import Foundation
import WebKit

// The Reddit app (project.yml target Reddit, REDDIT_APP; Joe, 2026-11-12: "start building a version of Facebook and one
// of Reddit that have similar filtering features", then "For Reddit, no images allowed. And text-context filtering.").
//
// BUILT, NOT OPEN. Reddit stays blocked everywhere (TechLockdown, DNS, the browsers' policy; locked memory entry 4), and
// nothing here changes that. This app is not published to the install page, has no ad-hoc profile, and opens nothing:
// every Reddit address stops at "Reddit is not open" until BOTH locks are turned, `builtOpen` below (in the app) and
// "open" in filter-config.js. Turning either is loosening and follows locked memory entry 1 (a Sunday review at least
// seven days after the proposal, or the override challenge), never a request in the moment.
//
// What it would be if a review opens it, the narrow route:
//   - Text only. No images, video, GIFs, thumbnails, avatars or link previews: refused on the network by the content
//     rules below (every image and media request, and every request to the media hosts) and taken out of the page by
//     reddit-filter.js. No picture is ever fetched, so nothing needs judging.
//   - old.reddit.com only (plain pages, no endless feed, no video player); www and the other fronts are sent there.
//   - No r/all, r/popular, random, or the logged-out front page; no 18+ or quarantine gates; no adult-named subreddit.
//   - An allow-list of subreddits, on by default and empty: home is those subreddits together, and nothing else opens.
//   - Posts and comments marked NSFW, quarantined or promoted, and any whose text carries an adult or suggestive term,
//     are removed outright in the page (reddit-filter.js), with no label, reveal or switch.
//   - The same History and feed to the mini PC as the other apps, as app "reddit".
// The policy rules about Reddit's own addresses (feeds off, adult names, the list) apply in every app built from this
// code, so the Browser is no easier a way in.
enum RedditRules {
    /// The app's own lock. False: the Reddit app opens nothing. See the note above before touching it.
    static let builtOpen = false

    struct Settings {
        var open = false
        var allowOn = true
        var allow: [String] = []
        var feedsOff: Set<String> = ["all", "popular", "random", "randnsfw", "friends", "mod", "best", "home"]
        var pagesOff: [String] = ["over18", "quarantine", "gallery", "media", "poll", "premium", "coins", "avatar", "chat", "rpan"]
        var mediaHosts: [String] = ["i.redd.it", "preview.redd.it", "external-preview.redd.it", "thumbs.redditmedia.com", "v.redd.it",
                                    "packaged-media.redd.it", "imgur.com", "gfycat.com", "tenor.com", "streamable.com", "redgifs.com",
                                    "redd.it", "redditmedia.com"]
        var subPatterns: [String] = ["nsfw", "gonewild", "porn", "hentai", "nude", "naked", "sex", "xxx"]
    }

    /// The settings in filter-config.js ("reddit"), the file the page side and the Devices dashboard read. Anything
    /// missing or unreadable keeps the defaults above, which are closed (not open, the list on and empty).
    static func parse(_ source: String) -> Settings {
        var s = Settings()
        guard let start = source.range(of: "globalThis.IGFilterConfig = ") else { return s }
        var json = source[start.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
        if json.hasSuffix(";") { json.removeLast() }
        guard let data = json.data(using: .utf8), let all = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let r = all["reddit"] as? [String: Any] else { return s }
        s.open = (r["open"] as? Bool) == true
        if let list = r["allowList"] as? [String: Any] {
            s.allowOn = (list["on"] as? Bool) != false
            s.allow = ((list["subreddits"] as? [String]) ?? []).map { $0.lowercased() }
        }
        if let v = r["feedsOff"] as? [String], !v.isEmpty { s.feedsOff = Set(v.map { $0.lowercased() }) }
        if let v = r["pagesOff"] as? [String], !v.isEmpty { s.pagesOff = v.map { $0.lowercased() } }
        if let v = r["mediaHosts"] as? [String], !v.isEmpty { s.mediaHosts = v.map { $0.lowercased() } }
        if let v = r["subredditPatterns"] as? [String], !v.isEmpty { s.subPatterns = v }
        return s
    }

    static let settings: Settings = {
        guard let url = Bundle.main.url(forResource: "filter-config", withExtension: "js", subdirectory: "shared"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { return Settings() }
        return parse(source)
    }()

    /// Open only when the app's lock and the settings' lock are both turned.
    static var isOpen: Bool { builtOpen && settings.open }

    static let front = "old.reddit.com"

    static func isHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "reddit.com" || host.hasSuffix(".reddit.com")
    }

    /// A host (or host and path) on the media list: pictures, video, GIFs and the sites Reddit embeds them from.
    static func isMediaHost(_ url: URL, _ s: Settings = settings) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        let path = url.path.lowercased()
        return s.mediaHosts.contains { entry in
            let parts = entry.split(separator: "/", maxSplits: 1).map(String.init)
            guard let h = parts.first, host == h || host.hasSuffix("." + h) else { return false }
            return parts.count < 2 || path.hasPrefix("/" + parts[1])
        }
    }

    /// The subreddits an address names: "/r/a+b/new/" gives ["a", "b"]; nil when it names none.
    static func subreddits(in url: URL) -> [String]? {
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count >= 2, parts[0].lowercased() == "r" else { return nil }
        return parts[1].lowercased().split(separator: "+").map(String.init)
    }

    static func isAdultName(_ name: String, _ s: Settings = settings) -> Bool {
        s.subPatterns.contains { name.range(of: $0, options: [.regularExpression, .caseInsensitive]) != nil }
    }

    /// Pages that exist only on Reddit's newer front (signing in, the account's settings): left where they are.
    static func staysOnItsHost(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        if host != "reddit.com" && host != "www.reddit.com" { return host == "accounts.reddit.com" }
        let first = url.path.split(separator: "/").first.map { $0.lowercased() } ?? ""
        return ["login", "register", "account", "settings", "password", "svc", "api", "verification"].contains(first)
    }

    /// Where the app starts: the listed subreddits together, or Reddit's root while the list is empty (which stops at
    /// the policy below).
    static var home: URL {
        let list = settings.allow
        return URL(string: "https://\(front)/" + (list.isEmpty ? "" : "r/" + list.joined(separator: "+") + "/"))!
    }

    static func isHome(_ url: URL) -> Bool {
        guard isHost(url) else { return false }
        if url.path.isEmpty || url.path == "/" { return true }
        guard let subs = subreddits(in: url), !settings.allow.isEmpty else { return false }
        return Set(subs) == Set(settings.allow) && url.path.split(separator: "/").count == 2
    }

    private static var rewrote: [String: Date] = [:]

    /// A Reddit address as the one this app opens instead, or nil: without the "include 18+" search switch (every
    /// app); and in the Reddit app, on old.reddit.com, with the root as the listed subreddits. An address rewritten
    /// twice within five seconds is left alone the second time (Reddit sent it back), and the policy then stops it.
    static func rewrite(_ url: URL, inApp: Bool = Flavor.isReddit, settings s: Settings = settings) -> URL? {
        guard isHost(url), var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        var changed = false
        if let items = parts.queryItems, items.contains(where: { $0.name.lowercased() == "include_over_18" }) {
            let kept = items.filter { $0.name.lowercased() != "include_over_18" }
            parts.queryItems = kept.isEmpty ? nil : kept
            changed = true
        }
        if inApp {
            if parts.host?.lowercased() != front, !staysOnItsHost(url) { parts.host = front; parts.scheme = "https"; changed = true }
            if parts.path.isEmpty || parts.path == "/", s.allowOn, !s.allow.isEmpty { parts.path = "/r/" + s.allow.joined(separator: "+") + "/"; changed = true }
        }
        guard changed, let out = parts.url, out != url else { return nil }
        let key = url.absoluteString, now = Date()
        rewrote = rewrote.filter { now.timeIntervalSince($0.value) < 5 }
        if rewrote[key] != nil { return nil }
        rewrote[key] = now
        return out
    }

    /// What the policy does with an address, or nil when Reddit's rules have nothing to say about it.
    static func decide(_ url: URL, isMainFrame: Bool, inApp: Bool = Flavor.isReddit, open: Bool = isOpen, settings s: Settings = settings) -> Decision? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        if inApp, isMediaHost(url, s) {
            return .block(title: "Pictures and video are off here", reason: "This app shows Reddit as text only.")
        }
        guard isHost(url) else { return nil }
        if inApp, !open {
            return .block(title: "Reddit is not open", reason: "Reddit stays blocked. This app opens nothing until that changes at a Sunday review.")
        }
        guard isMainFrame else { return nil }
        let path = url.path.lowercased()
        let first = path.split(separator: "/").first.map(String.init) ?? ""
        let off = Decision.block(title: "That page is off here", reason: "It is not part of Reddit in this app.")
        if s.pagesOff.contains(where: { path == "/" + $0 || path.hasPrefix("/" + $0 + "/") }) { return off }
        if let subs = subreddits(in: url) {
            for sub in subs {
                if s.feedsOff.contains(sub) { return .block(title: "That feed is off here", reason: "r/all, r/popular and random are not part of Reddit here.") }
                if isAdultName(sub, s) { return .block(title: "That subreddit does not open here", reason: "Adult and suggestive subreddits are removed.") }
                if s.allowOn, !s.allow.contains(sub) { return .block(title: "That subreddit is not on the list", reason: "Only the subreddits agreed at a Sunday review open here.") }
            }
        } else if s.feedsOff.contains(first) {
            return .block(title: "That feed is off here", reason: "r/all, r/popular and random are not part of Reddit here.")
        } else if s.allowOn, path.isEmpty || path == "/" {
            // The front page is Reddit's own choice of posts. In the app it was already sent to the listed subreddits
            // (rewrite); what arrives here is an empty list, or another app built from this code.
            return .block(title: "No subreddits are on the list yet", reason: "Only the subreddits agreed at a Sunday review open here.")
        }
        if inApp, url.host?.lowercased() != front, !staysOnItsHost(url) { return off } // Reddit sent it back to its newer pages
        return nil
    }

    // MARK: - No media, on the network

    /// The content rules, as WebKit reads them. On any page of Reddit's, in every app: every image and media request
    /// is refused, and every request to a media host. In the Reddit app: every image and media request, whatever the
    /// page. (No alternation in WebKit's rule patterns, so one rule per host.)
    static func rules(inApp: Bool = Flavor.isReddit, settings s: Settings = settings) -> String {
        let onReddit = ["^https?://[^/]*reddit\\.com[:/]"]
        let media = ["image", "media", "svg-document"]
        func block(_ trigger: [String: Any]) -> [String: Any] { ["trigger": trigger, "action": ["type": "block"]] }
        var list: [[String: Any]] = [block(["url-filter": ".*", "resource-type": media, "if-top-url": onReddit])]
        for entry in s.mediaHosts {
            let parts = entry.split(separator: "/", maxSplits: 1).map(String.init)
            guard let host = parts.first, host.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil else { continue }
            let tail = parts.count > 1 && parts[1].range(of: "^[a-z0-9/_-]+$", options: .regularExpression) != nil ? "/" + parts[1] : "[:/]"
            list.append(block(["url-filter": "^https?://[^/]*" + host.replacingOccurrences(of: ".", with: "\\.") + tail, "if-top-url": onReddit]))
        }
        if inApp { list.append(block(["url-filter": ".*", "resource-type": media])) }
        let data = (try? JSONSerialization.data(withJSONObject: list)) ?? Data("[]".utf8)
        return String(data: data, encoding: .utf8) ?? "[]"
    }

    private static var rule: WKContentRuleList?
    private static var waiting: [(WKContentRuleList?) -> Void] = []

    static func prepare(_ completion: @escaping (WKContentRuleList?) -> Void) {
        if let rule { completion(rule); return }
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "reddit-text-only-v1", encodedContentRuleList: rules()) { result, _ in
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
