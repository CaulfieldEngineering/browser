import Foundation

/// Bounded ephemeral fetches to the image's own URL. Never forwards the page URL, cookies, or credentials.
/// Private/authenticated images that this cannot read remain covered.
final class BlurImageLoader: NSObject, URLSessionDataDelegate {
    private static let limit = 20 * 1024 * 1024
    private var bytes = Data()
    private var completion: ((Data?) -> Void)?
    private var session: URLSession?
    private var finished = false

    static func fetch(_ url: URL, completion: @escaping (Data?) -> Void) {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil else { completion(nil); return }
        let loader = BlurImageLoader()
        loader.completion = completion
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        loader.session = URLSession(configuration: config, delegate: loader, delegateQueue: nil)
        loader.session?.dataTask(with: url).resume()
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode),
              response.expectedContentLength <= Int64(Self.limit), response.mimeType?.hasPrefix("image/") == true else {
            completionHandler(.cancel); finish(nil); return
        }
        completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count + data.count <= Self.limit else { dataTask.cancel(); finish(nil); return }
        bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil else { completionHandler(nil); return }
        completionHandler(URLRequest(url: url))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { finish(error == nil ? bytes : nil) }
    private func finish(_ result: Data?) {
        guard !finished else { return }
        finished = true
        completion?(result)
        completion = nil
        session?.invalidateAndCancel()
        session = nil
    }
}
