import WebKit

/// A native network barrier complements the document-start script: CSS, srcset and shadow DOM
/// cannot briefly download an original HTTP image before a MutationObserver runs.
enum BlurProtection {
    private static var rule: WKContentRuleList?
    private static var waiting: [(WKContentRuleList?) -> Void] = []
    static func prepare(_ completion: @escaping (WKContentRuleList?) -> Void) {
        if let rule { completion(rule); return }
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        let json = #"[{"trigger":{"url-filter":"^https?://","resource-type":["image"]},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "blur-original-images-v1", encodedContentRuleList: json) { result, _ in
            rule = result
            let callbacks = waiting
            waiting.removeAll()
            callbacks.forEach { $0(result) }
        }
    }

    static func attach(to web: WKWebView) {
        web.isHidden = true
        prepare { [weak web] rule in
            guard let web, let rule else { return } // keep the page covered if the barrier cannot be installed
            web.configuration.userContentController.add(rule)
            // The initial navigation may already be in flight. It stays covered until didFinish verifies the script.
            if web.url != nil { web.reload() }
        }
    }

    static func reveal(_ web: WKWebView) {
        guard BlurSchedule.shared.active else { web.isHidden = false; return }
        // Main-frame readiness is sufficient because every subframe gets its own document-start script,
        // and original network images are blocked independently of script execution in every frame.
        web.evaluateJavaScript("globalThis.__browserBlurReady === true", in: nil, in: BlurBridge.world) { [weak web] result in
            if case .success(let value) = result, (value as? Bool) == true, rule != nil { web?.isHidden = false }
        }
    }
}
