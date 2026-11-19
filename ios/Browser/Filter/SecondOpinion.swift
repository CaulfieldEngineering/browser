import Foundation

/// The second opinion, the app's side (2026-11-19; docs/second-opinion.md). The page (filter/shared/second-opinion.js,
/// through bridge-ios.js) hands its units here as JSON; this posts them to the Devices server on the mini PC
/// (POST /api/filter-review, the tailnet address) and answers the reply's JSON, or nil when it is off, unreachable or
/// slower than the page's timeout (the page then keeps the on-device decision). Nothing is kept on the phone.
/// Wired from InstagramFilter.Bridge: `case "second": SecondOpinion.shared.ask(body["body"] as? String) { replyHandler($0, nil) }`.
final class SecondOpinion {
    static let shared = SecondOpinion()
    static let endpoint = URL(string: "http://100.92.203.47:4500/api/filter-review")!

    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 5
        c.timeoutIntervalForResource = 5
        c.waitsForConnectivity = false
        c.httpCookieStorage = nil
        c.urlCache = nil
        return URLSession(configuration: c)
    }()

    /// `json` is the page's request ({items, timeoutMs}); the answer is the server's JSON text or nil.
    func ask(_ json: String?, _ done: @escaping (String?) -> Void) {
        guard let json, json.count < 8_000_000, let data = json.data(using: .utf8),
              var req = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return done(nil) }
        let timeout = min(max((req["timeoutMs"] as? Double) ?? 3000, 300), 5000) / 1000
        let info = Bundle.main.infoDictionary ?? [:]
        req["device"] = "iPhone"
        req["app"] = (info["CFBundleName"] as? String) ?? "Browser"
        req["version"] = (info["CFBundleShortVersionString"] as? String) ?? "?"
        var request = URLRequest(url: Self.endpoint, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: req)
        session.dataTask(with: request) { data, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            let text = ok ? data.flatMap { String(data: $0, encoding: .utf8) } : nil
            DispatchQueue.main.async { done(text) }
        }.resume()
    }
}
