import UIKit
import WebKit

// Several Instagram accounts in the Instagram app (Joe, 2026-11-05: "I also need support for multiple accounts").
// Each account is its own website data store (cookies, storage), so each stays signed in on its own and switching is
// one tap. The first account is the default store the app has always used, so the account already signed in stays.
// Every account gets the same filter; the feed and History stay per app. Instagram's own switcher (in its profile
// menu) still works inside an account as well.
struct IGAccount: Codable, Equatable {
    var id: String   // "default", or a UUID for its own data store
    var name: String
}

enum Accounts {
    private static let listKey = "ig.accounts", currentKey = "ig.account.current"

    static var all: [IGAccount] {
        get {
            if let d = UserDefaults.standard.data(forKey: listKey), let a = try? JSONDecoder().decode([IGAccount].self, from: d), !a.isEmpty { return a }
            return [IGAccount(id: "default", name: "Account 1")]
        }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: listKey) }
    }

    static var current: IGAccount {
        let id = UserDefaults.standard.string(forKey: currentKey) ?? "default"
        return all.first { $0.id == id } ?? all[0]
    }

    static func select(_ id: String) { UserDefaults.standard.set(id, forKey: currentKey) }

    static func store(for account: IGAccount) -> WKWebsiteDataStore {
        guard account.id != "default", let uuid = UUID(uuidString: account.id) else { return .default() }
        return WKWebsiteDataStore(forIdentifier: uuid)
    }

    @discardableResult
    static func add() -> IGAccount {
        let a = IGAccount(id: UUID().uuidString, name: "Account \(all.count + 1)")
        all = all + [a]
        return a
    }

    static func rename(_ id: String, _ name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        all = all.map { $0.id == id ? IGAccount(id: $0.id, name: String(clean.prefix(40))) : $0 }
    }

    /// Removes an added account and its stored sign-in (never the first). The data store goes with it.
    static func remove(_ id: String) {
        guard id != "default" else { return }
        all = all.filter { $0.id != id }
        if current.id == id || UserDefaults.standard.string(forKey: currentKey) == id { select("default") }
        if let uuid = UUID(uuidString: id) { WKWebsiteDataStore.remove(forIdentifier: uuid) { _ in } }
    }

    /// Names an account after the Instagram user signed in to it, the first time that can be read from the page
    /// (Instagram's own nav shows "<user>'s profile picture"). Only an account still called "Account N" is renamed.
    static let usernameScript = """
    (() => { const i = document.querySelector('nav img[alt$="profile picture"], [role="navigation"] img[alt$="profile picture"], a[href^="/"][role="link"] img[alt$="profile picture"]');
      const m = i && i.getAttribute('alt').match(/^(.{1,30}?)'s profile picture$/); return m ? m[1] : ''; })()
    """
    static func learnName(_ name: String, for id: String) {
        guard !name.isEmpty, let a = all.first(where: { $0.id == id }), a.name.hasPrefix("Account ") else { return }
        rename(id, name)
    }
}

/// The account switcher: a short list, the open account ticked in the accent, "Add account" as the one action.
/// Swipe an added account to remove it (asks once); press and hold a name to rename it.
final class AccountsViewController: UITableViewController {
    var onPick: ((IGAccount) -> Void)?
    private var accounts: [IGAccount] = []

    init() { super.init(style: .insetGrouped) }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Accounts"
        overrideUserInterfaceStyle = .dark
        tableView.backgroundColor = Look.bg
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in self?.dismiss(animated: true) })
        navigationItem.rightBarButtonItem?.tintColor = Look.text
        tableView.addGestureRecognizer(UILongPressGestureRecognizer(target: self, action: #selector(held(_:))))
        reload()
    }

    private func reload() { accounts = Accounts.all; tableView.reloadData() }

    override func numberOfSections(in tableView: UITableView) -> Int { 2 }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { section == 0 ? accounts.count : 1 }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        var c = cell.defaultContentConfiguration()
        cell.backgroundColor = Look.raised
        if indexPath.section == 0 {
            let a = accounts[indexPath.row]
            c.text = a.name
            c.textProperties.color = Look.text
            cell.accessoryType = a.id == Accounts.current.id ? .checkmark : .none
            cell.tintColor = Look.accent
        } else {
            c.text = "Add account"
            c.textProperties.color = Look.accent
            c.image = UIImage(systemName: "plus")
            c.imageProperties.tintColor = Look.accent
            cell.accessoryType = .none
        }
        cell.contentConfiguration = c
        return cell
    }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        section == 1 ? "Each account keeps its own sign-in. The filter is the same for all." : nil
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let a = indexPath.section == 0 ? accounts[indexPath.row] : Accounts.add()
        dismiss(animated: true) { [onPick] in onPick?(a) }
    }

    override func tableView(_ tableView: UITableView, trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath) -> UISwipeActionsConfiguration? {
        guard indexPath.section == 0, accounts[indexPath.row].id != "default" else { return nil }
        let a = accounts[indexPath.row]
        let remove = UIContextualAction(style: .destructive, title: "Remove") { [weak self] _, _, done in
            let ask = UIAlertController(title: "Remove \(a.name)?", message: "Its sign-in on this phone is removed. The Instagram account itself is not touched.", preferredStyle: .alert)
            ask.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done(false) })
            ask.addAction(UIAlertAction(title: "Remove", style: .destructive) { _ in
                let wasCurrent = Accounts.current.id == a.id
                Accounts.remove(a.id)
                self?.reload()
                done(true)
                if wasCurrent { self?.onPick?(Accounts.current) }
            })
            self?.present(ask, animated: true)
        }
        return UISwipeActionsConfiguration(actions: [remove])
    }

    @objc private func held(_ g: UILongPressGestureRecognizer) {
        guard g.state == .began, let ip = tableView.indexPathForRow(at: g.location(in: tableView)), ip.section == 0 else { return }
        let a = accounts[ip.row]
        let ask = UIAlertController(title: "Rename", message: nil, preferredStyle: .alert)
        ask.addTextField { $0.text = a.name }
        ask.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        ask.addAction(UIAlertAction(title: "Save", style: .default) { [weak self] _ in Accounts.rename(a.id, ask.textFields?.first?.text ?? ""); self?.reload() })
        present(ask, animated: true)
    }
}
