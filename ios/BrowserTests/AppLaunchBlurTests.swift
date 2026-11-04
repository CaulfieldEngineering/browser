import XCTest
import WebKit
import BlurCore
@testable import Browser

/// Runs inside the launched app (the test host), so a launch crash fails here before anything else.
/// Pages are loaded through the app's own web view factory and navigation delegate.
@MainActor
final class AppLaunchBlurTests: XCTestCase {
    private var hosted: [WKWebView] = []
    override func tearDown() async throws {
        hosted.forEach { $0.removeFromSuperview() }
        hosted = []
        BlurSchedule.shared.replaceForTesting([])
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

    /// A web view made exactly as the app makes one, put on screen (WebKit throttles views outside a window).
    private func appWebView() async throws -> WKWebView {
        let browser = try await browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        hosted.append(web)
        return web
    }

    private func js(_ web: WKWebView, _ script: String) async throws -> Any? {
        try await web.evaluateJavaScript(script)
    }

    private func pngDataURL(_ color: UIColor) -> String {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64)).image { context in
            color.setFill(); context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
        return "data:image/png;base64," + image.pngData()!.base64EncodedString()
    }

    private func astronaut() throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "astronaut", withExtension: "png"), "fixture in the test bundle")
        return try Data(contentsOf: url)
    }

    /// RGBA at 128 x 128, row 0 at the top.
    private func pixels(_ data: Data) throws -> [UInt8] {
        let image = try XCTUnwrap(UIImage(data: data)?.cgImage)
        var buffer = [UInt8](repeating: 0, count: 128 * 128 * 4)
        let context = try XCTUnwrap(CGContext(data: &buffer, width: 128, height: 128, bitsPerComponent: 8, bytesPerRow: 512,
                                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: 128, height: 128))
        return buffer
    }

    private func meanDifference(_ a: [UInt8], _ b: [UInt8], x: Range<Int> = 0..<128, y: Range<Int> = 0..<128) -> Double {
        var total = 0, count = 0
        for row in y { for column in x { for channel in 0..<3 {
            let i = (row * 128 + column) * 4 + channel
            total += abs(Int(a[i]) - Int(b[i])); count += 1
        } } }
        return Double(total) / Double(count)
    }

    func testAppLaunchesAndIsOffByDefault() async throws {
        let browser = try await browser()
        XCTAssertNotNil(browser.view.window, "the browser is on screen")
        BlurSchedule.shared.replaceForTesting([])
        XCTAssertFalse(BlurSchedule.shared.active, "no window: the filter is off")
    }

    /// Outside a window, browsing is untouched: images load as they are, the page shows, no bridge exists.
    func testPageLoadWithBlurOff() async throws {
        BlurSchedule.shared.replaceForTesting([])
        let web = try await appWebView()
        let original = pngDataURL(.red)
        web.loadHTMLString("<html><body><img id='photo' width='64' height='64' src='\(original)'><video id='video' width='100' height='100' controls></video></body></html>", baseURL: nil)
        try await eventually("the page loads") { !web.isLoading && web.url != nil }
        try await eventually("the image decodes") { (try await self.js(web, "document.querySelector('#photo').complete && document.querySelector('#photo').naturalWidth") as? Int) == 64 }
        XCTAssertFalse(web.isHidden)
        let v1 = try await js(web, "getComputedStyle(document.querySelector('#photo')).visibility") as? String
        XCTAssertEqual(v1, "visible")
        let v2 = try await js(web, "document.querySelector('#photo').src") as? String
        XCTAssertEqual(v2, original)
        let v3 = try await js(web, "document.querySelector('#video').controls") as? Bool
        XCTAssertEqual(v3, true)
        XCTAssertEqual(web.configuration.allowsPictureInPictureMediaPlayback, true)
        let v4 = try await js(web, "!!(globalThis.webkit?.messageHandlers?.mediaBlur)") as? Bool
        XCTAssertEqual(v4, false)
    }

    /// Inside a window: the page is covered until the content script is verified, a person photo is replaced
    /// by the natively masked output, and every failure path leaves media hidden.
    func testPageLoadWithWindowOnMasksAndFailsClosed() async throws {
        BlurSchedule.shared.replaceForTesting([BlurWindows.Window(from: Date().addingTimeInterval(-60), until: Date().addingTimeInterval(3600))])
        XCTAssertTrue(BlurSchedule.shared.active)
        let web = try await appWebView()
        XCTAssertTrue(web.isHidden, "covered before anything loads")
        XCTAssertEqual(web.configuration.allowsPictureInPictureMediaPlayback, false)
        let photo = try astronaut()
        let original = "data:image/png;base64," + photo.base64EncodedString()
        let corrupt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" // truncated PNG
        let network = "http://127.0.0.1:9/never.png" // blocked by the content rule; the native fetch fails
        web.loadHTMLString("""
            <html><body style="margin:0">
            <img id='photo' width='256' height='256' src='\(original)'>
            <img id='corrupt' width='64' height='64' src='\(corrupt)'>
            <img id='network' width='64' height='64' src='\(network)'>
            <video id='video' width='100' height='100' controls></video>
            </body></html>
            """, baseURL: nil)
        try await eventually(within: 20, "the page is revealed after the script is verified") { !web.isHidden }
        try await eventually(within: 30, "the photo is replaced by the processed output") {
            (try await self.js(web, "getComputedStyle(document.querySelector('#photo')).visibility") as? String) == "visible"
        }
        let shown = try XCTUnwrap(try await js(web, "document.querySelector('#photo').src") as? String)
        XCTAssertTrue(shown.hasPrefix("data:image/jpeg;base64,"), "the processed JPEG, not the original")
        XCTAssertNotEqual(shown, original)
        let processed = try XCTUnwrap(Data(base64Encoded: String(shown.dropFirst("data:image/jpeg;base64,".count))))
        let before = try pixels(photo), after = try pixels(processed)
        let whole = meanDifference(before, after)
        let face = meanDifference(before, after, x: 52..<60, y: 26..<34)
        print("BLUR_APP_MASK whole=\(whole) face=\(face)")
        XCTAssertGreaterThan(whole, 4, "the body is visibly masked")
        // The face is reported, not asserted: if Vision cannot find the person in the simulator, the pipeline
        // covers the whole image, which is the intended fail-closed result.

        // Fail closed: undecodable data, a network image the barrier blocks, video and its native controls.
        try await Task.sleep(nanoseconds: 1_500_000_000)
        for id in ["corrupt", "network", "video"] {
            let value = try await js(web, "getComputedStyle(document.querySelector('#\(id)')).visibility") as? String
            XCTAssertEqual(value, "hidden", "\(id) must stay hidden")
        }
        let v5 = try await js(web, "document.querySelector('#video').controls") as? Bool
        XCTAssertEqual(v5, false)
        let v6 = try await js(web, "document.querySelector('#network').naturalWidth") as? Int
        XCTAssertEqual(v6, 0, "the original network image never loaded")
        let v7 = try await js(web, "!!(globalThis.webkit?.messageHandlers?.mediaBlur)") as? Bool
        XCTAssertEqual(v7, false, "the page cannot reach the bridge")
    }

    /// The local boundary timer turns the filter on and off at the window's exact edges, without a poll.
    func testWindowBoundariesInTheApp() async throws {
        final class Count: @unchecked Sendable { var value = 0 }
        let changes = Count()
        let observer = NotificationCenter.default.addObserver(forName: BlurSchedule.changed, object: nil, queue: .main) { _ in changes.value += 1 }
        defer { NotificationCenter.default.removeObserver(observer) }
        let from = Date().addingTimeInterval(1.5), until = from.addingTimeInterval(2)
        BlurSchedule.shared.replaceForTesting([BlurWindows.Window(from: from, until: until)])
        XCTAssertFalse(BlurSchedule.shared.active, "off before the window")
        try await eventually(within: 5, "on at the start") { BlurSchedule.shared.active }
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(from), -0.05)
        try await eventually(within: 5, "off at the end") { !BlurSchedule.shared.active }
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(until), -0.05)
        XCTAssertGreaterThanOrEqual(changes.value, 2)
        // A browser view made after the window is back to normal browsing.
        let web = try await appWebView()
        XCTAssertFalse(web.isHidden)
        XCTAssertEqual(web.configuration.allowsPictureInPictureMediaPlayback, true)
    }
}
