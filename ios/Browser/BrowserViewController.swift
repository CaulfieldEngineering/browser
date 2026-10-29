import UIKit
import WebKit

// Joe's browser (prototype): one page at a time in a web view, a bar at the bottom within thumb reach like Safari's
// (the address, then back, forward, share, reload), a thin progress line, swipe back and forward, pull to refresh.
// Every navigation goes through Policy (Policy.swift); what it blocks shows a calm page of its own over the web view.
// No private mode, no downloads, no settings for DNS or proxies: it is only a browser.

enum Look {
    static let bg = UIColor(red: 0x14 / 255.0, green: 0x15 / 255.0, blue: 0x18 / 255.0, alpha: 1)
    static let raised = UIColor(white: 1, alpha: 0.08)
    static let text = UIColor(red: 0xe3 / 255.0, green: 0xe4 / 255.0, blue: 0xe8 / 255.0, alpha: 1)
    static let muted = UIColor(red: 0x9a / 255.0, green: 0x9e / 255.0, blue: 0xa8 / 255.0, alpha: 1)
    static let faint = UIColor(red: 0x62 / 255.0, green: 0x66 / 255.0, blue: 0x6f / 255.0, alpha: 1)
    static let accent = UIColor(red: 0x6f / 255.0, green: 0xb7 / 255.0, blue: 0xa0 / 255.0, alpha: 1)
    static let line = UIColor(white: 1, alpha: 0.07)
}

final class BrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UITextFieldDelegate {
    private var webView: WKWebView!
    private let bar = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
    private let progress = UIProgressView(progressViewStyle: .bar)
    private let field = UITextField()
    private let cancel = UIButton(type: .system)
    private let buttons = UIStackView()
    private let back = UIButton(type: .system)
    private let forward = UIButton(type: .system)
    private let share = UIButton(type: .system)
    private let reload = UIButton(type: .system)
    private let blocked = BlockedView()
    private let empty = UILabel()
    private var watches: [NSKeyValueObservation] = []
    /// The bar's distance above the keyboard: a little at rest, more while typing (Joe, 2026-10-29: "Can we do more of a
    /// gap between the URL bar and the keyboard").
    private var barToKeyboard: NSLayoutConstraint!
    private static let restGap: CGFloat = 2
    private static let typingGap: CGFloat = 14

    private static let lastPageKey = "lastPage"

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        view = UIView()
        view.backgroundColor = Look.bg
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        makeWebView()
        makeBar()
        makeOverlays()
        layout()
        watch()

        if let last = UserDefaults.standard.string(forKey: Self.lastPageKey), let url = URL(string: last) {
            open(url)
        } else {
            updateBar()
        }
    }

    // MARK: - Building

    private func makeWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // never a private (non-persistent) store
        config.allowsInlineMediaPlayback = true
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.isOpaque = false
        webView.backgroundColor = Look.bg
        webView.underPageBackgroundColor = Look.bg
        webView.scrollView.backgroundColor = Look.bg
        webView.scrollView.keyboardDismissMode = .interactive

        let refresh = UIRefreshControl()
        refresh.tintColor = Look.muted
        refresh.addTarget(self, action: #selector(pulled), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        view.addSubview(webView)
    }

    private func makeBar() {
        progress.progressTintColor = Look.accent
        progress.trackTintColor = .clear
        progress.isHidden = true

        field.delegate = self
        field.backgroundColor = Look.raised
        field.layer.cornerRadius = 12
        field.layer.cornerCurve = .continuous
        field.textColor = Look.text
        field.tintColor = Look.accent
        field.font = .systemFont(ofSize: 16)
        field.attributedPlaceholder = NSAttributedString(string: "Search or enter address", attributes: [.foregroundColor: Look.muted])
        field.textAlignment = .center
        field.keyboardType = .webSearch
        field.returnKeyType = .go
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.smartDashesType = .no
        field.smartQuotesType = .no
        field.clearButtonMode = .whileEditing
        field.enablesReturnKeyAutomatically = true
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.leftViewMode = .always
        field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.rightViewMode = .unlessEditing
        field.accessibilityLabel = "Address"

        cancel.setTitle("Cancel", for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 16)
        cancel.tintColor = Look.text
        cancel.isHidden = true
        cancel.addTarget(self, action: #selector(cancelEditing), for: .touchUpInside)
        cancel.setContentHuggingPriority(.required, for: .horizontal)

        func setUp(_ button: UIButton, _ symbol: String, _ label: String, _ action: Selector) {
            button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .regular)), for: .normal)
            button.tintColor = Look.text
            button.accessibilityLabel = label
            button.addTarget(self, action: action, for: .touchUpInside)
            button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        }
        setUp(back, "chevron.backward", "Back", #selector(goBack))
        setUp(forward, "chevron.forward", "Forward", #selector(goForward))
        setUp(share, "square.and.arrow.up", "Share", #selector(sharePage))
        setUp(reload, "arrow.clockwise", "Reload", #selector(reloadOrStop))
        [back, forward, share, reload].forEach(buttons.addArrangedSubview)
        buttons.axis = .horizontal
        buttons.distribution = .fillEqually

        view.addSubview(bar)
    }

    private func makeOverlays() {
        empty.text = "Search or enter an address below."
        empty.textColor = Look.faint
        empty.font = .systemFont(ofSize: 15)
        empty.textAlignment = .center
        empty.numberOfLines = 0
        view.addSubview(empty)

        blocked.isHidden = true
        blocked.onBack = { [weak self] in self?.leaveBlocked() }
        view.addSubview(blocked)
    }

    private func layout() {
        let topLine = UIView()
        topLine.backgroundColor = Look.line
        let fieldRow = UIStackView(arrangedSubviews: [field, cancel])
        fieldRow.spacing = 12
        let column = UIStackView(arrangedSubviews: [fieldRow, buttons])
        column.axis = .vertical
        column.spacing = 4

        for v in [webView!, bar, topLine, progress, column, empty, blocked] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false }
        bar.contentView.addSubview(topLine)
        bar.contentView.addSubview(progress)
        bar.contentView.addSubview(column)

        // The bar rides on the keyboard (keyboardLayoutGuide is the safe area's bottom when there is none).
        barToKeyboard = column.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -Self.restGap)
        barToKeyboard.isActive = true
        NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main) { [weak self] _ in
            self?.barToKeyboard.constant = -Self.typingGap
        }
        NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.barToKeyboard.constant = -Self.restGap
        }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bar.topAnchor),

            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            topLine.topAnchor.constraint(equalTo: bar.contentView.topAnchor),
            topLine.leadingAnchor.constraint(equalTo: bar.contentView.leadingAnchor),
            topLine.trailingAnchor.constraint(equalTo: bar.contentView.trailingAnchor),
            topLine.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),

            progress.topAnchor.constraint(equalTo: bar.contentView.topAnchor),
            progress.leadingAnchor.constraint(equalTo: bar.contentView.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: bar.contentView.trailingAnchor),
            progress.heightAnchor.constraint(equalToConstant: 2),

            column.topAnchor.constraint(equalTo: bar.contentView.topAnchor, constant: 10),
            column.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            column.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            field.heightAnchor.constraint(equalToConstant: 44),

            empty.centerYAnchor.constraint(equalTo: webView.centerYAnchor),
            empty.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            empty.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),

            blocked.topAnchor.constraint(equalTo: webView.topAnchor),
            blocked.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
            blocked.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            blocked.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    private func watch() {
        watches = [
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in self?.updateProgress() },
            webView.observe(\.isLoading, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.url, options: [.new]) { [weak self] _, _ in self?.updateBar() },
        ]
    }

    // MARK: - The bar

    private func updateBar() {
        back.isEnabled = webView.canGoBack || !blocked.isHidden
        forward.isEnabled = webView.canGoForward
        share.isEnabled = webView.url != nil && blocked.isHidden
        let symbol = webView.isLoading ? "xmark" : "arrow.clockwise"
        reload.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .regular)), for: .normal)
        reload.accessibilityLabel = webView.isLoading ? "Stop" : "Reload"
        reload.isEnabled = webView.url != nil
        for b in [back, forward, share, reload] { b.tintColor = b.isEnabled ? Look.text : Look.faint }
        empty.isHidden = webView.url != nil || !blocked.isHidden
        if !field.isEditing { field.text = Self.shortAddress(webView.url) }
        if let url = webView.url, url.scheme == "https" || url.scheme == "http" {
            UserDefaults.standard.set(url.absoluteString, forKey: Self.lastPageKey)
        }
    }

    private func updateProgress() {
        let p = Float(webView.estimatedProgress)
        progress.isHidden = !webView.isLoading && p >= 1
        progress.setProgress(p, animated: p > progress.progress)
        if p >= 1 {
            UIView.animate(withDuration: 0.3, delay: 0.2) { self.progress.alpha = 0 } completion: { _ in
                self.progress.isHidden = true
                self.progress.alpha = 1
                self.progress.progress = 0
            }
        }
    }

    /// At rest the bar shows the site, not the whole address ("nytimes.com").
    static func shortAddress(_ url: URL?) -> String {
        guard let url, let host = url.host else { return "" }
        if host.hasSuffix("duckduckgo.com"), let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "q" })?.value {
            return q
        }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        field.textAlignment = .natural
        field.text = webView.url?.absoluteString ?? ""
        cancel.isHidden = false
        buttons.isHidden = true
        DispatchQueue.main.async { textField.selectAll(nil) }
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        field.textAlignment = .center
        cancel.isHidden = true
        buttons.isHidden = false
        updateBar()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if let url = Search.destination(for: textField.text ?? "") { open(url) }
        textField.resignFirstResponder()
        return false
    }

    @objc private func cancelEditing() { field.resignFirstResponder() }

    // MARK: - Actions

    private func open(_ url: URL) {
        webView.load(URLRequest(url: url))
    }

    @objc private func goBack() {
        if !blocked.isHidden { return leaveBlocked() }
        webView.goBack()
    }

    @objc private func goForward() { webView.goForward() }

    @objc private func reloadOrStop() {
        if webView.isLoading { webView.stopLoading() } else { webView.reload() }
    }

    @objc private func pulled() {
        webView.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.webView.scrollView.refreshControl?.endRefreshing() }
    }

    @objc private func sharePage() {
        guard let url = webView.url else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = share
        present(sheet, animated: true)
    }

    // MARK: - Blocked pages

    private func showBlocked(_ title: String, _ reason: String, _ url: URL?) {
        blocked.show(title: title, reason: reason, address: url?.host ?? url?.absoluteString ?? "")
        updateProgress()
        updateBar()
    }

    private func leaveBlocked() {
        blocked.isHidden = true
        updateBar()
    }

    // MARK: - Every navigation passes through Policy

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch Policy.decide(request: navigationAction.request, isMainFrame: isMainFrame) {
        case .allow:
            // A link with no frame of its own (target=_blank) opens here, in the same view.
            if navigationAction.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(navigationAction.request)
                return
            }
            if isMainFrame { blocked.isHidden = true }
            // Allow without handing the link to another app (a universal link would open that app); WebKit's
            // _WKNavigationActionPolicyAllowWithoutTryingAppLink, which browsers built on WKWebView use.
            decisionHandler(WKNavigationActionPolicy(rawValue: WKNavigationActionPolicy.allow.rawValue + 2) ?? .allow)
        case .openOutside:
            decisionHandler(.cancel)
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        case let .block(title, reason):
            decisionHandler(.cancel)
            if isMainFrame || navigationAction.targetFrame == nil { showBlocked(title, reason, navigationAction.request.url) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        switch Policy.decide(response: navigationResponse.response, isMainFrame: navigationResponse.isForMainFrame, canShow: navigationResponse.canShowMIMEType) {
        case .allow, .openOutside:
            decisionHandler(.allow)
        case let .block(title, reason):
            decisionHandler(.cancel)
            if navigationResponse.isForMainFrame { showBlocked(title, reason, navigationResponse.response.url) }
        }
    }

    // Links and scripts that open a new window open in the same view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.request.url != nil { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        updateBar()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        let e = error as NSError
        if e.code == NSURLErrorCancelled || e.code == 102 /* frame load interrupted, a cancelled navigation */ { return updateBar() }
        let url = (e.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
        blocked.show(title: "This page did not open", reason: e.localizedDescription, address: url?.host ?? "", calm: true)
        updateBar()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // Alerts, confirms and prompts from pages, as plain sheets.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }
}

// The page shown instead of one the browser does not open: what happened, in a line, and the way back.
final class BlockedView: UIView {
    var onBack: (() -> Void)?
    private let icon = UIImageView()
    private let title = UILabel()
    private let reason = UILabel()
    private let address = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Look.bg

        icon.tintColor = Look.muted
        icon.contentMode = .scaleAspectFit
        icon.heightAnchor.constraint(equalToConstant: 32).isActive = true

        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = Look.text
        title.textAlignment = .center
        title.numberOfLines = 0

        reason.font = .systemFont(ofSize: 15)
        reason.textColor = Look.muted
        reason.textAlignment = .center
        reason.numberOfLines = 0

        address.font = .systemFont(ofSize: 13)
        address.textColor = Look.faint
        address.textAlignment = .center

        let button = UIButton(type: .system)
        button.setTitle("Go back", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.tintColor = Look.text
        button.backgroundColor = Look.raised
        button.layer.cornerRadius = 12
        button.layer.cornerCurve = .continuous
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        button.widthAnchor.constraint(greaterThanOrEqualToConstant: 140).isActive = true
        button.addTarget(self, action: #selector(goBack), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [icon, title, reason, address, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 8
        stack.setCustomSpacing(16, after: icon)
        stack.setCustomSpacing(24, after: address)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func show(title: String, reason: String, address: String, calm: Bool = false) {
        let symbol = calm ? "wifi.exclamationmark" : "hand.raised"
        icon.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 28, weight: .light))
        self.title.text = title
        self.reason.text = reason
        self.address.text = address
        self.address.isHidden = address.isEmpty
        isHidden = false
    }

    @objc private func goBack() { onBack?() }
}
