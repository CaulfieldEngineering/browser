import UIKit

// The site app's menu, on a two-finger tap (Joe, 2026-11-10, of the old action sheet: "Can we tidy this up and remove
// the history option?", then "Can we make this a more advanced menu screen"). A sheet in sections, like Settings:
// the account and version at the top; Feed (Skip posts I've seen, a real switch; Instagram only); Tools (hide a
// picture, reload); Accounts; the update when there is one. No History and no Filter today (Joe: "Oh we can hide that
// Filter Today button"); both are still kept on the phone as before, only the menu lines went. Each row says what it
// does in a line under it.
final class SiteMenuViewController: UITableViewController {
    struct Actions {
        var hidePick: () -> Void
        var reload: () -> Void
        var pickAccount: (IGAccount) -> Void
        var seenChanged: () -> Void
        var update: (() -> Void)?
        var newer: String?
        var version: String
    }
    private let actions: Actions

    private enum Row { case seen, hide, reload, account, update }
    private var sections: [(title: String?, footer: String?, rows: [Row])] = []

    init(_ actions: Actions) {
        self.actions = actions
        super.init(style: .insetGrouped)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        tableView.backgroundColor = Look.bg
        tableView.separatorColor = Look.line
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in self?.dismiss(animated: true) })
        navigationItem.rightBarButtonItem?.tintColor = Look.text
        tableView.tableHeaderView = header()
        build()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        tableView.tableHeaderView = header()  // the account may have been renamed
        build()
        tableView.reloadData()
    }

    private func build() {
        sections = []
        if actions.newer != nil, actions.update != nil { sections.append((nil, nil, [.update])) }
        if Flavor.isInstagram {
            sections.append(("Feed", "Posts you have already scrolled past are left out the next time the feed opens, so you start at what is new. Posts you saw on this visit stay.", [.seen]))
        }
        sections.append(("Tools", nil, [.hide, .reload]))
        sections.append(("Account", nil, [.account]))
    }

    private func header() -> UIView {
        let v = UIView(frame: CGRect(x: 0, y: 0, width: max(tableView.bounds.width, 320), height: 76))
        v.autoresizingMask = .flexibleWidth
        let name = UILabel(), sub = UILabel()
        name.text = Accounts.current.name
        name.font = .systemFont(ofSize: 20, weight: .semibold)
        name.textColor = Look.text
        sub.text = "\(Flavor.name) \(actions.version)"
        sub.font = .systemFont(ofSize: 13)
        sub.textColor = Look.muted
        let stack = UIStackView(arrangedSubviews: [name, sub])
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: v.layoutMarginsGuide.leadingAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: v.bottomAnchor, constant: -8),
        ])
        return v
    }

    override func numberOfSections(in tableView: UITableView) -> Int { sections.count }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { sections[section].rows.count }
    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? { sections[section].title }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? { sections[section].footer }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        cell.backgroundColor = Look.raised
        cell.accessoryView = nil
        cell.accessoryType = .none
        cell.selectionStyle = .default
        var c = UIListContentConfiguration.subtitleCell()
        c.textProperties.color = Look.text
        c.secondaryTextProperties.color = Look.muted
        c.secondaryTextProperties.font = .systemFont(ofSize: 13)
        c.imageProperties.tintColor = Look.muted
        let row = sections[indexPath.section].rows[indexPath.row]
        switch row {
        case .update:
            c.text = "Update to \(actions.newer ?? "")"
            c.secondaryText = "Installs the new version from the install page."
            c.textProperties.color = Look.accent
            c.image = UIImage(systemName: "arrow.down.circle")
            c.imageProperties.tintColor = Look.accent
        case .seen:
            c.text = "Skip posts I've seen"
            c.image = UIImage(systemName: "eye.slash")
            let sw = UISwitch()
            sw.isOn = SeenPosts.on
            sw.onTintColor = Look.accent
            sw.accessibilityLabel = "Skip posts I've seen"
            sw.addAction(UIAction { [weak self] a in
                SeenPosts.on = (a.sender as? UISwitch)?.isOn ?? SeenPosts.on
                self?.actions.seenChanged()
            }, for: .valueChanged)
            cell.accessoryView = sw
            cell.selectionStyle = .none
        case .hide:
            c.text = "Hide a picture"
            c.secondaryText = "Then tap the picture. It stays hidden on this phone."
            c.image = UIImage(systemName: "nosign")
        case .reload:
            c.text = "Reload"
            c.image = UIImage(systemName: "arrow.clockwise")
        case .account:
            c.text = Accounts.current.name
            c.secondaryText = Accounts.all.count > 1 ? "\(Accounts.all.count) accounts on this phone" : "Switch or add an account"
            c.image = UIImage(systemName: "person.crop.circle")
            cell.accessoryType = .disclosureIndicator
        }
        cell.contentConfiguration = c
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch sections[indexPath.section].rows[indexPath.row] {
        case .update: dismiss(animated: true) { [actions] in actions.update?() }
        case .hide: dismiss(animated: true) { [actions] in actions.hidePick() }
        case .reload: dismiss(animated: true) { [actions] in actions.reload() }
        case .account:
            let list = AccountsViewController()
            list.onPick = actions.pickAccount
            navigationController?.pushViewController(list, animated: true)
        case .seen: break
        }
    }
}
