import XCTest
import WebKit
@testable import Browser

@MainActor
final class MediaProtectionTests: XCTestCase {
    private final class Handler: NSObject, WKScriptMessageHandlerWithReply {
        var replies: [(Any?, String?) -> Void] = []
        var sources: [String] = []
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            let body = message.body as? [String: Any]
            if body?["kind"] as? String == "image" {
                sources.append(body?["source"] as? String ?? "")
                replies.append(replyHandler)
            } else { replyHandler(nil, "Test frame unavailable") }
        }
    }
    private func image(_ color: UIColor) -> String {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64)).image { context in
            color.setFill(); context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
        return "data:image/png;base64," + image.pngData()!.base64EncodedString()
    }
    private func eventually(_ check: @escaping () async throws -> Bool) async throws {
        for _ in 0..<100 {
            if try await check() { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("WebKit condition did not become true within five seconds")
    }

    func testImagesStayHiddenUntilProcessedAndHideAgainOnSourceChange() async throws {
        let config = WKWebViewConfiguration()
        let handler = Handler()
        config.userContentController.addScriptMessageHandler(handler, contentWorld: BlurBridge.world, name: "mediaBlur")
        let scriptURL = try XCTUnwrap(Bundle.main.url(forResource: "MediaBlur", withExtension: "js"))
        let script = try String(contentsOf: scriptURL)
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: BlurBridge.world))
        let rule: WKContentRuleList? = await withCheckedContinuation { continuation in BlurProtection.prepare { continuation.resume(returning: $0) } }
        config.userContentController.add(try XCTUnwrap(rule))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: config)
        let original = image(.red), filtered = image(.blue), changed = image(.green)
        web.loadHTMLString("<html><body><img id='photo' width='64' height='64' src='\(original)'><video id='video' width='100' height='100' controls></video><canvas id='canvas' width='100' height='100'></canvas></body></html>", baseURL: nil)
        try await eventually { !handler.replies.isEmpty }
        let hidden = try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#photo')).visibility") as? String
        XCTAssertEqual(hidden, "hidden")
        XCTAssertEqual(handler.sources.first, original)
        handler.replies.removeFirst()(["image": filtered], nil)
        try await eventually { (try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#photo')).visibility") as? String) == "visible" }
        let source = try await web.evaluateJavaScript("document.querySelector('#photo').src") as? String
        XCTAssertEqual(source, filtered)
        let videoHidden = try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#video')).visibility") as? String
        let canvasHidden = try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#canvas')).visibility") as? String
        XCTAssertEqual(videoHidden, "hidden"); XCTAssertEqual(canvasHidden, "hidden")
        let nativeControls = try await web.evaluateJavaScript("document.querySelector('#video').controls") as? Bool
        XCTAssertEqual(nativeControls, false)
        _ = try await web.evaluateJavaScript("document.querySelector('#photo').src='\(changed)'")
        try await eventually { !handler.replies.isEmpty }
        let hiddenAgain = try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#photo')).visibility") as? String
        XCTAssertEqual(hiddenAgain, "hidden")
        handler.replies.removeFirst()(nil, "Unreadable")
        try await Task.sleep(nanoseconds: 100_000_000)
        let stillHidden = try await web.evaluateJavaScript("getComputedStyle(document.querySelector('#photo')).visibility") as? String
        XCTAssertEqual(stillHidden, "hidden")
    }

    func testBridgeOnlyExistsInIsolatedWorld() async throws {
        let config = WKWebViewConfiguration()
        BlurBridge.install(on: config, active: true)
        let web = WKWebView(frame: .zero, configuration: config)
        web.loadHTMLString("<html><body>Test</body></html>", baseURL: nil)
        try await eventually { !web.isLoading }
        let accessible = try await web.evaluateJavaScript("!!(globalThis.webkit?.messageHandlers?.mediaBlur)") as? Bool
        XCTAssertEqual(accessible, false)
    }
}
