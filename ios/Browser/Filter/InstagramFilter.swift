import CryptoKit
import UIKit
import WebKit

// The Instagram filter (Joe, 2026-11-05; locked memory entry 21; scope narrowed the same day: "Let's just try the
// suggestive content for now and we can build on it"). On instagram.com, in every tab: suggestive posts and Reels are
// hidden behind a quiet placeholder that names the account and why, never blurred, with nothing to tap to see them,
// judged on the phone from the caption and hashtags and an image classifier. Nothing is sent off the phone. No switch.
//
// The page side is shared with the laptop extension (repo folder filter/shared, in the app as the folder "shared":
// rules.js, bridge-ios.js, ig-filter.js, and ig-tidy.js, which hides Instagram's "open the app" prompts). It runs in a
// content world of its own, so Instagram's scripts cannot see or undo it, and asks this bridge:
//   url   an image on Instagram's CDN: fetched here (the same picture the page is loading), made small, judged
//   data  a frame the page drew (a video)
//   rect  what is on screen there (a playing video whose frames the page cannot read): a snapshot of the web view
//   warm  start loading the model now;  stat  count one event (FilterStats, on the phone only)
//   width how many pictures the judge takes at a time on this phone (Classifier.lanes)
// A picture judged once is not judged again: its scores are kept on the phone (ScoreCache), so a profile opened a
// second time, Back, a reload, shows at once. The rules still decide from the scores each time.
// An answer is the scores, or {_error: loading | unreadable | timeout | host | bad}, so the page can say "still checking"
// and try again rather than treat every miss alike. The judging is the classifier page (classifier.html, nsfwjs) in a
// hidden web view, loaded at launch in the Instagram app and on the first Instagram page in the Browser.
enum InstagramFilter {
    static let world = WKContentWorld.world(name: "igfilter")

    /// The page scripts, in order: the settings, the rules, the bridge, the filter, the prompt tidier.
    private static let scripts: [WKUserScript] = {
        ["filter-config", "rules", "bridge-ios", "ig-filter", "ig-tidy", "ig-seen", "fb-tidy"].compactMap { name in
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
        if Flavor.isSiteApp { Classifier.shared.warmUp() } // a site app opens its site at once: load the model now
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

    /// The picture, fetched as the page would (a Safari-like client, Instagram as the referrer), tried three times.
    static func fetchImage(_ url: URL, attempt: Int = 0, _ done: @escaping (UIImage?) -> Void) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 12 // was 20: three slow pictures held every other picture's turn for a minute
        request.setValue("https://www.instagram.com/", forHTTPHeaderField: "Referer")
        request.setValue("image/webp,image/avif,image/jpeg,image/png,image/*;q=0.8", forHTTPHeaderField: "Accept")
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
            if ok, let data, let image = UIImage(data: data) { return done(image) }
            guard attempt < 2 else { return done(nil) }
            DispatchQueue.global().asyncAfter(deadline: .now() + (attempt == 0 ? 0.4 : 1.5)) { fetchImage(url, attempt: attempt + 1, done) }
        }.resume()
    }

    /// The page's questions. The reply is the scores dictionary, or {_error: reason}.
    final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
        weak var web: WKWebView?
        init(web: WKWebView) { self.web = web }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return replyHandler(["_error": "bad"], nil) }
            let fail: (String) -> Void = { reason in DispatchQueue.main.async { FilterStats.shared.count("unjudged-" + reason); replyHandler(["_error": reason], nil) } }
            let judged: (Classifier.Answer) -> Void = { answer in
                DispatchQueue.main.async {
                    switch answer {
                    case let .scores(s): replyHandler(s, nil)
                    case let .failed(reason): FilterStats.shared.count("unjudged-" + reason); replyHandler(["_error": reason], nil)
                    }
                }
            }
            switch op {
            case "warm":
                Classifier.shared.warmUp(); replyHandler(true, nil)
            case "width":
                replyHandler(Classifier.shared.lanes, nil)
            case "stat":
                if let name = body["name"] as? String {
                    FilterStats.shared.count(name)
                    // "note-<what>": something the page's scripts did that Joe would see as a glitch (ig-tidy.js: the
                    // page put back at the top, the feed sent to the Following feed). One line to the mini PC, as a
                    // heartbeat whose state is "js:<what>", beside the "load:<reason>" lines.
                    if name.hasPrefix("note-"), Flavor.isSiteApp { Feed.shared.beat("js:" + String(name.dropFirst(5).prefix(12))) }
                }
                replyHandler(true, nil)
            case "diag":
                // The page moved under Joe without a scroll of his (ig-filter.js, watchJump): one heartbeat line
                // "diag:<name>" with its numbers (how far, where the page was, how long since a touch and since the
                // filter last changed the page). Numbers only; the mini PC keeps nothing else from it.
                if Flavor.isSiteApp, let name = body["name"] as? String, let data = body["data"] as? String {
                    FilterStats.shared.count("diag-" + name)
                    Feed.shared.beat("diag:" + String(name.prefix(10)), data: data)
                }
                replyHandler(true, nil)
            case "report":
                if let record = body["record"] as? String { HiddenByHand.shared.add(record) }
                replyHandler(true, nil)
            case "byhand":
                replyHandler(HiddenByHand.shared.ids, nil)
            case "seen":
                replyHandler(SeenPosts.on, nil)
            case "url":
                guard let s = body["url"] as? String, let url = URL(string: s), InstagramFilter.isMediaHost(url) else { return fail("host") }
                // Judged before (this visit or an earlier one): the same scores, at once.
                let key = ScoreCache.key(for: url)
                if let known = ScoreCache.shared.scores(for: key) {
                    FilterStats.shared.count("judged-again")
                    return replyHandler(known, nil)
                }
                InstagramFilter.fetchImage(url) { image in
                    guard let image, let d = InstagramFilter.dataURL(image) else { return fail("unreadable") }
                    Classifier.shared.classify(d) { answer in
                        DispatchQueue.main.async {
                            if case let .scores(s) = answer { ScoreCache.shared.put(key, s) }
                            judged(answer)
                        }
                    }
                }
            case "data":
                guard let d = body["data"] as? String, d.hasPrefix("data:image/"), d.count < 4_000_000 else { return fail("bad") }
                Classifier.shared.classify(d, judged)
            case "rect":
                guard let web, let r = body["rect"] as? [String: Double], let w = r["width"], let h = r["height"], w > 0, h > 0 else { return fail("bad") }
                let config = WKSnapshotConfiguration()
                config.rect = CGRect(x: r["x"] ?? 0, y: r["y"] ?? 0, width: w, height: h).intersection(web.bounds)
                guard !config.rect.isNull, config.rect.width > 20, config.rect.height > 20 else { return fail("bad") }
                config.snapshotWidth = NSNumber(value: 300)
                web.takeSnapshot(with: config) { image, _ in
                    guard let image, let d = InstagramFilter.dataURL(image) else { return fail("unreadable") }
                    Classifier.shared.classify(d, judged)
                }
            default:
                fail("bad")
            }
        }
    }
}

/// The scores of pictures already judged, kept on the phone (2026-11-12, for speed; Joe: "I spend most of my time
/// looking at empty grey boxes"). The two judges give the same scores for the same picture every time, so a picture
/// seen before (a profile opened again, Back, a reload, the feed after the page restarted) is answered at once
/// instead of being fetched and judged again. What is kept: the six scores under a short hash of the picture's
/// address (never the address, never the picture), the newest 12,000, in the app's Caches. The rules read the scores
/// fresh each time, so a line that is tightened later applies to these pictures too. A new build of the judges (their
/// files' sizes change) starts the cache empty. Only pictures both judges answered are kept. Main thread only.
final class ScoreCache {
    static let shared = ScoreCache(file: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("filter-scores.json"))
    static let names = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy", "Revealing"]
    static let cap = 12000

    private struct Saved: Codable { let stamp: String; let keys: [String]; let values: [[Double]] }
    private var scores: [String: [Double]] = [:]
    private var order: [String] = [] // oldest first
    private let file: URL?
    private let stamp: String
    private var saveQueued = false

    /// The judges as built into this app: the sizes of the models and of the code that prepares a picture for them.
    static let modelStamp: String = {
        let base = Bundle.main.resourceURL?.appendingPathComponent("shared")
        let size = { (name: String) -> Int in
            guard let path = base?.appendingPathComponent(name).path, let attrs = try? FileManager.default.attributesOfItem(atPath: path) else { return 0 }
            return (attrs[.size] as? NSNumber)?.intValue ?? 0
        }
        return ["vendor/tinyclip-vision-int8.onnx", "vendor/clip-prompts.json", "vendor/group1-shard1of1.min.js", "vendor/model.min.js", "classifier.js", "clip.js", "clip-worker.js"]
            .map { String(size($0)) }.joined(separator: "-")
    }()

    init(file: URL?, stamp: String = ScoreCache.modelStamp) {
        self.file = file
        self.stamp = stamp
        if let file, let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode(Saved.self, from: data),
           saved.stamp == stamp, saved.keys.count == saved.values.count {
            for (k, v) in zip(saved.keys, saved.values) where v.count == Self.names.count && scores[k] == nil {
                scores[k] = v
                order.append(k)
            }
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.save() }
    }

    /// A short hash of what names the picture: its path and the parts of its query that choose the picture and its
    /// size (not the server it came from, nor the signature and expiry Instagram changes on every load).
    static func key(for url: URL) -> String {
        let volatile: Set<String> = ["oh", "oe", "ccb", "edm", "ig_cache_key"]
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let kept = items.filter { !volatile.contains($0.name) && !$0.name.hasPrefix("_nc_") }.map { "\($0.name)=\($0.value ?? "")" }.sorted()
        let text = url.path + "?" + kept.joined(separator: "&")
        return SHA256.hash(data: Data(text.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
    }

    var count: Int { order.count }

    func scores(for key: String) -> [String: Double]? {
        guard let v = scores[key] else { return nil }
        return Dictionary(uniqueKeysWithValues: zip(Self.names, v))
    }

    func put(_ key: String, _ s: [String: Double]) {
        let v = Self.names.compactMap { s[$0] }
        guard v.count == Self.names.count else { return } // both judges answered, or it is not kept
        if scores[key] == nil { order.append(key) }
        scores[key] = v
        if order.count > Self.cap {
            let drop = order.count - Self.cap
            for k in order.prefix(drop) { scores.removeValue(forKey: k) }
            order.removeFirst(drop)
        }
        guard !saveQueued, file != nil else { return }
        saveQueued = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.save() }
    }

    /// Written off the main thread (`wait`: here and now, for the tests); a save lost to a crash only means those
    /// pictures are judged once more.
    func save(wait: Bool = false) {
        saveQueued = false
        guard let file else { return }
        let saved = Saved(stamp: stamp, keys: order, values: order.compactMap { scores[$0] })
        let write = { if let data = try? JSONEncoder().encode(saved) { try? data.write(to: file, options: .atomic) } }
        if wait { write() } else { DispatchQueue.global(qos: .utility).async(execute: write) }
    }
}

/// Pictures Joe hid by hand (the menu's circle-slash; Joe, 2026-11-05: "Let's just add a settings button to report
/// should be blocked", "Something discrete"). Their ids stay hidden on this phone; each record (the post or media id,
/// the two judges' scores, the rules that fired, the time and the surface; never the picture or an address) goes to
/// the mini PC with the feed, as data, so the filter can be tuned. No undo.
final class HiddenByHand {
    static let shared = HiddenByHand()
    private let key = "filter.byhand.ids"
    private(set) var ids: [String]
    init() { ids = UserDefaults.standard.stringArray(forKey: "filter.byhand.ids") ?? [] }

    func add(_ json: String) {
        guard let data = json.data(using: .utf8), let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let id = record["id"] as? String, !id.isEmpty, !ids.contains(id) {
            ids.append(String(id.prefix(120)))
            if ids.count > 3000 { ids.removeFirst(ids.count - 3000) }
            UserDefaults.standard.set(ids, forKey: key)
        }
        Feed.shared.report(json)
    }
}

/// "Skip posts I've seen" (ig-seen.js; Joe, 2026-11-10: "note what we see and not show me literally the same posts every
/// time I open the app"). On unless turned off in the menu. The posts seen are noted in the page's own storage, per
/// account; this is only the switch.
enum SeenPosts {
    private static let key = "instagram.skipSeen"
    static var on: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
    /// Tells an open page at once (the page's skipped posts come back when it is turned off).
    static func tell(_ web: WKWebView?) {
        web?.evaluateJavaScript("document.dispatchEvent(new Event('\(on ? "igs-on" : "igs-off")')); true", completionHandler: nil)
    }
}

/// Counts of what the filter did, by reason, per day, on the phone only: no pictures, no addresses. Shown in the menu
/// (Filter today) so Joe can read them out; nothing sends them anywhere.
final class FilterStats {
    static let shared = FilterStats()
    private let key = "filter.stats"
    private(set) var model: [String: Any] = [:] // backend, loadMs, avgMs: how the classifier is running here
    private var days: [String: [String: Int]]

    init() {
        days = (UserDefaults.standard.dictionary(forKey: "filter.stats") as? [String: [String: Int]]) ?? [:]
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.save() }
    }

    static func day(_ d: Date = Date()) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }

    func count(_ name: String) {
        let safe = String(name.prefix(40)).filter { $0.isLetter || $0.isNumber || $0 == "-" }
        guard !safe.isEmpty else { return }
        let d = Self.day()
        days[d, default: [:]][safe, default: 0] += 1
        if days.count > 30 { for k in days.keys.sorted().dropLast(30) { days.removeValue(forKey: k) } }
        // Written at most every two seconds and on leaving the app (was: on every count, several a picture).
        guard !saveQueued else { return }
        saveQueued = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.save() }
    }
    private var saveQueued = false

    func save() {
        saveQueued = false
        UserDefaults.standard.set(days, forKey: key)
    }

    /// How the filter runs, for the mini PC (sent with the heartbeat on leaving the app; Feed.swift): how long
    /// pictures waited on screen (the wait-0 to wait-4 steps, ig-filter.js), how many were judged and how many
    /// answered from the scores kept, restarts, pictures that could not be fetched or judged, the judges' speed, and
    /// how many times the feed was held still when the page above the screen changed ("feed-held", ig-filter.js).
    /// Timing only: never what was hidden or why, no addresses, no pictures. Those counts stay on the phone.
    func timing() -> [String: Any] {
        let t = today()
        var out: [String: Any] = ["day": Self.day(), "judged": (t["judged-clean"] ?? 0) + (t["judged-flagged"] ?? 0), "kept": ScoreCache.shared.count]
        for k in ["wait-0", "wait-1", "wait-2", "wait-3", "wait-4", "judged-again", "page-restarted", "page-restarted-home", "page-hung", "page-fresh",
                  "judge-restarted", "judge-one-lane", "unjudged-timeout", "unjudged-unreadable", "unjudged-loading", "unjudged-bad", "feed-held", "anchor-native"] {
            if let n = t[k], n > 0 { out[k] = n }
        }
        for k in ["backend", "loadMs", "avgMs", "avgWaitMs", "n"] { if let v = model[k], v is String || v is NSNumber { out[k] = v } }
        if let clip = model["clip"] as? [String: Any] {
            for k in ["mode", "lanes", "avgMs", "loadMs", "error"] { if let v = clip[k], v is String || v is NSNumber { out["clip-" + k] = v } }
        }
        out["lanes"] = Classifier.shared.lanes
        return out
    }

    func setModel(_ info: [String: Any]) { model = info }

    func today() -> [String: Int] { days[Self.day()] ?? [:] }

    /// Plain lines for the menu: hidden by reason, then how the model runs.
    func summary() -> [String] {
        let t = today()
        let sum = { (prefix: String) in t.filter { $0.key.hasPrefix(prefix) }.values.reduce(0, +) }
        let caption = t["hidden-text"] ?? 0
        let picture = sum("hidden-explicit") + sum("hidden-sexy") + sum("hidden-combined")
        let unchecked = sum("hidden-unjudged")
        var lines = ["Hidden today: \(picture) picture, \(caption) caption, \(unchecked) not checked"]
        lines.append("Shown again after checking: \(t["restored"] ?? 0); judged clean: \(t["judged-clean"] ?? 0)")
        if picture > 0 { lines.append("Picture line: \(sum("hidden-sexy")) suggestive, \(sum("hidden-explicit")) explicit, \(sum("hidden-combined")) combined") }
        lines.append("Revealing clothing: \(t["hidden-revealing"] ?? 0) picture, \(t["hidden-revealing-text"] ?? 0) caption")
        lines.append("Accounts hidden by name or bio: \((t["hidden-account-name"] ?? 0) + (t["hidden-account-bio"] ?? 0)); avatars hidden: \(t["hidden-avatar"] ?? 0)")
        lines.append("Hidden by hand: \(t["hidden-by-hand"] ?? 0)")
        lines.append("Seen before, skipped: \(t["seen-skipped"] ?? 0)")
        let waits = (0...4).map { t["wait-\($0)"] ?? 0 }
        if waits.reduce(0, +) > 0 { lines.append("Pictures shown at once: \(waits[0]); after up to 0.6 s: \(waits[1]), 1.5 s: \(waits[2]), 4 s: \(waits[3]), longer: \(waits[4])") }
        if let again = t["judged-again"], again > 0 { lines.append("Answered from pictures judged before: \(again)") }
        if let s = t["skipped-reel"], s > 0 { lines.append("Reels and stories skipped: \(s + (t["skipped-story"] ?? 0))") }
        let misses = t.filter { $0.key.hasPrefix("unjudged-") }.sorted { $0.key < $1.key }.map { "\($0.key.dropFirst(9)) \($0.value)" }
        if !misses.isEmpty { lines.append("Not judged: " + misses.joined(separator: ", ")) }
        if let b = model["backend"] as? String { lines.append("Model: \(b.isEmpty ? "?" : b), loaded in \(model["loadMs"] as? Int ?? 0) ms, \(model["avgMs"] as? Int ?? 0) ms a picture") }
        return lines
    }
}

/// The classifier page in a hidden web view, made once and kept. Calls queue until the model has loaded.
final class Classifier: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    enum Answer { case scores([String: Double]), failed(String) }
    static let shared = Classifier()
    private var web: WKWebView?
    private(set) var ready = false
    private var queued: [(ticket: String, data: String, done: (Answer) -> Void)] = []
    private var pending: [Int: (Answer) -> Void] = [:]
    private var next = 1
    private var lastEnded: Date?
    /// The model did not load (the page answered ready: false, or the page itself did not open): the page is loaded
    /// again after 1, 3, 8, 20 and then every 60 seconds, until it has. Before 2026-11-12 it was never tried again,
    /// so for the rest of that run of the app nothing was judged and every picture stayed hidden; it was also why
    /// the app test of the classifier failed now and then on a slow simulator. What waits is kept waiting (each ask
    /// still answers "loading" after 120 s), so nothing is shown unjudged.
    private var loadFailures = 0
    private static let reloadAfter: [TimeInterval] = [1, 3, 8, 20]
    private func loadAgain() {
        ready = false
        FilterStats.shared.count("judge-load-failed")
        let wait = loadFailures < Self.reloadAfter.count ? Self.reloadAfter[loadFailures] : 60
        loadFailures += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
            guard let self, !self.ready, let web = self.web else { return }
            self.attachToWindow()
            web.load(URLRequest(url: self.page))
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loadAgain() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return } // our own reload took its place
        loadAgain()
    }

    /// How many pictures the revealing-clothing judge takes at a time (clip.js, its lanes; each is a worker with the
    /// model in it): three on a phone with six cores and 5 GB or more (an iPhone 13 Pro and up), two with four cores
    /// and 3 GB, else one. One, for the rest of this run of the app, after the judge's process ended twice within 90
    /// seconds (iOS took it back for memory).
    private(set) var lanes = Classifier.lanesFor(cores: ProcessInfo.processInfo.activeProcessorCount, memory: ProcessInfo.processInfo.physicalMemory)

    static func lanesFor(cores: Int, memory: UInt64) -> Int {
        let gb = Double(memory) / 1_073_741_824
        if cores >= 6 && gb >= 5 { return 3 }
        if cores >= 4 && gb >= 2.8 { return 2 }
        return 1
    }

    private var page: URL { URL(string: "igc://local/classifier.html?lanes=\(lanes)")! }

    func warmUp() { DispatchQueue.main.async { _ = self.view() } }

    private func view() -> WKWebView? {
        if let web { return web }
        guard Bundle.main.url(forResource: "classifier", withExtension: "html", subdirectory: "shared") != nil else { return nil }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "igc")
        // Served from the app's own files under igc://local/ (BundleFiles), so the page can fetch its models (the
        // revealing-clothing model and its runtime); a file:// page cannot fetch.
        config.setURLSchemeHandler(BundleFiles(), forURLScheme: "igc")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 4, height: 4), configuration: config)
        web.isUserInteractionEnabled = false
        web.alpha = 0.01 // in a window, so WebKit keeps it running; too small and faint to see
        web.navigationDelegate = self
        self.web = web
        attachToWindow()
        web.load(URLRequest(url: page))
        return web
    }

    private func attachToWindow() {
        guard let web, web.window == nil else { return }
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } ?? ($0 as? UIWindowScene)?.windows.first }.first
        window?.addSubview(web)
    }

    func classify(_ dataURL: String, _ done: @escaping (Answer) -> Void) {
        DispatchQueue.main.async {
            guard self.view() != nil else { return done(.failed("loading")) }
            self.attachToWindow()
            if !self.ready {
                // Waiting for the model (the page shows "still checking" and asks again). A classifier that never
                // loads answers "loading" after 120 s, so nothing waits for ever.
                let ticket = UUID().uuidString
                self.queued.append((ticket, dataURL, done))
                DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
                    if let i = self.queued.firstIndex(where: { $0.ticket == ticket }) { self.queued.remove(at: i).done(.failed("loading")) }
                }
                return
            }
            self.send(dataURL, done)
        }
    }

    private func send(_ dataURL: String, _ done: @escaping (Answer) -> Void) {
        let id = next
        next += 1
        pending[id] = done
        let arg = String(data: try! JSONSerialization.data(withJSONObject: [dataURL]), encoding: .utf8)!
        web?.evaluateJavaScript("igcClassify(\(id), \(arg)[0])") { [weak self] _, error in
            if error != nil, let cb = self?.pending.removeValue(forKey: id) { cb(.failed("timeout")) }
        }
        // The page judges one picture at a time; an answer that has not come in 90 s counts as not judged.
        DispatchQueue.main.asyncAfter(deadline: .now() + 90) { [weak self] in
            if let cb = self?.pending.removeValue(forKey: id) { cb(.failed("timeout")) }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if let info = body["info"] as? [String: Any] { FilterStats.shared.setModel(info) }
        if let ok = body["ready"] as? Bool {
            guard ok else { return loadAgain() } // what waits keeps waiting; the page is loaded again
            ready = true
            loadFailures = 0
            let waiting = queued
            queued.removeAll()
            for q in waiting { send(q.data, q.done) }
            return
        }
        guard let id = body["id"] as? Int, let cb = pending.removeValue(forKey: id) else { return }
        if let s = (body["scores"] as? [String: Any])?.compactMapValues({ ($0 as? NSNumber)?.doubleValue }), !s.isEmpty { cb(.scores(s)) }
        else { cb(.failed("bad")) }
    }

    /// The classifier's process ended (memory): start it again; what was waiting is answered as not judged. Twice
    /// within 90 seconds: it comes back with one lane, which needs a third of the memory.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        ready = false
        for (_, cb) in pending { cb(.failed("timeout")) }
        pending.removeAll()
        FilterStats.shared.count("judge-restarted")
        let now = Date()
        if lanes > 1, let last = lastEnded, now.timeIntervalSince(last) < 90 {
            lanes = 1
            FilterStats.shared.count("judge-one-lane")
        }
        lastEnded = now
        webView.load(URLRequest(url: page))
    }
}

/// The classifier page's own files (the app's folder "shared"), as igc://local/<path>. Only files inside that folder.
final class BundleFiles: NSObject, WKURLSchemeHandler {
    private static let types = ["html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "json": "application/json",
                                "wasm": "application/wasm", "onnx": "application/octet-stream", "txt": "text/plain"]
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let base = Bundle.main.resourceURL?.appendingPathComponent("shared").standardizedFileURL,
              let path = task.request.url?.path, !path.contains("..") else { return fail(task) }
        let file = base.appendingPathComponent(String(path.drop(while: { $0 == "/" }))).standardizedFileURL
        guard file.path.hasPrefix(base.path + "/"), let data = try? Data(contentsOf: file) else { return fail(task) }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
    private func fail(_ task: WKURLSchemeTask) {
        task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
    }
}
