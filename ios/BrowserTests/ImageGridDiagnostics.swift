import XCTest
import WebKit
import BlurCore
@testable import Browser

/// Diagnostic only (never fails on network): real image-search grids in a window, then what each image did.
@MainActor
final class ImageGridDiagnostics: XCTestCase {
    override func tearDown() async throws { BlurSchedule.shared.replaceForTesting([]) }

    private static let dump = """
    (() => {
      const imgs = [...document.querySelectorAll('img')];
      const shown = imgs.filter(i => getComputedStyle(i).visibility === 'visible' && i.src.startsWith('data:image/jpeg')).length;
      const rows = imgs.slice(0, 25).map(i => {
        const r = i.getBoundingClientRect();
        return [getComputedStyle(i).visibility, i.naturalWidth, Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top),
          (i.currentSrc || i.src || '').slice(0, 80), 'data-src=' + (i.dataset.src || '').slice(0, 50), 'srcset=' + (i.srcset || '').slice(0, 30), 'loading=' + i.loading].join(' | ');
      });
      const bg = [...document.querySelectorAll('*')].filter(e => (e.getAttribute('style') || '').includes('url(')).length;
      return 'imgs=' + imgs.length + ' processedVisible=' + shown + ' inlineStyleUrls=' + bg + ' title=' + document.title + '\\n' + rows.join('\\n');
    })()
    """

    func testDiagnoseImageSearchGrids() async throws {
        BlurSchedule.shared.replaceForTesting([BlurWindows.Window(from: Date().addingTimeInterval(-60), until: Date().addingTimeInterval(3600))])
        let browser = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.compactMap { $0.rootViewController as? BrowserViewController }.first)
        for address in ["https://duckduckgo.com/?q=mountain+landscape&iax=images&ia=images&kp=1",
                        "https://www.bing.com/images/search?q=mountain+landscape&adlt=strict"] {
            BlurBridge.testLog = []
            let web = browser.makeWebView()
            web.frame = CGRect(x: 0, y: 0, width: 390, height: 800)
            browser.view.addSubview(web)
            defer { web.removeFromSuperview() }
            web.load(URLRequest(url: URL(string: address)!))
            try await Task.sleep(nanoseconds: 25_000_000_000)
            let report = (try? await web.evaluateJavaScript(Self.dump)) as? String ?? "no report"
            print("GRID_DIAG \(address) hidden=\(web.isHidden)\n\(report)\nGRID_BRIDGE \(BlurBridge.testLog.count) replies:\n" + BlurBridge.testLog.prefix(40).joined(separator: "\n"))
        }
    }
}
