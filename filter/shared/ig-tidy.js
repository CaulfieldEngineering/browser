// Instagram's prompts to open or get its app, hidden (Joe, 2026-11-05, in the Instagram app: "yes hide those"). The
// "Open app" / "Open Instagram" buttons, "Get the app" and "See this in the app" banners and sheets, and links to the
// App Store or the instagram:// scheme. A sheet that offers "Not now" is answered "Not now". On instagram.com only, in
// the filter's own content world; the app's Policy also ignores any link that would open the native app.
(function () {
  'use strict';
  if (globalThis.__igTidy || !/(^|\.)instagram\.com$/i.test(location.hostname)) return;
  globalThis.__igTidy = { hidden: 0 };
  const WORDS = /^(open|get|use|download|switch to|continue in|see (this|more|it) (in|on)) (the )?(instagram )?(app|instagram)( for (a )?better experience)?\.?$/i;
  // Text runs together across elements ("...in the appNot now"), so no word boundary after "app".
  const SHEET = /(open|see|continue|watch|get).{0,30}\b(in|on) the (instagram )?app|\bopen instagram|\buse the app|\bget the app/i;
  const APPLINK = /^(instagram|itms-apps?|itms-appss?):|apps\.apple\.com|itunes\.apple\.com|\/download\/?($|\?)|app\.link|onelink\.me/i;

  // Instagram's own tab bar (the bottom bar on the phone, the side bar on a wide screen): found by its links (home,
  // the search tab, messages), marked data-igt-nav, and never touched by anything below, so it is the same on every
  // page (Joe, 2026-11-05, on the search page's bar losing tabs). The one change to it is deliberate: no Reels tab
  // (Joe: "Also the reels button can go away"); the other tabs share its room. Reels in the feed, on profiles and in
  // shared links stay.
  function markNav() {
    const msgs = [...document.querySelectorAll('a[href^="/direct"]')];
    for (const m of msgs) {
      let bar = m.closest('nav, [role="navigation"]');
      if (!bar) for (let up = m.parentElement, i = 0; up && up !== document.body && i < 8; up = up.parentElement, i++) {
        if (up.querySelector('a[href^="/explore"]') && up.querySelector('a[href="/"], a[href^="/?"]')) { bar = up; break; }
      }
      if (!bar || bar.hasAttribute('data-igt-nav')) continue;
      bar.setAttribute('data-igt-nav', '');
    }
    for (const bar of document.querySelectorAll('[data-igt-nav]')) {
      for (const reels of bar.querySelectorAll('a[href="/reels/"], a[href^="/reels/?"]')) {
        // The tab's own slot: the reels link's ancestor that sits in the same row as the other tabs' slots.
        let slot = reels;
        while (slot.parentElement && slot.parentElement !== bar && slot.parentElement.querySelectorAll('a[href]').length <= 1) slot = slot.parentElement;
        if (!slot.hasAttribute('data-igt-reels')) { slot.setAttribute('data-igt-reels', ''); slot.style.setProperty('display', 'none', 'important'); }
      }
    }
  }
  const inNav = (el) => !!(el && el.closest && el.closest('[data-igt-nav]')) || !!(el && el.querySelector && el.querySelector('[data-igt-nav]'));
  // A prompt's own floating banner (a fixed or sticky strip, not the tab bar), so no close button or chevron is left.
  function bannerOf(el) {
    for (let up = el.parentElement, i = 0; up && up !== document.body && i < 5; up = up.parentElement, i++) {
      if (inNav(up)) return el;
      const cs = getComputedStyle(up);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && up.getBoundingClientRect().height <= 160) return up;
    }
    return el;
  }
  const hide = (el) => { if (!el || inNav(el)) return; el = bannerOf(el); if (el.hasAttribute('data-igt') || inNav(el)) return; el.setAttribute('data-igt', ''); el.style.setProperty('display', 'none', 'important'); globalThis.__igTidy.hidden++; };
  function tidy(root) {
    if (!root || !root.querySelectorAll) return;
    for (const a of root.querySelectorAll('a[href]')) if (APPLINK.test(a.getAttribute('href') || '')) hide(a);
    for (const b of root.querySelectorAll('a, button, [role="button"]')) {
      const t = (b.textContent || '').trim();
      if (t.length < 40 && WORDS.test(t)) hide(b);
    }
    // A sheet or banner whose message is "see this in the app": "Not now" if it has one, else hidden.
    for (const d of root.querySelectorAll('[role="dialog"], [role="presentation"], [role="banner"]')) {
      const t = (d.textContent || '').slice(0, 300);
      if (!SHEET.test(t)) continue;
      const notNow = [...d.querySelectorAll('button, [role="button"], a')].find((x) => /^(not now|cancel|close|continue (on|in) (the )?(web|browser))$/i.test((x.textContent || '').trim()) || /close/i.test(x.getAttribute('aria-label') || ''));
      if (notNow) { try { notNow.click(); } catch {} } else if (d.querySelectorAll('article, video').length === 0) hide(d);
    }
  }
  let t = 0;
  const run = () => { t = 0; markNav(); tidy(document.body); };
  new MutationObserver(() => { if (!t) t = setTimeout(run, 150); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run, { once: true });
  // No Explore (Joe, 2026-11-05: "let's get rid of the explore page"). On /explore and everything under it (the search
  // tab's grid, tag and place grids, search results' recommended posts) every post and reel tile is gone, so only the
  // search box and the accounts it finds are left. On the phone the search tab itself is /explore/, so its link stays;
  // on a wide screen (the laptop), where search has its own panel, the Explore link goes too.
  const tile = (sel) => `html[data-igt-explore] a[href*="${sel}"]:not([data-igt-nav] a)`;
  const exploreCss = [tile('/p/'), tile('/reel/'), tile('/reels/'), tile('/tv/')].join(',') + '{display:none !important}' +
    // the search page while it waits: no endless spinner under the search box
    'html[data-igt-explore] [role="progressbar"]:not([data-igt-nav] *),html[data-igt-explore] svg[aria-label^="Loading"],html[data-igt-explore] [data-visualcompletion="loading-state"]{display:none !important}' +
    '@media (min-width: 768px) and (hover: hover){a[href="/explore/"],a[href^="/explore/?"]{display:none !important}}';
  const markExplore = () => {
    const root = document.documentElement;
    if (!root) return;
    if (!document.getElementById('igt-style')) { const st = document.createElement('style'); st.id = 'igt-style'; st.textContent = exploreCss; (document.head || root).appendChild(st); }
    if (/^\/explore(\/|$)/.test(location.pathname)) root.setAttribute('data-igt-explore', ''); else root.removeAttribute('data-igt-explore');
  };
  markExplore();
  document.addEventListener('DOMContentLoaded', markExplore, { once: true });
  setInterval(markExplore, 250);

  // The search page, plain (Joe, 2026-11-05: "Can we get rid of all of the junk and images that come along with the
  // Instagram search page?"): on /explore and below only the search field and a plain list of results (accounts and
  // hashtags) are left. Gone: every video, every picture shown larger than a small avatar, the suggested, trending and
  // discover sections, and the Top / Reels / Places tabs with their tiles. A result keeps its small avatar (44 pt or
  // less), which the filter still judges there (ig-filter.js judges every picture on these pages, however small).
  const AVATAR = (globalThis.IGFilterConfig && globalThis.IGFilterConfig.searchAvatarPx) || 44;
  const SECTION = /^(suggested( for you)?|suggested accounts|trending|trending now|discover( people)?|explore|recommended( for you)?|popular|see all|more like this)$/i;
  const TABS = /^(top|reels|places|videos|for you)$/i;
  const gone = (el) => { if (el && !inNav(el) && !el.hasAttribute('data-igt')) { el.setAttribute('data-igt', ''); el.style.setProperty('display', 'none', 'important'); } };
  // The box a section heading heads: the smallest one around it that also holds that section's links, and never one
  // with the search field or another section's heading in it (so the real results are never taken with it).
  function sectionOf(head) {
    let box = head, best = head;
    for (let i = 0; i < 5 && box.parentElement && box.parentElement !== document.body; i++) {
      const up = box.parentElement;
      if (up.querySelector('input, textarea, [role="search"]')) break;
      const heads = [...up.querySelectorAll('h1, h2, h3, h4, span, div')].filter((x) => x.children.length <= 1 && SECTION.test((x.textContent || '').trim()));
      if (heads.length > 1) break;
      box = up;
      if (up.querySelectorAll('a[href]').length >= 2) { best = up; break; } // the heading's row and its list
    }
    return best;
  }
  function plainSearch() {
    markNav();
    if (!/^\/explore(\/|$)/.test(location.pathname) || !document.body) return;
    for (const v of document.querySelectorAll('video')) gone(v.closest('a') || v);
    for (const img of document.querySelectorAll('img, [style*="background-image"]')) {
      const r = img.getBoundingClientRect();
      if (r.width > AVATAR + 0.5 || r.height > AVATAR + 0.5) gone(img.closest('a[href*="/p/"], a[href*="/reel/"]') || img);
    }
    for (const el of document.querySelectorAll('h1, h2, h3, h4, span, div')) {
      if (el.children.length > 1) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 30) continue;
      if (SECTION.test(t)) gone(sectionOf(el));
    }
    for (const tab of document.querySelectorAll('[role="tab"], [role="tablist"] a, [role="tablist"] button')) {
      if (TABS.test((tab.textContent || '').trim())) gone(tab);
    }
  }
  let ps = 0;
  new MutationObserver(() => { if (!ps) ps = setTimeout(() => { ps = 0; plainSearch(); }, 60); }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
  setInterval(plainSearch, 500);

  // A newly opened page starts at the top, as in the native app (Joe, 2026-11-05: "opening certain pages scrolls way
  // down instead of starting at the top"; a post's comments opened at the last comments). Instagram changes pages without
  // loading (pushState), so the old scroll position, the filter's collapsing of hidden posts, or a comment box focused by
  // the page can leave a new page part way down. For 1.5 s after a new address (not Back or Forward, which keep
  // Instagram's own restored position), the page is put back at the top as it builds, until Joe touches or scrolls it
  // himself; a text box the page focused without his tap is let go so the keyboard does not pull the page down.
  // Back or Forward is told apart by the popstate event, which every Back and Forward fires. (Not by history's length:
  // WebKit does not grow it for an entry pushed without a fresh tap, so a new page can look like Back by that measure.)
  let lastHref = location.href, lastLen = history.length, popAt = 0, userAt = 0, settleUntil = 0;
  addEventListener('popstate', () => { popAt = Date.now(); }, true);
  for (const ev of ['touchstart', 'wheel', 'keydown', 'mousedown']) addEventListener(ev, () => { userAt = Date.now(); }, { capture: true, passive: true });
  const atTop = () => {
    if (Date.now() > settleUntil || userAt > settleUntil - 1500) return;
    const root = document.documentElement;
    if (scrollY > 0) { scrollTo(0, 0); root && root.setAttribute('data-igt-top', String(Date.now())); }
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable)) {
      try { a.blur(); } catch {}
      if (document.activeElement === a) { try { a.setAttribute('readonly', ''); a.blur(); a.removeAttribute('readonly'); } catch {} }
      root && root.setAttribute('data-igt-blur', document.activeElement === a ? 'failed' : 'done');
    }
  };
  setInterval(() => {
    if (location.href === lastHref) return;
    const was = lastHref, grew = history.length > lastLen;
    lastHref = location.href; lastLen = history.length;
    const samePage = was.split('#')[0] === location.href.split('#')[0];
    const root = document.documentElement;
    if (root) root.setAttribute('data-igt-nav', [location.pathname, grew ? 'new' : 'same', Date.now() - popAt < 400 ? 'pop' : '-', userAt > Date.now() - 2000 ? 'touched' : '-'].join(' '));
    if (samePage || Date.now() - popAt < 400) return; // a hash change, or Back / Forward
    settleUntil = Date.now() + 1500;
    if (root) root.setAttribute('data-igt-settle', String(settleUntil)); // when the putting-back ends (the app tests wait on it)
    for (const ms of [0, 60, 200, 450, 800, 1200, 1500]) setTimeout(atTop, ms);
  }, 50);
  new MutationObserver(() => { if (Date.now() < settleUntil) atTop(); }).observe(document, { childList: true, subtree: true });
  // The home feed is the Following feed: only the accounts Joe follows, newest first (Joe, 2026-11-05: "I follow like
  // 1000 people but every time I open it I see the same exact post. Even when I refresh. And I feel like I see the same
  // 10 accounts and its not even people I know"). "/" without a variant goes to "/?variant=following": on arriving,
  // on a tap of the home tab or the logo, and when Instagram changes the address to "/" itself. An address that already
  // names a variant (favorites, following) is left as it is, and so is Back. Its posts, and any suggested posts after
  // them, go through the filter like every other post.
  const FOLLOWING = '/?variant=following';
  const wantsFeed = (href) => { try { const u = new URL(href, location.href); return /(^|\.)instagram\.com$/i.test(u.hostname) && u.pathname === '/' && !u.searchParams.has('variant'); } catch { return false; } };
  let feedPopAt = 0;
  addEventListener('popstate', () => { feedPopAt = Date.now(); }, true);
  if (wantsFeed(location.href)) location.replace(FOLLOWING);
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (wantsFeed(a.getAttribute('href'))) { e.preventDefault(); e.stopImmediatePropagation(); location.assign(FOLLOWING); }
  }, true);
  let feedHref = location.href;
  setInterval(() => {
    if (location.href === feedHref) return;
    feedHref = location.href;
    if (wantsFeed(feedHref) && Date.now() - feedPopAt > 400) location.replace(FOLLOWING);
  }, 100);

  // Links to the app that are clicked anyway go nowhere.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && APPLINK.test(a.getAttribute('href') || '')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
