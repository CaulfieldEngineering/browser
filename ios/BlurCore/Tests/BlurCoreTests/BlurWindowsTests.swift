import XCTest
@testable import BlurCore

final class BlurWindowsTests: XCTestCase {
    func testDefaultOffAndExactWindowBoundaries() throws {
        let doc = try BlurWindows(data: Data(#"{"windows":[{"from":"2026-10-31T00:00:00-04:00","until":"2026-10-31T07:00:00-04:00"}]}"#.utf8))
        let start = ISO8601DateFormatter().date(from: "2026-10-31T04:00:00Z")!
        XCTAssertFalse(BlurWindows().isActive(at: start))
        XCTAssertFalse(doc.isActive(at: start.addingTimeInterval(-1)))
        XCTAssertTrue(doc.isActive(at: start))
        XCTAssertTrue(doc.isActive(at: start.addingTimeInterval(7 * 3600 - 0.1)))
        XCTAssertFalse(doc.isActive(at: start.addingTimeInterval(7 * 3600)))
        XCTAssertEqual(doc.nextBoundary(after: start), start.addingTimeInterval(7 * 3600))
    }
    func testBadScheduleDoesNotDecode() {
        for json in [#"{}"#, #"{"windows":null}"#, #"{"windows":[{"from":"2026-10-31T00:00:00","until":"2026-10-31T07:00:00"}]}"#,
                     #"{"windows":[{"from":"2026-10-31T07:00:00Z","until":"2026-10-31T00:00:00Z"}]}"#] {
            XCTAssertThrowsError(try BlurWindows(data: Data(json.utf8)))
        }
    }
    func testCachedDocumentRemainsUsableOfflineAndDSTIsAbsolute() throws {
        let data = Data(#"{"windows":[{"from":"2026-11-01T01:30:00-04:00","until":"2026-11-01T01:30:00-05:00"}]}"#.utf8)
        let cached = try BlurWindows(data: data)
        XCTAssertEqual(cached.windows[0].until.timeIntervalSince(cached.windows[0].from), 3600)
        XCTAssertTrue(cached.isActive(at: cached.windows[0].from.addingTimeInterval(1800)))
    }
}
