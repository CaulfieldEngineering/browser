import XCTest
import WebKit
@testable import Instagram

/// The Instagram app's frame (Joe, 2026-11-05, on 0.1.38: "Framing is still a little off. Bleed up top and still a small
/// gap at the bottom"). The page keeps to the safe area; the strips by the status bar and the home indicator take the
/// colours of Instagram's header and tab bar, dark and light. Screenshots are attached to the test results.
@MainActor
final class InstagramAppTests: XCTestCase {
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
        web.loadHTMLString(fixture, baseURL: URL(string: "https://www.instagram.com/")!)
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
        web.loadHTMLString("<input id='q' autofocus style='margin-top:600px'>", baseURL: URL(string: "https://www.instagram.com/")!)
        try await Task.sleep(nanoseconds: 1_000_000_000)
        let before = web.convert(web.bounds, to: vc.view)
        _ = try? await web.evaluateJavaScript("document.getElementById('q').focus()")
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let after = web.convert(web.bounds, to: vc.view)
        XCTAssertEqual(before.minY, after.minY, accuracy: 0.5, "the header does not jump")
        vc.view.endEditing(true)
    }

    func testCSSColoursAreRead() {
        XCTAssertEqual(rgb(BrowserViewController.colour(css: "rgb(12, 16, 20)")), [12, 16, 20])
        XCTAssertEqual(rgb(BrowserViewController.colour(css: "rgba(250, 250, 250, 1)")), [250, 250, 250])
        XCTAssertNil(BrowserViewController.colour(css: "rgba(0, 0, 0, 0)"))
        XCTAssertNil(BrowserViewController.colour(css: "transparent"))
    }

    /// The Instagram app opens Instagram only and ignores links to the native app.
    func testLinksStayOnTheWeb() {
        XCTAssertTrue(Flavor.isInstagram)
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "instagram://media?id=1")!), isMainFrame: true), .ignore)
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "https://apps.apple.com/app/id389801252")!), isMainFrame: true), .ignore)
        XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: "https://www.instagram.com/p/abc/")!), isMainFrame: true), .allow)
        if case .block = Policy.decide(request: URLRequest(url: URL(string: "https://example.com/")!), isMainFrame: true) {} else { XCTFail("other sites stay out") }
    }
}
