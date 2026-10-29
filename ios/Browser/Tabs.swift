import UIKit
import WebKit

// Tabs (Joe, 2026-10-29: "Can we build in tabs"). Each tab keeps its address, title and a snapshot for the overview;
// its web view is made only when the tab is opened (tabs restored at launch have none until then, and background tabs
// give theirs up when memory runs low), so many tabs cost little. Every tab's web view has the same delegate, so every
// navigation in every tab still passes through Policy. No private tabs: one persistent website store for all.

/// What a tab shows instead of a page the policy did not open.
struct BlockedInfo {
    let title: String
    let reason: String
    let address: String
    let calm: Bool
}

final class Tab {
    let id: UUID
    var url: URL?
    var title: String
    var webView: WKWebView?
    var snapshot: UIImage?
    var blocked: BlockedInfo?
    var lastUsed: Date

    init(id: UUID = UUID(), url: URL? = nil, title: String = "", lastUsed: Date = Date()) {
        self.id = id
        self.url = url
        self.title = title
        self.lastUsed = lastUsed
    }

    /// The card's title: the page's, else its site, else "Start page".
    var displayTitle: String {
        if !title.isEmpty { return title }
        let short = BrowserViewController.shortAddress(url)
        return short.isEmpty ? "Start page" : short
    }
}

/// The tabs as they were, kept across launches: addresses and titles in UserDefaults, snapshots as small JPEGs in Caches.
enum TabStore {
    static let cap = 30
    private static let tabsKey = "tabs"
    private static let currentKey = "currentTab"
    private static let lastPageKey = "lastPage" // the one-page prototype's, read once

    private struct Saved: Codable {
        let id: UUID
        let url: String?
        let title: String
        let lastUsed: Date
    }

    static func load() -> (tabs: [Tab], current: Int) {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: tabsKey), let saved = try? JSONDecoder().decode([Saved].self, from: data), !saved.isEmpty {
            let tabs = saved.map { Tab(id: $0.id, url: $0.url.flatMap(URL.init(string:)), title: $0.title, lastUsed: $0.lastUsed) }
            let currentId = defaults.string(forKey: currentKey).flatMap(UUID.init(uuidString:))
            return (tabs, tabs.firstIndex { $0.id == currentId } ?? tabs.count - 1)
        }
        let first = Tab(url: defaults.string(forKey: lastPageKey).flatMap(URL.init(string:)))
        return ([first], 0)
    }

    static func save(_ tabs: [Tab], current: Tab?) {
        let saved = tabs.map { Saved(id: $0.id, url: $0.url?.absoluteString, title: $0.title, lastUsed: $0.lastUsed) }
        if let data = try? JSONEncoder().encode(saved) { UserDefaults.standard.set(data, forKey: tabsKey) }
        UserDefaults.standard.set(current?.id.uuidString, forKey: currentKey)
    }

    private static var folder: URL? {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let dir = caches.appendingPathComponent("tab-snapshots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func saveSnapshot(_ image: UIImage, for id: UUID) {
        guard let file = folder?.appendingPathComponent("\(id.uuidString).jpg"), let data = image.jpegData(compressionQuality: 0.6) else { return }
        try? data.write(to: file, options: .atomic)
    }

    static func loadSnapshot(for id: UUID) -> UIImage? {
        guard let file = folder?.appendingPathComponent("\(id.uuidString).jpg") else { return nil }
        return UIImage(contentsOfFile: file.path)
    }

    static func removeSnapshot(for id: UUID) {
        guard let file = folder?.appendingPathComponent("\(id.uuidString).jpg") else { return }
        try? FileManager.default.removeItem(at: file)
    }
}

// MARK: - The overview

/// Every tab as a card with its snapshot and title, two across. Tap one to open it, x or a sideways swipe to close it,
/// + for a new tab, Done (or the open tab's card) to go back to it.
final class TabsView: UIView, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    var tabs: [Tab] = []
    var current: Tab?
    var onSelect: ((Tab) -> Void)?
    var onClose: ((Tab) -> Void)?
    var onNew: (() -> Void)?
    var onDone: (() -> Void)?

    private let grid: UICollectionView
    private let count = UILabel()

    override init(frame: CGRect) {
        let layout = UICollectionViewFlowLayout()
        layout.minimumInteritemSpacing = 14
        layout.minimumLineSpacing = 20
        layout.sectionInset = UIEdgeInsets(top: 16, left: 16, bottom: 24, right: 16)
        grid = UICollectionView(frame: .zero, collectionViewLayout: layout)
        super.init(frame: frame)
        backgroundColor = Look.bg

        grid.backgroundColor = .clear
        grid.dataSource = self
        grid.delegate = self
        grid.alwaysBounceVertical = true
        grid.register(TabCard.self, forCellWithReuseIdentifier: "card")

        let bar = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
        let line = UIView()
        line.backgroundColor = Look.line

        let plus = UIButton(type: .system)
        plus.setImage(UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 21, weight: .regular)), for: .normal)
        plus.tintColor = Look.text
        plus.accessibilityLabel = "New tab"
        plus.addAction(UIAction { [weak self] _ in self?.onNew?() }, for: .touchUpInside)

        count.font = .systemFont(ofSize: 15, weight: .medium)
        count.textColor = Look.muted
        count.textAlignment = .center

        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        done.tintColor = Look.text
        done.addAction(UIAction { [weak self] _ in self?.onDone?() }, for: .touchUpInside)

        let row = UIStackView(arrangedSubviews: [plus, count, done])
        row.distribution = .equalCentering
        row.alignment = .center

        for v in [grid, bar, line, row] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false }
        addSubview(grid)
        addSubview(bar)
        bar.contentView.addSubview(line)
        bar.contentView.addSubview(row)
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            grid.leadingAnchor.constraint(equalTo: leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: trailingAnchor),
            grid.bottomAnchor.constraint(equalTo: bar.topAnchor),
            bar.leadingAnchor.constraint(equalTo: leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: bottomAnchor),
            line.topAnchor.constraint(equalTo: bar.contentView.topAnchor),
            line.leadingAnchor.constraint(equalTo: bar.contentView.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: bar.contentView.trailingAnchor),
            line.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),
            row.topAnchor.constraint(equalTo: bar.contentView.topAnchor, constant: 6),
            row.heightAnchor.constraint(equalToConstant: 44),
            row.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 20),
            row.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -20),
            row.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -4),
            plus.widthAnchor.constraint(equalToConstant: 44),
            done.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func reload() {
        count.text = tabs.count == 1 ? "1 Tab" : "\(tabs.count) Tabs"
        grid.reloadData()
        if let current, let i = tabs.firstIndex(where: { $0 === current }) {
            grid.layoutIfNeeded()
            grid.scrollToItem(at: IndexPath(item: i, section: 0), at: .centeredVertically, animated: false)
        }
    }

    private func close(_ tab: Tab) {
        guard let i = tabs.firstIndex(where: { $0 === tab }) else { return }
        tabs.remove(at: i)
        grid.performBatchUpdates({ grid.deleteItems(at: [IndexPath(item: i, section: 0)]) })
        count.text = tabs.count == 1 ? "1 Tab" : "\(tabs.count) Tabs"
        onClose?(tab)
    }

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { tabs.count }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let card = collectionView.dequeueReusableCell(withReuseIdentifier: "card", for: indexPath) as! TabCard
        let tab = tabs[indexPath.item]
        if tab.snapshot == nil { tab.snapshot = TabStore.loadSnapshot(for: tab.id) }
        card.show(tab, isCurrent: tab === current)
        card.onClose = { [weak self] in self?.close(tab) }
        return card
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        onSelect?(tabs[indexPath.item])
    }

    func collectionView(_ collectionView: UICollectionView, layout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let columns: CGFloat = bounds.width > 600 ? 3 : 2
        let width = floor((collectionView.bounds.width - 32 - 14 * (columns - 1)) / columns)
        return CGSize(width: width, height: width * 1.3 + 26)
    }
}

final class TabCard: UICollectionViewCell, UIGestureRecognizerDelegate {
    var onClose: (() -> Void)?
    private let frameView = UIView()
    private let image = UIImageView()
    private let placeholder = UIImageView(image: UIImage(systemName: "globe", withConfiguration: UIImage.SymbolConfiguration(pointSize: 28, weight: .light)))
    private let title = UILabel()
    private let closeButton = UIButton(type: .system)
    private let pan = UIPanGestureRecognizer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        frameView.backgroundColor = Look.raised
        frameView.layer.cornerRadius = 14
        frameView.layer.cornerCurve = .continuous
        frameView.clipsToBounds = true
        frameView.layer.borderColor = Look.accent.cgColor

        image.contentMode = .scaleAspectFill
        image.clipsToBounds = true
        placeholder.tintColor = Look.faint

        title.font = .systemFont(ofSize: 13, weight: .medium)
        title.textColor = Look.text
        title.textAlignment = .center

        var look = UIButton.Configuration.filled()
        look.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold))
        look.baseBackgroundColor = UIColor(white: 0, alpha: 0.55)
        look.baseForegroundColor = Look.text
        look.cornerStyle = .capsule
        look.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6)
        closeButton.configuration = look
        closeButton.accessibilityLabel = "Close tab"
        closeButton.addAction(UIAction { [weak self] _ in self?.onClose?() }, for: .touchUpInside)

        for v in [frameView, image, placeholder, title, closeButton] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false }
        contentView.addSubview(frameView)
        frameView.addSubview(placeholder)
        frameView.addSubview(image)
        contentView.addSubview(closeButton)
        contentView.addSubview(title)
        NSLayoutConstraint.activate([
            frameView.topAnchor.constraint(equalTo: contentView.topAnchor),
            frameView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            frameView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            frameView.bottomAnchor.constraint(equalTo: title.topAnchor, constant: -8),
            image.topAnchor.constraint(equalTo: frameView.topAnchor),
            image.leadingAnchor.constraint(equalTo: frameView.leadingAnchor),
            image.trailingAnchor.constraint(equalTo: frameView.trailingAnchor),
            image.bottomAnchor.constraint(equalTo: frameView.bottomAnchor),
            placeholder.centerXAnchor.constraint(equalTo: frameView.centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: frameView.centerYAnchor),
            closeButton.topAnchor.constraint(equalTo: frameView.topAnchor, constant: 6),
            closeButton.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -6),
            title.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            title.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            title.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            title.heightAnchor.constraint(equalToConstant: 18),
        ])

        // A sideways swipe closes the tab.
        pan.addTarget(self, action: #selector(swiped(_:)))
        pan.delegate = self
        contentView.addGestureRecognizer(pan)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func prepareForReuse() {
        super.prepareForReuse()
        contentView.transform = .identity
        contentView.alpha = 1
    }

    func show(_ tab: Tab, isCurrent: Bool) {
        image.image = tab.snapshot
        placeholder.isHidden = tab.snapshot != nil
        title.text = tab.displayTitle
        frameView.layer.borderWidth = isCurrent ? 2 : 0
        accessibilityLabel = tab.displayTitle
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === pan else { return true }
        let v = pan.velocity(in: contentView)
        return abs(v.x) > abs(v.y) * 1.5
    }

    @objc private func swiped(_ pan: UIPanGestureRecognizer) {
        let dx = pan.translation(in: contentView).x
        switch pan.state {
        case .changed:
            contentView.transform = CGAffineTransform(translationX: dx, y: 0)
            contentView.alpha = max(0.2, 1 - abs(dx) / bounds.width)
        case .ended, .cancelled:
            let flung = abs(pan.velocity(in: contentView).x) > 800
            if pan.state == .ended && (abs(dx) > bounds.width * 0.4 || flung) {
                let away = (dx < 0 ? -1 : 1) * bounds.width * 1.6
                UIView.animate(withDuration: 0.2, animations: {
                    self.contentView.transform = CGAffineTransform(translationX: away, y: 0)
                    self.contentView.alpha = 0
                }, completion: { _ in self.onClose?() })
            } else {
                UIView.animate(withDuration: 0.25, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0, options: [], animations: {
                    self.contentView.transform = .identity
                    self.contentView.alpha = 1
                })
            }
        default:
            break
        }
    }
}
