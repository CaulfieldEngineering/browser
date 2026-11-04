import UIKit

// History, from the ••• menu: every page opened, newest first, under a heading per day, with a search field. Tap a
// page to open it in this tab; a long press opens it in a new tab or copies its address. Nothing here removes a visit.
// Laid out like All Tabs (Tabs.swift): the same dark surface, a bar with Done, quiet type.

final class HistoryView: UIView, UITableViewDataSource, UITableViewDelegate, UISearchTextFieldDelegate {
    var onOpen: ((URL) -> Void)?
    var onOpenInNewTab: ((URL) -> Void)?
    var onDone: (() -> Void)?

    private var store: HistoryStore = .shared
    private let table = UITableView(frame: .zero, style: .plain)
    private let search = UISearchTextField()
    private let empty = UILabel()

    /// Visits shown, by day, newest first.
    private var days: [(title: String, visits: [Visit])] = []
    /// While not searching: the months not yet read, newest first.
    private var monthsLeft: [String] = []
    private var loaded: [Visit] = []
    private var query = ""
    private let work = DispatchQueue(label: "history.view")
    private var generation = 0

    private static let time: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()
    private static let dayTitle: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return f
    }()
    private static let dayTitleYear: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEEMMMMdyyyy")
        return f
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Look.bg

        let title = UILabel()
        title.text = "History"
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = Look.text

        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        done.tintColor = Look.text
        done.addAction(UIAction { [weak self] _ in self?.endSearch(); self?.onDone?() }, for: .touchUpInside)

        search.delegate = self
        search.placeholder = "Search history"
        search.backgroundColor = Look.raised
        search.textColor = Look.text
        search.tintColor = Look.accent
        search.font = .systemFont(ofSize: 16)
        search.returnKeyType = .search
        search.autocapitalizationType = .none
        search.autocorrectionType = .no
        search.attributedPlaceholder = NSAttributedString(string: "Search history", attributes: [.foregroundColor: Look.muted])
        search.leftView?.tintColor = Look.muted
        search.addAction(UIAction { [weak self] _ in self?.searchChanged() }, for: .editingChanged)

        table.backgroundColor = .clear
        table.dataSource = self
        table.delegate = self
        table.separatorColor = Look.line
        table.separatorInset = UIEdgeInsets(top: 0, left: 20, bottom: 0, right: 0)
        table.keyboardDismissMode = .onDrag
        table.sectionHeaderTopPadding = 0
        table.rowHeight = 60
        table.register(VisitCell.self, forCellReuseIdentifier: "visit")

        empty.textColor = Look.faint
        empty.font = .systemFont(ofSize: 15)
        empty.textAlignment = .center
        empty.numberOfLines = 0

        let line = UIView()
        line.backgroundColor = Look.line

        let header = UIView()
        header.backgroundColor = Look.chrome
        for v in [header, title, done, search, line, table, empty] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false }
        addSubview(table)
        addSubview(header)
        header.addSubview(title)
        header.addSubview(done)
        header.addSubview(search)
        header.addSubview(line)
        addSubview(empty)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor),
            header.leadingAnchor.constraint(equalTo: leadingAnchor),
            header.trailingAnchor.constraint(equalTo: trailingAnchor),
            title.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 10),
            title.centerXAnchor.constraint(equalTo: centerXAnchor),
            done.centerYAnchor.constraint(equalTo: title.centerYAnchor),
            done.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
            done.heightAnchor.constraint(equalToConstant: 44),
            search.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 14),
            search.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 16),
            search.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
            search.heightAnchor.constraint(equalToConstant: 38),
            search.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -12),
            line.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            line.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            line.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),
            table.topAnchor.constraint(equalTo: header.bottomAnchor),
            table.leadingAnchor.constraint(equalTo: leadingAnchor),
            table.trailingAnchor.constraint(equalTo: trailingAnchor),
            table.bottomAnchor.constraint(equalTo: bottomAnchor),
            empty.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 48),
            empty.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            empty.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    /// Reads the newest visits again (each time the view is shown).
    func reload(store: HistoryStore = .shared) {
        self.store = store
        generation += 1
        let gen = generation
        let q = query
        work.async { [weak self] in
            guard let self else { return }
            if q.isEmpty {
                var months = store.months()
                var visits: [Visit] = []
                while visits.count < 300, !months.isEmpty { visits += store.visits(in: months.removeFirst()) }
                DispatchQueue.main.async {
                    guard gen == self.generation else { return }
                    self.loaded = visits
                    self.monthsLeft = months
                    self.show(visits)
                }
            } else {
                let found = store.search(q)
                DispatchQueue.main.async {
                    guard gen == self.generation else { return }
                    self.show(found)
                }
            }
        }
    }

    /// The next month, when the list is scrolled to its end.
    private func loadMore() {
        guard query.isEmpty, !monthsLeft.isEmpty else { return }
        let month = monthsLeft.removeFirst()
        let gen = generation
        let store = self.store
        work.async { [weak self] in
            let more = store.visits(in: month)
            DispatchQueue.main.async {
                guard let self, gen == self.generation else { return }
                self.loaded += more
                self.show(self.loaded)
            }
        }
    }

    private func show(_ visits: [Visit]) {
        let calendar = Calendar.current
        var out: [(title: String, visits: [Visit])] = []
        var currentDay: Date?
        for v in visits {
            let day = calendar.startOfDay(for: v.at)
            if day != currentDay {
                currentDay = day
                out.append((Self.title(for: day), []))
            }
            out[out.count - 1].visits.append(v)
        }
        days = out
        table.reloadData()
        empty.isHidden = !out.isEmpty
        empty.text = query.isEmpty ? "Pages you open show here." : "No pages match."
    }

    static func title(for day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }
        let sameYear = calendar.component(.year, from: day) == calendar.component(.year, from: Date())
        return (sameYear ? dayTitle : dayTitleYear).string(from: day)
    }

    private func searchChanged() {
        query = (search.text ?? "").trimmingCharacters(in: .whitespaces)
        reload(store: store)
    }

    private func endSearch() {
        search.resignFirstResponder()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return false
    }

    // MARK: - The list

    func numberOfSections(in tableView: UITableView) -> Int { days.count }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { days[section].visits.count }

    func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        let label = UILabel()
        label.text = days[section].title.uppercased()
        label.font = .systemFont(ofSize: 12, weight: .semibold)
        label.textColor = Look.muted
        let holder = UIView()
        holder.backgroundColor = Look.bg
        label.translatesAutoresizingMaskIntoConstraints = false
        holder.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: holder.layoutMarginsGuide.leadingAnchor, constant: 4),
            label.bottomAnchor.constraint(equalTo: holder.bottomAnchor, constant: -8),
        ])
        return holder
    }

    func tableView(_ tableView: UITableView, heightForHeaderInSection section: Int) -> CGFloat { 44 }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "visit", for: indexPath) as! VisitCell
        let v = days[indexPath.section].visits[indexPath.row]
        let site = BrowserViewController.shortAddress(URL(string: v.url))
        let when = Self.time.string(from: v.at)
        cell.show(title: v.displayTitle, detail: v.failed ? "\(site), did not open, \(when)" : "\(site), \(when)", failed: v.failed)
        return cell
    }

    func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        if indexPath.section == days.count - 1, indexPath.row >= days[indexPath.section].visits.count - 5 { loadMore() }
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let url = URL(string: days[indexPath.section].visits[indexPath.row].url) else { return }
        endSearch()
        onOpen?(url)
    }

    func tableView(_ tableView: UITableView, contextMenuConfigurationForRowAt indexPath: IndexPath, point: CGPoint) -> UIContextMenuConfiguration? {
        guard let url = URL(string: days[indexPath.section].visits[indexPath.row].url) else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            UIMenu(children: [
                UIAction(title: "Open in New Tab", image: UIImage(systemName: "plus.square.on.square")) { _ in
                    self?.endSearch()
                    self?.onOpenInNewTab?(url)
                },
                UIAction(title: "Copy Link", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.url = url },
            ])
        }
    }
}

final class VisitCell: UITableViewCell {
    private let title = UILabel()
    private let detail = UILabel()

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        backgroundColor = .clear
        let selected = UIView()
        selected.backgroundColor = Look.raised
        selectedBackgroundView = selected

        title.font = .systemFont(ofSize: 15)
        title.textColor = Look.text
        detail.font = .systemFont(ofSize: 12)
        detail.textColor = Look.muted
        let stack = UIStackView(arrangedSubviews: [title, detail])
        stack.axis = .vertical
        stack.spacing = 3
        stack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -20),
            stack.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func show(title: String, detail: String, failed: Bool) {
        self.title.text = title
        self.title.textColor = failed ? Look.muted : Look.text
        self.detail.text = detail
        accessibilityLabel = "\(title), \(detail)"
    }
}
