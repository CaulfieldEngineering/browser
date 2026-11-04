import ObjectiveC
import WebKit

// Turns what a tab's web view does into visits: every new main-frame address (a full load, or a page changing its
// own address as single-page sites do), with the page's title once it has one. A visit is written when its title
// comes (and a moment more for it to settle), after five seconds without one, or when the tab moves on. A redirect
// hop (gone again within a second, still loading, no title) is not a visit. A page that did not open is a visit
// marked so. Every tab's web view is attached when it is made (BrowserViewController.makeWebView).

final class HistoryRecorder {
    static let shared = HistoryRecorder(store: HistoryStore.shared, feed: Feed.shared)

    private let store: HistoryStore
    private let feed: Feed?
    private let now: () -> Date
    private let after: (TimeInterval, @escaping () -> Void) -> Void

    /// What one web view is on.
    final class Track {
        var pending: Visit?
        var pendingWhileLoading = false
        var token = 0
        var lastURL: String?
    }

    private var tracks: [ObjectIdentifier: Track] = [:]
    private static var watchesKey = 0

    init(store: HistoryStore, feed: Feed?, now: @escaping () -> Date = Date.init,
         after: ((TimeInterval, @escaping () -> Void) -> Void)? = nil) {
        self.store = store
        self.feed = feed
        self.now = now
        self.after = after ?? { delay, block in DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: block) }
    }

    private func track(_ key: ObjectIdentifier) -> Track {
        if let t = tracks[key] { return t }
        let t = Track()
        tracks[key] = t
        return t
    }

    /// Follows a web view's address and title for as long as it lives.
    func attach(_ web: WKWebView) {
        let key = ObjectIdentifier(web)
        let watches = [
            web.observe(\.url, options: [.new]) { [weak self] web, _ in
                self?.addressChanged(key, url: web.url, loading: web.isLoading)
            },
            web.observe(\.title, options: [.new]) { [weak self] web, _ in
                self?.titleChanged(key, title: web.title ?? "", url: web.url)
            },
        ]
        objc_setAssociatedObject(web, &Self.watchesKey, Gone(watches) { [weak self] in self?.forget(key) }, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    /// A load finished: the title it has now is the page's.
    func finished(_ web: WKWebView) {
        let t = track(ObjectIdentifier(web))
        if let p = t.pending, p.url == web.url?.absoluteString {
            if let title = web.title, !title.isEmpty { t.pending?.title = title }
            commit(t)
        }
    }

    /// A main-frame load did not open (a failed load, or a page the browser does not open).
    func failed(_ web: WKWebView, url: URL?) { failed(ObjectIdentifier(web), url: url) }

    func failed(_ key: ObjectIdentifier, url: URL?) {
        guard let url, Self.isWeb(url) else { return }
        let t = track(key)
        if t.pending?.url == url.absoluteString {
            t.pending?.failed = true
        } else {
            commit(t)
            t.pending = Visit(at: now(), url: url.absoluteString, failed: true)
        }
        commit(t)
    }

    static func isWeb(_ url: URL) -> Bool { ["http", "https"].contains(url.scheme?.lowercased() ?? "") }

    func addressChanged(_ key: ObjectIdentifier, url: URL?, loading: Bool) {
        guard let url, Self.isWeb(url) else { return }
        let address = url.absoluteString
        let t = track(key)
        if t.pending?.url == address { return }
        if t.pending == nil, t.lastURL == address { return }
        if let p = t.pending {
            let hop = p.title.isEmpty && !p.failed && t.pendingWhileLoading && now().timeIntervalSince(p.at) < 1
            if hop { t.pending = nil } else { commit(t) }
        }
        t.pending = Visit(at: now(), url: address)
        t.pendingWhileLoading = loading
        schedule(t, in: 5)
    }

    func titleChanged(_ key: ObjectIdentifier, title: String, url: URL?) {
        let t = track(key)
        guard !title.isEmpty, let p = t.pending, url?.absoluteString == p.url else { return }
        let first = p.title.isEmpty
        t.pending?.title = title
        if first { schedule(t, in: 1.5) }
    }

    private func schedule(_ t: Track, in delay: TimeInterval) {
        t.token += 1
        let token = t.token
        after(delay) { [weak self, weak t] in
            guard let self, let t, t.token == token else { return }
            self.commit(t)
        }
    }

    private func commit(_ t: Track) {
        guard let visit = t.pending else { return }
        t.pending = nil
        t.token += 1
        t.lastURL = visit.url
        store.append(visit)
        feed?.record(visit)
    }

    private func forget(_ key: ObjectIdentifier) {
        if let t = tracks[key] { commit(t) }
        tracks[key] = nil
    }

    /// Keeps a web view's observations, and says when the web view is gone.
    private final class Gone {
        let watches: [NSKeyValueObservation]
        let done: () -> Void
        init(_ watches: [NSKeyValueObservation], done: @escaping () -> Void) {
            self.watches = watches
            self.done = done
        }
        deinit {
            let done = self.done
            DispatchQueue.main.async(execute: done)
        }
    }
}
