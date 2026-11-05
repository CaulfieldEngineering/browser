import XCTest
import WebKit
@testable import Browser

/// The Instagram filter (Joe, 2026-11-05): suggestive posts are removed on instagram.com, judged on the phone.
@MainActor
final class InstagramFilterTests: XCTestCase {
    private func browser() throws -> BrowserViewController {
        try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.compactMap { $0.rootViewController as? BrowserViewController }.first)
    }

    func testTheFilterFilesAreInTheApp() {
        for name in ["rules", "bridge-ios", "ig-filter", "classifier"] {
            XCTAssertNotNil(Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "shared"), "\(name).js")
        }
        XCTAssertNotNil(Bundle.main.url(forResource: "classifier", withExtension: "html", subdirectory: "shared"))
        XCTAssertNotNil(Bundle.main.url(forResource: "nsfwjs.min", withExtension: "js", subdirectory: "shared/vendor"))
    }

    func testOnlyInstagramsImageHostsAreFetched() {
        XCTAssertTrue(InstagramFilter.isMediaHost(URL(string: "https://scontent-iad3-1.cdninstagram.com/v/t51.jpg")!))
        XCTAssertTrue(InstagramFilter.isMediaHost(URL(string: "https://scontent.xx.fbcdn.net/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "https://example.com/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "http://scontent.cdninstagram.com/x.jpg")!))
        XCTAssertFalse(InstagramFilter.isMediaHost(URL(string: "https://cdninstagram.com.evil.example/x.jpg")!))
    }

    /// The model loads in WebKit on the phone and scores a plain picture as not suggestive.
    func testTheClassifierScoresAPlainImage() async throws {
        _ = try browser()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 400)).image { ctx in
            UIColor.systemTeal.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 300, height: 400))
            UIColor.systemYellow.setFill(); ctx.fill(CGRect(x: 40, y: 60, width: 200, height: 120))
        }
        let data = try XCTUnwrap(InstagramFilter.dataURL(image))
        let scores: [String: Double]? = await withCheckedContinuation { done in Classifier.shared.classify(data) { done.resume(returning: $0) } }
        let s = try XCTUnwrap(scores, "the classifier answered")
        XCTAssertEqual(Set(s.keys), ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"])
        XCTAssertLessThan(s["Sexy"] ?? 1, 0.45)
    }

    /// In the app's own web view, on an instagram.com page: a post whose caption is suggestive is removed, a plain one
    /// stays. The page cannot see the filter (it runs in its own content world).
    func testASuggestiveCaptionIsRemovedInTheApp() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        let html = """
        <html><body><main>
        <article id="plain"><div>New pedal day #fuzz</div></article>
        <article id="hot"><div>new set #lingerie</div></article>
        </main></body></html>
        """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.instagram.com/")!)
        var gone: [String] = []
        for _ in 0..<50 {
            try await Task.sleep(nanoseconds: 300_000_000)
            gone = (try? await web.evaluateJavaScript("[...document.querySelectorAll('[data-igf-gone]')].map(e => e.id)") as? [String]) ?? []
            if !gone.isEmpty { break }
        }
        XCTAssertEqual(gone, ["hot"])
        let seen = try? await web.evaluateJavaScript("typeof window.IGFilterRules + typeof window.__igFilter") as? String
        XCTAssertEqual(seen, "undefinedundefined", "the page cannot see the filter")
    }

    /// Not on Instagram: nothing happens.
    func testOtherSitesAreUntouched() async throws {
        let browser = try browser()
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        web.loadHTMLString("<article id='a'>#lingerie</article>", baseURL: URL(string: "https://example.com/")!)
        try await Task.sleep(nanoseconds: 2_000_000_000)
        let n = try? await web.evaluateJavaScript("document.querySelectorAll('[data-igf-gone]').length") as? Int
        XCTAssertEqual(n, 0)
    }
}
