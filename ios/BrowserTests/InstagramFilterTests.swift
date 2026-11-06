import XCTest
import WebKit
@testable import Browser

/// The Instagram filter (Joe, 2026-11-05): suggestive posts are removed on instagram.com, judged on the phone.
@MainActor
final class InstagramFilterTests: XCTestCase {
    private func browser() throws -> BrowserViewController {
        try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.compactMap { $0.rootViewController as? BrowserViewController }.first)
    }

    func testTheFilterFilesAreInTheApp() {
        for name in ["filter-config", "rules", "bridge-ios", "ig-filter", "ig-tidy", "classifier", "clip"] {
            XCTAssertNotNil(Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "shared"), "\(name).js")
        }
        XCTAssertNotNil(Bundle.main.url(forResource: "classifier", withExtension: "html", subdirectory: "shared"))
        XCTAssertNotNil(Bundle.main.url(forResource: "nsfwjs.min", withExtension: "js", subdirectory: "shared/vendor"))
    }

    func testOnlyInstagramsImageHostsAreFetched() {
        XCTAssertTrue(InstagramFilter.isMediaHost(URL(string: "https://scontent-iad3-1.cdninstagram.com/v/t51.jpg")!))
        XCTAssertTrue(InstagramFilter.isMediaHost(URL(string: "https://scontent.xx.fbcdn.net/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "https://example.com/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "http://scontent.cdninstagram.com/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "https://cdninstagram.com.evil.example/x.jpg")!))
    }

    /// The model loads in WebKit on the phone and scores a plain picture as not suggestive.
    func testTheClassifierScoresAPlainImage() async throws {
        _ = try browser()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 400)).image { ctx in
            UIColor.systemTeal.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 300, height: 400))
            UIColor.systemYellow.setFill(); ctx.fill(CGRect(x: 40, y: 60, width: 200, height: 120))
        }
        let data = try XCTUnwrap(InstagramFilter.dataURL(image))
        let answer: Classifier.Answer = await withCheckedContinuation { done in Classifier.shared.classify(data) { done.resume(returning: $0) } }
        guard case let .scores(s) = answer else { return XCTFail("the classifier answered \(answer)") }
        XCTAssertEqual(Set(s.keys), ["Drawing", "Hentai", "Neutral", "Porn", "Sexy", "Revealing"], "both judges answered")
        XCTAssertLessThan(s["Sexy"] ?? 1, 0.45)
        XCTAssertLessThan(s["Revealing"] ?? 1, 0.6, "a plain picture is not revealing clothing")
    }

    /// In the app's own web view, on an instagram.com page: a post whose caption is suggestive is removed, a plain one
    /// stays. The page cannot see the filter (it runs in its own content world).
    func testASuggestiveCaptionIsRemovedInTheApp() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        let html = """
        <html><body><main>
        <article id="plain"><div>New pedal day #fuzz</div></article>
        <article id="hot"><div>new set #lingerie</div></article>
        </main></body></html>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.instagram.com/?variant=following")!) // the feed, where the app opens
        var gone: [String] = []
        for _ in 0..<50 {
            try await Task.sleep(nanoseconds: 300_000_000)
            gone = (try? await web.evaluateJavaScript("[...document.querySelectorAll('[data-igf-gone]')].map(e => e.id)") as? [String]) ?? []
            if !gone.isEmpty { break }
        }
        XCTAssertEqual(gone, ["hot"])
        // Discreet (Joe, 2026-11-05: "i'd prefer not to label the pictures"): the post collapses, with no words on the page.
        let shown = try? await web.evaluateJavaScript("getComputedStyle(document.getElementById('hot')).display + '|' + document.body.innerText") as? String
        XCTAssertEqual(shown?.components(separatedBy: "|").first, "none", "a hidden post collapses")
        XCTAssertFalse(shown?.contains("Hidden") ?? true, "nothing on the page says why")
        let seen = try? await web.evaluateJavaScript("typeof window.IGFilterRules + typeof window.__igFilter") as? String
        XCTAssertEqual(seen, "undefinedundefined", "the page cannot see the filter")
    }

    /// Not on Instagram: nothing happens.
    func testOtherSitesAreUntouched() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        web.loadHTMLString("<article id='a'>#lingerie</article>", baseURL: URL(string: "https://example.com/")!)
        try await Task.sleep(nanoseconds: 2_000_000_000)
        let n = try? await web.evaluateJavaScript("document.querySelectorAll('[data-igf-gone]').length") as? Int
        XCTAssertEqual(n, 0)
    }

    /// Instagram's prompts to open its app are hidden on instagram.com, in the app's own web view.
    func testOpenAppPromptsAreHiddenInTheApp() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        web.loadHTMLString("<main><a id='a' href='https://apps.apple.com/app/instagram/id389801252'>Open app</a><button id='b'>Open Instagram</button><article id='c'>pedals</article></main>", baseURL: URL(string: "https://www.instagram.com/?variant=following")!) // the feed, where the app opens
        var hidden: [String] = []
        for _ in 0..<30 {
            try await Task.sleep(nanoseconds: 300_000_000)
            hidden = (try? await web.evaluateJavaScript("['a','b','c'].filter(id => getComputedStyle(document.getElementById(id)).display === 'none')") as? [String]) ?? []
            if hidden.count >= 2 { break }
        }
        XCTAssertEqual(hidden, ["a", "b"])
    }

    /// The search page, plain: the field and the results stay; suggested and trending sections, the Top and Reels tabs
    /// and videos go (Joe, 2026-11-05: "get rid of all of the junk and images that come along with the Instagram search page").
    func testTheSearchPageIsPlainInTheApp() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 800)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        let html = """
        <main><input id="q" placeholder="Search">
        <div role="tablist"><a role="tab" id="top" href="#">Top</a><a role="tab" id="reels" href="#">Reels</a><a role="tab" id="accounts" href="#">Accounts</a></div>
        <a id="acct" href="/pedalshop/">pedalshop</a><a id="tag" href="/explore/tags/fuzz/">#fuzz</a>
        <div id="sugg"><div><span>Suggested for you</span><a href="#">See all</a></div><div><a href="/a/">a</a><a href="/b/">b</a></div></div>
        <video id="v" style="width:200px;height:300px"></video></main>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.instagram.com/explore/search/keyword/")!)
        let js = "['q','acct','tag','accounts','top','reels','sugg','v'].map(i => { let e = document.getElementById(i); for (; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return i + ':gone'; return i + ':shown'; }).join(' ')"
        var state = ""
        for _ in 0..<30 {
            try await Task.sleep(nanoseconds: 300_000_000)
            state = (try? await web.evaluateJavaScript(js) as? String) ?? ""
            if state.contains("sugg:gone") && state.contains("v:gone") && state.contains("reels:gone") { break }
        }
        XCTAssertEqual(state, "q:shown acct:shown tag:shown accounts:shown top:gone reels:gone sugg:gone v:gone")
    }

    /// Instagram's home feed is the Following feed (Joe, 2026-11-05: "every time I open it I see the same exact post").
    func testTheHomeFeedIsTheFollowingFeed() {
        let f = { (s: String) in Flavor.followingFeed(for: URL(string: s)!)?.absoluteString }
        XCTAssertEqual(f("https://www.instagram.com/"), "https://www.instagram.com/?variant=following")
        XCTAssertEqual(f("https://www.instagram.com"), "https://www.instagram.com/?variant=following")
        XCTAssertEqual(f("https://instagram.com/?hl=en"), "https://instagram.com/?hl=en&variant=following")
        XCTAssertNil(f("https://www.instagram.com/?variant=favorites"), "a variant is left as it is")
        XCTAssertNil(f("https://www.instagram.com/?variant=following"))
        XCTAssertNil(f("https://www.instagram.com/p/abc/"), "a post is left as it is")
        XCTAssertNil(f("https://www.instagram.com/pedalshop/"))
        XCTAssertNil(f("https://example.com/"), "another site is left as it is")
    }

    /// Links to the native app or the App Store are recognised (the Instagram app ignores them; Flavor.swift).
    func testNativeAppLinksAreRecognised() {
        for s in ["instagram://media?id=1", "itms-apps://apps.apple.com/app/id389801252", "https://apps.apple.com/us/app/instagram/id389801252", "https://instagram.app.link/abc", "fb://profile"] {
            XCTAssertTrue(Policy.isNativeAppLink(URL(string: s)!), s)
        }
        for s in ["https://www.instagram.com/", "https://www.instagram.com/p/abc/", "https://example.com/"] {
            XCTAssertFalse(Policy.isNativeAppLink(URL(string: s)!), s)
        }
        // The Browser itself still hands other apps' links to them (2026-11-03).
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "instagram://media?id=1")!), isMainFrame: true), .openOutside)
    }

    /// Each added account has its own data store; the first is the default store, so its sign-in stays.
    func testAccountsKeepTheirOwnStores() {
        let saved = (UserDefaults.standard.data(forKey: "ig.accounts"), UserDefaults.standard.string(forKey: "ig.account.current"))
        defer {
            UserDefaults.standard.set(saved.0, forKey: "ig.accounts")
            UserDefaults.standard.set(saved.1, forKey: "ig.account.current")
        }
        UserDefaults.standard.removeObject(forKey: "ig.accounts")
        UserDefaults.standard.removeObject(forKey: "ig.account.current")
        XCTAssertEqual(Accounts.all.map(\.id), ["default"])
        XCTAssertNil(Accounts.store(for: Accounts.current).identifier, "the first account is the default store")
        let two = Accounts.add()
        XCTAssertEqual(Accounts.all.count, 2)
        XCTAssertEqual(two.name, "Account 2")
        let store = Accounts.store(for: two)
        XCTAssertEqual(store.identifier?.uuidString, two.id)
        Accounts.select(two.id)
        XCTAssertEqual(Accounts.current.id, two.id)
        Accounts.learnName("pedalshop", for: two.id)
        XCTAssertEqual(Accounts.current.name, "pedalshop")
        Accounts.learnName("other", for: two.id) // a named account keeps its name
        XCTAssertEqual(Accounts.current.name, "pedalshop")
        Accounts.remove(two.id)
        XCTAssertEqual(Accounts.all.map(\.id), ["default"])
        XCTAssertEqual(Accounts.current.id, "default")
        Accounts.remove("default") // the first account cannot be removed
        XCTAssertEqual(Accounts.all.count, 1)
    }

    /// The filter's counts are kept by reason, on the phone, and read as plain lines.
    func testFilterCountsByReason() {
        let stats = FilterStats()
        for n in ["hidden-sexy", "hidden-sexy", "hidden-text", "hidden-unjudged-loading", "unjudged-unreadable", "restored", "judged-clean"] { stats.count(n) }
        let lines = stats.summary().joined(separator: "\n")
        XCTAssertTrue(lines.contains("picture"), lines)
        XCTAssertTrue(lines.contains("caption"), lines)
        XCTAssertTrue(lines.contains("Not judged: unreadable"), lines)
        stats.count("bad name with https://x.example/ in it")
        XCTAssertNil(stats.today().keys.first { $0.contains("/") || $0.contains(":") }, "no addresses are kept")
    }
}
