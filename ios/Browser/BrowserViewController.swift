import UIKit
import WebKit

// Joe's browser (prototype), laid out like Chrome on the iPhone (Joe, 2026-10-29: "I'd actually like chromes layout
// please"): a top bar with back, the address pill (the site, centred, with share inside it) and a ••• menu; the page in
// a card with rounded bottom corners; a bottom toolbar of three labelled buttons, Ask HQ, New Tab and All Tabs. Tabs
// (Tabs.swift) are each a web view; a thin progress line under the top bar; swipe back and forward; pull to refresh;
// video in picture in picture and sound that keeps playing when the app is left (AppDelegate sets the audio session).
// Every navigation in every tab goes through Policy (Policy.swift); what it blocks shows a calm page in the card.
// No private mode, no downloads, no settings for DNS or proxies: it is only a browser.

enum Look {
    static let bg = UIColor(red: 0x14 / 255.0, green: 0x15 / 255.0, blue: 0x18 / 255.0, alpha: 1)
    /// The bars around the page, a step lighter than it, as Chrome's are.
    static let chrome = UIColor(red: 0x1d / 255.0, green: 0x1e / 255.0, blue: 0x22 / 255.0, alpha: 1)
    static let raised = UIColor(white: 1, alpha: 0.08)
    static let text = UIColor(red: 0xe3 / 255.0, green: 0xe4 / 255.0, blue: 0xe8 / 255.0, alpha: 1)
    static let muted = UIColor(red: 0x9a / 255.0, green: 0x9e / 255.0, blue: 0xa8 / 255.0, alpha: 1)
    static let faint = UIColor(red: 0x62 / 255.0, green: 0x66 / 255.0, blue: 0x6f / 255.0, alpha: 1)
    static let accent = UIColor(red: 0x6f / 255.0, green: 0xb7 / 255.0, blue: 0xa0 / 255.0, alpha: 1)
    static let line = UIColor(white: 1, alpha: 0.07)
}

final class BrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UITextFieldDelegate {
    /// The open tab's web view, in the page card. Every tab's web view has this controller as its delegates.
    private var webView: WKWebView!
    private var tabs: [Tab] = []
    private var current: Tab!

    private let topBar = UIView()
    private let backButton = UIButton(type: .system)
    private let field = UITextField()
    private let shareInField = UIButton(type: .system)
    private let more = UIButton(type: .system)
    private let moreDot = UIView()
    private let cancel = UIButton(type: .system)
    private let progress = UIProgressView(progressViewStyle: .bar)
    /// The page card: the web view, the start page and the blocked page, rounded at the bottom.
    private let card = UIView()
    private let bottomBar = UIView()
    private let askHQ = UIButton(type: .system)
    private let newTabButton = UIButton(type: .system)
    private let allTabs = UIButton(type: .system)
    private let blocked = BlockedView()
    private let empty = UILabel()
    private let tabsView = TabsView()
    private var watches: [NSKeyValueObservation] = []

    /// Shown above the toolbar, and in the ••• menu, when the install page has a newer build (Joe, 2026-10-29: "As
    /// always let's build in an updater or link into the app"). It asks iOS to install from the install page's manifest.
    private let updateButton = UIButton(type: .system)
    private var newerVersion: String?
    private static let installPage = "https://caulfieldengineering.github.io/browser-install/"
    /// HQ, Joe's own chat app, in Chrome's place for its assistant. Only this one app.
    private static let askHQURL = URL(string: "hq://chat")!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        view = UIView()
        view.backgroundColor = Look.chrome
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        makeTopBar()
        makeCard()
        makeBottomBar()
        makeOverlays()
        layout()
        checkForUpdate()
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.checkForUpdate()
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.snapshotCurrent()
            self?.saveTabs()
        }

        let restored = TabStore.load()
        tabs = restored.tabs
        select(tabs[restored.current])
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Background tabs give up their pages; each keeps its address and loads it again when opened.
        for tab in tabs where tab !== current { tab.webView = nil }
    }

    // MARK: - Updates

    private static var myVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "" }
    private static var myBuild: Int { Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0 }

    /// Reads the install page's version.json; a higher build number shows the Update button and the menu's line.
    private func checkForUpdate() {
        guard let url = URL(string: Self.installPage + "version.json") else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let data, let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let build = info["build"] as? Int, let version = info["version"] as? String else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                self.newerVersion = build > Self.myBuild ? version : nil
                self.updateButton.configuration?.title = "Update to \(version)"
                self.updateButton.isHidden = self.newerVersion == nil
                self.moreDot.isHidden = self.newerVersion == nil
            }
        }.resume()
    }

    private func installUpdate() {
        let manifest = Self.installPage + "manifest.plist"
        if let url = URL(string: "itms-services://?action=download-manifest&url=\(manifest)") { UIApplication.shared.open(url) }
    }

    // MARK: - Building

    private static func symbol(_ name: String, _ size: CGFloat = 19) -> UIImage? {
        UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: .regular))
    }

    private func makeTopBar() {
        topBar.backgroundColor = Look.chrome

        backButton.setImage(Self.symbol("arrow.left"), for: .normal)
        backButton.tintColor = Look.text
        backButton.accessibilityLabel = "Back"
        backButton.addTarget(self, action: #selector(goBack), for: .touchUpInside)

        field.delegate = self
        field.backgroundColor = Look.raised
        field.layer.cornerRadius = 20
        field.layer.cornerCurve = .continuous
        field.textColor = Look.text
        field.tintColor = Look.accent
        field.font = .systemFont(ofSize: 16)
        field.attributedPlaceholder = NSAttributedString(string: "Search or type URL", attributes: [.foregroundColor: Look.muted])
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
        field.accessibilityLabel = "Address"
        setFieldInsets(editing: false)

        // Share, inside the pill on its right (at rest).
        shareInField.setImage(Self.symbol("square.and.arrow.up", 15), for: .normal)
        shareInField.tintColor = Look.muted
        shareInField.accessibilityLabel = "Share"
        shareInField.frame = CGRect(x: 4, y: 0, width: 40, height: 40)
        shareInField.addTarget(self, action: #selector(sharePage), for: .touchUpInside)
        // In a fixed-width holder: UITextField sizes a bare button down to its icon, which put it against the text.
        let shareHolder = UIView(frame: CGRect(x: 0, y: 0, width: 48, height: 40))
        shareHolder.addSubview(shareInField)
        shareHolder.widthAnchor.constraint(equalToConstant: 48).isActive = true
        shareHolder.heightAnchor.constraint(equalToConstant: 40).isActive = true
        field.rightView = shareHolder
        field.rightViewMode = .unlessEditing

        more.setImage(Self.symbol("ellipsis"), for: .normal)
        more.tintColor = Look.text
        more.accessibilityLabel = "More"
        more.showsMenuAsPrimaryAction = true
        more.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.menuItems() ?? []) }])
        moreDot.backgroundColor = Look.accent
        moreDot.layer.cornerRadius = 3.5
        moreDot.isHidden = true
        moreDot.isUserInteractionEnabled = false

        cancel.setTitle("Cancel", for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 16)
        cancel.tintColor = Look.text
        cancel.isHidden = true
        cancel.addTarget(self, action: #selector(cancelEditing), for: .touchUpInside)
        cancel.setContentHuggingPriority(.required, for: .horizontal)

        progress.progressTintColor = Look.accent
        progress.trackTintColor = .clear
        progress.isHidden = true
    }

    private func setFieldInsets(editing: Bool) {
        // At rest the left matches the share button on the right, so the site sits in the middle.
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: editing ? 14 : 48, height: 1))
        field.leftViewMode = .always
    }

    private func makeCard() {
        card.backgroundColor = Look.bg
        card.layer.cornerRadius = 18
        card.layer.cornerCurve = .continuous
        card.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        card.clipsToBounds = true
    }

    /// Icon over a small label, as in Chrome's toolbar.
    private static func toolLook(_ image: UIImage?, _ title: String) -> UIButton.Configuration {
        var look = UIButton.Configuration.plain()
        look.image = image
        look.imagePlacement = .top
        look.imagePadding = 4
        look.baseForegroundColor = Look.text
        var text = AttributedString(title)
        text.font = .systemFont(ofSize: 11, weight: .medium)
        look.attributedTitle = text
        look.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4)
        return look
    }

    /// The All Tabs icon: the count in a rounded square.
    private static func countImage(_ n: Int) -> UIImage {
        let size = CGSize(width: 24, height: 24)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let path = UIBezierPath(roundedRect: CGRect(x: 1.5, y: 1.5, width: 21, height: 21), cornerRadius: 5.5)
            path.lineWidth = 1.8
            Look.text.setStroke()
            path.stroke()
            let text = (n > 99 ? ":)" : "\(n)") as NSString
            let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 12, weight: .semibold), .foregroundColor: Look.text]
            let s = text.size(withAttributes: attrs)
            text.draw(at: CGPoint(x: (size.width - s.width) / 2, y: (size.height - s.height) / 2), withAttributes: attrs)
        }.withRenderingMode(.alwaysOriginal)
    }

    private func makeBottomBar() {
        bottomBar.backgroundColor = Look.chrome

        askHQ.configuration = Self.toolLook(Self.symbol("bubble.left", 20), "Ask HQ")
        askHQ.addAction(UIAction { _ in UIApplication.shared.open(Self.askHQURL) }, for: .touchUpInside)

        newTabButton.configuration = Self.toolLook(Self.symbol("plus.circle", 20), "New Tab")
        newTabButton.addAction(UIAction { [weak self] _ in self?.newTab(focus: true) }, for: .touchUpInside)

        allTabs.configuration = Self.toolLook(Self.countImage(1), "All Tabs")
        allTabs.addTarget(self, action: #selector(showTabs), for: .touchUpInside)
        // A long press: New Tab, Close This Tab.
        allTabs.menu = UIMenu(children: [
            UIAction(title: "New Tab", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in self?.newTab(focus: true) },
            UIAction(title: "Close This Tab", image: UIImage(systemName: "xmark"), attributes: .destructive) { [weak self] _ in
                if let tab = self?.current { self?.close(tab) }
            },
        ])
        allTabs.showsMenuAsPrimaryAction = false
    }

    private func makeOverlays() {
        empty.text = "Search or type an address above.\n\nBrowser \(Self.myVersion)"
        empty.textColor = Look.faint
        empty.font = .systemFont(ofSize: 15)
        empty.textAlignment = .center
        empty.numberOfLines = 0

        var look = UIButton.Configuration.filled()
        look.baseBackgroundColor = Look.accent
        look.baseForegroundColor = Look.bg
        look.cornerStyle = .capsule
        look.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16)
        updateButton.configuration = look
        updateButton.isHidden = true
        updateButton.addAction(UIAction { [weak self] _ in self?.installUpdate() }, for: .touchUpInside)

        blocked.isHidden = true
        blocked.onBack = { [weak self] in self?.leaveBlocked() }

        tabsView.isHidden = true
        tabsView.onSelect = { [weak self] tab in
            self?.select(tab)
            self?.hideTabs()
        }
        tabsView.onClose = { [weak self] tab in
            guard let self else { return }
            self.close(tab)
            self.tabsView.current = self.current
            if self.tabsView.tabs.isEmpty { self.hideTabs() }
        }
        tabsView.onNew = { [weak self] in
            self?.hideTabs()
            self?.newTab(focus: true)
        }
        tabsView.onDone = { [weak self] in self?.hideTabs() }
    }

    private func layout() {
        let row = UIStackView(arrangedSubviews: [backButton, field, more, cancel])
        row.spacing = 4
        row.alignment = .center
        let tools = UIStackView(arrangedSubviews: [askHQ, newTabButton, allTabs])
        tools.distribution = .fillEqually

        for v in [topBar, row, progress, card, empty, blocked, bottomBar, tools, updateButton, tabsView, moreDot] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
        }
        view.addSubview(card)
        view.addSubview(topBar)
        topBar.addSubview(row)
        topBar.addSubview(progress)
        card.addSubview(empty)
        card.addSubview(blocked)
        view.addSubview(bottomBar)
        bottomBar.addSubview(tools)
        view.addSubview(updateButton)
        view.addSubview(moreDot)
        view.addSubview(tabsView)

        NSLayoutConstraint.activate([
            topBar.topAnchor.constraint(equalTo: view.topAnchor),
            topBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            topBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            row.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 4),
            row.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 6),
            row.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -6),
            row.bottomAnchor.constraint(equalTo: topBar.bottomAnchor, constant: -8),
            backButton.widthAnchor.constraint(equalToConstant: 44),
            backButton.heightAnchor.constraint(equalToConstant: 44),
            more.widthAnchor.constraint(equalToConstant: 44),
            more.heightAnchor.constraint(equalToConstant: 44),
            field.heightAnchor.constraint(equalToConstant: 40),
            moreDot.widthAnchor.constraint(equalToConstant: 7),
            moreDot.heightAnchor.constraint(equalToConstant: 7),
            moreDot.topAnchor.constraint(equalTo: more.topAnchor, constant: 10),
            moreDot.trailingAnchor.constraint(equalTo: more.trailingAnchor, constant: -8),

            progress.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
            progress.trailingAnchor.constraint(equalTo: topBar.trailingAnchor),
            progress.bottomAnchor.constraint(equalTo: topBar.bottomAnchor),
            progress.heightAnchor.constraint(equalToConstant: 2),

            card.topAnchor.constraint(equalTo: topBar.bottomAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            card.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),

            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tools.topAnchor.constraint(equalTo: bottomBar.topAnchor, constant: 4),
            tools.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 8),
            tools.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -8),
            tools.heightAnchor.constraint(equalToConstant: 52),
            tools.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            updateButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            updateButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14),

            empty.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            empty.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 32),
            empty.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -32),

            blocked.topAnchor.constraint(equalTo: card.topAnchor),
            blocked.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            blocked.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            blocked.trailingAnchor.constraint(equalTo: card.trailingAnchor),

            tabsView.topAnchor.constraint(equalTo: view.topAnchor),
            tabsView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tabsView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabsView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    /// The ••• menu, built each time it opens.
    private func menuItems() -> [UIMenuElement] {
        guard let web = webView else { return [] }
        let forward = UIAction(title: "Forward", image: UIImage(systemName: "arrow.right"), attributes: web.canGoForward ? [] : .disabled) { [weak self] _ in
            self?.webView.goForward()
        }
        let reload = web.isLoading
            ? UIAction(title: "Stop", image: UIImage(systemName: "xmark")) { [weak self] _ in self?.webView.stopLoading() }
            : UIAction(title: "Reload", image: UIImage(systemName: "arrow.clockwise"), attributes: web.url == nil ? .disabled : []) { [weak self] _ in self?.webView.reload() }
        let newTab = UIAction(title: "New Tab", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in self?.newTab(focus: true) }
        let closeTab = UIAction(title: "Close Tab", image: UIImage(systemName: "xmark.square"), attributes: .destructive) { [weak self] _ in
            if let tab = self?.current { self?.close(tab) }
        }
        let share = UIAction(title: "Share", image: UIImage(systemName: "square.and.arrow.up"), attributes: web.url == nil ? .disabled : []) { [weak self] _ in
            self?.sharePage()
        }
        var about: [UIMenuElement] = [UIAction(title: "Browser \(Self.myVersion)", attributes: .disabled) { _ in }]
        if let newer = newerVersion {
            about.append(UIAction(title: "Update to \(newer)", image: UIImage(systemName: "arrow.down.circle")) { [weak self] _ in self?.installUpdate() })
        }
        return [
            UIMenu(options: .displayInline, children: [forward, reload]),
            UIMenu(options: .displayInline, children: [newTab, closeTab]),
            UIMenu(options: .displayInline, children: [share]),
            UIMenu(options: .displayInline, children: about),
        ]
    }

    // MARK: - Tabs

    /// Opens a tab: its web view (made now if it has none, loading its address) goes in the card, the bars follow it.
    private func select(_ tab: Tab) {
        if let old = current, old !== tab { snapshotCurrent() }
        current = tab
        tab.lastUsed = Date()
        let web = tab.webView ?? makeWebView()
        if tab.webView == nil {
            tab.webView = web
            if let url = tab.url { web.load(URLRequest(url: url)) }
        }
        if webView !== web {
            webView?.removeFromSuperview()
            webView = web
            web.translatesAutoresizingMaskIntoConstraints = false
            card.insertSubview(web, at: 0)
            NSLayoutConstraint.activate([
                web.topAnchor.constraint(equalTo: card.topAnchor),
                web.bottomAnchor.constraint(equalTo: card.bottomAnchor),
                web.leadingAnchor.constraint(equalTo: card.leadingAnchor),
                web.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            ])
            watch()
        }
        if let b = tab.blocked { blocked.show(title: b.title, reason: b.reason, address: b.address, calm: b.calm) } else { blocked.isHidden = true }
        progress.isHidden = true
        progress.progress = 0
        updateBar()
        saveTabs()
    }

    /// A new tab, opened. With no address it is the start page, with the address field ready to type in.
    @discardableResult
    private func newTab(webView made: WKWebView? = nil, focus: Bool = false) -> Tab {
        if tabs.count >= TabStore.cap, let oldest = tabs.filter({ $0 !== current }).min(by: { $0.lastUsed < $1.lastUsed }) {
            remove(oldest)
        }
        let tab = Tab()
        tab.webView = made
        let at = (tabs.firstIndex { $0 === current } ?? tabs.count - 1) + 1
        tabs.insert(tab, at: min(max(at, 0), tabs.count))
        select(tab)
        if focus { DispatchQueue.main.async { self.field.becomeFirstResponder() } }
        return tab
    }

    private func remove(_ tab: Tab) {
        tab.webView?.stopLoading()
        tab.webView = nil
        TabStore.removeSnapshot(for: tab.id)
        tabs.removeAll { $0 === tab }
    }

    /// Closes a tab; closing the open one opens its neighbour, and closing the last leaves a fresh start page.
    private func close(_ tab: Tab) {
        let index = tabs.firstIndex { $0 === tab } ?? 0
        let wasCurrent = tab === current
        remove(tab)
        if tabs.isEmpty {
            current = nil
            newTab()
        } else if wasCurrent {
            current = nil
            select(tabs[min(index, tabs.count - 1)])
        } else {
            updateBar()
            saveTabs()
        }
    }

    private func saveTabs() {
        TabStore.save(tabs, current: current)
    }

    /// The open tab's picture for the overview, kept small, and on disk for the next launch.
    private func snapshotCurrent(then done: (() -> Void)? = nil) {
        guard let tab = current, let web = webView, web.url != nil, web.bounds.width > 0 else { done?(); return }
        let config = WKSnapshotConfiguration()
        config.snapshotWidth = NSNumber(value: 360)
        web.takeSnapshot(with: config) { image, _ in
            if let image {
                tab.snapshot = image
                TabStore.saveSnapshot(image, for: tab.id)
            }
            done?()
        }
    }

    @objc private func showTabs() {
        field.resignFirstResponder()
        snapshotCurrent { [weak self] in
            guard let self else { return }
            self.tabsView.tabs = self.tabs
            self.tabsView.current = self.current
            self.tabsView.alpha = 0
            self.tabsView.isHidden = false
            self.tabsView.reload()
            UIView.animate(withDuration: 0.2) { self.tabsView.alpha = 1 }
        }
    }

    private func hideTabs() {
        UIView.animate(withDuration: 0.2, animations: { self.tabsView.alpha = 0 }, completion: { _ in self.tabsView.isHidden = true })
    }

    private func tab(for web: WKWebView) -> Tab? { tabs.first { $0.webView === web } }

    // MARK: - A tab's web view

    /// A tab's web view. A page that opens a window hands its own configuration (`given`), which must be used.
    private func makeWebView(_ given: WKWebViewConfiguration? = nil) -> WKWebView {
        let config = given ?? WKWebViewConfiguration()
        config.websiteDataStore = .default() // never a private (non-persistent) store
        config.allowsInlineMediaPlayback = true
        // Picture in picture (Joe, 2026-10-29: "PIP player would be nice"): WebKit's own, from a video's controls or
        // on leaving the app while a video plays, as in Safari.
        config.allowsPictureInPictureMediaPlayback = true
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsLinkPreview = true
        web.isOpaque = false
        web.backgroundColor = Look.bg
        web.underPageBackgroundColor = Look.bg
        web.scrollView.backgroundColor = Look.bg
        web.scrollView.keyboardDismissMode = .interactive

        let refresh = UIRefreshControl()
        refresh.tintColor = Look.muted
        refresh.addTarget(self, action: #selector(pulled), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        return web
    }

    private func watch() {
        watches = [
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in self?.updateProgress() },
            webView.observe(\.isLoading, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.url, options: [.new]) { [weak self] _, _ in self?.updateBar() },
            webView.observe(\.title, options: [.new]) { [weak self] web, _ in self?.tab(for: web)?.title = web.title ?? "" },
        ]
    }

    // MARK: - The bars

    private func updateBar() {
        guard let web = webView else { return }
        backButton.isEnabled = web.canGoBack || !blocked.isHidden
        backButton.tintColor = backButton.isEnabled ? Look.text : Look.faint
        shareInField.isHidden = web.url == nil || !blocked.isHidden
        empty.isHidden = web.url != nil || !blocked.isHidden
        if !field.isEditing { field.text = Self.shortAddress(web.url) }
        if let url = web.url, url.scheme == "https" || url.scheme == "http", current.url != url {
            current.url = url
            saveTabs()
        }
        allTabs.configuration?.image = Self.countImage(tabs.count)
        allTabs.accessibilityLabel = tabs.count == 1 ? "All tabs, 1 tab" : "All tabs, \(tabs.count) tabs"
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

    /// At rest the pill shows the site, not the whole address ("nytimes.com").
    static func shortAddress(_ url: URL?) -> String {
        guard let url, let host = url.host else { return "" }
        if host.hasSuffix("duckduckgo.com"), let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "q" })?.value {
            return q
        }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    // The pill is at the top, so the keyboard comes up well clear of it; while typing, Cancel takes the ••• place.
    func textFieldDidBeginEditing(_ textField: UITextField) {
        field.textAlignment = .natural
        setFieldInsets(editing: true)
        field.text = webView.url?.absoluteString ?? ""
        cancel.isHidden = false
        more.isHidden = true
        moreDot.alpha = 0
        DispatchQueue.main.async { textField.selectAll(nil) }
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        field.textAlignment = .center
        setFieldInsets(editing: false)
        cancel.isHidden = true
        more.isHidden = false
        moreDot.alpha = 1
        updateBar()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if let url = Search.destination(for: textField.text ?? "") { webView.load(URLRequest(url: url)) }
        textField.resignFirstResponder()
        return false
    }

    @objc private func cancelEditing() { field.resignFirstResponder() }

    // MARK: - Actions

    @objc private func goBack() {
        if !blocked.isHidden { return leaveBlocked() }
        webView.goBack()
    }

    @objc private func pulled() {
        webView.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.webView.scrollView.refreshControl?.endRefreshing() }
    }

    @objc private func sharePage() {
        guard let url = webView.url else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = shareInField
        present(sheet, animated: true)
    }

    // MARK: - Blocked pages

    /// The calm page, kept on its tab: shown now if that tab is open, else when it is opened.
    private func showBlocked(_ info: BlockedInfo, in web: WKWebView) {
        guard let tab = tab(for: web) else { return }
        tab.blocked = info
        guard tab === current else { return }
        blocked.show(title: info.title, reason: info.reason, address: info.address, calm: info.calm)
        updateProgress()
        updateBar()
    }

    private func showBlocked(_ title: String, _ reason: String, _ url: URL?, in web: WKWebView) {
        showBlocked(BlockedInfo(title: title, reason: reason, address: url?.host ?? url?.absoluteString ?? "", calm: false), in: web)
    }

    private func leaveBlocked() {
        current.blocked = nil
        blocked.isHidden = true
        updateBar()
    }

    // MARK: - Every navigation passes through Policy

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch Policy.decide(request: navigationAction.request, isMainFrame: isMainFrame) {
        case .allow:
            // A link with no frame of its own that did not get a new tab (below) opens in a new tab here.
            if navigationAction.targetFrame == nil {
                decisionHandler(.cancel)
                newTab()
                self.webView.load(navigationAction.request)
                return
            }
            if isMainFrame, let tab = tab(for: webView) {
                tab.blocked = nil
                if tab === current { blocked.isHidden = true }
            }
            // Allow without handing the link to another app (a universal link would open that app); WebKit's
            // _WKNavigationActionPolicyAllowWithoutTryingAppLink, which browsers built on WKWebView use.
            decisionHandler(WKNavigationActionPolicy(rawValue: WKNavigationActionPolicy.allow.rawValue + 2) ?? .allow)
        case .openOutside:
            decisionHandler(.cancel)
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        case let .block(title, reason):
            decisionHandler(.cancel)
            if isMainFrame || navigationAction.targetFrame == nil { showBlocked(title, reason, navigationAction.request.url, in: webView) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        switch Policy.decide(response: navigationResponse.response, isMainFrame: navigationResponse.isForMainFrame, canShow: navigationResponse.canShowMIMEType) {
        case .allow, .openOutside:
            decisionHandler(.allow)
        case let .block(title, reason):
            decisionHandler(.cancel)
            if navigationResponse.isForMainFrame { showBlocked(title, reason, navigationResponse.response.url, in: webView) }
        }
    }

    // Links and scripts that open a new window open in a new tab. WebKit loads the request into the web view returned
    // here, through the same delegates, so Policy sees it as it sees every navigation.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let made = makeWebView(configuration)
        newTab(webView: made)
        return made
    }

    // A page closing a window it opened (window.close()) closes that tab.
    func webViewDidClose(_ webView: WKWebView) {
        if let tab = tab(for: webView) { close(tab) }
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
        showBlocked(BlockedInfo(title: "This page did not open", reason: e.localizedDescription, address: url?.host ?? "", calm: true), in: webView)
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
