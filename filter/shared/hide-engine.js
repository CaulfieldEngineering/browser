// Applies the hide rules (hide-rules.js: the bundled floor, plus any signed rules the extension fetched) on every site
// the filter runs on. One generic way of hiding, so a new rule is data, not code. Never on the filter's skip list
// (Claude, Blocks, Tailscale, Joe's own tools). It only ever hides; nothing here shows anything another part hid.
(function () {
  'use strict';
  if (globalThis.__hideEngine || !globalThis.FilterHideRules) return;
  const HR = globalThis.FilterHideRules;
  const host = (location.hostname || '').toLowerCase();
  const W = globalThis.WebFilterRules;
  // The web filter's skip list also names Instagram and Facebook (they have their own module); the hide rules run there.
  if (!host || (W && W.skip && W.skip(host) && !/(^|\.)(instagram\.com|facebook\.com|messenger\.com)$/.test(host))) return;
  const state = (globalThis.__hideEngine = { hidden: 0, rules: HR.merge(HR.bundled, null) });
  let lists = HR.forHost(state.rules, host, location.pathname), listsFor = location.pathname;

  // Never hidden: the page itself, its main area, its navigation, a search field, a dialog, nearly the whole screen.
  const tooBig = (el) => { const r = el.getBoundingClientRect(); return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9; };
  const PROTECT = 'main, [role="main"], nav, [role="navigation"], [data-igt-nav], input, textarea, [role="search"], [role="dialog"]';
  const guarded = (el) => !el || el === document.body || el === document.documentElement || el.matches(PROTECT) || !!el.querySelector(PROTECT) || !!el.closest('[data-igt-nav], nav, [role="navigation"]') || tooBig(el);
  const hide = (el) => {
    if (!el || el.hasAttribute('data-fhr') || guarded(el)) return false;
    el.setAttribute('data-fhr', '');
    if (el.matches('article')) { // a post: one invisible pixel, so a feed still loads what comes after it
      for (const [k, v] of [['height', '1px'], ['min-height', '0'], ['overflow', 'hidden'], ['opacity', '0'], ['margin', '0'], ['padding', '0'], ['border', '0']]) el.style.setProperty(k, v, 'important');
    } else el.style.setProperty('display', 'none', 'important');
    state.hidden++;
    try { const b = globalThis.IGFilterBridge; b && b.stat && b.stat('rule-hidden'); } catch {}
    return true;
  };
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const controls = (el) => el.querySelectorAll('a[href], button, [role="button"]').length;
  // The panel a heading heads: the smallest box that starts with the heading's words and holds two or more links or
  // buttons, never a guarded one.
  function panelOf(el, words) {
    let box = el;
    for (let i = 0; i < 8; i++) {
      const up = box.parentElement;
      if (!up || guarded(up)) return null;
      box = up;
      if (controls(box) < 2) continue;
      return textOf(box).toLowerCase().startsWith(words) ? box : null;
    }
    return null;
  }
  // The elements whose own text holds a word, found by the browser's own text search (cheap on any page).
  const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LOW = UP.toLowerCase();
  const quote = (s) => (!s.includes("'") ? `'${s}'` : !s.includes('"') ? `"${s}"` : null);
  function holding(needle) {
    const q = quote(needle);
    if (!q || !document.body) return [];
    let snap;
    try { snap = document.evaluate(`//body//text()[contains(translate(., '${UP}', '${LOW}'), ${q})]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); } catch { return []; }
    const out = new Set();
    for (let i = 0; i < Math.min(snap.snapshotLength, 500); i++) { const p = snap.snapshotItem(i).parentElement; if (p) out.add(p); }
    return [...out];
  }
  function apply() {
    if (!document.body) return;
    if (listsFor !== location.pathname) { listsFor = location.pathname; lists = HR.forHost(state.rules, host, listsFor); } // pages change without loading
    const L = lists;
    if (L.blockPaths && L.blockPaths.some((p) => location.pathname.startsWith(p))) { location.replace(location.origin + '/'); return; }
    for (const sel of L.selectors || []) { try { for (const el of document.querySelectorAll(sel)) hide(el); } catch {} }
    for (const h of (L.headings || []).map((s) => s.toLowerCase())) {
      for (const el of holding(h)) {
        if (el.hasAttribute('data-fhr') || el.closest('article, [data-fhr]') || textOf(el).toLowerCase() !== h) continue;
        if (!hide(panelOf(el, h))) hide(el);
      }
    }
    const buttons = (L.buttons || []).map((s) => s.toLowerCase());
    if (buttons.length) {
      const isBtn = (el) => el && el.closest('a[href], button, [role="button"]');
      for (const b of buttons) for (const el of holding(b)) { const c = isBtn(el); if (c && textOf(c).toLowerCase() === b) hide(c); }
      for (const el of document.querySelectorAll('[aria-label]')) {
        if (buttons.includes((el.getAttribute('aria-label') || '').toLowerCase().trim())) hide(isBtn(el) || el);
      }
    }
    for (const p of (L.phrases || []).map((s) => s.toLowerCase())) {
      for (const el of holding(p)) { if (!el.closest('[data-fhr]')) hide(el.closest('article, li, [role="listitem"], [role="article"]') || el) || hide(el); }
    }
  }
  let t = 0;
  const soon = () => { if (!t) t = setTimeout(() => { t = 0; apply(); }, 150); };
  // What the selectors name is hidden as it is put in the page, before it is drawn (2026-11-15: a panel drawn and taken
  // out a moment later is a flicker); the words-based rules follow a moment later, as before.
  const now = (ms) => {
    const sels = lists.selectors || [];
    if (sels.length) for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      for (const sel of sels) { try { if (n.matches(sel)) hide(n); for (const el of n.querySelectorAll(sel)) hide(el); } catch {} }
    }
    soon();
  };
  new MutationObserver(now).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  setInterval(apply, 1500);
  // The fetched rules (signed, checked by the extension's service worker), added to the floor.
  const take = (extra) => {
    if (!extra) return;
    state.rules = HR.merge(HR.bundled, extra);
    const t = HR.tuningFor(state.rules.tuning, host, location.pathname);
    globalThis.__igFilterLate = t.judgeLateRetrySeconds * 1000;
    globalThis.__igFilterTune = t; // ig-filter.js reads its calm numbers from here and redraws its style sheet
    try { const f = globalThis.__igFilter; f && f.retune && f.retune(); } catch {}
    lists = HR.forHost(state.rules, host, location.pathname); listsFor = location.pathname; apply();
  };
  try {
    if (globalThis.chrome && chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ wf: 'hideRules' }, (r) => { void chrome.runtime.lastError; take(r && r.rules); });
  } catch {}
  if (globalThis.__hideRulesExtra) take(globalThis.__hideRulesExtra); // tests, and any other device that hands them in
})();
