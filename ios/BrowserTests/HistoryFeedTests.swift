import XCTest
@testable import Browser

// History on the phone, the queue to the mini PC with its retries, the heartbeat, and the recorder's idea of a visit.
// Every test uses its own folder and in-memory secrets; nothing reaches the network.

private func scratch() -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("hf-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

private func date(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

/// Stands in for the mini PC: answers from a script, records what it was sent.
private final class FakeTransport: FeedTransport {
    var pairAnswers: [String?] = []
    var sendAnswers: [FeedAnswer] = []
    var pairs = 0
    var sent: [[String: Any]] = []
    var keysUsed: [String] = []

    func pair(name: String, completion: @escaping (String?) -> Void) {
        pairs += 1
        completion(pairAnswers.isEmpty ? "dev.key" : pairAnswers.removeFirst())
    }

    func send(_ body: Data, key: String, completion: @escaping (FeedAnswer) -> Void) {
        let info = (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:]
        sent.append(info)
        keysUsed.append(key)
        if !sendAnswers.isEmpty { return completion(sendAnswers.removeFirst()) }
        let seqs = (info["events"] as? [[String: Any]] ?? []).compactMap { $0["seq"] as? Int }
        completion(.ok(upTo: seqs.max() ?? 0))
    }
}

/// Delayed blocks, run by hand.
private final class Later {
    var waits: [TimeInterval] = []
    var blocks: [() -> Void] = []
    func run(on feed: Feed) {
        let now = blocks
        blocks = []
        for b in now { feed.work.sync(execute: b) }
        drain(feed)
    }
}

private func drain(_ feed: Feed) {
    for _ in 0..<8 { feed.work.sync {} }
}

private func makeFeed(_ transport: FakeTransport, secrets: MemorySecrets = MemorySecrets(), dir: URL = scratch(), later: Later) -> Feed {
    Feed(queueFile: dir.appendingPathComponent("outbox.json"), secrets: secrets, transport: transport, now: { date("2026-11-03T22:00:00Z") },
         after: { wait, block in later.waits.append(wait); later.blocks.append(block) })
}

final class HistoryStoreTests: XCTestCase {
    func testKeepsVisitsByMonthNewestFirstAndAcrossLaunches() {
        let dir = scratch()
        let store = HistoryStore(directory: dir)
        store.append(Visit(at: date("2026-10-31T12:00:00Z"), url: "https://a.example/one", title: "One"))
        store.append(Visit(at: date("2026-11-02T12:00:00Z"), url: "https://b.example/two", title: "Two"))
        store.append(Visit(at: date("2026-11-03T12:00:00Z"), url: "https://c.example/three", title: "", failed: true))

        let again = HistoryStore(directory: dir) // the next launch
        XCTAssertEqual(again.months().count, 2)
        XCTAssertEqual(again.months(), again.months().sorted(by: >))
        let november = again.visits(in: again.months()[0])
        XCTAssertEqual(november.map(\.url), ["https://c.example/three", "https://b.example/two"])
        XCTAssertTrue(november[0].failed)
        XCTAssertEqual(november[0].displayTitle, "c.example")
        XCTAssertEqual(again.visits(in: again.months()[1]).map(\.title), ["One"])
    }

    func testSearchMatchesEveryWordInTitleOrAddress() {
        let store = HistoryStore(directory: scratch())
        store.append(Visit(at: date("2026-11-01T12:00:00Z"), url: "https://news.example/story", title: "Big Story Today"))
        store.append(Visit(at: date("2026-11-02T12:00:00Z"), url: "https://shop.example/pedals", title: "Fuzz Pedal"))
        XCTAssertEqual(store.search("story news").map(\.title), ["Big Story Today"])
        XCTAssertEqual(store.search("PEDAL").count, 1)
        XCTAssertEqual(store.search("pedal story").count, 0)
        XCTAssertEqual(store.search("   ").count, 0)
    }

    func testHistoryViewGroupsByDay() {
        XCTAssertEqual(HistoryView.title(for: Date()), "Today")
        XCTAssertEqual(HistoryView.title(for: Date().addingTimeInterval(-86400)), "Yesterday")
    }
}

final class FeedQueueTests: XCTestCase {
    func testNumbersKeepGoingAcrossLaunchesAndAReinstall() {
        let secrets = MemorySecrets()
        let dir = scratch()
        let q = FeedQueue(file: dir.appendingPathComponent("outbox.json"), secrets: secrets)
        let install = q.install
        XCTAssertEqual(q.add(type: "visit", at: Date(), url: "https://a.example").seq, 1)
        XCTAssertEqual(q.add(type: "beat", at: Date(), state: "active").seq, 2)

        let relaunched = FeedQueue(file: dir.appendingPathComponent("outbox.json"), secrets: secrets)
        XCTAssertEqual(relaunched.events.map(\.seq), [1, 2])
        relaunched.drop(upTo: 1)
        XCTAssertEqual(FeedQueue(file: dir.appendingPathComponent("outbox.json"), secrets: secrets).events.map(\.seq), [2])

        // A reinstall loses the file but not the Keychain: same install, the next number, so the mini PC sees a gap.
        let reinstalled = FeedQueue(file: scratch().appendingPathComponent("outbox.json"), secrets: secrets)
        XCTAssertEqual(reinstalled.install, install)
        XCTAssertEqual(reinstalled.add(type: "beat", at: Date()).seq, 3)
    }
}

final class FeedSendingTests: XCTestCase {
    func testPairsSendsInBatchesAndEmptiesTheQueue() {
        let transport = FakeTransport()
        let later = Later()
        let feed = makeFeed(transport, later: later)
        for i in 0..<450 { feed.record(Visit(at: date("2026-11-03T21:00:00Z"), url: "https://e.example/\(i)", title: "P\(i)")) }
        drain(feed)
        XCTAssertTrue(transport.sent.isEmpty, "waits a moment to gather a batch")
        XCTAssertEqual(later.waits, [2])
        later.run(on: feed)
        XCTAssertEqual(transport.pairs, 1)
        XCTAssertEqual(transport.sent.map { ($0["events"] as? [Any])?.count ?? 0 }, [200, 200, 50])
        XCTAssertEqual(transport.sent[0]["pending"] as? Int, 450)
        XCTAssertNotNil(transport.sent[0]["install"] as? String)
        let first = (transport.sent[0]["events"] as? [[String: Any]])?.first
        XCTAssertEqual(first?["type"] as? String, "visit")
        XCTAssertEqual(first?["url"] as? String, "https://e.example/0")
        XCTAssertEqual(first?["at"] as? String, "2026-11-03T21:00:00Z")
        XCTAssertTrue(feed.queue.events.isEmpty)
    }

    func testOfflineKeepsTheQueueAndRetriesWithBackoff() {
        let transport = FakeTransport()
        transport.pairAnswers = [nil] // the mini PC cannot be reached
        transport.sendAnswers = [.failed, .failed]
        let later = Later()
        let feed = makeFeed(transport, later: later)
        feed.beat("active")
        drain(feed)
        later.run(on: feed) // the two-second gather: pairing fails
        XCTAssertEqual(later.waits.last, 5)
        later.run(on: feed) // paired; the send fails
        XCTAssertEqual(later.waits.last, 15)
        XCTAssertEqual(feed.queue.events.count, 1, "nothing is lost while it cannot be sent")
        feed.beat("active")
        drain(feed)
        later.run(on: feed) // fails again
        XCTAssertEqual(later.waits.last, 60)
        later.run(on: feed) // goes through
        XCTAssertTrue(feed.queue.events.isEmpty)
        XCTAssertEqual(transport.sent.last.flatMap { ($0["events"] as? [Any])?.count }, 2)
    }

    func testARevokedKeyIsReplaced() {
        let transport = FakeTransport()
        transport.pairAnswers = ["old.key", "new.key"]
        transport.sendAnswers = [.unauthorized]
        let secrets = MemorySecrets()
        let later = Later()
        let feed = makeFeed(transport, secrets: secrets, later: later)
        feed.beat("active")
        drain(feed)
        later.run(on: feed)
        XCTAssertNil(secrets.string("key"))
        later.run(on: feed)
        XCTAssertEqual(transport.keysUsed, ["old.key", "new.key"])
        XCTAssertEqual(secrets.string("key"), "new.key")
        XCTAssertTrue(feed.queue.events.isEmpty)
    }

    func testAResentBatchIsDroppedByTheMiniPCsAnswer() {
        let transport = FakeTransport()
        transport.sendAnswers = [.ok(upTo: 1)] // took only the first; the rest go again
        let later = Later()
        let feed = makeFeed(transport, later: later)
        feed.beat("active")
        feed.beat("background")
        drain(feed)
        later.run(on: feed)
        XCTAssertEqual(feed.queue.events.map(\.seq), [2])
        feed.flush()
        drain(feed)
        XCTAssertTrue(feed.queue.events.isEmpty)
    }
}

final class HeartbeatTests: XCTestCase {
    func testBeatsWhileInUseAndWhenLeaving() {
        let transport = FakeTransport()
        transport.pairAnswers = Array(repeating: nil as String?, count: 50) // offline: the beats stay in the queue to be read
        let later = Later()
        let feed = makeFeed(transport, later: later)
        var clock = date("2026-11-03T22:00:00Z")
        let heart = Heartbeat(feed: feed, now: { clock })

        heart.cameToFront()
        drain(feed)
        XCTAssertEqual(feed.queue.events.map { $0.state ?? "" }, ["active"])
        clock += 120
        heart.tick() // two minutes: not yet
        drain(feed)
        XCTAssertEqual(feed.queue.events.count, 1)
        clock += 200
        heart.tick() // past five minutes, with no visits: a beat
        drain(feed)
        XCTAssertEqual(feed.queue.events.map { $0.state ?? "" }, ["active", "active"])
        heart.wentAway()
        drain(feed)
        XCTAssertEqual(feed.queue.events.last?.state, "background")
        XCTAssertTrue(feed.queue.events.allSatisfy { $0.type == "beat" })
    }
}

final class HistoryRecorderTests: XCTestCase {
    func testAVisitIsWrittenWithItsTitleAndARedirectHopIsNot() {
        let store = HistoryStore(directory: scratch())
        var clock = date("2026-11-03T22:00:00Z")
        var blocks: [() -> Void] = []
        let recorder = HistoryRecorder(store: store, feed: nil, now: { clock }, after: { _, b in blocks.append(b) })
        let tab = ObjectIdentifier(NSObject())

        recorder.addressChanged(tab, url: URL(string: "https://t.example/r"), loading: true) // a redirect hop
        clock += 0.3
        recorder.addressChanged(tab, url: URL(string: "https://dest.example/page"), loading: true)
        recorder.titleChanged(tab, title: "Destination", url: URL(string: "https://dest.example/page"))
        blocks.forEach { $0() }
        blocks = []
        clock += 10
        recorder.addressChanged(tab, url: URL(string: "https://dest.example/page"), loading: false) // same page: nothing
        recorder.addressChanged(tab, url: URL(string: "about:blank"), loading: false) // not the web: nothing
        recorder.failed(tab, url: URL(string: "https://gone.example/"))

        let visits = store.visits(in: store.months()[0])
        XCTAssertEqual(visits.map(\.url), ["https://gone.example/", "https://dest.example/page"])
        XCTAssertEqual(visits[1].title, "Destination")
        XCTAssertTrue(visits[0].failed)
    }

    func testAPageLeftQuicklyIsStillAVisit() {
        let store = HistoryStore(directory: scratch())
        var clock = date("2026-11-03T22:00:00Z")
        let recorder = HistoryRecorder(store: store, feed: nil, now: { clock }, after: { _, _ in })
        let tab = ObjectIdentifier(NSObject())
        recorder.addressChanged(tab, url: URL(string: "https://one.example/"), loading: false) // a page changing its own address
        clock += 0.2
        recorder.addressChanged(tab, url: URL(string: "https://two.example/"), loading: false)
        XCTAssertEqual(store.visits(in: store.months()[0]).map(\.url), ["https://one.example/"])
    }
}
