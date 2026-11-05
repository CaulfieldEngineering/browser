import Foundation
import WebKit

// Every navigation passes through here: each request before it is made (`decide(request:)`) and each answer before it
// is shown (`decide(response:)`). This is where the rules from the mini PC will plug in later (time of day, the Morning
// Check-In, focus sessions); for the prototype it allows the web and blocks only what would put something on the phone:
// configuration profiles, apps and app installs. Links to other apps open those apps (2026-11-03).

enum Decision: Equatable {
    case allow
    /// Opened by the system (a phone number, an email address); nothing that reaches the web.
    case openOutside
    /// Not loaded; a calm page says why.
    case block(title: String, reason: String)
    /// Not loaded, and nothing shown: the page stays as it is (the Instagram app's links to the native app).
    case ignore
}

enum Policy {
    /// Schemes the browser loads itself.
    static let webSchemes: Set<String> = ["http", "https", "about", "blob", "data"]
    /// Schemes handed to the system: they start a call, a message or an email, and reach nothing on the web.
    static let outsideSchemes: Set<String> = ["tel", "mailto", "sms", "facetime", "facetime-audio"]
    /// What installs something: configuration profiles, provisioning profiles, apps.
    static let blockedExtensions: Set<String> = ["mobileconfig", "mobileprovision", "ipa", "ipsw", "xpi", "crx", "pkg", "dmg", "exe", "msi", "apk"]
    static let blockedMIMETypes: Set<String> = [
        "application/x-apple-aspen-config", // .mobileconfig
        "application/x-apple-aspen-mobileprovision",
        "application/x-ios-app",
        "application/x-itunes-ipa",
        "application/vnd.android.package-archive",
        "application/x-msdownload",
    ]

    static func decide(request: URLRequest, isMainFrame: Bool) -> Decision {
        guard let url = request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        // The Instagram app (Flavor.swift): a link that would open the native Instagram app or its App Store page does
        // nothing (Joe, 2026-11-05: "yes hide those"). The native app stays hidden; this app stays on the web.
        if Flavor.isInstagram, isNativeAppLink(url) { return .ignore }
        if outsideSchemes.contains(scheme) { return .openOutside }
        if isOwnInstall(url) { return .openOutside }
        if scheme == "itms-services" {
            // An app install from a web page (sideloading): stays closed, except our own install pages above.
            return .block(title: "This link installs an app", reason: "Apps are not installed from here.")
        }
        if !webSchemes.contains(scheme) {
            // Another app's own link (itms-appss:// for the App Store, an app's custom scheme) opens that app, the way
            // Safari does (Joe, 2026-11-03: the Canon R50's QR code forwards to the App Store and was stopped here;
            // "The refusal to redirect was never a spec of mine"). What can be installed is the phone's call, not ours.
            // Only from the page itself: an ad's hidden frame does not get to open apps.
            return isMainFrame ? .openOutside : .block(title: "This link opens another app", reason: "Only the page itself can open another app.")
        }
        if blockedExtensions.contains(url.pathExtension.lowercased()) {
            return .block(title: "This file installs something", reason: "Profiles and apps are not downloaded here.")
        }
        // Image and video search, always (SearchBlock.swift).
        if SearchBlock.isMediaSearch(url) { return .block(title: SearchBlock.title, reason: SearchBlock.reason) }
        // The Instagram app (Flavor.swift) opens Instagram only: a link out to another site stops here. Frames inside
        // Instagram's pages may load what they need.
        if Flavor.isInstagram, isMainFrame, scheme == "http" || scheme == "https", !Flavor.isInstagramHost(url) {
            return .block(title: "This app opens Instagram only", reason: "Links to other sites do not open here.")
        }
        return .allow
    }

    /// The native Instagram app (or Threads, Facebook) by its scheme, an App Store link, or an app-install redirect.
    static func isNativeAppLink(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased() ?? ""
        if ["instagram", "instagram-stories", "barcelona", "fb", "fb-messenger", "itms-apps", "itms-appss", "itms", "itmss", "intent"].contains(scheme) { return true }
        guard scheme == "http" || scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "apps.apple.com" || host == "itunes.apple.com" || host.hasSuffix(".app.link") || host.hasSuffix(".onelink.me")
    }

    /// Our own install pages, and nothing else, may install: Joe opens browser-install in the Browser and taps Install
    /// (2026-10-29). THE RULE, exactly: the scheme is itms-services, `action` is `download-manifest`, and `url` is
    /// https://caulfieldengineering.github.io/<name>/manifest.plist with <name> one of `ownInstallPages` (no port, no
    /// query, no other path). Every other itms-services link and every other app link stays blocked.
    static let ownInstallPages: Set<String> = ["browser-install", "hq-install", "blocks-install"]

    static func isOwnInstall(_ url: URL) -> Bool {
        #if APPSTORE
        return false // the TestFlight build installs nothing, not even our own pages (ios-testflight.yml)
        #endif
        guard url.scheme?.lowercased() == "itms-services",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.first(where: { $0.name == "action" })?.value == "download-manifest",
              let target = items.first(where: { $0.name == "url" })?.value,
              let manifest = URLComponents(string: target),
              manifest.scheme == "https", manifest.host == "caulfieldengineering.github.io",
              manifest.port == nil, manifest.query == nil, manifest.fragment == nil, manifest.user == nil
        else { return false }
        let parts = manifest.path.split(separator: "/", omittingEmptySubsequences: false)
        // "/browser-install/manifest.plist" -> ["", "browser-install", "manifest.plist"]
        if parts.count == 3 && parts[0].isEmpty && ownInstallPages.contains(String(parts[1])) && parts[2] == "manifest.plist" { return true }
        // The Instagram app built from this code (Flavor.swift): "/browser-install/instagram/manifest.plist", exactly.
        return manifest.path == "/browser-install/instagram/manifest.plist"
    }

    static func decide(response: URLResponse, isMainFrame: Bool, canShow: Bool) -> Decision {
        let mime = response.mimeType?.lowercased() ?? ""
        if blockedMIMETypes.contains(mime) || blockedExtensions.contains(response.url?.pathExtension.lowercased() ?? "") {
            return .block(title: "This file installs something", reason: "Profiles and apps are not downloaded here.")
        }
        // A download (anything a web view cannot show). The prototype keeps no files.
        if !canShow && isMainFrame {
            return .block(title: "Downloads are off", reason: "This browser shows pages; it does not save files yet.")
        }
        return .allow
    }
}

// What the browser does with a search that is not an address.
enum Search {
    /// DuckDuckGo with SafeSearch strict (kp=1).
    static func searchURL(for text: String) -> URL? {
        var parts = URLComponents(string: "https://duckduckgo.com/")
        parts?.queryItems = [URLQueryItem(name: "q", value: text), URLQueryItem(name: "kp", value: "1")]
        return parts?.url
    }

    /// An address if the text is one ("example.com", "https://x.org/a"), else a search.
    static func destination(for raw: String) -> URL? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if text.contains(" ") { return searchURL(for: text) }
        if let parsed = URL(string: text), let scheme = parsed.scheme?.lowercased() {
            if (scheme == "http" || scheme == "https"), parsed.host != nil { return parsed }
            if scheme != "localhost", !text.contains(".") || text.contains("://") { return searchURL(for: text) }
        }
        // A bare host: has a dot (or is localhost / an IP with a port), no spaces.
        let hostPart = text.split(separator: "/", maxSplits: 1).first.map(String.init) ?? text
        let looksLikeHost = hostPart.contains(".") && !hostPart.hasPrefix(".") && !hostPart.hasSuffix(".")
            && hostPart.range(of: #"^[A-Za-z0-9.\-:\[\]]+$"#, options: .regularExpression) != nil
        if looksLikeHost || hostPart.hasPrefix("localhost") {
            return URL(string: "https://" + text)
        }
        return searchURL(for: text)
    }
}
