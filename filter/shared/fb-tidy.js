// Facebook, tidied (Joe, 2026-11-05: "we can start building a facebook version of our filtered app, too. Let's start by
// hiding the default feed, any ads etc."). On facebook.com and messenger.com, in the Facebook app, the Browser and the
// laptop extension, in the filter's own world. The filter (ig-filter.js with rules.js) hides sponsored and suggested
// posts and suggestive pictures wherever they are; this file does the page itself:
//   - No News Feed: Facebook's home goes to Notifications (useful, and nothing on it is chosen by an algorithm). A tap
//     on Home or the logo goes there too. Back is left alone.
//   - No Stories or Reels rail, no "People you may know", no right-rail ads (sponsored sections of the side column).
//   - No "Open app" / "Get the app" prompts; links to the native app go nowhere.
//   - 2026-11-13, brought up to the Instagram app (Joe: "start building a version of Facebook ... that have similar
//     filtering features"): no Video or Reels tab (/watch, /reels and /reel with no reel named go to Notifications,
//     as Instagram's Reels tab and Explore went; a reel or video someone shared still opens and is judged); a
//     profile, Page or group whose name or intro carries an adult term keeps only its name; and what this file does
//     to the page is said to the app (note-fb-...), which passes it to the mini PC as a "js:" line beside the
//     "load:" lines, with no address, the way ig-tidy.js does.
// Profiles, Messages, Notifications, Groups, Pages, Events, Marketplace listings, search and posting stay.
(function () {
  'use strict';
  if (globalThis.__fbTidy || !/(^|\.)(facebook\.com|messenger\.com)$/i.test(location.hostname)) return;
  globalThis.__fbTidy = { hidden: 0 };
  const CFG = (globalThis.IGFilterConfig && globalThis.IGFilterConfig.facebook) || {};
  const HOME_TO = CFG.homeGoesTo || '/notifications/';
  const note = (what) => { try { const b = globalThis.IGFilterBridge; b && b.stat && b.stat('note-' + what); } catch {} };
  // The feeds Facebook chooses: the News Feed (home) and the Video and Reels tabs. A reel or a video that is named
  // (/reel/<id>, /watch/?v=<id>, /<page>/videos/<id>) is not a feed and is left alone.
  const isNewsFeed = (p) => p === '/' || p === '/home.php' || p === '/index.php';
  const isVideoTab = (u) => /^\/(watch|reels?|video|videos)(\/(feed|latest|live|shows|saved|create))?$/i.test(u.pathname.replace(/\/+$/, '')) && !(u.searchParams.get('v') || u.searchParams.get('video_id'));
  const isHome = (href) => {
    try {
      const u = new URL(href, location.href);
      if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return false;
      return isNewsFeed(u.pathname) || isVideoTab(u);
    } catch { return false; }
  };
  const hide = (el) => { if (el && !el.hasAttribute('data-fbt')) { el.setAttribute('data-fbt', ''); el.style.setProperty('display', 'none', 'important'); globalThis.__fbTidy.hidden++; } };

  // ---- no News Feed ----
  let popAt = 0;
  addEventListener('popstate', () => { popAt = Date.now(); }, true);
  if (isHome(location.href)) { note('fb-home'); location.replace(HOME_TO); }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href') || '';
    if (APPLINK.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (isHome(href)) { e.preventDefault(); e.stopImmediatePropagation(); note('fb-home-tap'); location.assign(HOME_TO); }
  }, true);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (isHome(lastHref) && Date.now() - popAt > 400) { note('fb-home-addr'); location.replace(HOME_TO); }
  }, 100);

  // ---- a profile, Page or group by its name and intro ----
  // Its heading (the h1 in the main area) and the few lines around it are judged like an Instagram account's name and
  // bio (rules.js account()). One that carries an adult term keeps only its name: its pictures, videos and posts go.
  const style = () => {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById('fbt-style')) return;
    const s = document.createElement('style');
    s.id = 'fbt-style';
    s.textContent = 'html[data-fbt-account] [role="main"] img,html[data-fbt-account] [role="main"] video,html[data-fbt-account] [role="main"] [style*="background-image"],html[data-fbt-account] [role="main"] [role="article"],html[data-fbt-account] [role="main"] a[href*="/photo"],html[data-fbt-account] [role="main"] a[href*="/reel/"],html[data-fbt-account] [role="main"] a[href*="/videos/"]{display:none !important}';
    parent.appendChild(s);
  };
  let accountPath = '', accountSeen = '';
  function checkAccount() {
    const root = document.documentElement;
    const R = globalThis.IGFilterRules;
    if (!root || !R || !R.account) return;
    if (accountPath && accountPath !== location.pathname) { accountPath = ''; accountSeen = ''; root.removeAttribute('data-fbt-account'); }
    if (accountPath || /^\/(notifications|messages|marketplace|search|settings|friends|events|bookmarks)(\/|$)/i.test(location.pathname)) return;
    const h1 = document.querySelector('[role="main"] h1');
    if (!h1) return;
    // the name, and the intro beside it: the smallest box around the heading that holds a little more text
    let box = h1;
    for (let i = 0; i < 4 && box.parentElement && !box.parentElement.matches('[role="main"], body'); i++) {
      if ((box.parentElement.textContent || '').length > 500 || box.parentElement.querySelector('[role="article"], [role="feed"]')) break;
      box = box.parentElement;
    }
    const text = (h1.textContent || '').trim() + ' ' + [...box.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => (e.textContent || '').trim()).filter(Boolean).join(' ').slice(0, 500);
    if (text === accountSeen) return;
    accountSeen = text;
    if (!R.account(text)) return;
    accountPath = location.pathname;
    style();
    root.setAttribute('data-fbt-account', '');
    note('fb-account');
    try { const b = globalThis.IGFilterBridge; b && b.stat && b.stat('hidden-fb-account'); } catch {}
  }

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
    // The Video and Reels tabs' own links (the tab bar's and the menu's): gone, like Instagram's Reels tab.
    for (const a of root.querySelectorAll('a[href*="/watch"], a[href*="/reel"], a[href*="/video"]')) {
      if (a.closest('[role="article"]')) continue;
      try { const u = new URL(a.getAttribute('href') || '', location.href); if (/(^|\.)facebook\.com$/i.test(u.hostname) && isVideoTab(u)) hide(a); } catch {}
    }
    checkAccount();
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
