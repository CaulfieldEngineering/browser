import Foundation
import Network
import Security
import UIKit

// The feed to the mini PC (Joe, 2026-11-03: history "mainly" for "adaptive accountability"). Every visit, and a
// heartbeat while the browser is in use, goes into a queue kept in a file on the phone and is sent in batches to the
// HQ service on the mini PC (hq-widget server/browser-feed.js) over the tailnet. Offline, the queue waits and is sent
// when the mini PC can be reached; sending never blocks browsing. Each event has a sequence number kept in the
// Keychain with this install's id, so the mini PC can tell a gap (a lost queue) from a quiet phone.
// The key for the feed is asked for and kept by itself (it is good for nothing but the feed). There is no switch.

struct FeedEvent: Codable, Equatable {
    let seq: Int
    let type: String // "visit" or "beat"
    let at: Date
    var url: String?
    var title: String?
    var failed: Bool?
    var state: String? // a beat's: "active" (in use) or "background" (just left)
}

/// Small values that should outlive a reinstall: the install id, the last sequence number, the feed key.
protocol SecretStore: AnyObject {
    func string(_ key: String) -> String?
    func set(_ value: String?, for key: String)
}

final class MemorySecrets: SecretStore {
    var values: [String: String] = [:]
    func string(_ key: String) -> String? { values[key] }
    func set(_ value: String?, for key: String) { values[key] = value }
}

/// The Keychain, this device only. If the Keychain refuses (as an unsigned simulator build can), UserDefaults.
final class KeychainSecrets: SecretStore {
    private let service = "com.caulfieldengineering.browser.feed"

    func string(_ key: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data, let s = String(data: data, encoding: .utf8) {
            return s
        }
        return UserDefaults.standard.string(forKey: "feed." + key)
    }

    func set(_ value: String?, for key: String) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(base as CFDictionary)
        guard let value else {
            UserDefaults.standard.removeObject(forKey: "feed." + key)
            return
        }
        var item = base
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        if SecItemAdd(item as CFDictionary, nil) == errSecSuccess {
            UserDefaults.standard.removeObject(forKey: "feed." + key)
        } else {
            UserDefaults.standard.set(value, forKey: "feed." + key)
        }
    }
}

/// The waiting events, in a file, oldest first.
final class FeedQueue {
    /// Beyond this the oldest go (the mini PC sees the missing numbers as a gap).
    static let cap = 20000
    let file: URL
    private(set) var events: [FeedEvent] = []
    private let secrets: SecretStore
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    init(file: URL, secrets: SecretStore) {
        self.file = file
        self.secrets = secrets
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let data = try? Data(contentsOf: file), let saved = try? decoder.decode([FeedEvent].self, from: data) { events = saved }
    }

    /// This install's id, made once and kept with the sequence number.
    var install: String {
        if let id = secrets.string("install") { return id }
        let id = UUID().uuidString
        secrets.set(id, for: "install")
        return id
    }

    var lastSeq: Int { Int(secrets.string("seq") ?? "") ?? 0 }

    @discardableResult
    func add(type: String, at: Date, url: String? = nil, title: String? = nil, failed: Bool? = nil, state: String? = nil) -> FeedEvent {
        _ = install
        let seq = lastSeq + 1
        secrets.set(String(seq), for: "seq") // first, so a number is never used twice
        let event = FeedEvent(seq: seq, type: type, at: at, url: url, title: title, failed: failed, state: state)
        events.append(event)
        if events.count > Self.cap { events.removeFirst(events.count - Self.cap) }
        save()
        return event
    }

    /// Everything up to and including `seq` reached the mini PC.
    func drop(upTo seq: Int) {
        let before = events.count
        events.removeAll { $0.seq <= seq }
        if events.count != before { save() }
    }

    private func save() {
        if let data = try? encoder.encode(events) { try? data.write(to: file, options: .atomic) }
    }
}

enum FeedAnswer: Equatable {
    case ok(upTo: Int)
    case unauthorized
    case failed
}

protocol FeedTransport {
    func pair(name: String, completion: @escaping (String?) -> Void)
    func send(_ body: Data, key: String, completion: @escaping (FeedAnswer) -> Void)
}

/// The HQ service on the mini PC, by its Tailscale name over HTTPS (its own certificate), reached through the
/// service's CONNECT tunnel on the tailnet address, because the phone does not resolve Tailscale names. The way the
/// HQ app reaches it (hq-widget ios/HQ/WebViewController.swift, `Server`).
final class ServerTransport: FeedTransport {
    static let name = "mini-pc.tail625446.ts.net"
    static let base = URL(string: "https://mini-pc.tail625446.ts.net:4440")!

    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        var proxy = ProxyConfiguration(httpCONNECTProxy: NWEndpoint.hostPort(host: "100.92.203.47", port: 4400))
        proxy.matchDomains = [ServerTransport.name]
        c.proxyConfigurations = [proxy]
        c.timeoutIntervalForRequest = 20
        c.timeoutIntervalForResource = 60
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    func pair(name: String, completion: @escaping (String?) -> Void) {
        var request = URLRequest(url: Self.base.appendingPathComponent("api/browser/pair"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["name": name])
        session.dataTask(with: request) { data, response, _ in
            guard (response as? HTTPURLResponse)?.statusCode == 200, let data,
                  let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return completion(nil) }
            completion(info["key"] as? String)
        }.resume()
    }

    func send(_ body: Data, key: String, completion: @escaping (FeedAnswer) -> Void) {
        var request = URLRequest(url: Self.base.appendingPathComponent("api/browser/feed"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(key, forHTTPHeaderField: "x-widget-key")
        request.httpBody = body
        session.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { return completion(.unauthorized) }
            guard status == 200, let data, let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let upTo = info["upTo"] as? Int else { return completion(.failed) }
            completion(.ok(upTo: upTo))
        }.resume()
    }
}

/// The queue and its sender. Everything runs on its own serial queue; callers never wait on the network.
final class Feed {
    static let shared = Feed(
        queueFile: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!.appendingPathComponent("feed/outbox.json"),
        secrets: KeychainSecrets(),
        transport: ServerTransport()
    )

    static let batchSize = 200
    /// Waits after a failure, longest last, then the longest again until it goes through.
    static let backoff: [TimeInterval] = [5, 15, 60, 120, 300]

    let work: DispatchQueue
    let queue: FeedQueue
    private let secrets: SecretStore
    private let transport: FeedTransport
    private let now: () -> Date
    /// Runs a block on `work` after a delay; the tests run it by hand.
    private let after: (TimeInterval, @escaping () -> Void) -> Void
    private var sending = false
    private var failures = 0
    private var retryPlanned = false
    private var monitor: NWPathMonitor?

    init(queueFile: URL, secrets: SecretStore, transport: FeedTransport, now: @escaping () -> Date = Date.init,
         after: ((TimeInterval, @escaping () -> Void) -> Void)? = nil) {
        self.queue = FeedQueue(file: queueFile, secrets: secrets)
        self.secrets = secrets
        self.transport = transport
        self.now = now
        let work = DispatchQueue(label: "feed")
        self.work = work
        self.after = after ?? { delay, block in work.asyncAfter(deadline: .now() + delay, execute: block) }
    }

    private static var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "" }
    private static var build: Int { Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0 }

    /// At launch: send what waited, and again whenever the network comes back.
    func start() {
        work.async {
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { [weak self] path in
                if path.status == .satisfied { self?.work.async { self?.failures = 0; self?.send() } }
            }
            monitor.start(queue: self.work)
            self.monitor = monitor
            self.send()
        }
    }

    func record(_ visit: Visit) {
        work.async {
            self.queue.add(type: "visit", at: visit.at, url: visit.url, title: visit.title, failed: visit.failed ? true : nil)
            self.soon()
        }
    }

    func beat(_ state: String) {
        work.async {
            self.queue.add(type: "beat", at: self.now(), state: state)
            self.soon()
        }
    }

    /// Send now if nothing is on its way (the app came to the front, or a test).
    func flush() { work.async { self.send() } }

    /// A visit usually comes with others (a redirect, the next page): wait two seconds and send them together.
    private func soon() {
        guard !retryPlanned else { return }
        retryPlanned = true
        after(2) { [weak self] in
            self?.retryPlanned = false
            self?.send()
        }
    }

    private func retryLater() {
        let wait = Self.backoff[min(failures, Self.backoff.count - 1)]
        failures += 1
        guard !retryPlanned else { return }
        retryPlanned = true
        after(wait) { [weak self] in
            self?.retryPlanned = false
            self?.send()
        }
    }

    /// One batch at a time. On success the next batch goes at once; on failure it waits (backoff) and tries again.
    private func send() {
        guard !sending, !queue.events.isEmpty else { return }
        guard let key = secrets.string("key") else {
            sending = true
            transport.pair(name: "\(Flavor.name) (iPhone)") { [weak self] key in
                guard let self else { return }
                self.work.async {
                    self.sending = false
                    if let key {
                        self.secrets.set(key, for: "key")
                        self.send()
                    } else {
                        self.retryLater()
                    }
                }
            }
            return
        }
        let batch = Array(queue.events.prefix(Self.batchSize))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let events = (try? JSONSerialization.jsonObject(with: encoder.encode(batch))) ?? []
        var body: [String: Any] = ["install": queue.install, "app": Flavor.feedApp, "version": Self.version, "build": Self.build,
                                   "pending": queue.events.count, "events": events]
        if let oldest = queue.events.first?.at { body["oldestPending"] = ISO8601DateFormatter().string(from: oldest) }
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        sending = true
        transport.send(data, key: key) { [weak self] answer in
            guard let self else { return }
            self.work.async {
                self.sending = false
                switch answer {
                case let .ok(upTo):
                    self.failures = 0
                    self.queue.drop(upTo: upTo)
                    if !self.queue.events.isEmpty, batch.last.map({ $0.seq <= upTo }) ?? false { self.send() }
                case .unauthorized:
                    // The key was revoked or lost on the mini PC: ask for a new one.
                    self.secrets.set(nil, for: "key")
                    self.retryLater()
                case .failed:
                    self.retryLater()
                }
            }
        }
    }
}

/// Says the browser is in use, every five minutes while it is in front, and when it comes to the front or leaves,
/// even with no visits, so the mini PC can tell "not browsing" from "the feed stopped".
final class Heartbeat {
    static let shared = Heartbeat(feed: Feed.shared)
    static let interval: TimeInterval = 300

    private let feed: Feed
    private let now: () -> Date
    private var timer: Timer?
    private(set) var lastBeat: Date?

    init(feed: Feed, now: @escaping () -> Date = Date.init) {
        self.feed = feed
        self.now = now
    }

    /// Watches the app coming to the front and going away.
    func start() {
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.cameToFront() }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.wentAway() }
        if UIApplication.shared.applicationState == .active { cameToFront() }
    }

    func cameToFront() {
        beat("active")
        feed.flush()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.tick() }
    }

    func wentAway() {
        timer?.invalidate()
        timer = nil
        beat("background")
        // A little time to get the last events out before iOS suspends the app.
        var task = UIBackgroundTaskIdentifier.invalid
        let end = {
            guard task != .invalid else { return }
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        task = UIApplication.shared.beginBackgroundTask { end() }
        feed.flush()
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { end() }
    }

    /// Checked every minute while in front; beats once the interval has passed.
    func tick() {
        guard let last = lastBeat, now().timeIntervalSince(last) < Self.interval - 1 else { return beat("active") }
    }

    private func beat(_ state: String) {
        lastBeat = now()
        feed.beat(state)
    }
}
