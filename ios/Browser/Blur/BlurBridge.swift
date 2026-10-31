import UIKit
import WebKit
import BlurCore

/// One bridge per web view; WebKit retains it, it never retains the web view. Image work is bounded globally.
final class BlurBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let world = WKContentWorld.world(name: "BrowserMediaProtection")
    private static let worker = DispatchQueue(label: "browser.blur.vision", qos: .userInitiated)
    private static let pipeline = PersonBlurPipeline()
    private static let cache: NSCache<NSString, NSData> = {
        let cache = NSCache<NSString, NSData>()
        cache.totalCostLimit = 32 * 1024 * 1024
        cache.countLimit = 100
        return cache
    }()
    private var inFlight = 0

    static func install(on config: WKWebViewConfiguration, active: Bool) {
        let controller = WKUserContentController()
        config.userContentController = controller
        guard active else { return }
        let bridge = BlurBridge()
        controller.addScriptMessageHandler(bridge, contentWorld: world, name: "mediaBlur")
        if let url = Bundle.main.url(forResource: "MediaBlur", withExtension: "js"), let script = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: world))
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard BlurSchedule.shared.active, let body = message.body as? [String: Any], let kind = body["kind"] as? String else { replyHandler(nil, "Inactive"); return }
        if kind == "ready" { replyHandler(true, nil); return }
        guard inFlight < 3 else { replyHandler(nil, "Busy"); return }
        let moving = kind == "frame"
        let dimension = moving ? 768 : max(256, min(1536, (body["size"] as? Int) ?? 1024))
        let source = body["source"] as? String ?? ""
        guard source.utf8.count <= 28 * 1024 * 1024 else { replyHandler(nil, "Too large"); return }
        let key = "\(dimension):\(source)" as NSString
        if !moving, source.hasPrefix("http"), let hit = Self.cache.object(forKey: key) {
            replyHandler(["image": "data:image/jpeg;base64," + (hit as Data).base64EncodedString()], nil); return
        }
        inFlight += 1
        let complete: (Data?) -> Void = { [weak self] data in
            guard let data else {
                DispatchQueue.main.async { self?.inFlight -= 1; replyHandler(nil, "Unreadable media") }; return
            }
            Self.worker.async {
                let processed: Data? = autoreleasepool {
                    guard let image = try? PersonBlurPipeline.decode(data, maximumDimension: dimension),
                          let result = try? Self.pipeline.process(image, moving: moving) else { return nil }
                    return try? PersonBlurPipeline.jpeg(result.image)
                }
                if !moving, source.hasPrefix("http"), let processed { Self.cache.setObject(processed as NSData, forKey: key, cost: processed.count) }
                DispatchQueue.main.async {
                    self?.inFlight -= 1
                    guard BlurSchedule.shared.active, let processed else { replyHandler(nil, "Processing failed"); return }
                    replyHandler(["image": "data:image/jpeg;base64," + processed.base64EncodedString()], nil)
                }
            }
        }
        if source.hasPrefix("data:image/"), let comma = source.firstIndex(of: ","), source[..<comma].hasSuffix(";base64") {
            complete(Data(base64Encoded: String(source[source.index(after: comma)...])))
        } else if !moving, let url = URL(string: source) { BlurImageLoader.fetch(url, completion: complete) }
        else { complete(nil) }
    }
}
