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

  const hide = (el) => { if (!el || el.hasAttribute('data-igt')) return; el.setAttribute('data-igt', ''); el.style.setProperty('display', 'none', 'important'); globalThis.__igTidy.hidden++; };
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
  const run = () => { t = 0; tidy(document.body); };
  new MutationObserver(() => { if (!t) t = setTimeout(run, 150); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run, { once: true });
  // No Explore (Joe, 2026-11-05: "let's get rid of the explore page"). On /explore and everything under it (the search
  // tab's grid, tag and place grids, search results' recommended posts) every post and reel tile is gone, so only the
  // search box and the accounts it finds are left. On the phone the search tab itself is /explore/, so its link stays;
  // on a wide screen (the laptop), where search has its own panel, the Explore link goes too.
  const exploreCss = 'html[data-igt-explore] a[href*="/p/"],html[data-igt-explore] a[href*="/reel/"],html[data-igt-explore] a[href*="/reels/"],html[data-igt-explore] a[href*="/tv/"]{display:none !important}' +
    '@media (min-width: 768px){a[href="/explore/"],a[href^="/explore/?"]{display:none !important}}';
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
  const gone = (el) => { if (el && !el.hasAttribute('data-igt')) { el.setAttribute('data-igt', ''); el.style.setProperty('display', 'none', 'important'); } };
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

  // Links to the app that are clicked anyway go nowhere.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && APPLINK.test(a.getAttribute('href') || '')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
