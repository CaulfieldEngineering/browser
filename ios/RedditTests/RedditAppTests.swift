import XCTest
import WebKit
@testable import Reddit

/// The Reddit app (Joe, 2026-11-12: "start building a version of Facebook and one of Reddit that have similar filtering
/// features", "For Reddit, no images allowed. And text-context filtering."). BUILT, NOT OPEN: Reddit stays blocked
/// (locked memory entry 4). These tests hold the two things that matter: as built the app opens nothing, and the
/// rules it would keep if a Sunday review opened it. The pages are fixtures shaped like old Reddit's; no test, and no
/// agent, opens Reddit.
@MainActor
final class RedditAppTests: XCTestCase {

    private func app() throws -> BrowserViewController {
        try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            .compactMap { $0.rootViewController as? BrowserViewController }.first)
    }

    private func until(_ web: WKWebView, _ js: String, seconds: Double = 60) async throws -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if (try? await web.evaluateJavaScript("!!(\(js))") as? Bool) == true { return true }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        return false
    }

    private func isBlock(_ d: Decision?) -> Bool { if case .block = d { return true } else { return false } }

    /// A list for the tests only: what a review might agree. The app's own settings stay as shipped.
    private var listed: RedditRules.Settings { var s = RedditRules.Settings(); s.open = true; s.allow = ["diypedals", "synthdiy"]; return s }

    func testItIsTheRedditApp() {
        XCTAssertTrue(Flavor.isReddit && Flavor.isSiteApp && !Flavor.isInstagram && !Flavor.isFacebook)
        XCTAssertEqual(Flavor.name, "Reddit")
        XCTAssertEqual(Flavor.feedApp, "reddit", "it would report to the phone feed as its own app")
    }

    // MARK: - Not open

    func testAsBuiltItIsNotOpen() {
        XCTAssertFalse(RedditRules.builtOpen, "the app's own lock")
        XCTAssertFalse(RedditRules.settings.open, "the settings' lock (filter-config.js)")
        XCTAssertFalse(RedditRules.isOpen)
        XCTAssertTrue(RedditRules.settings.allowOn, "the allow-list is on")
        XCTAssertEqual(RedditRules.settings.allow, [], "and empty")
        XCTAssertGreaterThan(RedditRules.settings.mediaHosts.count, 12, "the settings file was read")
        XCTAssertTrue(RedditRules.settings.feedsOff.isSuperset(of: ["all", "popular"]))
    }

    func testAsBuiltNothingOfRedditOpens() {
        let decide = { (s: String) in Policy.decide(request: URLRequest(url: URL(string: s)!), isMainFrame: true) }
        for s in ["https://old.reddit.com/", "https://www.reddit.com/", "https://old.reddit.com/r/diypedals/", "https://www.reddit.com/login/",
                  "https://old.reddit.com/r/all/", "https://reddit.com/r/popular", "https://old.reddit.com/user/someone/", "https://old.reddit.com/search?q=fuzz"] {
            guard case let .block(title, _) = decide(s) else { XCTFail("\(s) must not open"); continue }
            XCTAssertEqual(title, "Reddit is not open", s)
        }
        // not even inside a frame
        XCTAssertTrue(isBlock(Policy.decide(request: URLRequest(url: URL(string: "https://www.reddit.com/embed")!), isMainFrame: false)))
        // nor anything else
        XCTAssertTrue(isBlock(decide("https://example.com/")))
        XCTAssertTrue(isBlock(decide("https://i.redd.it/x.jpg")))
        XCTAssertTrue(isBlock(decide("https://imgur.com/a/x")))
        XCTAssertEqual(decide("reddit://r/all"), .ignore, "the native Reddit app is not opened")
        XCTAssertEqual(decide("https://apps.apple.com/app/reddit/id1064216828"), .ignore)
    }

    func testItCannotBeInstalledFromOurInstallPage() {
        let link = URL(string: "itms-services://?action=download-manifest&url=https://caulfieldengineering.github.io/browser-install/reddit/manifest.plist")!
        XCTAssertFalse(Policy.isOwnInstall(link), "there is no Reddit install page, and the apps do not accept one")
    }

    /// Both locks are needed: the settings' lock alone opens nothing.
    func testTheSettingsAloneDoNotOpenIt() {
        let source = "globalThis.IGFilterConfig = {\"reddit\": {\"open\": true, \"allowList\": {\"on\": true, \"subreddits\": [\"diypedals\"]}}};"
        let s = RedditRules.parse(source)
        XCTAssertTrue(s.open)
        XCTAssertFalse(RedditRules.builtOpen && s.open)
        // settings that cannot be read are closed
        let broken = RedditRules.parse("globalThis.IGFilterConfig = {not json")
        XCTAssertFalse(broken.open)
        XCTAssertTrue(broken.allowOn)
        XCTAssertEqual(broken.allow, [])
        // an allow-list switched off in the file is read as off, a missing one as on
        XCTAssertTrue(RedditRules.parse("globalThis.IGFilterConfig = {\"reddit\": {}};").allowOn)
    }

    // MARK: - The rules it would keep if opened

    func testIfOpenedOnlyTheListedSubredditsOpen() {
        let s = listed
        let d = { (u: String) in RedditRules.decide(URL(string: u)!, isMainFrame: true, inApp: true, open: true, settings: s) }
        XCTAssertNil(d("https://old.reddit.com/r/diypedals/"))
        XCTAssertNil(d("https://old.reddit.com/r/diypedals/comments/abc/first_fuzz/"))
        XCTAssertNil(d("https://old.reddit.com/r/DIYPedals+synthdiy/new/"))
        XCTAssertNil(d("https://old.reddit.com/message/inbox/"))
        XCTAssertNil(d("https://www.reddit.com/login/"), "signing in stays where Reddit has it")
        for u in ["https://old.reddit.com/r/all/", "https://old.reddit.com/r/popular/", "https://old.reddit.com/r/random", "https://old.reddit.com/r/randnsfw",
                  "https://old.reddit.com/r/pics/", "https://old.reddit.com/r/diypedals+pics/", "https://old.reddit.com/r/gonewild/", "https://old.reddit.com/r/NSFW_GIF/",
                  "https://old.reddit.com/over18?dest=x", "https://old.reddit.com/quarantine", "https://old.reddit.com/gallery/abc", "https://old.reddit.com/media?url=x",
                  "https://old.reddit.com/best/", "https://www.reddit.com/r/diypedals/"] {
            XCTAssertTrue(isBlock(d(u)), u)
        }
        // an empty list: the front page stops
        var empty = RedditRules.Settings(); empty.open = true
        XCTAssertTrue(isBlock(RedditRules.decide(URL(string: "https://old.reddit.com/")!, isMainFrame: true, inApp: true, open: true, settings: empty)))
        // an adult name is out even if someone put it on the list
        var bad = listed; bad.allow.append("gonewild")
        XCTAssertTrue(isBlock(RedditRules.decide(URL(string: "https://old.reddit.com/r/gonewild/")!, isMainFrame: true, inApp: true, open: true, settings: bad)))
    }

    func testIfOpenedMediaHostsNeverOpen() {
        let s = listed
        for u in ["https://i.redd.it/a.jpg", "https://preview.redd.it/a.jpg?width=640", "https://external-preview.redd.it/a", "https://b.thumbs.redditmedia.com/a.jpg",
                  "https://v.redd.it/abc", "https://packaged-media.redd.it/a", "https://i.imgur.com/a.jpg", "https://imgur.com/a/b", "https://gfycat.com/a",
                  "https://tenor.com/view/a", "https://streamable.com/25j4a3", "https://www.redgifs.com/watch/a", "https://redd.it/abc", "https://www.redditmedia.com/mediaembed/a"] {
            XCTAssertTrue(RedditRules.isMediaHost(URL(string: u)!), u)
            XCTAssertTrue(isBlock(RedditRules.decide(URL(string: u)!, isMainFrame: false, inApp: true, open: true, settings: s)), u)
        }
        XCTAssertFalse(RedditRules.isMediaHost(URL(string: "https://old.reddit.com/r/diypedals/")!))
    }

    func testIfOpenedRedditIsKeptOnItsPlainPages() {
        let s = listed
        let r = { (u: String) in RedditRules.rewrite(URL(string: u)!, inApp: true, settings: s)?.absoluteString }
        XCTAssertEqual(r("https://www.reddit.com/r/diypedals/hot/"), "https://old.reddit.com/r/diypedals/hot/")
        XCTAssertEqual(r("https://new.reddit.com/r/synthdiy/"), "https://old.reddit.com/r/synthdiy/")
        XCTAssertEqual(r("https://old.reddit.com/"), "https://old.reddit.com/r/diypedals+synthdiy/", "home is the listed subreddits together")
        XCTAssertEqual(r("https://old.reddit.com/search?q=fuzz&include_over_18=on"), "https://old.reddit.com/search?q=fuzz", "no 18+ search")
        XCTAssertNil(r("https://old.reddit.com/r/diypedals/"))
        XCTAssertNil(r("https://www.reddit.com/login/?dest=x"))
        XCTAssertNil(r("https://example.com/"))
        // Reddit sending an address straight back is not chased round and round
        XCTAssertNotNil(r("https://www.reddit.com/r/diypedals/wiki/"))
        XCTAssertNil(r("https://www.reddit.com/r/diypedals/wiki/"), "the second time within five seconds it is left, and the policy stops it")
    }

    // MARK: - No pictures, on the network and in the page

    func testTheNoMediaRulesCompile() async throws {
        let json = RedditRules.rules()
        let list = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]])
        XCTAssertGreaterThan(list.count, 14, "one for all media on Reddit's pages, one a media host, one for all media in this app")
        let compiled: WKContentRuleList? = await withCheckedContinuation { done in
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "reddit-test", encodedContentRuleList: json) { rule, error in
                if let error { print("rule list error: \(error)") }
                done.resume(returning: rule)
            }
        }
        XCTAssertNotNil(compiled, "WebKit takes the rules")
    }

    /// In a web view made the app's way (the filter's scripts and the no-media rules), on a fixture shaped like an
    /// old Reddit page, with the list as shipped (empty): nothing of the page shows.
    func testAFixturePageShowsNothingAsShipped() async throws {
        let vc = try app()
        let web = vc.makeWebView()
        web.navigationDelegate = nil // the fixture is loaded past the policy, which opens no Reddit address at all
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        vc.view.addSubview(web)
        defer { web.removeFromSuperview() }
        let html = """
        <div class="content"><div class="sitetable">
          <div class="thing link" id="clean" data-subreddit="diypedals" data-nsfw="false" data-author="dan"><div class="entry"><a class="title" href="/r/diypedals/comments/a/">First fuzz build</a></div></div>
          <div class="thing link" id="nsfw" data-subreddit="diypedals" data-nsfw="true" data-author="x"><div class="entry"><a class="title" href="/r/diypedals/comments/b/">Plain</a></div></div>
          <img id="pic" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="200" height="200">
        </div></div>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://old.reddit.com/r/diypedals/")!)
        let passed = try await until(web, "document.documentElement.hasAttribute('data-rdf-pass')")
        XCTAssertTrue(passed, "the Reddit filter ran in the page")
        let js = "[document.documentElement.getAttribute('data-rdf-blocked') || 'open', getComputedStyle(document.body).display, getComputedStyle(document.getElementById('pic')).display].join('|')"
        let state = try await web.evaluateJavaScript(js) as? String
        XCTAssertEqual(state, "off-list|none|none", "a subreddit off the (empty) list does not open; no picture is drawn")
    }
}
