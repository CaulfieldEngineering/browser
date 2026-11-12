import XCTest
import WebKit
@testable import Instagram

/// The Instagram app's frame (Joe, 2026-11-05, on 0.1.38: "Framing is still a little off. Bleed up top and still a small
/// gap at the bottom"). The page keeps to the safe area; the strips by the status bar and the home indicator take the
/// colours of Instagram's header and tab bar, dark and light. Screenshots are attached to the test results.
@MainActor
final class InstagramAppTests: XCTestCase {

    /// The app's own first load (instagram.com or facebook.com at launch) can land after a test's page and replace it
    /// (main run 64: the first test saw "/" and no fixture). Stop it and wait until the web view is idle.
    private func idle(_ web: WKWebView) async throws {
        web.stopLoading()
        for _ in 0..<50 where web.isLoading { try await Task.sleep(nanoseconds: 100_000_000); web.stopLoading() }
    }
    private func app() throws -> (BrowserViewController, UIWindow) {
        let window = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.rootViewController is BrowserViewController })
        return (window.rootViewController as! BrowserViewController, window)
    }

    /// The page's web view: the largest one on screen (the classifier's is a few points).
    private func page(in vc: BrowserViewController) throws -> WKWebView {
        func all(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(all) }
        return try XCTUnwrap(all(vc.view).compactMap { $0 as? WKWebView }.max { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height })
    }

    /// A page shaped like Instagram's: viewport-fit=cover, a header at the top, a tab bar fixed at the bottom with
    /// env(safe-area-inset-bottom) padding, colours by the colour scheme.
    private let fixture = """
    <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <style>
      :root { color-scheme: light dark; } body { margin: 0; background: rgb(255,255,255); font: 15px -apple-system; }
      header { position: sticky; top: 0; height: 44px; background: rgb(255,255,255); }
      nav { position: fixed; left: 0; right: 0; bottom: 0; height: 50px; padding-bottom: env(safe-area-inset-bottom); background: rgb(250,250,250); }
      @media (prefers-color-scheme: dark) { body, header { background: rgb(12,16,20); color: #f5f5f5 } nav { background: rgb(12,16,20) } }
      main { height: 2000px; }
    </style></head><body><header>Instagram</header><main></main><nav id="nav">tabs</nav></body></html>
    """

    private func load(_ web: WKWebView) async throws {
        try await idle(web)
        web.loadHTMLString(fixture, baseURL: URL(string: "https://www.instagram.com/?variant=following")!) // the feed, where the app opens
        for _ in 0..<30 { try await Task.sleep(nanoseconds: 200_000_000); if !web.isLoading { break } }
        try await Task.sleep(nanoseconds: 500_000_000)
    }

    private func rgb(_ c: UIColor?) -> [Int] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        (c ?? .clear).resolvedColor(with: .current).getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b].map { Int(($0 * 255).rounded()) }
    }

    func testThePageKeepsToTheSafeArea() throws {
        let (vc, _) = try app()
        vc.view.layoutIfNeeded()
        let web = try page(in: vc)
        let frame = web.convert(web.bounds, to: vc.view)
        let safe = vc.view.safeAreaInsets
        XCTAssertGreaterThan(safe.top, 0, "a phone with a notch in the simulator")
        XCTAssertEqual(frame.minY, safe.top, accuracy: 0.5, "Instagram's header starts below the status bar")
        XCTAssertEqual(frame.maxY, vc.view.bounds.height - safe.bottom, accuracy: 0.5, "the tab bar ends above the home indicator")
        XCTAssertEqual(frame.width, vc.view.bounds.width, accuracy: 0.5)
        XCTAssertEqual(vc.topStrip.frame.height, safe.top, accuracy: 0.5)
        XCTAssertEqual(vc.bottomStrip.frame.height, safe.bottom, accuracy: 0.5)
    }

    func testTheStripsTakeInstagramsColoursDarkAndLight() async throws {
        let (vc, window) = try app()
        let web = try page(in: vc)
        defer { window.overrideUserInterfaceStyle = .unspecified }
        for (style, top, bottom) in [(UIUserInterfaceStyle.dark, [12, 16, 20], [12, 16, 20]), (.light, [255, 255, 255], [250, 250, 250])] {
            window.overrideUserInterfaceStyle = style
            try await load(web)
            await withCheckedContinuation { done in vc.matchStrips { done.resume() } }
            XCTAssertEqual(rgb(vc.topStrip.backgroundColor), top, "\(style == .dark ? "dark" : "light"): the status bar strip is the header's colour")
            XCTAssertEqual(rgb(vc.bottomStrip.backgroundColor), bottom, "\(style == .dark ? "dark" : "light"): the strip under the tab bar is the tab bar's colour")
            XCTAssertEqual(vc.preferredStatusBarStyle, style == .dark ? .lightContent : .darkContent)
            // The tab bar's own padding: env(safe-area-inset-bottom) is 0 inside the safe area, so no gap above the strip.
            let pad = try await web.evaluateJavaScript("getComputedStyle(document.getElementById('nav')).paddingBottom") as? String
            XCTAssertEqual(pad, "0px")
            let shot = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) })
            shot.name = "Instagram frame, \(style == .dark ? "dark" : "light")"
            shot.lifetime = .keepAlways
            add(shot)
        }
    }

    /// With the keyboard up the frame does not move: the page stays pinned to the safe area (WebKit scrolls inside it).
    func testTheFrameDoesNotJumpWithTheKeyboard() async throws {
        let (vc, _) = try app()
        let web = try page(in: vc)
        try await idle(web)
        web.loadHTMLString("<input id='q' autofocus style='margin-top:600px'>", baseURL: URL(string: "https://www.instagram.com/?variant=following")!) // the feed, where the app opens
        try await Task.sleep(nanoseconds: 1_000_000_000)
        let before = web.convert(web.bounds, to: vc.view)
        _ = try? await web.evaluateJavaScript("document.getElementById('q').focus()")
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let after = web.convert(web.bounds, to: vc.view)
        XCTAssertEqual(before.minY, after.minY, accuracy: 0.5, "the header does not jump")
        vc.view.endEditing(true)
    }

    /// Waits until the page says a condition holds (polled every 50 ms), up to a limit; true if it held.
    private func until(_ web: WKWebView, _ js: String, seconds: Double = 8) async throws -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if (try? await web.evaluateJavaScript("!!(\(js))") as? Bool) == true { return true }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        return false
    }
    /// The scroll logic is done with the page at `path` (ig-tidy.js "navigation settled", data-igt-settled).
    private func settled(_ web: WKWebView, path: String) async throws -> Bool {
        try await until(web, "document.documentElement.getAttribute('data-igt-settled') === '\(path)'", seconds: 15)
    }

    /// A newly opened page starts at the top; Back keeps the place in the feed (Joe, 2026-11-05: "opening certain pages
    /// scrolls way down instead of starting at the top"). Instagram changes pages by pushState, as this fixture does.
    func testANewPageStartsAtTheTopAndBackKeepsThePlace() async throws {
        let (vc, _) = try app()
        let web = try page(in: vc)
        let html = """
        <main id="m"></main><script>
        const feed = () => { m.innerHTML = Array.from({ length: 60 }, (_, i) => '<article style="height:300px">post ' + i + '</article>').join(''); };
        const comments = () => { m.innerHTML = '<div id="caption" style="height:120px">caption</div>' + Array.from({ length: 80 }, (_, i) => '<div style="height:60px">comment ' + i + '</div>').join('') + '<textarea id="add"></textarea>'; };
        feed();
        window.openComments = () => { history.pushState({}, '', '/p/P10/comments/'); comments(); document.getElementById('add').focus(); scrollTo(0, 99999); };
        addEventListener('popstate', () => { window.popped = true; feed(); scrollTo(0, 1200); });
        </script>
        """
        try await idle(web)
        web.loadHTMLString(html, baseURL: URL(string: "https://www.instagram.com/?variant=following")!) // the feed, where the app opens
        let loaded = try await until(web, "typeof openComments === 'function' && document.querySelectorAll('#m article').length === 60 && location.search === '?variant=following'", seconds: 15)
        XCTAssertTrue(loaded, "the test's page is on screen (not the app's own launch load)")
        let feedSettled = try await settled(web, path: "/?variant=following")
        XCTAssertTrue(feedSettled, "the filter is running on it and done with it")
        // The feed as its own history entry, as on Instagram (WebKit reloads a loadHTMLString page on Back, so the
        // first entry cannot be the feed); then the settling for that new page passes before Joe "scrolls".
        _ = try? await web.evaluateJavaScript("history.pushState({}, '', '/?variant=following'); true")
        _ = try? await web.evaluateJavaScript("scrollTo(0, 1200); openComments(); true")
        let commentsSettled = try await settled(web, path: "/p/P10/comments/")
        XCTAssertTrue(commentsSettled, "the filter saw the comments page and finished settling it")
        let y = try await web.evaluateJavaScript("scrollY") as? Double
        let seen = try await web.evaluateJavaScript("[document.documentElement.getAttribute('data-igt-nav'), document.documentElement.getAttribute('data-igt-top'), history.length, location.pathname].join(' | ')") as? String
        XCTAssertEqual(y, 0, "the comments page starts at the top (the filter saw: \(seen ?? "nothing"))")
        let focused = try await web.evaluateJavaScript("document.activeElement && document.activeElement.id") as? String
        XCTAssertNotEqual(focused, "add", "the comment box the page focused is let go")
        // Back, as Instagram's own page sees it: the address goes back without a new entry and popstate fires. (WebKit
        // skips history entries made by script without a tap when going Back, so history.back() from a test cannot
        // reach them; on Instagram every new page follows Joe's tap.)
        let blur = try await web.evaluateJavaScript("document.documentElement.getAttribute('data-igt-blur') || 'none'") as? String
        XCTAssertNotEqual(blur, "failed", "the field could be let go")
        _ = try? await web.evaluateJavaScript("history.replaceState({}, '', '/?variant=following'); dispatchEvent(new PopStateEvent('popstate')); true")
        let backSettled = try await until(web, "window.popped === true && document.documentElement.getAttribute('data-igt-settled') === '/?variant=following'", seconds: 15)
        XCTAssertTrue(backSettled, "the filter saw Back and is done with the feed")
        let popped = try await web.evaluateJavaScript("window.popped === true") as? Bool
        XCTAssertEqual(popped, true, "Back was a history step inside the page (not a reload)")
        let back = try await web.evaluateJavaScript("scrollY") as? Double
        XCTAssertEqual(back, 1200, "Back returns to the same place in the feed")
    }

    /// Away for half an hour or more, the app opens its home fresh; sooner, it comes back where it was. Only the home
    /// feed is ever loaded again on coming back.
    func testAwayForAWhileOpensHomeFresh() {
        let now = Date()
        XCTAssertTrue(BrowserViewController.isStale(leftAt: 0, now: now), "never noted: home")
        XCTAssertFalse(BrowserViewController.isStale(leftAt: now.timeIntervalSince1970 - 60, now: now))
        XCTAssertFalse(BrowserViewController.isStale(leftAt: now.timeIntervalSince1970 - 29 * 60, now: now))
        XCTAssertTrue(BrowserViewController.isStale(leftAt: now.timeIntervalSince1970 - 31 * 60, now: now))
        XCTAssertTrue(Flavor.isHome(URL(string: "https://www.instagram.com/?variant=following")!))
        XCTAssertTrue(Flavor.isHome(URL(string: "https://www.instagram.com/")!))
        XCTAssertFalse(Flavor.isHome(URL(string: "https://www.instagram.com/someone/")!))
        XCTAssertFalse(Flavor.isHome(URL(string: "https://www.instagram.com/direct/inbox/")!))
        XCTAssertFalse(Flavor.isHome(URL(string: "https://example.com/")!))
    }

    /// No long-press previews in the Instagram app (holding a story is Instagram's own gesture).
    func testNoLinkPreviews() throws {
        let (vc, _) = try app()
        XCTAssertFalse(try page(in: vc).allowsLinkPreview)
    }

    /// A page that did not open for want of a connection offers "Try again"; a page the app does not open, "Go back".
    func testAPageThatDidNotOpenOffersToTryAgain() throws {
        func all(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(all) }
        let view = BlockedView()
        var tried = 0, back = 0
        view.onRetry = { tried += 1 }
        view.onBack = { back += 1 }
        view.show(title: "This page did not open", reason: "The Internet connection appears to be offline.", address: "instagram.com", calm: true, retry: true)
        let button = try XCTUnwrap(all(view).compactMap { $0 as? UIButton }.first)
        XCTAssertEqual(button.title(for: .normal), "Try again")
        button.sendActions(for: .touchUpInside)
        XCTAssertEqual([tried, back], [1, 0])
        view.show(title: "This app opens Instagram only", reason: "Links to other sites do not open here.", address: "example.com")
        XCTAssertEqual(button.title(for: .normal), "Go back")
        button.sendActions(for: .touchUpInside)
        XCTAssertEqual([tried, back], [1, 1])
    }

    func testCSSColoursAreRead() {
        XCTAssertEqual(rgb(BrowserViewController.colour(css: "rgb(12, 16, 20)")), [12, 16, 20])
        XCTAssertEqual(rgb(BrowserViewController.colour(css: "rgba(250, 250, 250, 1)")), [250, 250, 250])
        XCTAssertNil(BrowserViewController.colour(css: "rgba(0, 0, 0, 0)"))
        XCTAssertNil(BrowserViewController.colour(css: "transparent"))
    }

    /// The Instagram app opens Instagram only and ignores links to the native app; it starts on the Following feed.
    func testLinksStayOnTheWeb() {
        XCTAssertTrue(Flavor.isInstagram)
        XCTAssertEqual(Flavor.home.absoluteString, "https://www.instagram.com/?variant=following")
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "instagram://media?id=1")!), isMainFrame: true), .ignore)
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "https://apps.apple.com/app/id389801252")!), isMainFrame: true), .ignore)
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "https://www.instagram.com/p/abc/")!), isMainFrame: true), .allow)
        if case .block = Policy.decide(request: URLRequest(url: URL(string: "https://example.com/")!), isMainFrame: true) {} else { XCTFail("other sites stay out") }
    }
}
