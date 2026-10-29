import AVFoundation
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Video and sound keep playing when the app is left or the screen is off, and a playing video can go into
        // picture in picture (Joe, 2026-10-29: "PIP player would be nice. Keep YouTube or videos playing when I close
        // away from the app?"). With UIBackgroundModes audio in Info.plist.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = .dark
        window.backgroundColor = Look.bg
        let browser = BrowserViewController()
        window.rootViewController = browser
        window.makeKeyAndVisible()
        self.window = window
        openLinks(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        openLinks(URLContexts)
    }

    /// A link handed over by another app (cebrowser://open?url=<address>) opens in a new tab.
    private func openLinks(_ contexts: Set<UIOpenURLContext>) {
        guard let browser = window?.rootViewController as? BrowserViewController else { return }
        for context in contexts {
            let parts = URLComponents(url: context.url, resolvingAgainstBaseURL: false)
            guard let value = parts?.queryItems?.first(where: { $0.name == "url" })?.value, let url = URL(string: value),
                  ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { continue }
            browser.open(external: url)
        }
    }
}
