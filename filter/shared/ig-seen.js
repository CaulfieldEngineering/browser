// Posts already seen, skipped (Joe, 2026-11-10, in the Instagram app: "Could we add a setting in our IG app to note what
// we see and not show me literally the same posts every time I open the app"). On the home feed (the Following feed,
// ig-tidy.js), a post that was on screen for a second or more is noted by its id (the /p/ or /reel/ link), with the
// time. The next time the feed opens (a fresh load: launching, the home tab, pull to refresh), a post noted before that
// load is taken out the same way the filter takes out a hidden post: one invisible pixel, so the feed keeps loading the
// next ones. Posts seen during this visit stay, so scrolling back up still finds them, and so does Back. Everywhere else
// (profiles, a post's own page, messages, Reels) nothing is skipped. Noted on this device only, per account (each
// account has its own storage), at most 6000 posts and 30 days.
// The setting: the app's menu, "Skip posts I've seen" (on unless turned off). The app answers IGFilterBridge.seenOn()
// and sends the events igs-on / igs-off when it is switched; where there is no such bridge (the laptop) it is on.
(function () {
  'use strict';
  const g = globalThis;
  if (g.__igSeen || !/(^|\.)instagram\.com$/i.test(location.hostname)) return;
  const KEY = 'igs.seen.v1', MAX = 6000, DAYS = 30, SEEN_MS = g.__igSeenMs || 1000;
  const state = { on: true, skipped: 0, noted: 0 };
  g.__igSeen = state;
  const BRIDGE = g.IGFilterBridge || {};
  const stat = (n) => { try { BRIDGE.stat && BRIDGE.stat(n); } catch {} };
  const loadedAt = Date.now();

  let seen = new Map(); // id -> time first noted (ms)
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k in o) seen.set(k, +o[k]); } catch {}
  const cutoff = Date.now() - DAYS * 864e5;
  for (const [k, t] of seen) if (!(t > cutoff)) seen.delete(k);
  let saveTimer = 0;
  const save = () => {
    saveTimer = 0;
    while (seen.size > MAX) seen.delete(seen.keys().next().value); // oldest first (insertion order)
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(seen))); } catch {}
  };

  const onFeed = () => location.pathname === '/' && !/[?&]variant=favorites\b/.test(location.search);
  const idOf = (post) => {
    for (const a of post.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]{5,})/);
      if (m) return m[1];
    }
    return null;
  };

  const css = 'html:not([data-igs-off]) article[data-igs-seen]{display:block !important;height:1px !important;min-height:0 !important;max-height:1px !important;margin:0 !important;padding:0 !important;border:0 !important;overflow:hidden !important;opacity:0 !important;pointer-events:none !important}';
  const addStyle = () => {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById('igs-style')) return;
    const s = document.createElement('style'); s.id = 'igs-style'; s.textContent = css; parent.appendChild(s);
  };

  // Taking a post out above the screen must not move what is on screen (WebKit has no scroll anchoring).
  function keepPlace(post, change) {
    if (post.getBoundingClientRect().top >= 0) { change(); return; }
    const anchor = [...document.querySelectorAll('article')].find((a) => a !== post && a.getBoundingClientRect().top >= 0);
    const before = anchor && anchor.getBoundingClientRect().top;
    change();
    if (anchor) { const d = anchor.getBoundingClientRect().top - before; if (Math.abs(d) >= 1) scrollBy(0, d); }
  }
  const nudge = () => { try { dispatchEvent(new Event('scroll')); } catch {} };

  // ---- noting what is on screen ----
  const timers = new WeakMap();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const post = e.target;
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!timers.has(post)) timers.set(post, setTimeout(() => note(post), SEEN_MS));
      } else if (timers.has(post)) { clearTimeout(timers.get(post)); timers.delete(post); }
    }
  }, { threshold: [0, 0.5] });
  function note(post) {
    timers.delete(post);
    if (!onFeed() || post.hasAttribute('data-igs-seen') || post.hasAttribute('data-igf-gone')) return;
    const id = idOf(post);
    if (!id || seen.has(id)) return;
    seen.set(id, Date.now());
    state.noted++;
    post.setAttribute('data-igs-noted', '');
    if (!saveTimer) saveTimer = setTimeout(save, 400);
  }

  // ---- skipping what was seen before this visit ----
  // Nothing is skipped until the app has said whether the setting is on (at most 1.5 s).
  let asked = !BRIDGE.seenOn;
  function look() {
    if (!asked || !onFeed() || !document.body) return;
    addStyle();
    for (const post of document.querySelectorAll('article:not([data-igs-looked])')) {
      const id = idOf(post);
      if (!id) continue; // its link not built yet: looked at again on the next change
      post.setAttribute('data-igs-looked', '');
      const t = seen.get(id);
      if (state.on && t && t < loadedAt) {
        keepPlace(post, () => post.setAttribute('data-igs-seen', ''));
        for (const v of post.querySelectorAll('video')) { try { v.muted = true; v.pause(); } catch {} }
        state.skipped++;
        stat('seen-skipped');
        setTimeout(nudge, 50);
      } else io.observe(post);
    }
    if (document.documentElement) document.documentElement.setAttribute('data-igs-pass', String(state.skipped)); // for the tests
  }
  let timer = 0;
  new MutationObserver(() => { if (!timer) timer = setTimeout(() => { timer = 0; look(); }, 80); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', look, { once: true });
  addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); save(); } });

  // ---- the setting ----
  const set = (on) => {
    state.on = on;
    const root = document.documentElement;
    if (root) { if (on) root.removeAttribute('data-igs-off'); else root.setAttribute('data-igs-off', ''); }
  };
  document.addEventListener('igs-on', () => set(true));
  document.addEventListener('igs-off', () => set(false));
  const answered = (on) => { if (asked) return; asked = true; set(on !== false); look(); };
  try { if (BRIDGE.seenOn) Promise.resolve(BRIDGE.seenOn()).then(answered, () => answered(true)); } catch { answered(true); }
  setTimeout(() => answered(true), 1500);
})();
