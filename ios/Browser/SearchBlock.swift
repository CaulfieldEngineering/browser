import Foundation
import WebKit

// Image and video search are off in this browser, always (Joe, 2026-11-04: "all that stuff I looked at I want to
// stop" ... "the rest is through inane channels like image search etc"). There is no switch. Normal web search keeps
// working. Main-frame navigations are stopped in Policy.decide(request:) with the calm blocked page; a search page that
// switches to its image tab without a navigation (DuckDuckGo changes the address with pushState) is caught when the
// address changes; the requests such a page makes for its image results are refused by the content rules below.
enum SearchBlock {
    static let title = "Image search is off here"
    static let reason = "Image and video search are not available in this browser. Web search still works."

    /// True for the image or video vertical of a search engine, reverse image search, and Pinterest search.
    static func isMediaSearch(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              var host = url.host?.lowercased() else { return false }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        if host.hasPrefix("m.") { host.removeFirst(2) }
        let path = url.path.lowercased()
        var query: [String: String] = [:]
        for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
            query[item.name.lowercased()] = (item.value ?? "").lowercased()
        }
        func on(_ domain: String) -> Bool { host == domain || host.hasSuffix("." + domain) }
        func pathStarts(_ prefixes: String...) -> Bool { prefixes.contains { path == $0 || path.hasPrefix($0 + "/") || path.hasPrefix($0 + "?") } }
        let label = host.split(separator: ".").first.map(String.init) ?? host

        // Reverse image search and face search sites: the whole site.
        for site in ["tineye.com", "pimeyes.com", "facecheck.id", "lenso.ai", "search4faces.com", "lens.google.com", "images.google.com"] where on(site) { return true }
        // Google, any country domain (google.com, google.co.uk, google.de ...).
        if host.hasPrefix("images.google.") || host.hasPrefix("video.google.") || host.hasPrefix("lens.google.") { return true }
        if label == "google" || host.contains(".google.") || host.hasPrefix("google.") {
            if pathStarts("/imghp", "/images", "/videohp", "/searchbyimage") { return true }
            if ["isch", "vid"].contains(query["tbm"] ?? "") { return true }
            if ["2", "7"].contains(query["udm"] ?? "") { return true }
            if (query["tbs"] ?? "").contains("sbi") { return true }
        }
        if on("duckduckgo.com") {
            if ["images", "videos"].contains(query["ia"] ?? "") || ["images", "videos"].contains(query["iax"] ?? "") { return true }
            if path == "/i.js" || path == "/v.js" { return true }
        }
        if on("bing.com") && pathStarts("/images", "/videos") { return true }
        if host.hasPrefix("images.search.yahoo.") || host.hasPrefix("video.search.yahoo.") { return true }
        if host.contains("search.yahoo.") && pathStarts("/search/images", "/search/video", "/search/videos") { return true }
        if host.hasPrefix("yandex.") || host.contains(".yandex.") {
            if pathStarts("/images", "/video") { return true }
        }
        if on("ecosia.org") && pathStarts("/images", "/videos") { return true }
        if on("search.brave.com") && pathStarts("/images", "/videos") { return true }
        if on("startpage.com") && ["images", "video", "videos"].contains(query["cat"] ?? "") { return true }
        if on("qwant.com") && ["images", "videos"].contains(query["t"] ?? "") { return true }
        if on("mojeek.com") && query["fmt"] == "images" { return true }
        if on("search.aol.com") && pathStarts("/aol/image", "/aol/video") { return true }
        if host == "image.baidu.com" || host == "pic.sogou.com" || host == "video.baidu.com" { return true }
        if (label == "pinterest" || host.contains(".pinterest.") || host.hasPrefix("pinterest.")) && pathStarts("/search") { return true }
        return false
    }

    /// Requests a search page makes for image or video results without navigating (fetch, XHR, scripts).
    /// No alternation in WebKit content rule regexes, so one rule per pattern.
    static let rules = """
    [
      {"trigger":{"url-filter":"^https?://[^/]*duckduckgo\\\\.com/[iv]\\\\.js"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*duckduckgo\\\\.com/.*[?&]iax?=images"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*duckduckgo\\\\.com/.*[?&]iax?=videos"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*bing\\\\.com/images/"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*bing\\\\.com/videos/"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*google\\\\.[^/]*/search\\\\?.*tbm=isch"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://[^/]*google\\\\.[^/]*/search\\\\?.*udm=2"},"action":{"type":"block"}},
      {"trigger":{"url-filter":"^https?://lens\\\\.google\\\\.com"},"action":{"type":"block"}}
    ]
    """

    private static var rule: WKContentRuleList?
    private static var waiting: [(WKContentRuleList?) -> Void] = []

    static func prepare(_ completion: @escaping (WKContentRuleList?) -> Void) {
        if let rule { completion(rule); return }
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "media-search-v1", encodedContentRuleList: rules) { result, _ in
            DispatchQueue.main.async {
                rule = result
                let callbacks = waiting
                waiting.removeAll()
                callbacks.forEach { $0(result) }
            }
        }
    }

    /// Adds the rules to a web view's controller (now, or as soon as they are compiled).
    static func attach(to web: WKWebView) {
        prepare { [weak web] rule in
            guard let web, let rule else { return }
            web.configuration.userContentController.add(rule)
        }
    }
}
