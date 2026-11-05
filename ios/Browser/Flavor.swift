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
    /// Where the Instagram app starts, and where a new page goes.
    static let home = URL(string: "https://www.instagram.com/")!

    static func isInstagramHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "instagram.com" || host.hasSuffix(".instagram.com")
    }
}
