import XCTest
import WebKit
@testable import Browser

/// A cold simulator, waited out once before the tests' own clocks start. The first web page of a run starts WebKit's
/// processes, and the first Instagram page starts the classifier loading its models; on a slow runner either can take
/// longer than a test allows for its own page (AppLaunchTests.testPageLoads, 10 s, failed twice on 2026-11-12;
/// InstagramFilterTests.testAccountsByNameInTheApp, 30 s, failed once on 2026-11-13, each on code that did not touch
/// it and each green on a rerun). Each test class asks for this in its setUp. It waits on what it is waiting for (a
/// first page that answers; the classifier ready), never a fixed time, and gives up quietly at its limit: no test's
/// own check or limit is changed, and a WebKit or a classifier that never comes still fails the tests that need it.
@MainActor
enum ColdStart {
    private static var pageShown = false
    private static var judgeWarm = false

    static func waitOut(classifier: Bool) async {
        if !pageShown {
            pageShown = true
            let browser = await browserWindow()
            if let browser {
                let web = browser.makeWebView()
                web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
                browser.view.addSubview(web)
                web.loadHTMLString("<p id='warm'>warm</p>", baseURL: nil)
                await until(180) { (try? await web.evaluateJavaScript("!!document.getElementById('warm')") as? Bool) == true }
                web.removeFromSuperview()
            }
        }
        if classifier, !judgeWarm {
            judgeWarm = true
            Classifier.shared.warmUp()
            await until(240) { Classifier.shared.ready }
        }
    }

    private static func browserWindow() async -> BrowserViewController? {
        var found: BrowserViewController?
        await until(30) {
            found = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows).compactMap { $0.rootViewController as? BrowserViewController }.first
            return found != nil
        }
        return found
    }

    private static func until(_ seconds: Double, _ check: @escaping () async -> Bool) async {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if await check() { return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }
}
