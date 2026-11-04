import XCTest
import WebKit
@testable import Browser

/// Image and video search are off, always; normal web search still works (Joe, 2026-11-04).
@MainActor
final class SearchBlockTests: XCTestCase {
    private func blocked(_ address: String) -> Bool {
        let url = URL(string: address)!
        return Policy.decide(request: URLRequest(url: url), isMainFrame: true) == .block(title: SearchBlock.title, reason: SearchBlock.reason)
    }

    func testEveryImageAndVideoVerticalIsBlocked() {
        let verticals = [
            // Google, any country domain
            "https://www.google.com/search?q=cats&tbm=isch",
            "https://www.google.co.uk/search?q=cats&tbm=isch&safe=active",
            "https://www.google.com/search?q=cats&tbm=vid",
            "https://www.google.com/search?q=cats&udm=2",
            "https://www.google.de/search?udm=7&q=cats",
            "https://www.google.com/search?tbs=sbi:AMhZZiv&q=x",
            "https://images.google.com/",
            "https://images.google.fr/imghp",
            "https://www.google.com/imghp?hl=en",
            "https://lens.google.com/uploadbyurl?url=x",
            "https://www.google.com/searchbyimage?image_url=x",
            // DuckDuckGo
            "https://duckduckgo.com/?q=cats&ia=images",
            "https://duckduckgo.com/?q=cats&iax=images&ia=images&kp=1",
            "https://duckduckgo.com/?q=cats&ia=videos",
            "https://duckduckgo.com/?q=cats&iax=videos",
            "https://duckduckgo.com/i.js?q=cats&o=json",
            "https://duckduckgo.com/v.js?q=cats",
            // Bing
            "https://www.bing.com/images/search?q=cats",
            "https://www.bing.com/images?q=cats",
            "https://www.bing.com/videos/search?q=cats",
            // Yahoo, Yandex, Ecosia, Brave, Startpage, Qwant, Mojeek, AOL, Baidu
            "https://images.search.yahoo.com/search/images?p=cats",
            "https://video.search.yahoo.com/search/video?p=cats",
            "https://search.yahoo.com/search/images?p=cats",
            "https://yandex.com/images/search?text=cats",
            "https://yandex.ru/video/search?text=cats",
            "https://www.ecosia.org/images?q=cats",
            "https://www.ecosia.org/videos?q=cats",
            "https://search.brave.com/images?q=cats",
            "https://search.brave.com/videos?q=cats",
            "https://www.startpage.com/sp/search?query=cats&cat=images",
            "https://www.startpage.com/do/search?query=cats&cat=video",
            "https://www.qwant.com/?q=cats&t=images",
            "https://www.qwant.com/?q=cats&t=videos",
            "https://www.mojeek.com/search?q=cats&fmt=images",
            "https://search.aol.com/aol/image?q=cats",
            "https://image.baidu.com/search/index?word=cats",
            // Pinterest search and reverse image search sites
            "https://www.pinterest.com/search/pins/?q=cats",
            "https://pinterest.co.uk/search/pins/?q=cats",
            "https://tineye.com/",
            "https://www.tineye.com/search?url=x",
            "https://pimeyes.com/en",
            "https://facecheck.id/",
            "http://www.google.com/search?q=cats&tbm=isch",
        ]
        for address in verticals { XCTAssertTrue(blocked(address), "should be blocked: \(address)") }
    }

    func testNormalSearchAndBrowsingStillWork() {
        let allowed = [
            "https://duckduckgo.com/?q=cats&kp=1",
            "https://duckduckgo.com/?q=cats&ia=web",
            "https://duckduckgo.com/",
            "https://www.google.com/search?q=cats",
            "https://www.google.com/search?q=cats&udm=14",
            "https://www.google.com/",
            "https://www.bing.com/search?q=cats",
            "https://search.yahoo.com/search?p=cats",
            "https://yandex.com/search/?text=cats",
            "https://www.ecosia.org/search?q=cats",
            "https://search.brave.com/search?q=cats",
            "https://www.startpage.com/sp/search?query=cats",
            "https://www.qwant.com/?q=cats&t=web",
            "https://www.pinterest.com/",
            "https://en.wikipedia.org/wiki/Image",
            "https://example.com/images/search",
            "https://maps.google.com/",
            "https://mail.google.com/mail/u/0/",
            "https://github.com/search?q=images",
        ]
        for address in allowed {
            XCTAssertEqual(Policy.decide(request: URLRequest(url: URL(string: address)!), isMainFrame: true), .allow, "should load: \(address)")
        }
        // The browser's own search goes to DuckDuckGo web results.
        XCTAssertFalse(SearchBlock.isMediaSearch(Search.searchURL(for: "mountain pictures")!))
    }

    func testSubframesAreBlockedToo() {
        let url = URL(string: "https://www.bing.com/images/search?q=cats")!
        XCTAssertNotEqual(Policy.decide(request: URLRequest(url: url), isMainFrame: false), .allow)
    }

    func testContentRulesCompile() async {
        let rule: WKContentRuleList? = await withCheckedContinuation { done in SearchBlock.prepare { done.resume(returning: $0) } }
        XCTAssertNotNil(rule, "the image-result request rules compile")
    }

    /// Through the app's own web view and navigation delegate: the image search never loads.
    func testAnImageSearchNavigationIsStoppedInTheApp() async throws {
        let browser = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.compactMap { $0.rootViewController as? BrowserViewController }.first)
        let web = browser.makeWebView()
        web.frame = CGRect(x: 0, y: 0, width: 390, height: 700)
        browser.view.addSubview(web)
        defer { web.removeFromSuperview() }
        web.load(URLRequest(url: URL(string: "https://www.google.com/search?q=cats&tbm=isch")!))
        try await Task.sleep(nanoseconds: 1_500_000_000)
        XCTAssertFalse(web.url?.absoluteString.contains("tbm=isch") ?? false, "the image search page did not load")
    }
}
