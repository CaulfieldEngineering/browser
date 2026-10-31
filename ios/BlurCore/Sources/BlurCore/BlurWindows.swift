import Foundation

/// The only input to activation. All comparisons use absolute instants, including DST changes.
public struct BlurWindows: Equatable {
    public struct Window: Equatable {
        public let from: Date
        public let until: Date
        public init(from: Date, until: Date) { self.from = from; self.until = until }
    }
    public let windows: [Window]
    public init(windows: [Window] = []) { self.windows = windows }

    public init(data: Data) throws {
        struct Document: Decodable {
            struct Entry: Decodable { let from: String; let until: String }
            let windows: [Entry]
        }
        guard data.count <= 64 * 1024 else { throw InvalidSchedule.invalid }
        let doc = try JSONDecoder().decode(Document.self, from: data)
        guard doc.windows.count <= 128 else { throw InvalidSchedule.invalid }
        let iso = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func date(_ value: String) -> Date? {
            // Require a timezone; never interpret a server string in the phone's current timezone.
            guard value.range(of: #"(Z|[+-]\d{2}:\d{2})$"#, options: .regularExpression) != nil else { return nil }
            return iso.date(from: value) ?? fractional.date(from: value)
        }
        windows = try doc.windows.map {
            guard let from = date($0.from), let until = date($0.until), until > from else { throw InvalidSchedule.invalid }
            return Window(from: from, until: until)
        }
    }

    public func isActive(at now: Date) -> Bool { windows.contains { $0.from <= now && now < $0.until } }
    public func nextBoundary(after now: Date) -> Date? {
        windows.flatMap { [$0.from, $0.until] }.filter { $0 > now }.min()
    }
    private enum InvalidSchedule: Error { case invalid }
}
