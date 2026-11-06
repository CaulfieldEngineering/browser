import Foundation

// One code base, two apps. The Browser, and the Instagram app (Joe, 2026-11-05: "We might even make a separate branch of
// the app where Instagram can be its own icon and interface on my phone"; locked memory entry 21): the same browser,
// built by the project.yml target Instagram with INSTAGRAM_APP set. It opens instagram.com and nothing else, one page at
// a time, with the same Instagram filter (Filter/), the same History, and the same feed to the mini PC under its own
// install (entry 15: if it stops reporting, that counts as tamper).
enum Flavor {
    #if INSTAGRAM_APP
    static let isInstagram = true
    #else
    static let isInstagram = false
    #endif

    /// The name in the menu, on the start page and in the feed.
    static let name = isInstagram ? "Instagram" : "Browser"
    /// The app the feed reports for (hq-widget server/browser-feed.js, the laptop watch keeps them apart).
    static let feedApp = isInstagram ? "instagram" : "browser"
    /// Where this app's builds are published (ios-build.yml): the Instagram app in a folder of the same install page.
    static let installPage = isInstagram ? "https://caulfieldengineering.github.io/browser-install/instagram/"
                                         : "https://caulfieldengineering.github.io/browser-install/"
    /// Where the Instagram app starts: the Following feed, the accounts Joe follows in time order (Joe, 2026-11-05: "I
    /// follow like 1000 people but every time I open it I see the same exact post").
    static let home = URL(string: "https://www.instagram.com/?variant=following")!

    /// Instagram's home feed asked for without a variant ("/"), as the Following feed instead; nil for anything else
    /// (a post, a profile, "/?variant=favorites", another site). Used for every main-frame load in both apps, so a
    /// launch, a link from another app and a pull to refresh all land on Following.
    static func followingFeed(for url: URL) -> URL? {
        guard isInstagramHost(url), url.path.isEmpty || url.path == "/",
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        if parts.queryItems?.contains(where: { $0.name == "variant" }) == true { return nil }
        parts.path = "/"
        parts.queryItems = (parts.queryItems ?? []) + [URLQueryItem(name: "variant", value: "following")]
        return parts.url
    }

    static func isInstagramHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "instagram.com" || host.hasSuffix(".instagram.com")
    }
}
