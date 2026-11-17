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
//   - 2026-11-14, no Reels at all (Joe: "No Reels please."): a reel is not opened even when it is named or shared
//     (/reel/<id>, /reels/, /watch with or without a video, /share/r/, a profile's or a search's Reels tab, a
//     reels.facebook.com address); a tap on one does nothing, an address that lands on one goes to Notifications, and
//     a post, notification, card or shelf that is a reel is taken off the page. A video that is not a reel
//     (/<page>/videos/<id>) is left as it was. Bringing Reels back is loosening (locked memory, entry 1).
// Profiles, Messages, Notifications, Groups, Pages, Events, Marketplace listings, search and posting stay.
// Started by the filter config gate where there is one (the laptop: FilterGate runs it once the signed config is read),
// at once everywhere else. FilterFeature(name) says whether a feature is on for this page; with no gate, always.
(function (run) { const G = globalThis.FilterGate; if (G && G.when) G.when(run); else run(); })(function () {
  const F = (name, href) => { const f = globalThis.FilterFeature; return typeof f !== "function" || f(name, href); };
  'use strict';
  if (globalThis.__fbTidy || !/(^|\.)(facebook\.com|messenger\.com)$/i.test(location.hostname)) return;
  globalThis.__fbTidy = { hidden: 0 };
  const CFG = (globalThis.IGFilterConfig && globalThis.IGFilterConfig.facebook) || {};
  const HOME_TO = CFG.homeGoesTo || '/notifications/';
  const note = (what) => { try { const b = globalThis.IGFilterBridge; b && b.stat && b.stat('note-' + what); } catch {} };
  // Work surfaces first (filter-config.js "work"; Joe, 2026-11-16: "Yeah we need to make sure that our filters do not
  // interfere with work"): Ads Manager, Business Suite, Events Manager, Commerce, billing, his Page's own views. This file
  // does nothing to such a page and never sends one elsewhere (Ads Manager's own "/" used to go to Notifications); its
  // pictures are still judged by the filter. Reels links stay closed everywhere.
  const WORK = globalThis.IGFilterRules && globalThis.IGFilterRules.work;
  const onWork = (href) => !!(WORK && WORK.on(href || location.href));
  // The feeds Facebook chooses: the News Feed (home) and the Video and Reels tabs. A reel or a video that is named
  // (/reel/<id>, /watch/?v=<id>, /<page>/videos/<id>) is not a feed and is left alone.
  const isNewsFeed = (p) => p === '/' || p === '/home.php' || p === '/index.php';
  const isVideoTab = (u) => /^\/(watch|reels?|video|videos)(\/(feed|latest|live|shows|saved|create))?$/i.test(u.pathname.replace(/\/+$/, '')) && !(u.searchParams.get('v') || u.searchParams.get('video_id'));
  // A reel, named or not (2026-11-14, "No Reels please."): /reel, /reels and /watch anywhere in the address
  // (a profile's /<name>/reels/, search's /search/reels/), a reel's share link /share/r/, reels.facebook.com.
  const isReel = (u) => /(^|\.)facebook\.com$/i.test(u.hostname) && (/^reels?\./i.test(u.hostname)
    || /^\/share\/r(\/|$)/i.test(u.pathname) || /^\/watch(\/|$)/i.test(u.pathname)
    || u.pathname.split('/').some((p) => /^reels?$/i.test(p)));
  const reelHref = (href) => { if (!F('fb.noReels')) return false; try { return isReel(new URL(href, location.href)); } catch { return false; } };
  const isHome = (href) => {
    try {
      const u = new URL(href, location.href);
      if (!/(^|\.)facebook\.com$/i.test(u.hostname) || onWork(u.href)) return false;
      return (F('fb.noFeed') && isNewsFeed(u.pathname)) || (F('fb.videoTab') && isVideoTab(u)) || (F('fb.noReels') && isReel(u));
    } catch { return false; }
  };
  // Never hide the page itself (2026-11-14, Joe on the Friends tab: "whatever that second button from the left in the
  // header is has locked up the app"): m.facebook.com marks few regions, so a rail's heading could climb to a box
  // holding the whole page, top bar and tabs included, and leave it blank. A box that holds the top bar, the tabs or a
  // link to Notifications, or that is most of the screen tall, is never hidden as a rail.
  const isPage = (el) => !el || el === document.body || el === document.documentElement
    || !!el.querySelector('[role="banner"], [role="tablist"], [role="navigation"], [role="main"], a[href*="/notifications"], a[href*="/friends"], a[href*="/marketplace"]')
    || (el.getBoundingClientRect().height > innerHeight * 0.6);
  const hide = (el) => { if (el && !el.hasAttribute('data-fbt')) { el.setAttribute('data-fbt', ''); el.style.setProperty('display', 'none', 'important'); globalThis.__fbTidy.hidden++; } };

  // ---- no News Feed ----
  let popAt = 0;
  addEventListener('popstate', () => { popAt = Date.now(); }, true);
  if (onWork()) { /* a work surface: left as it is */ }
  else if (reelHref(location.href)) { note('fb-reel'); location.replace(HOME_TO); }
  else if (isHome(location.href)) { note('fb-home'); location.replace(HOME_TO); }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href') || '';
    if (F('fb.appPrompts') && APPLINK.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (reelHref(href)) { e.preventDefault(); e.stopImmediatePropagation(); note('fb-reel-tap'); return; }
    if (isHome(href)) { e.preventDefault(); e.stopImmediatePropagation(); note('fb-home-tap'); location.assign(HOME_TO); }
  }, true);
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (onWork(lastHref)) return;
    if (reelHref(lastHref)) { note('fb-reel-addr'); location.replace(HOME_TO); }
    else if (isHome(lastHref) && Date.now() - popAt > 400) { note('fb-home-addr'); location.replace(HOME_TO); }
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
    if (!root || !R || !R.account || !F('fb.adultProfiles')) return;
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
  const RAIL = /^(stories|reels|reels and short videos|short videos|people you may know|suggested for you|suggested groups|suggested pages|create story)$/i;
  // Which feature of the config each rail answers to: Stories (fb.storiesRail), Reels (fb.noReels), suggestions (fb.suggested).
  const railOn = (t) => { t = (t || '').trim(); if (!RAIL.test(t)) return false; return /stor/i.test(t) ? F('fb.storiesRail') : /reel|short/i.test(t) ? F('fb.noReels') : F('fb.suggested'); };
  const APPLINK = /^(fb|fb-messenger|fbauth2|itms-apps?|itms-appss?):|apps\.apple\.com|itunes\.apple\.com|\.app\.link\/|onelink\.me/i;
  const PROMPT = /^(open (the )?(facebook )?app|open in app|get the app|use the app|install( the)? app|continue in (the )?app|download facebook|switch to the app)\.?$/i;
  const RULES = globalThis.IGFilterRules && globalThis.IGFilterRules.facebook;
  function tidy() {
    const root = document.body;
    if (!root || onWork()) return;
    // Rails by their label: a region or list named Stories / Reels / People you may know.
    for (const el of root.querySelectorAll('[aria-label]')) {
      if (railOn(el.getAttribute('aria-label')) && !el.querySelector('input, textarea, [role="search"]') && !isPage(el)) hide(el);
    }
    // A section whose heading is one of those (the heading and its list).
    for (const h of root.querySelectorAll('h2, h3, h4, span[dir="auto"]')) {
      if (h.children.length > 1 || !railOn(h.textContent)) continue;
      let box = h;
      for (let i = 0; i < 6 && box.parentElement && box.parentElement !== root; i++) {
        const up = box.parentElement;
        if (up.querySelector('input, textarea, [role="search"], [role="main"] [role="feed"]') || up.matches('[role="main"], [role="navigation"], [role="banner"]') || isPage(up)) break;
        box = up;
        if (up.querySelectorAll('a[href]').length >= 2) break;
      }
      if (!isPage(box)) hide(box);
    }
    // The side column: any part of it that is sponsored, by the same test the filter uses for posts.
    if (F('fb.ads')) for (const side of root.querySelectorAll('[role="complementary"]')) {
      for (const part of side.children.length === 1 ? side.firstElementChild.children : side.children) {
        if (RULES && RULES.sponsored(part)) hide(part);
        else if (/^\s*Sponsored\b/.test(part.innerText || '')) hide(part);
      }
    }
    // The home page's feed, should the address change slip past the redirect for a moment.
    if (isHome(location.href)) for (const f of root.querySelectorAll('[role="feed"]')) hide(f);
    // The Video and Reels tabs' own links (the tab bar's and the menu's): gone, like Instagram's Reels tab.
    if (F('fb.videoTab')) for (const a of root.querySelectorAll('a[href*="/watch"], a[href*="/reel"], a[href*="/video"]')) {
      if (a.closest('[role="article"]')) continue;
      try { const u = new URL(a.getAttribute('href') || '', location.href); if (/(^|\.)facebook\.com$/i.test(u.hostname) && isVideoTab(u)) hide(a); } catch {}
    }
    // Reels, everywhere (2026-11-14): a post, notification or card that links to a reel goes as a whole; a tab or a
    // menu entry for Reels goes by itself. The hidden counts go to the app like the rest.
    for (const a of root.querySelectorAll('a[href]')) {
      if (a.hasAttribute('data-fbt') || !reelHref(a.getAttribute('href') || '')) continue;
      const box = a.closest('[role="article"]') || a.closest('[role="listitem"], li') || a;
      if (box !== a && (box.matches('[role="main"], [role="feed"], [role="navigation"], [role="banner"], body') || isPage(box))) { hide(a); continue; }
      if (!box.hasAttribute('data-fbt')) { hide(box); note('fb-reel-hide'); }
    }
    // A reel drawn as a video with Facebook's reel label on it, without a link.
    if (F('fb.noReels')) for (const el of root.querySelectorAll('[aria-label]')) {
      if (/^(reels?|reel by .*|watch reels?)$/i.test((el.getAttribute('aria-label') || '').trim())) { const b = el.closest('[role="article"], [role="listitem"], li'); hide(b && !isPage(b) ? b : el); }
    }
    checkAccount();
    // Prompts to open or get the app.
    if (!F('fb.appPrompts')) return;
    for (const a of root.querySelectorAll('a[href]')) if (APPLINK.test(a.getAttribute('href') || '')) hide(a);
    for (const b of root.querySelectorAll('a, button, [role="button"]')) {
      const t = (b.textContent || '').trim();
      if (t.length < 40 && PROMPT.test(t)) hide(b.closest('[role="dialog"]') || b); // never the top bar (role=banner) itself
    }
  }
  // A page left blank (2026-11-14): if, some seconds after the address settles, nothing on the screen can be seen,
  // whatever the cause, Notifications is opened instead, once for each address, so the app is never stuck on a dead page.
  let blankHref = '', blankSince = 0;
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
  setInterval(() => {
    const b = document.body;
    if (!b || !F('fb.blankRescue') || document.readyState === 'loading' || onWork() || isHome(location.href) || /^\/(notifications|login|checkpoint)/i.test(location.pathname)) { blankSince = 0; return; }
    const visible = (b.innerText || '').trim().length > 2 || [...b.querySelectorAll('img, video, svg, canvas, input, a, [role="button"]')].some(seen);
    if (visible || blankHref !== location.href) { blankHref = location.href; blankSince = visible ? 0 : Date.now(); return; }
    if (!blankSince) { blankSince = Date.now(); return; }
    if (Date.now() - blankSince < 6000) return;
    blankSince = 0;
    try { const k = 'fbt-blank:' + location.pathname; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch {}
    note('fb-blank'); location.replace(HOME_TO);
  }, 1000);

  let t = 0;
  new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; tidy(); }, 120); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', tidy, { once: true });
  setInterval(tidy, 1000);
});
