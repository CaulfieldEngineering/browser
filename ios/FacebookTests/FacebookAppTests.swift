import XCTest
import WebKit
@testable import Facebook

/// The Facebook app (Joe, 2026-11-05: "we can start building a facebook version of our filtered app, too. Let's start by
/// hiding the default feed, any ads etc."): facebook.com only, home is Notifications, ads and suggestions gone.
/// These fixture pages are shaped like Facebook's; they prove the app's rules, not that Facebook's live site matches.
@MainActor
final class FacebookAppTests: XCTestCase {
    private func app() throws -> BrowserViewController {
        try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            .compactMap { $0.rootViewController as? BrowserViewController }.first)
    }

    private func page(in vc: BrowserViewController) throws -> WKWebView {
        func all(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(all) }
        return try XCTUnwrap(all(vc.view).compactMap { $0 as? WKWebView }.max { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height })
    }

    func testItIsTheFacebookApp() {
        XCTAssertTrue(Flavor.isFacebook && Flavor.isSiteApp && !Flavor.isInstagram)
        XCTAssertEqual(Flavor.name, "Facebook")
        XCTAssertEqual(Flavor.feedApp, "facebook", "it reports to the phone feed as its own app")
        XCTAssertEqual(Flavor.installPage, "https://caulfieldengineering.github.io/browser-install/facebook/")
        XCTAssertEqual(Flavor.home.absoluteString, "https://m.facebook.com/notifications/", "it opens on Notifications, not the News Feed")
    }

    func testFacebookOnlyAndNoNativeApp() {
        let decide = { (s: String) in Policy.decide(request: URLRequest(url: URL(string: s)!), isMainFrame: true) }
        for s in ["https://m.facebook.com/groups/1/", "https://www.facebook.com/marketplace/", "https://www.messenger.com/t/1", "https://fb.me/abc", "https://accountscenter.facebook.com/"] {
            XCTAssertEqual(decide(s), .allow, s)
        }
        if case .block = decide("https://www.instagram.com/") {} else { XCTFail("other sites stay out") }
        if case .block = decide("https://example.com/") {} else { XCTFail("other sites stay out") }
        XCTAssertEqual(decide("fb://profile/1"), .ignore, "the native Facebook app is not opened")
        XCTAssertEqual(decide("https://apps.apple.com/app/facebook/id284882215"), .ignore)
    }

    func testTheNewsFeedGoesToNotifications() {
        let r = { (s: String) in Flavor.rewrite(URL(string: s)!)?.absoluteString }
        XCTAssertEqual(r("https://m.facebook.com/"), "https://m.facebook.com/notifications/")
        XCTAssertEqual(r("https://www.facebook.com/home.php"), "https://www.facebook.com/notifications/")
        XCTAssertNil(r("https://m.facebook.com/groups/1/"))
        XCTAssertNil(r("https://m.facebook.com/notifications/"))
    }

    /// In the app's own web view: a sponsored post and a suggestion go, a friend's post stays, with nothing on the page
    /// saying why.
    func testAdsAndSuggestionsAreGoneInTheApp() async throws {
        let vc = try app()
        let web = try page(in: vc)
        let html = """
        <div role="main"><div role="feed">
          <div role="article" id="friend"><h4><a href="/a">A friend</a></h4><span dir="auto">New pedal board</span></div>
          <div role="article" id="ad"><h4><a href="/b">Shop</a></h4><span>Sponsored</span><span dir="auto">Buy now</span></div>
          <div role="article" id="sugg"><span>Suggested for you</span><span>Follow</span></div>
        </div></div>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://m.facebook.com/groups/pedals/")!)
        let js = "['friend','ad','sugg'].map(i => i + ':' + (getComputedStyle(document.getElementById(i)).display === 'none' ? 'gone' : 'shown')).join(' ') + '|' + /Hidden/.test(document.body.innerText)"
        var state = ""
        for _ in 0..<30 {
            try await Task.sleep(nanoseconds: 300_000_000)
            state = (try? await web.evaluateJavaScript(js) as? String) ?? ""
            if state.hasPrefix("friend:shown ad:gone sugg:gone") { break }
        }
        XCTAssertEqual(state, "friend:shown ad:gone sugg:gone|false")
    }

    func testThePageKeepsToTheSafeArea() throws {
        let vc = try app()
        vc.view.layoutIfNeeded()
        let web = try page(in: vc)
        let frame = web.convert(web.bounds, to: vc.view)
        XCTAssertEqual(frame.minY, vc.view.safeAreaInsets.top, accuracy: 0.5)
        XCTAssertEqual(frame.maxY, vc.view.bounds.height - vc.view.safeAreaInsets.bottom, accuracy: 0.5)
    }
}
