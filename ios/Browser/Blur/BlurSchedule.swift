import UIKit
import BlurCore

/// Main-thread owned. The schedule is the only network request this feature makes apart from fetching
/// an image from its original source. No browsing URL, image, frame, or inference result goes to a service.
final class BlurSchedule {
    static let shared = BlurSchedule()
    static let changed = Notification.Name("BlurScheduleChanged")
    private static let key = "blur.schedule.v1"
    private(set) var active = false
    private var document: BlurWindows
    private var heldWindows: [BlurWindows.Window] = []
    private var refreshTimer: Timer?
    private var boundaryTimer: Timer?
    private var fetching = false
    private var observers: [NSObjectProtocol] = []
    private let session: URLSession

    private init() {
        document = UserDefaults.standard.data(forKey: Self.key).flatMap { try? BlurWindows(data: $0) } ?? BlurWindows()
        active = document.isActive(at: Date())
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        config.httpCookieStorage = nil
        config.urlCache = nil
        session = URLSession(configuration: config)
    }

    func start() {
        guard refreshTimer == nil else { return }
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.evaluate(); self?.refresh()
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.significantTimeChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.evaluate() })
        let timer = Timer(timeInterval: 300, repeats: true) { [weak self] _ in self?.evaluate(); self?.refresh() }
        RunLoop.main.add(timer, forMode: .common)
        refreshTimer = timer
        evaluate()
        refresh()
    }

    private func evaluate() {
        let now = Date()
        heldWindows.removeAll { $0.until <= now }
        let effective = BlurWindows(windows: document.windows + heldWindows)
        let value = effective.isActive(at: now)
        if value != active {
            active = value
            NotificationCenter.default.post(name: Self.changed, object: self)
        }
        boundaryTimer?.invalidate()
        if let next = effective.nextBoundary(after: now) {
            let timer = Timer(timeInterval: max(0.05, next.timeIntervalSince(now)), repeats: false) { [weak self] _ in self?.evaluate() }
            RunLoop.main.add(timer, forMode: .common)
            boundaryTimer = timer
        }
    }

    private func refresh() {
        guard !fetching else { return }
        fetching = true
        // Cache-busting prevents a CDN's older empty document from delaying a newly requested window.
        let url = URL(string: "https://caulfieldengineering.github.io/browser-install/blur.json?t=\(Int(Date().timeIntervalSince1970))")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        session.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.fetching = false
                defer { self.evaluate() }
                guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                      let data, let next = try? BlurWindows(data: data) else { return }
                // Even a stale but valid response cannot shorten a window already in effect.
                let now = Date()
                self.heldWindows += self.document.windows.filter { $0.from <= now && now < $0.until }
                self.document = next
                let retained = next.windows + self.heldWindows
                let formatter = ISO8601DateFormatter()
                let stored = ["windows": retained.map { ["from": formatter.string(from: $0.from), "until": formatter.string(from: $0.until)] }]
                if let cached = try? JSONSerialization.data(withJSONObject: stored) { UserDefaults.standard.set(cached, forKey: Self.key) }
            }
        }.resume()
    }
}
