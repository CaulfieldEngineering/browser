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

  // Links to the app that are clicked anyway go nowhere.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && APPLINK.test(a.getAttribute('href') || '')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
