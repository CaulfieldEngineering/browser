import Foundation

// History (Joe, 2026-11-03: "Are you able to log my browser history from our app?", and what for: "Both mainly
// adaptive accountability"). Every main-frame page a tab opens is kept here, on the phone, for the History view, and
// also goes to the mini PC through the feed (Feed.swift). One JSON line per visit, one file per month, in Application
// Support; written only by appending. There is no setting that stops it and nothing in the app that deletes it.

struct Visit: Codable, Equatable {
    let id: UUID
    let at: Date
    let url: String
    var title: String
    /// The page did not open (a failed load or a page the browser does not open).
    var failed: Bool

    init(id: UUID = UUID(), at: Date, url: String, title: String = "", failed: Bool = false) {
        self.id = id
        self.at = at
        self.url = url
        self.title = title
        self.failed = failed
    }

    /// The page's title, else its site.
    var displayTitle: String {
        if !title.isEmpty { return title }
        let short = BrowserViewController.shortAddress(URL(string: url))
        return short.isEmpty ? url : short
    }
}

final class HistoryStore {
    static let shared = HistoryStore(directory: HistoryStore.defaultDirectory)
    static let changed = Notification.Name("HistoryStore.changed")

    static var defaultDirectory: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return support.appendingPathComponent("history", isDirectory: true)
    }

    let directory: URL
    private let queue = DispatchQueue(label: "history.store")
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
    private let monthFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM"
        return f
    }()

    init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Adds a visit to the end of its month's file.
    func append(_ visit: Visit) {
        queue.sync {
            guard var line = try? encoder.encode(visit) else { return }
            line.append(0x0A)
            let file = directory.appendingPathComponent("\(monthFormat.string(from: visit.at)).jsonl")
            if let handle = try? FileHandle(forWritingTo: file) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: line)
            } else {
                try? line.write(to: file, options: .atomic)
            }
        }
        NotificationCenter.default.post(name: Self.changed, object: self)
    }

    /// The months that have visits, newest first ("2026-11").
    func months() -> [String] {
        queue.sync {
            let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
            return names.filter { $0.hasSuffix(".jsonl") }.map { String($0.dropLast(6)) }.sorted(by: >)
        }
    }

    /// One month's visits, newest first.
    func visits(in month: String) -> [Visit] {
        queue.sync {
            let file = directory.appendingPathComponent("\(month).jsonl")
            guard let data = try? Data(contentsOf: file) else { return [] }
            var out: [Visit] = []
            for line in data.split(separator: 0x0A) where !line.isEmpty {
                if let v = try? decoder.decode(Visit.self, from: Data(line)) { out.append(v) }
            }
            return out.sorted { $0.at > $1.at }
        }
    }

    /// Every visit whose title or address has every word of `text`, newest first.
    func search(_ text: String, limit: Int = 500) -> [Visit] {
        let words = text.lowercased().split(separator: " ").map(String.init)
        guard !words.isEmpty else { return [] }
        var out: [Visit] = []
        for month in months() {
            for v in visits(in: month) {
                let hay = (v.title + " " + v.url).lowercased()
                if words.allSatisfy({ hay.contains($0) }) {
                    out.append(v)
                    if out.count >= limit { return out }
                }
            }
        }
        return out
    }
}
