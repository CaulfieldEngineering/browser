import XCTest
import WebKit
@testable import Browser

/// Runs inside the launched app (the test host), so a launch crash fails here before anything else.
/// Pages load through the app's own web view factory and navigation delegate.
@MainActor
final class AppLaunchTests: XCTestCase {
    private var hosted: [WKWebView] = []
    override func setUp() async throws { await ColdStart.waitOut(classifier: false) } // a cold simulator, once (ColdStart.swift)
    override func tearDown() async throws {
        hosted.forEach { $0.removeFromSuperview() }
        hosted = []
    }

    private func eventually(within seconds: Double = 10, _ what: String, _ check: @escaping () async throws -> Bool) async throws {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if try await check() { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Not true within \(seconds) s: \(what)")
    }

    private func browser() async throws -> BrowserViewController {
        var found: BrowserViewController?
        try await eventually(within: 15, "the app shows its browser window") {
            found = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows).compactMap { $0.rootViewController as? BrowserViewController }.first
            return found != nil
        }
        return try XCTUnwrap(found)
    }

    private func js(_ web: WKWebView, _ script: String) async throws -> Any? {
        try await web.evaluateJavaScript(script)
    }

    func testAppLaunches() async throws {
        let browser = try await browser()
        XCTAssertNotNil(browser.view.window, "the browser is on screen")
    }

    /// A page with an image and a video loads as it is: nothing hidden, nothing replaced, picture in picture allowed.
    func testPageLoads() async throws {
        let browser = try await browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        hosted.append(web)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64)).image { context in
            UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
        let original = "data:image/png;base64," + image.pngData()!.base64EncodedString()
        web.loadHTMLString("<html><body><img id='photo' width='64' height='64' src='\(original)'><video id='video' width='100' height='100' controls></video></body></html>", baseURL: nil)
        try await eventually("the page loads") { !web.isLoading && web.url != nil }
        try await eventually("the image decodes") { (try await self.js(web, "document.querySelector('#photo').complete && document.querySelector('#photo').naturalWidth") as? Int ?? 0) > 0 }
        XCTAssertFalse(web.isHidden)
        let visibility = try await js(web, "getComputedStyle(document.querySelector('#photo')).visibility") as? String
        XCTAssertEqual(visibility, "visible")
        let source = try await js(web, "document.querySelector('#photo').src") as? String
        XCTAssertEqual(source, original)
        let controls = try await js(web, "document.querySelector('#video').controls") as? Bool
        XCTAssertEqual(controls, true)
        XCTAssertTrue(web.configuration.allowsPictureInPictureMediaPlayback)
    }

    /// In the Browser a newer build puts the green dot on the ••• button, inside it; with no update there is no dot.
    func testAnUpdatePutsTheDotOnTheMoreButton() async throws {
        let vc = try await browser()
        UserDefaults.standard.removeObject(forKey: "updateDismissedBuild")
        defer { vc.showUpdate(version: "0", build: 0); UserDefaults.standard.removeObject(forKey: "updateDismissedBuild") }
        vc.showUpdate(version: "0.1.999999", build: 999_999)
        vc.view.layoutIfNeeded()
        XCTAssertTrue(BrowserViewController.showsMoreDot)
        XCTAssertFalse(vc.moreDot.isHidden)
        XCTAssertFalse(vc.updateButton.isHidden)
        let more = try XCTUnwrap(vc.view.subviewsDeep.compactMap { $0 as? UIButton }.first { $0.accessibilityLabel == "More" })
        XCTAssertFalse(more.isHidden || more.window == nil, "the dot has its ••• under it")
        let dot = vc.moreDot.convert(vc.moreDot.bounds, to: vc.view)
        XCTAssertTrue(more.convert(more.bounds, to: vc.view).contains(dot), "the dot sits on the ••• button")
        vc.showUpdate(version: "0", build: 0)
        XCTAssertTrue(vc.moreDot.isHidden, "no update, no dot")
    }
}

private extension UIView {
    var subviewsDeep: [UIView] { subviews + subviews.flatMap(\.subviewsDeep) }
}
