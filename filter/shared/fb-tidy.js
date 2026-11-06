// Facebook, tidied (Joe, 2026-11-05: "we can start building a facebook version of our filtered app, too. Let's start by
// hiding the default feed, any ads etc."). On facebook.com and messenger.com, in the Facebook app, the Browser and the
// laptop extension, in the filter's own world. The filter (ig-filter.js with rules.js) hides sponsored and suggested
// posts and suggestive pictures wherever they are; this file does the page itself:
//   - No News Feed: Facebook's home goes to Notifications (useful, and nothing on it is chosen by an algorithm). A tap
//     on Home or the logo goes there too. Back is left alone.
//   - No Stories or Reels rail, no "People you may know", no right-rail ads (sponsored sections of the side column).
//   - No "Open app" / "Get the app" prompts; links to the native app go nowhere.
// Profiles, Messages, Notifications, Groups, Pages, Events, Marketplace listings, search and posting stay.
(function () {
  'use strict';
  if (globalThis.__fbTidy || !/(^|\.)(facebook\.com|messenger\.com)$/i.test(location.hostname)) return;
  globalThis.__fbTidy = { hidden: 0 };
  const CFG = (globalThis.IGFilterConfig && globalThis.IGFilterConfig.facebook) || {};
  const HOME_TO = CFG.homeGoesTo || '/notifications/';
  const isHome = (href) => {
    try {
      const u = new URL(href, location.href);
      if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return false;
      return u.pathname === '/' || u.pathname === '/home.php' || u.pathname === '/index.php';
    } catch { return false; }
  };
  const hide = (el) => { if (el && !el.hasAttribute('data-fbt')) { el.setAttribute('data-fbt', ''); el.style.setProperty('display', 'none', 'important'); globalThis.__fbTidy.hidden++; } };

  // ---- no News Feed ----
  let popAt = 0;
  addEventListener('popstate', () => { popAt = Date.now(); }, true);
  if (isHome(location.href)) location.replace(HOME_TO);
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href') || '';
    if (APPLINK.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (isHome(href)) { e.preventDefault(); e.stopImmediatePropagation(); location.assign(HOME_TO); }
  }, true);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (isHome(lastHref) && Date.now() - popAt > 400) location.replace(HOME_TO);
  }, 100);

  // ---- rails, suggestions, right-rail ads, app prompts ----
  const RAIL = /^(stories|reels|reels and short videos|people you may know|suggested for you|suggested groups|suggested pages|create story)$/i;
  const APPLINK = /^(fb|fb-messenger|fbauth2|itms-apps?|itms-appss?):|apps\.apple\.com|itunes\.apple\.com|\.app\.link\/|onelink\.me/i;
  const PROMPT = /^(open (the )?(facebook )?app|open in app|get the app|use the app|install( the)? app|continue in (the )?app|download facebook|switch to the app)\.?$/i;
  const RULES = globalThis.IGFilterRules && globalThis.IGFilterRules.facebook;
  function tidy() {
    const root = document.body;
    if (!root) return;
    // Rails by their label: a region or list named Stories / Reels / People you may know.
    for (const el of root.querySelectorAll('[aria-label]')) {
      if (RAIL.test((el.getAttribute('aria-label') || '').trim()) && !el.querySelector('input, textarea, [role="search"]')) hide(el);
    }
    // A section whose heading is one of those (the heading and its list).
    for (const h of root.querySelectorAll('h2, h3, h4, span[dir="auto"]')) {
      if (h.children.length > 1 || !RAIL.test((h.textContent || '').trim())) continue;
      let box = h;
      for (let i = 0; i < 6 && box.parentElement && box.parentElement !== root; i++) {
        const up = box.parentElement;
        if (up.querySelector('input, textarea, [role="search"], [role="main"] [role="feed"]') || up.matches('[role="main"], [role="navigation"], [role="banner"]')) break;
        box = up;
        if (up.querySelectorAll('a[href]').length >= 2) break;
      }
      hide(box);
    }
    // The side column: any part of it that is sponsored, by the same test the filter uses for posts.
    for (const side of root.querySelectorAll('[role="complementary"]')) {
      for (const part of side.children.length === 1 ? side.firstElementChild.children : side.children) {
        if (RULES && RULES.sponsored(part)) hide(part);
        else if (/^\s*Sponsored\b/.test(part.innerText || '')) hide(part);
      }
    }
    // The home page's feed, should the address change slip past the redirect for a moment.
    if (isHome(location.href)) for (const f of root.querySelectorAll('[role="feed"]')) hide(f);
    // Prompts to open or get the app.
    for (const a of root.querySelectorAll('a[href]')) if (APPLINK.test(a.getAttribute('href') || '')) hide(a);
    for (const b of root.querySelectorAll('a, button, [role="button"]')) {
      const t = (b.textContent || '').trim();
      if (t.length < 40 && PROMPT.test(t)) hide(b.closest('[role="dialog"]') || b); // never the top bar (role=banner) itself
    }
  }
  let t = 0;
  new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; tidy(); }, 120); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', tidy, { once: true });
  setInterval(tidy, 1000);
})();
