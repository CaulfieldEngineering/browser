// The Instagram filter's core (2026-11-19; Joe: "our instagram filter is absolutlely effed", "its all destroying
// instagram", "did you remove the Follow button?"). The design is docs/instagram-filter-design.md. Four things, used by
// every other part of the filter on instagram.com (ig-tidy.js, ig-filter.js, hide-engine.js):
//
//   IGCore.surface(path, search)   which surface a route is (feed, profile, post, direct, ...), and its policy
//   IGCore.allowed(el, rule, kind) the guard no rule can pass: never a protected control, the page, or too much of it
//   IGCore.blank(el, rule, kind)   the one way to hide: blank in place, the box kept, Instagram's layout untouched
//   IGCore.selftest()              the page reports on itself: a rule that hid too much, or found nothing it should have
//   IGCore.suggestionRows(root)    suggested accounts found by structure (rows of one account and one Follow)
//   IGCore.skeleton()              the page as structure only, for fixtures (no picture, name or word)
//
// Nothing here shows anything: it only refuses, blanks, counts and reports. No class names, no climbing from a word.
(function () {
  'use strict';
  const g = globalThis;
  if (g.IGCore) return;
  const onIG = typeof location !== 'undefined' && /(^|\.)instagram\.com$/i.test(location.hostname || '');

  // ---- surfaces ---------------------------------------------------------------------------------------------------
  // First path segments that are Instagram's own pages, never an account's name.
  const RESERVED = /^(p|reel|reels|explore|direct|stories|accounts|tv|about|legal|developer|developers|privacy|web|challenge|emails|session|create|notifications|your_activity|archive|ads|professional_dashboard|api|graphql|static|press|help|terms|directory|topics|locations|popular|fragment|oauth|qr|n|s|ar|igtv|download|lite|securities|invites|nametag|badges|settings|saved|public|data|rsrc\.php)$/i;
  const USER = /^[A-Za-z0-9._]{1,30}$/;
  const isUser = (seg) => !!seg && USER.test(seg) && !RESERVED.test(seg);
  // What a rule may blank of the viewport on each surface, all rules together (structure rules are refused above it;
  // content rules are reported above it). `rules` are the structure rules that run there.
  const POLICY = {
    feed: { budget: 0.6, rules: ['sugg-row', 'sugg-head', 'sugg-unit'] },
    profile: { budget: 0.85, rules: ['sugg-row', 'sugg-head', 'sugg-button', 'account'] },
    post: { budget: 0.7, rules: ['sugg-row', 'sugg-head'] },
    stories: { budget: 1, rules: [] },
    reels: { budget: 1, rules: [] },
    explore: { budget: 1, rules: ['explore-tile', 'sugg-row', 'sugg-head'] },
    suggestions: { budget: 1, rules: ['sugg-row', 'sugg-head'] },
    people: { budget: 0.3, rules: ['sugg-button'] },
    direct: { budget: 0.3, rules: [] },
    notifications: { budget: 0.4, rules: ['sugg-row', 'sugg-head'] },
    create: { budget: 0, rules: [] },
    account: { budget: 0.3, rules: ['sugg-row', 'sugg-head'] },
    work: { budget: 0.2, rules: ['sugg-row', 'sugg-head', 'sugg-button'] },
    other: { budget: 0.3, rules: ['sugg-row', 'sugg-head'] },
  };
  /** The surface a route is. `work` is asked of the shared work list (rules.js) by the caller; see surfaceNow(). */
  function surface(pathname, search) {
    const p = String(pathname || '/'), seg = p.split('/').filter(Boolean);
    if (!seg.length) return 'feed';
    const a = seg[0].toLowerCase(), b = (seg[1] || '').toLowerCase();
    if (a === 'explore') return b === 'people' ? 'suggestions' : 'explore';
    if (a === 'direct') return 'direct';
    if (a === 'stories') return 'stories';
    if (a === 'reels') return seg[1] ? 'post' : 'reels'; // a reel opened by its link is a post; the tab's feed is not
    if (a === 'p' || a === 'reel' || a === 'tv') return /^(liked_by|likes)$/.test((seg[2] || '').toLowerCase()) ? 'people' : 'post';
    if (a === 'create') return 'create';
    if (a === 'notifications') return 'notifications';
    if (a === 'accounts') return b === 'activity' ? 'notifications' : (b === 'insights' || b === 'professional_dashboard' || b === 'manage_access') ? 'work' : 'account';
    if (a === 'professional_dashboard' || a === 'ads') return 'work';
    if (a === 'your_activity' || a === 'archive' || a === 'settings') return 'account';
    if (isUser(seg[0])) {
      if (b === 'p' || b === 'reel' || b === 'tv') return /^(liked_by|likes)$/.test((seg[3] || '').toLowerCase()) ? 'people' : 'post';
      if (b === 'saved') return 'account';
      if (b === 'followers' || b === 'following' || b === 'mutualonly' || b === 'hashtag_following') return 'people';
      return 'profile';
    }
    return 'other';
  }
  const workOn = () => { try { const R = g.IGFilterRules; return !!(R && R.work && R.work.on(location.href)); } catch { return false; } };
  /** The surface of the page as it is now: his work pages first, then the route. (The creation dialog opens over any
   *  route; it is kept whole by the guard, and the page under it stays the surface it was.) */
  function surfaceNow() {
    if (workOn()) return 'work';
    return surface(location.pathname, location.search);
  }
  /** Is this element in the creation dialog (what he is posting: never held, judged or blanked)? */
  const inCreation = (el) => { const d = creationDialog(); return !!d && !!el && (d === el || d.contains(el)); };
  /** The route shape of a link, names taken out: "/{user}/p/{id}/", "/explore/tags/{x}/", "/direct/t/{id}/". */
  function routeShape(href) {
    let u;
    try { u = new URL(href, 'https://www.instagram.com/'); } catch { return ''; }
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return 'ext:' + u.hostname.split('.').slice(-2).join('.');
    const seg = u.pathname.split('/').filter(Boolean);
    const out = seg.map((s, i) => {
      if (i === 0) return isUser(s) ? '{user}' : s.toLowerCase();
      const prev = seg[i - 1].toLowerCase();
      if (/^(p|reel|reels|tv|t|tags|locations|stories|highlights|audio)$/.test(prev)) return '{id}';
      if (/^(p|reel|tv|reels|tagged|reposts|saved|followers|following|inbox|requests|people|search|new|select|details|style)$/i.test(s)) return s.toLowerCase();
      return '{x}';
    });
    return '/' + out.join('/') + (out.length ? '/' : '') + (u.searchParams.get('variant') ? '?variant=' + u.searchParams.get('variant') : '');
  }
  /** The account a link goes to, or null: "/<user>/" and nothing more. */
  const accountOf = (href) => { const m = String(href || '').match(/^(?:https?:\/\/(?:www\.)?instagram\.com)?\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i); return m && isUser(m[1]) ? m[1].toLowerCase() : null; };
  const isPostHref = (href) => /^(?:https?:\/\/(?:www\.)?instagram\.com)?\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel|tv)\/[^/]+\/?/i.test(String(href || ''));

  // ---- the page's parts, by structure -----------------------------------------------------------------------------
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  // A control's words: its own text, or its ARIA label, or the label of the one icon in it. Never an SVG title's text
  // read as page text.
  function labelOf(el) {
    const own = el.getAttribute && el.getAttribute('aria-label');
    if (own) return own.trim();
    let t = '';
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) t += c.data; else if (c.nodeType === 1 && c.namespaceURI !== 'http://www.w3.org/2000/svg') walk(c); } };
    walk(el);
    t = t.replace(/\s+/g, ' ').trim();
    if (t) return t;
    const icon = el.querySelector && el.querySelector('svg[aria-label], img[alt]');
    return icon ? (icon.getAttribute('aria-label') || icon.getAttribute('alt') || '').trim() : '';
  }
  const CONTROL = 'button, [role="button"], a[href], [role="link"], [role="tab"], [role="menuitem"], input, textarea, select, [contenteditable="true"], [role="textbox"]';
  const TYPING = 'input:not([type="hidden"]), textarea, [contenteditable="true"], [role="textbox"], [role="search"], form';
  // A profile's own controls, by their whole words (the guard and the self-test use them; nothing is ever hidden by them).
  const OWN_CTL = /^(follow|following|follow back|requested|message|edit profile|view archive|share profile|contact|email|call|subscribe|subscribed|add to story|ad tools|view insights|insights|options|user options|settings|unblock|block)$/i;
  const NAV = 'nav, [role="navigation"], [data-igt-nav]';
  const mainOf = () => document.querySelector('main, [role="main"]');
  // (a post has a header of its own: the profile's is the one that is not in a post)
  const profileHeader = () => { const m = mainOf(); if (!m) return null; for (const h of m.querySelectorAll('header')) if (!h.closest('article')) return h; return null; };
  /** The creation dialog (new post, reel or story), on any route: a dialog that takes a file or says it creates. */
  function creationDialog() {
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const label = (d.getAttribute('aria-label') || '').toLowerCase();
      if (/^(create|new) (new )?(post|reel|story)|^(crop|edit|share)$/.test(label) || d.querySelector('input[type="file"]')) return d;
    }
    return null;
  }
  /** A post's own bar of actions (like, comment, share, save), found by its icons' labels. */
  const ACTION_ICON = /^(like|unlike|comment|share|share post|save|remove|more options|more|repost)$/i;
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') { try { if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false; } catch {} }
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  // ---- the guard --------------------------------------------------------------------------------------------------
  // kind: 'structure' (a rule about the page's furniture: suggestions, hide rules, prompts)
  //       'content'   (a post, tile or slide taken for what it shows or says: the picture judges, the caption rules)
  //       'media'     (one picture or video by itself)
  // Returns '' when the element may be blanked, or the reason it may not (one word, for the self-test).
  const viewArea = () => Math.max(1, innerWidth * innerHeight);
  function shareOf(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)), h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return (w * h) / viewArea();
  }
  const PAGE = 'main, [role="main"], [id^="mount"], [id^="react-root"]';
  function refusal(el, rule, kind) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return 'gone';
    if (el === document.body || el === document.documentElement || el.matches(PAGE) || el.querySelector(PAGE)) return 'page';
    // a box that holds a profile's tabs, or a whole list of posts, is a page's worth: never one unit
    if (kind !== 'media' && (el.matches('[role="tablist"]') || el.querySelector('[role="tablist"]') || el.querySelectorAll('article').length > 1)) return 'page';
    const media = kind === 'media' || /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName);
    const s = surfaceNow();
    // the creation dialog: nothing, ever (what he is posting is his own)
    const cd = creationDialog();
    if (cd && (cd === el || cd.contains(el) || el.contains(cd))) return 'create';
    // the navigation: only what ig-tidy takes by its own written exceptions (it does not come through here)
    if (el.matches(NAV) || el.querySelector(NAV)) return 'nav';
    if (!media && el.closest(NAV)) return 'nav';
    // a dialog is never taken, and inside one only a picture by itself
    if (el.matches('[role="dialog"]') || el.querySelector('[role="dialog"]')) return 'dialog';
    if (!media && kind === 'structure' && el.closest('[role="dialog"]')) return 'dialog';
    // somewhere he types: a search field, a comment field, the message composer
    if (!media && (el.matches(TYPING) || el.querySelector(TYPING))) return kind === 'content' && el.matches('article') ? '' : 'typing';
    // a profile's header: its pictures by themselves; the account rule's own parts; the Similar accounts button itself
    const head = s === 'profile' || s === 'work' || s === 'people' ? profileHeader() : null;
    if (head && !media) {
      if (el === head || el.contains(head)) return 'header';
      if (head.contains(el)) {
        if (rule === 'sugg-button') return /^similar accounts$/i.test(labelOf(el)) && el.matches('button, [role="button"]') ? '' : 'header';
        if (rule !== 'account') return 'header';
        for (const c of [el, ...el.querySelectorAll(CONTROL)]) if (c.matches(CONTROL) && OWN_CTL.test(labelOf(c))) return 'control';
        for (let up = el.parentElement; up && up !== head; up = up.parentElement) if (up.matches(CONTROL) && OWN_CTL.test(labelOf(up))) return 'control';
        if (el.querySelector('h1, h2')) return 'name';
      }
    }
    if (kind === 'structure') {
      // furniture rules never touch a post, and never more of the screen than the surface allows
      if (el.matches('article') || el.querySelector('article') || el.closest('article')) return 'post';
      const pol = POLICY[s] || POLICY.other;
      if (rule && pol.rules.length && !pol.rules.includes(rule) && !/^(hide-rule|prompt)/.test(rule)) return 'surface';
      if (!pol.rules.length && !/^(prompt)/.test(rule || '')) return 'surface';
      if (shareOf(el) > Math.min(pol.budget, 0.9)) return 'budget';
    }
    return '';
  }
  const refused = {};
  function allowed(el, rule, kind) {
    const why = refusal(el, rule || '', kind || 'structure');
    if (why && why !== 'gone') { const k = (rule || 'rule') + ':' + why; refused[k] = (refused[k] || 0) + 1; }
    return !why;
  }

  // ---- blanking in place ------------------------------------------------------------------------------------------
  // The element keeps its box. Its content is invisible and takes no tap; a content blank shows one plain shade, a
  // furniture blank shows nothing. Attributes and one style sheet: nothing is put in or taken out of Instagram's tree.
  const STYLE_ID = 'igx-style';
  const css = () => {
    const T = g.__igFilterTune || {}, C = (g.IGFilterConfig && g.IGFilterConfig.calm) || {};
    const shade = typeof T.holdShade === 'number' ? T.holdShade : typeof C.holdShade === 'number' ? C.holdShade : 0.12;
    return [
      '[data-igx]{pointer-events:none !important;-webkit-user-select:none !important;user-select:none !important}',
      '[data-igx],[data-igx] *{visibility:hidden !important}',
      '[data-igx-media] img,[data-igx-media] video,[data-igx-media] canvas,[data-igx-media] [style*="background-image"]{visibility:hidden !important;pointer-events:none !important}',
      // the shade is the box itself, drawn by a parent that stays visible: an outline-free overlay is not needed, the
      // blanked element's own box is painted through its ::before-less background by lifting visibility on itself only
      '[data-igx][data-igx-shade]{visibility:visible !important;color:transparent !important;background-image:none !important;background-color:rgba(128,128,128,' + (shade > 0 ? shade : 0.12) + ') !important;border-color:transparent !important;box-shadow:none !important;text-shadow:none !important;caret-color:transparent !important}',
      'img[data-igx][data-igx-shade],video[data-igx][data-igx-shade],canvas[data-igx][data-igx-shade]{visibility:hidden !important}',
    ].join('');
  };
  function addStyle() {
    const parent = document.head || document.documentElement;
    if (!parent) return;
    let st = document.getElementById(STYLE_ID);
    if (!st) { st = document.createElement('style'); st.id = STYLE_ID; parent.appendChild(st); }
    const text = css();
    if (st.textContent !== text) st.textContent = text;
  }
  const stat = (name) => { try { const b = g.IGFilterBridge; b && b.stat && b.stat(name); } catch {} };
  let lastBlankAt = 0;
  /** Blanks an element in place. Returns true if it is (now or already) blank, false if the guard refused. */
  function blank(el, rule, kind) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('data-igx')) return true;
    kind = kind || 'structure';
    if (!allowed(el, rule, kind)) return false;
    addStyle();
    el.setAttribute('data-igx', rule || 'rule');
    if (kind !== 'structure') el.setAttribute('data-igx-shade', '');
    el.setAttribute('aria-hidden', 'true');
    try { const a = document.activeElement; if (a && a !== document.body && el.contains(a)) a.blur(); } catch {}
    try { el.inert = true; } catch {}
    lastBlankAt = Date.now();
    soonTest();
    return true;
  }
  /** A unit the guard will not give up whole (it holds a field he types in, a dialog): every picture and video in it
   *  is made invisible instead, those put in later too, and its videos are stopped. Never the creation dialog. */
  function blankMedia(el, rule) {
    if (!el || el.nodeType !== 1 || inCreation(el)) return false;
    if (el === document.body || el === document.documentElement || el.matches(PAGE) || el.querySelector(PAGE)) return false;
    addStyle();
    el.setAttribute('data-igx-media', rule || 'rule');
    for (const v of el.querySelectorAll('video')) { try { v.muted = true; v.pause(); } catch {} }
    lastBlankAt = Date.now(); soonTest();
    return true;
  }
  /** Takes a blank off again (a post that was being checked and is clean). Only ever the element's own blank. */
  function unblank(el) {
    if (!el || el.nodeType !== 1 || !(el.hasAttribute('data-igx') || el.hasAttribute('data-igx-media'))) return;
    el.removeAttribute('data-igx'); el.removeAttribute('data-igx-shade'); el.removeAttribute('data-igx-media'); el.removeAttribute('aria-hidden');
    try { el.inert = false; } catch {}
  }

  // ---- suggested accounts, by structure ---------------------------------------------------------------------------
  // A people row holds exactly one account and exactly one control whose whole text is "Follow". That alone is any
  // list of people (search results, likes, "started following you"), so a row is a SUGGESTION only with evidence:
  // its own line says so ("12 mutuals", "Followed by ...", "Suggested for you", "New to Instagram", "Follows you"
  // is not one), or the list it is in sits under a heading that says so. And only in a list: two or more such rows
  // that are siblings (or one each in sibling wrappers), or one row under a heading. Outside any post, header or
  // dialog, and never on a page that is a list of people (followers, following, likes). One row alone with no
  // heading is never taken: a profile's own Follow and a post author's Follow cannot make a list.
  const SUGG_LINE = /^(\d[\d.,]*\s?[km]?\s+mutuals?|followed by \S.{0,80}|suggested for you|new to instagram|popular|from your contacts|instagram recommended)$/i;
  const SUGG_HEADING = /^(suggested for you|suggestions for you|suggested accounts|suggested|discover people|people you may know|accounts you may like|more accounts to follow)$/i;
  const leafTexts = (el, max) => { const out = []; const w = document.createTreeWalker(el, 4); let n; while ((n = w.nextNode()) && out.length < (max || 40)) { const p = n.parentElement; if (p && p.closest('svg')) continue; const t = n.data.replace(/\s+/g, ' ').trim(); if (t) out.push([t, p]); } return out; };
  // A line may be split over nodes ("12" " mutuals"): each leaf, and each small box's whole text, is tried.
  function hasSuggLine(row) {
    for (const [t, p] of leafTexts(row, 30)) { if (SUGG_LINE.test(t)) return true; const pt = textOf(p); if (pt.length <= 100 && SUGG_LINE.test(pt)) return true; const gp = p.parentElement; if (gp && row.contains(gp) && gp !== row) { const gt = textOf(gp); if (gt.length <= 100 && SUGG_LINE.test(gt)) return true; } }
    return false;
  }
  /** The suggestions heading of a list: a leaf saying so just before the list, in it or up to three boxes above. */
  function headingOf(list) {
    let box = list;
    for (let i = 0; i < 4 && box && box !== document.body && !box.matches('main, [role="main"]'); i++) {
      for (let sib = box.previousElementSibling, k = 0; sib && k < 2; sib = sib.previousElementSibling, k++) {
        if (sib.matches('article') || sib.querySelector('article')) break;
        for (const [t, p] of leafTexts(sib, 12)) if (SUGG_HEADING.test(t)) { let h = p; while (h.parentElement && h.parentElement !== sib && textOf(h.parentElement) === t) h = h.parentElement; return h; }
      }
      const first = box.firstElementChild;
      if (i === 0 && first) for (const [t, p] of leafTexts(first, 6)) if (SUGG_HEADING.test(t) && !accountsIn(first).size) return p;
      box = box.parentElement;
    }
    return null;
  }
  const FOLLOW_SEL = 'button, [role="button"], a, div, span';
  const isFollowLeaf = (el) => !el.firstElementChild && el.textContent.trim() === 'Follow';
  function followLeaves(root) {
    const out = [];
    let snap;
    try { snap = document.evaluate('.//text()[normalize-space(.)="Follow"]', root, null, 7, null); } catch { return out; }
    for (let i = 0; i < Math.min(snap.snapshotLength, 600); i++) {
      const p = snap.snapshotItem(i).parentElement;
      if (p && isFollowLeaf(p) && !p.closest('svg, article, header, [role="dialog"], ' + NAV)) out.push(p);
    }
    return out;
  }
  const accountsIn = (el) => { const s = new Set(); for (const a of el.querySelectorAll('a[href]')) { const who = accountOf(a.getAttribute('href')); if (who) s.add(who); } return s; };
  const followCount = (el) => { let n = 0; for (const x of el.querySelectorAll(FOLLOW_SEL)) if (isFollowLeaf(x)) n++; return n; };
  // The accounts a box names: links to an account that carry words (a name). A link that is only a small face (the
  // mutual followers' pictures) or sits in the "Followed by ..." line names no row of its own.
  function namedAccounts(el) {
    const out = new Set();
    for (const a of el.querySelectorAll('a[href]')) {
      const who = accountOf(a.getAttribute('href'));
      if (!who || !textOf(a)) continue;
      let inLine = false;
      for (let p = a.parentElement, i = 0; p && p !== el && i < 4; p = p.parentElement, i++) { const pt = textOf(p); if (pt.length > 120) break; if (/^followed by /i.test(pt)) { inLine = true; break; } }
      if (inLine) continue;
      out.add(who);
    }
    return out;
  }
  /** The row of one Follow leaf: the largest box around it that holds that one Follow and names at most one account,
   *  short enough to be a row. So it stops below the box where a second row, or anyone else's line, begins. */
  function rowOf(leaf) {
    let row = leaf;
    for (let i = 0; i < 16; i++) {
      const up = row.parentElement;
      if (!up || up === document.body || up.matches('main, [role="main"], article, header, [role="dialog"], ' + NAV)) break;
      if (followCount(up) !== 1 || namedAccounts(up).size > 1 || textOf(up).length > 260 || up.querySelector('input, textarea, video, article, [role="tablist"]')) break;
      row = up;
    }
    return row !== leaf && accountsIn(row).size >= 1 ? row : null;
  }
  /** Every suggested-account row under root, as [{ row, list, heading }]. See the evidence rule above. */
  function suggestionRows(root) {
    root = root || document.body;
    if (!root || surfaceNow() === 'people' || surfaceNow() === 'create') return []; // (a list of people is not suggestions; /create/ is his own page)
    const rows = [];
    for (const leaf of followLeaves(root)) { const row = rowOf(leaf); if (row && !rows.includes(row)) rows.push(row); }
    // group by list: rows that are siblings, or whose parents (grandparents) are siblings holding one row each
    const groups = new Map();
    for (const row of rows) {
      let key = row.parentElement;
      for (let i = 0; i < 2 && key && key.parentElement && key.children.length === 1; i++) key = key.parentElement;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    // A heading among the rows themselves (a list of what happened, then "Suggested for you", then the suggestions):
    // the nearest sibling before a row that is neither a people row nor anything but a heading.
    const headingBefore = (row, list, all) => {
      let child = row;
      while (child.parentElement && child.parentElement !== list) child = child.parentElement;
      for (let sib = child.previousElementSibling, k = 0; sib && k < 40; sib = sib.previousElementSibling, k++) {
        if (all.some((r) => sib === r || sib.contains(r))) continue; // another people row
        if (accountsIn(sib).size || sib.matches('article') || sib.querySelector('article')) return null;
        for (const [t, el] of leafTexts(sib, 6)) if (SUGG_HEADING.test(t)) return el;
        if (textOf(sib)) return null;
      }
      return null;
    };
    const out = [];
    for (const [list, rs] of groups) {
      const above = headingOf(list);
      const found = rs.map((row) => ({ row, list, heading: above || headingBefore(row, list, rs), line: hasSuggLine(row) }));
      const lines = found.filter((f) => f.line).length;
      for (const f of found) if (f.heading || (f.line && lines >= 2)) out.push({ row: f.row, list, heading: f.heading });
    }
    // A suggestions heading over accounts with no Follow in sight (a strip of faces, accounts already asked): the heading
    // is the evidence, and what goes is each box beside or under it that links an account. Found from the heading's own
    // words as the whole text of a leaf, never an SVG title, never in a post, a header, a dialog or the navigation.
    let snap = null;
    try { snap = document.evaluate('.//text()[contains(., "uggest") or contains(., "iscover people") or contains(., "ay know") or contains(., "ay like") or contains(., "ccounts to follow")]', root, null, 7, null); } catch {}
    for (let i = 0; snap && i < Math.min(snap.snapshotLength, 60); i++) {
      const leaf = snap.snapshotItem(i).parentElement;
      if (!leaf || leaf.closest('svg, article, header, [role="dialog"], ' + NAV) || !SUGG_HEADING.test(textOf(leaf))) continue;
      if (out.some((o) => o.heading === leaf)) continue;
      let head = leaf;
      while (head.parentElement && textOf(head.parentElement) === textOf(leaf) && !head.parentElement.matches('main, [role="main"], body')) head = head.parentElement;
      const box = head.parentElement;
      if (!box || box.matches('main, [role="main"], body') || box.querySelector('article, input, textarea, [role="tablist"]')) continue;
      const kids = [...box.children].filter((k) => k !== head && !k.contains(head) && accountsIn(k).size + (accountOf(k.getAttribute && k.getAttribute('href')) ? 1 : 0) >= 1 && !followCount(k));
      const accounts = new Set(); for (const k of kids) { for (const w of accountsIn(k)) accounts.add(w); const own = accountOf(k.getAttribute('href')); if (own) accounts.add(own); }
      if (accounts.size < 2 || textOf(box).length > 600) continue;
      // (where the heading and the accounts are all the box holds, the box is the panel: it goes as one)
      const whole = [...box.children].every((c) => c === head || c.contains(head) || kids.includes(c) || !textOf(c));
      if (whole && !out.some((o) => box.contains(o.row))) { out.push({ row: box, list: box.parentElement, heading: null }); continue; }
      for (const k of kids) if (!out.some((o) => o.row === k || o.row.contains(k) || k.contains(o.row))) out.push({ row: k, list: box, heading: leaf });
    }
    return out;
  }

  // ---- the self-test ----------------------------------------------------------------------------------------------
  // What the filter itself collapsed (display:none) outside the written exceptions.
  // (ig-tidy's own marks, data-igt, are the written exceptions: the Reels slot, the Explore page, the app prompts.)
  const OURS = '[data-fhr], [data-igf-gone], [data-igf-bio], [data-igf-cell-gone], [data-igx]';
  const COLLAPSE_OK = (el) => el.hasAttribute('data-igt-reels') || el.hasAttribute('data-igt-ok') || !!el.closest(NAV) || (el.tagName === 'A' && /^\/explore\/people/.test(el.getAttribute('href') || ''));
  const tiles = () => [...document.querySelectorAll('main a[href]')].filter((a) => isPostHref(a.getAttribute('href')) && !a.closest('article'));
  let reported = '', lastTest = 0, testTimer = 0;
  function selftest() {
    if (!onIG || !document.body) return null;
    lastTest = Date.now();
    const s = surfaceNow(), pol = POLICY[s] || POLICY.other;
    const res = { surface: s, at: lastTest, width: innerWidth, rules: {}, refused: { ...refused }, fails: [] };
    const fail = (check, rule, n) => res.fails.push(check + (rule ? ':' + rule : '') + (n !== undefined ? ':' + n : ''));
    // per rule: how many, and how much of the screen
    let total = 0;
    for (const el of document.querySelectorAll('[data-igx]')) {
      if (el.parentElement && el.parentElement.closest('[data-igx]')) continue;
      const rule = el.getAttribute('data-igx'), sh = shareOf(el);
      const r = res.rules[rule] || (res.rules[rule] = { n: 0, share: 0 });
      r.n++; r.share = Math.round((r.share + sh) * 1000) / 1000; total += sh;
    }
    res.share = Math.round(total * 1000) / 1000;
    // (a suggested row carries its own evidence and is held to the budget row by row, by the guard: a page of nothing
    // but suggestions is rightly all blank. The data-made rules are held to it all together.)
    for (const [rule, r] of Object.entries(res.rules)) if (/^(hide-rule|prompt)/.test(rule) && r.share > pol.budget) fail('too-much', rule, Math.round(r.share * 100));
    // nothing of ours collapsed
    let collapsed = 0;
    if (s !== 'explore') for (const el of document.querySelectorAll(OURS)) { if (COLLAPSE_OK(el)) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || (el.matches('article') && el.getBoundingClientRect().height <= 2)) collapsed++; }
    if (collapsed) fail('collapsed', '', collapsed);
    // the controls
    const hiddenCtl = (el) => !isVisible(el) || !!el.closest('[data-igx], [data-igt], [data-fhr], [data-igf-gone]');
    const head = s === 'profile' || s === 'work' || s === 'people' ? profileHeader() : null;
    if (head) {
      const ctls = [...head.querySelectorAll('button, [role="button"], a[role="link"], a[href]')].filter((c) => OWN_CTL.test(labelOf(c)));
      res.controls = ctls.length;
      const lost = ctls.filter(hiddenCtl).length;
      if (lost) fail('control-hidden', 'profile', lost);
    }
    for (const t of document.querySelectorAll(TYPING)) { if (t.closest('[data-igx], [data-igt], [data-fhr]') && !t.closest('article[data-igx]')) { fail('typing-hidden'); break; } }
    const cd = creationDialog();
    if (cd && (cd.closest(OURS) || cd.querySelector('[data-igx], [data-igt], [data-fhr], [data-igf-gone], [data-igf-hold]'))) fail('create-touched');
    const nav = document.querySelector(NAV);
    if (nav && s !== 'stories') { const links = [...nav.querySelectorAll('a[href]')].filter(isVisible).length; res.nav = links; if (links < 3) fail('nav', '', links); }
    // matched nothing: the anchor is on the page and still shown
    const suggLeft = suggestionRows(document.body).filter((x) => isVisible(x.row) && !x.row.closest('[data-igx], [data-igt], [data-fhr]')).length;
    if (suggLeft) fail('sugg-visible', '', suggLeft);
    if (s === 'explore') { const left = tiles().filter(isVisible).length; if (left) fail('explore-visible', '', left); }
    if (s === 'suggestions') fail('suggestions-page');
    if (s === 'feed' && !/(^|[?&])variant=(following|favorites)(&|$)/.test(location.search)) fail('feed-variant');
    const reels = nav && [...nav.querySelectorAll('a[href="/reels/"], a[href^="/reels/?"]')].filter(isVisible).length;
    if (reels) fail('reels-tab');
    // the grid: no tile on top of another, every row as Instagram made it
    if (s === 'profile' || s === 'post') {
      const rs = tiles().filter(isVisible).map((t) => t.getBoundingClientRect()).filter((r) => r.bottom > -2000 && r.top < innerHeight + 2000).sort((a, b) => a.top - b.top || a.left - b.left);
      let over = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length && rs[j].top < rs[i].bottom - 2; j++) {
        if (Math.min(rs[i].right, rs[j].right) - Math.max(rs[i].left, rs[j].left) > 2 && Math.min(rs[i].bottom, rs[j].bottom) - Math.max(rs[i].top, rs[j].top) > 2) over++;
      }
      res.tiles = rs.length;
      if (over) fail('grid-overlap', '', over);
    }
    for (const [k, n] of Object.entries(refused)) if (/:(header|control|name|nav|create|typing|page)$/.test(k)) fail('refused', k, n);
    try { document.documentElement.setAttribute('data-igx-selftest', JSON.stringify(res)); } catch {}
    // to the device's filter log: each failure once per page and kind (numbers and rule names only)
    const key = location.pathname + '|' + res.fails.map((f) => f.replace(/:\d+$/, '')).join(',');
    if (res.fails.length && key !== reported) { reported = key; for (const f of res.fails.slice(0, 8)) stat('selftest:' + s + ':' + f.replace(/:\d+$/, '')); }
    if (!res.fails.length) reported = '';
    return res;
  }
  function soonTest() { if (!testTimer) testTimer = setTimeout(() => { testTimer = 0; try { selftest(); } catch {} }, 2000); }

  // ---- the page as structure only (for fixtures) ------------------------------------------------------------------
  const KEEP_WORDS = /^(follow|following|follow back|requested|message|edit profile|view archive|suggested for you|suggestions for you|suggested|see all|similar accounts|discover people|people you may know|posts|followers|following|more|search|home|explore|reels|messages|notifications|create|profile|like|comment|share|save|send|reply|log in|sign up|not now|\d[\d.,]*\s?[km]?\s+mutuals?|new to instagram|sponsored|more posts from|add a comment…?|message…?)$/i;
  const LAYOUT = ['display', 'position', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self', 'justify-content', 'grid-template-columns', 'grid-column', 'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'margin', 'padding', 'top', 'left', 'right', 'bottom', 'overflow', 'box-sizing', 'aspect-ratio', 'object-fit', 'transform', 'z-index', 'float', 'vertical-align', 'white-space', 'font-size', 'line-height', 'border-width', 'border-style', 'visibility', 'pointer-events', 'contain', 'inset'];
  const DEFAULTS = { 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'align-items': 'normal', 'align-self': 'auto', 'justify-content': 'normal', 'grid-template-columns': 'none', 'grid-column': 'auto', gap: 'normal', 'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none', margin: '0px', padding: '0px', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', overflow: 'visible', 'aspect-ratio': 'auto', 'object-fit': 'fill', transform: 'none', 'z-index': 'auto', float: 'none', 'vertical-align': 'baseline', 'white-space': 'normal', 'border-width': '0px', 'border-style': 'none', visibility: 'visible', 'pointer-events': 'auto', contain: 'none', inset: 'auto', position: 'static' };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  /** The page (or one element) as HTML that lays out the same and says nothing: for a test fixture. */
  function skeleton(root, opts) {
    root = root || document.body;
    opts = opts || {};
    const names = new Map();
    const alias = (who) => { if (!names.has(who)) names.set(who, 'user' + (names.size + 1)); return names.get(who); };
    const anon = (href) => {
      let u; try { u = new URL(href, location.href); } catch { return '#'; }
      if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return 'https://example.com/';
      const seg = u.pathname.split('/').filter(Boolean);
      const out = seg.map((s, i) => (i === 0 && isUser(s) ? alias(s.toLowerCase()) : i > 0 && /^(p|reel|tv|t|tags|locations|stories|highlights)$/i.test(seg[i - 1]) ? 'ID' + (Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000) : s));
      const v = u.searchParams.get('variant');
      return '/' + out.join('/') + (out.length ? '/' : '') + (v ? '?variant=' + v : '');
    };
    let count = 0;
    const pic = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    function walk(el, depth) {
      if (count++ > (opts.max || 6000)) return '';
      const tag = el.tagName.toLowerCase();
      if (/^(script|style|link|meta|noscript|template|iframe)$/.test(tag)) return '';
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return '';
      const svg = el.namespaceURI === 'http://www.w3.org/2000/svg';
      const st = [];
      for (const p of LAYOUT) { const v = cs.getPropertyValue(p); if (!v || DEFAULTS[p] === v) continue; if ((p === 'width' || p === 'height') && cs.display === 'inline') continue; st.push(p + ':' + v); }
      const at = [];
      for (const n of ['role', 'aria-label', 'aria-selected', 'aria-hidden', 'aria-modal', 'type', 'tabindex', 'dir', 'placeholder', 'contenteditable', 'data-igt-nav']) if (el.hasAttribute(n)) { let v = el.getAttribute(n); if ((n === 'aria-label' || n === 'placeholder') && !KEEP_WORDS.test(v.trim()) && !OWN_CTL.test(v.trim())) v = /profile picture/i.test(v) ? 'profile picture' : 'n'.repeat(Math.min(v.length, 20)); at.push(n + '="' + esc(v) + '"'); }
      if (el.hasAttribute('href')) at.push('href="' + esc(anon(el.getAttribute('href'))) + '"');
      if (svg) { const r = el.getBoundingClientRect(); return '<svg ' + at.join(' ') + ' width="' + Math.round(r.width) + '" height="' + Math.round(r.height) + '" style="' + esc(st.join(';')) + '"></svg>'; }
      if (tag === 'img') return '<img ' + at.join(' ') + ' alt="' + (/profile picture/i.test(el.alt || '') ? 'profile picture' : '') + '" src="' + (opts.src ? opts.src(el, count) : pic) + '" style="' + esc(st.join(';')) + '">';
      if (tag === 'video') return '<video ' + at.join(' ') + ' muted playsinline style="' + esc(st.join(';')) + '"></video>';
      if (tag === 'input' || tag === 'textarea') return '<' + tag + ' ' + at.join(' ') + ' style="' + esc(st.join(';')) + '">' + (tag === 'textarea' ? '</textarea>' : '');
      let inner = '';
      for (const c of el.childNodes) {
        if (c.nodeType === 1) inner += walk(c, depth + 1);
        else if (c.nodeType === 3) { const t = c.data.replace(/\s+/g, ' '); if (t.trim()) inner += KEEP_WORDS.test(t.trim()) || OWN_CTL.test(t.trim()) ? esc(t) : esc(t.replace(/[^\s]/g, 'n')); }
      }
      const bg = /cdninstagram|fbcdn/.test(el.style && el.style.backgroundImage || '') ? ';background-image:url(' + (opts.src ? opts.src(el, count) : pic) + ')' : '';
      const out = /^(html|body)$/.test(tag) ? 'div' : tag;
      return '<' + out + (at.length ? ' ' + at.join(' ') : '') + ' style="' + esc(st.join(';') + bg) + '">' + inner + '</' + out + '>';
    }
    const html = walk(root, 0);
    return '<!-- instagram skeleton: ' + surfaceNow() + ' ' + routeShape(location.href) + ' ' + innerWidth + 'x' + innerHeight + ' ' + new Date().toISOString().slice(0, 10) + ' -->\n' + html;
  }

  g.IGCore = { surface, surfaceNow, inCreation, POLICY, routeShape, accountOf, isPostHref, isUser, labelOf, OWN_CTL, profileHeader, creationDialog, isVisible, allowed, refusal, blank, blankMedia, unblank, suggestionRows, selftest, skeleton, shareOf, _refused: refused };

  if (!onIG || typeof document === 'undefined') return;
  addStyle();
  document.addEventListener('DOMContentLoaded', addStyle, { once: true });
  // The self-test: two seconds after a route settles and after a blank, and every 30 s while the page is in front.
  let href = location.href;
  setInterval(() => {
    if (location.href !== href) { href = location.href; reported = ''; for (const k of Object.keys(refused)) delete refused[k]; soonTest(); }
    else if (Date.now() - lastTest > 30000 && document.visibilityState !== 'hidden') soonTest();
    if (!document.getElementById(STYLE_ID)) addStyle();
  }, 1000);
  soonTest();
})();
