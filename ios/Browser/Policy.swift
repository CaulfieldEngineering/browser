import Foundation
import WebKit

// Every navigation passes through here: each request before it is made (`decide(request:)`) and each answer before it
// is shown (`decide(response:)`). This is where the rules from the mini PC will plug in later (time of day, the Morning
// Check-In, focus sessions); for the prototype it allows the web and blocks only what would put something on the phone:
// configuration profiles, apps and app installs, and links that would hand off to another app.

enum Decision: Equatable {
    case allow
    /// Opened by the system (a phone number, an email address); nothing that reaches the web.
    case openOutside
    /// Not loaded; a calm page says why.
    case block(title: String, reason: String)
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
        if outsideSchemes.contains(scheme) { return .openOutside }
        if !webSchemes.contains(scheme) {
            // itms-services (an app install), itms-apps, another app's own link: none leaves the browser.
            return .block(title: "This link opens another app", reason: "Links to other apps and app installs stay closed here.")
        }
        if blockedExtensions.contains(url.pathExtension.lowercased()) {
            return .block(title: "This file installs something", reason: "Profiles and apps are not downloaded here.")
        }
        return .allow
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
