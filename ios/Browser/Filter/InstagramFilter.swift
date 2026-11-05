import UIKit
import WebKit

// The Instagram filter (Joe, 2026-11-05; locked memory entry 21; scope narrowed the same day: "Let's just try the
// suggestive content for now and we can build on it"). On instagram.com, in every tab: suggestive posts and Reels are
// removed outright, never blurred, with nothing to tap to see them, judged on the phone from the caption and hashtags
// and an image classifier. Nothing is sent off the phone. There is no switch.
//
// The page side is shared with the laptop extension (repo folder filter/shared, in the app as the folder "shared":
// rules.js, bridge-ios.js, ig-filter.js). It runs in a
// content world of its own, so Instagram's scripts cannot see or undo it, and asks this bridge to judge an image:
//   url   an image on Instagram's CDN: fetched here (the same picture the page is loading), made small, judged
//   data  a frame the page drew (a video)
//   rect  what is on screen there (a playing video whose frames the page cannot read): a snapshot of the web view
// The judging is the classifier page (filter/shared/classifier.html, nsfwjs) in a hidden one-point web view.
enum InstagramFilter {
    static let world = WKContentWorld.world(name: "igfilter")

    /// The page scripts, in order: the rules, the bridge, the filter.
    private static let scripts: [WKUserScript] = {
        ["rules", "bridge-ios", "ig-filter"].compactMap { name in
            guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "shared"),
                  let source = try? String(contentsOf: url, encoding: .utf8) else {
                assertionFailure("missing \(name)")
                return nil
            }
            return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world)
        }
    }()

    /// Adds the filter to a tab's web view. Called for every web view the app makes (BrowserViewController.makeWebView).
    static func attach(to web: WKWebView) {
        let ucc = web.configuration.userContentController
        // A window a page opens shares its opener's controller: add the scripts once.
        if !ucc.userScripts.contains(where: { $0.source == scripts.first?.source }) { for s in scripts { ucc.addUserScript(s) } }
        let bridge = Bridge(web: web)
        ucc.removeScriptMessageHandler(forName: "igf", contentWorld: world)
        ucc.addScriptMessageHandler(bridge, contentWorld: world, name: "igf")
        // The classifier is loaded on the first question from an Instagram page, not before.
    }

    /// Only Instagram's own image hosts are fetched for the page; nothing else can be asked for.
    static func isMediaHost(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "cdninstagram.com" || host.hasSuffix(".cdninstagram.com") || host == "fbcdn.net" || host.hasSuffix(".fbcdn.net")
    }

    /// A small JPEG data: URL of an image, its long side at most 448 px.
    static func dataURL(_ image: UIImage) -> String? {
        let side = max(image.size.width, image.size.height)
        guard side > 0 else { return nil }
        let k = min(1, 448 / side)
        let size = CGSize(width: max(1, (image.size.width * k).rounded()), height: max(1, (image.size.height * k).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = small.jpegData(compressionQuality: 0.85) else { return nil }
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }

    /// The page's questions. The reply is the scores dictionary, or nil when the image could not be judged.
    final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
        weak var web: WKWebView?
        init(web: WKWebView) { self.web = web }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return replyHandler(nil, nil) }
            let done: ([String: Double]?) -> Void = { scores in DispatchQueue.main.async { replyHandler(scores, nil) } }
            switch op {
            case "url":
                guard let s = body["url"] as? String, let url = URL(string: s), InstagramFilter.isMediaHost(url) else { return done(nil) }
                var request = URLRequest(url: url)
                request.timeoutInterval = 20
                URLSession.shared.dataTask(with: request) { data, _, _ in
                    guard let data, let image = UIImage(data: data), let d = InstagramFilter.dataURL(image) else { return done(nil) }
                    Classifier.shared.classify(d, done)
                }.resume()
            case "data":
                guard let d = body["data"] as? String, d.hasPrefix("data:image/"), d.count < 4_000_000 else { return done(nil) }
                Classifier.shared.classify(d, done)
            case "rect":
                guard let web, let r = body["rect"] as? [String: Double], let w = r["width"], let h = r["height"], w > 0, h > 0 else { return done(nil) }
                let config = WKSnapshotConfiguration()
                config.rect = CGRect(x: r["x"] ?? 0, y: r["y"] ?? 0, width: w, height: h).intersection(web.bounds)
                guard !config.rect.isNull, config.rect.width > 20, config.rect.height > 20 else { return done(nil) }
                config.snapshotWidth = NSNumber(value: 300)
                web.takeSnapshot(with: config) { image, _ in
                    guard let image, let d = InstagramFilter.dataURL(image) else { return done(nil) }
                    Classifier.shared.classify(d, done)
                }
            default:
                done(nil)
            }
        }
    }
}

/// The classifier page in a hidden web view, made once and kept. Calls queue until the model has loaded.
final class Classifier: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = Classifier()
    private var web: WKWebView?
    private(set) var ready = false
    private var queued: [(String, ([String: Double]?) -> Void)] = []
    private var pending: [Int: ([String: Double]?) -> Void] = [:]
    private var next = 1

    func warmUp() { DispatchQueue.main.async { _ = self.view() } }

    private func view() -> WKWebView? {
        if let web { return web }
        guard let page = Bundle.main.url(forResource: "classifier", withExtension: "html", subdirectory: "shared") else { return nil }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "igc")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        web.isUserInteractionEnabled = false
        web.alpha = 0.01 // in a window, so WebKit keeps it running; too small and faint to see
        web.navigationDelegate = self
        self.web = web
        attachToWindow()
        web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        return web
    }

    private func attachToWindow() {
        guard let web, web.window == nil else { return }
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } ?? ($0 as? UIWindowScene)?.windows.first }.first
        window?.addSubview(web)
    }

    func classify(_ dataURL: String, _ done: @escaping ([String: Double]?) -> Void) {
        DispatchQueue.main.async {
            guard self.view() != nil else { return done(nil) }
            self.attachToWindow()
            if !self.ready {
                // Waiting for the model (pictures stay held, invisible, meanwhile). Loading takes seconds on a phone
                // and up to a minute on a CPU-only simulator; a classifier that never loads answers "not judged" after
                // 120 s (the picture is then treated as flagged), so nothing waits for ever.
                let ticket = UUID().uuidString
                self.queued.append((ticket + "|" + dataURL, done))
                DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
                    if let i = self.queued.firstIndex(where: { $0.0.hasPrefix(ticket + "|") }) { self.queued.remove(at: i).1(nil) }
                }
                return
            }
            self.send(dataURL, done)
        }
    }

    private func send(_ dataURL: String, _ done: @escaping ([String: Double]?) -> Void) {
        let id = next
        next += 1
        pending[id] = done
        let arg = String(data: try! JSONSerialization.data(withJSONObject: [dataURL]), encoding: .utf8)!
        web?.evaluateJavaScript("igcClassify(\(id), \(arg)[0])") { [weak self] _, error in
            if error != nil, let cb = self?.pending.removeValue(forKey: id) { cb(nil) }
        }
        // An answer that never comes counts as not judged.
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            if let cb = self?.pending.removeValue(forKey: id) { cb(nil) }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if let ok = body["ready"] as? Bool {
            ready = ok
            let waiting = queued
            queued.removeAll()
            for (d, cb) in waiting {
                let data = d.firstIndex(of: "|").map { String(d[d.index(after: $0)...]) } ?? d // the ticket off
                ok ? send(data, cb) : cb(nil)
            }
            return
        }
        guard let id = body["id"] as? Int, let cb = pending.removeValue(forKey: id) else { return }
        cb((body["scores"] as? [String: Any])?.compactMapValues { ($0 as? NSNumber)?.doubleValue })
    }

    /// The classifier's process ended (memory): start it again; what was waiting is answered as not judged.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        ready = false
        for (_, cb) in pending { cb(nil) }
        pending.removeAll()
        webView.reload()
    }
}
