import Foundation

// One code base, four apps (the fourth, Reddit, is built and not open: Reddit.swift). The Browser; the Instagram app (Joe, 2026-11-05: "We might even make a separate branch of
// the app where Instagram can be its own icon and interface on my phone"; locked memory entry 21); and the Facebook app
// (Joe, 2026-11-05: "we can start building a facebook version of our filtered app, too. Let's start by hiding the
// default feed, any ads etc."). The site apps are the same browser built by the project.yml targets Instagram and
// Facebook (INSTAGRAM_APP, FACEBOOK_APP): one site only, one page at a time, full window, the shared filter (Filter/),
// several accounts, the same History, and the same feed to the mini PC under their own installs (entry 15: if one
// stops reporting, that counts as tamper).
enum Flavor {
    enum Kind { case browser, instagram, facebook, reddit }
    #if INSTAGRAM_APP
    static let kind = Kind.instagram
    #elseif FACEBOOK_APP
    static let kind = Kind.facebook
    #elseif REDDIT_APP
    static let kind = Kind.reddit
    #else
    static let kind = Kind.browser
    #endif
    static let isInstagram = kind == .instagram
    static let isFacebook = kind == .facebook
    /// The Reddit app (Reddit.swift): text only, an allow-list of subreddits, built and not open.
    static let isReddit = kind == .reddit
    /// One site, full window, no tabs: the Instagram app and the Facebook app.
    static let isSiteApp = kind != .browser

    /// The name in the menu, on the start page and in the feed.
    static let name: String = {
        switch kind {
        case .browser: return "Browser"
        case .instagram: return "Instagram"
        case .facebook: return "Facebook"
        case .reddit: return "Reddit"
        }
    }()
    /// The app the feed reports for (hq-widget server/browser-feed.js; the laptop watch keeps them apart).
    static let feedApp = name.lowercased()
    /// Where this app's builds are published (ios-build.yml): the site apps in folders of the same install page.
    static let installPage = "https://caulfieldengineering.github.io/browser-install/" + (kind == .browser ? "" : feedApp + "/")
    /// Where a site app starts. Instagram: the Following feed, the accounts Joe follows in time order ("I follow like
    /// 1000 people but every time I open it I see the same exact post"). Facebook: Notifications, not the News Feed.
    /// Reddit: the listed subreddits together (RedditRules.home), which opens nothing while the app is not open.
    static let home: URL = isReddit ? RedditRules.home : isFacebook ? URL(string: "https://m.facebook.com/notifications/")! : URL(string: "https://www.instagram.com/?variant=following")!

    static func isInstagramHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "instagram.com" || host.hasSuffix(".instagram.com")
    }

    /// Facebook and what it needs to sign in and to message: facebook.com, fb.com and fb.me links, messenger.com.
    static func isFacebookHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return ["facebook.com", "fb.com", "fb.me", "messenger.com"].contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// A site app's own home: Instagram's feed (any variant), Facebook's Notifications. What a site app opens fresh
    /// when Joe comes back after a while (BrowserViewController.cameBack).
    static func isHome(_ url: URL) -> Bool {
        if isReddit { return RedditRules.isHome(url) }
        if isFacebook { return isFacebookHost(url) && url.path.hasPrefix("/notifications") }
        return isInstagramHost(url) && (url.path.isEmpty || url.path == "/")
    }

    /// The one site a site app opens.
    static func isSiteHost(_ url: URL) -> Bool { isReddit ? RedditRules.isHost(url) : isFacebook ? isFacebookHost(url) : isInstagramHost(url) }

    /// Instagram's home feed asked for without a variant ("/"), as the Following feed instead; nil for anything else
    /// (a post, a profile, "/?variant=favorites", another site). Used for every main-frame load in all three apps, so a
    /// launch, a link from another app and a pull to refresh all land on Following.
    static func followingFeed(for url: URL) -> URL? {
        guard isInstagramHost(url), url.path.isEmpty || url.path == "/",
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        // "home" is Instagram's own name for the suggested feed (it goes there after a story closes; seen in the phone
        // feed 2026-11-10), so it counts as no variant. Any other variant (favorites, following) is left as it is.
        if parts.queryItems?.contains(where: { $0.name == "variant" && $0.value != "home" }) == true { return nil }
        parts.path = "/"
        parts.queryItems = (parts.queryItems ?? []).filter { $0.name != "variant" } + [URLQueryItem(name: "variant", value: "following")]
        return parts.url
    }

    /// Facebook's Video and Reels tabs (2026-11-13, as Instagram's Reels tab and Explore went): /watch, /reel, /reels,
    /// /video and their feed pages, with no video or reel named. A reel or video that is named ("/reel/123",
    /// "/watch/?v=123") is someone's post, not a feed, and is not one of these.
    static func isFacebookVideoTab(_ url: URL) -> Bool {
        var path = url.path.lowercased()
        while path.count > 1, path.hasSuffix("/") { path.removeLast() }
        let parts = path.split(separator: "/").map(String.init)
        guard let first = parts.first, ["watch", "reel", "reels", "video", "videos"].contains(first) else { return false }
        if parts.count == 2, !["feed", "latest", "live", "shows", "saved", "create"].contains(parts[1]) { return false }
        if parts.count > 2 { return false }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return !items.contains { ($0.name == "v" || $0.name == "video_id") && !($0.value ?? "").isEmpty }
    }

    /// Facebook's home (the News Feed) and its Video and Reels tabs, as Notifications instead; nil for anything else.
    /// In every app.
    static func facebookHome(for url: URL) -> URL? {
        guard let host = url.host?.lowercased(), host == "facebook.com" || host.hasSuffix(".facebook.com"),
              ["", "/", "/home.php", "/index.php"].contains(url.path) || isFacebookVideoTab(url) else { return nil }
        var parts = URLComponents()
        parts.scheme = "https"; parts.host = host; parts.path = "/notifications/"
        return parts.url
    }

    /// Where a main-frame load goes instead, if anywhere (the Following feed, Notifications).
    static func rewrite(_ url: URL) -> URL? { followingFeed(for: url) ?? facebookHome(for: url) ?? RedditRules.rewrite(url) }
}
