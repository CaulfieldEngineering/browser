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
  // A newly opened page starts at the top, as in the native app (Joe, 2026-11-05: "opening certain pages scrolls way
  // down instead of starting at the top"; a post's comments opened at the last comments). Instagram changes pages without
  // loading (pushState), so the old scroll position, the filter's collapsing of hidden posts, or a comment box focused by
  // the page can leave a new page part way down. For 1.5 s after a new address (not Back or Forward, which keep
  // Instagram's own restored position), the page is put back at the top as it builds, until Joe touches or scrolls it
  // himself; a text box the page focused without his tap is let go so the keyboard does not pull the page down.
  let lastHref = location.href, popAt = 0, userAt = 0, settleUntil = 0;
  addEventListener('popstate', () => { popAt = Date.now(); }, true);
  for (const ev of ['touchstart', 'wheel', 'keydown', 'mousedown']) addEventListener(ev, () => { userAt = Date.now(); }, { capture: true, passive: true });
  const atTop = () => {
    if (Date.now() > settleUntil || userAt > settleUntil - 1500) return;
    if (scrollY > 0) scrollTo(0, 0);
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) || (a && a.isContentEditable)) { try { a.blur(); } catch {} }
  };
  setInterval(() => {
    if (location.href === lastHref) return;
    const was = lastHref; lastHref = location.href;
    const samePage = was.split('#')[0] === location.href.split('#')[0];
    if (samePage || Date.now() - popAt < 400) return; // a hash change, or Back / Forward
    settleUntil = Date.now() + 1500;
    for (const ms of [0, 60, 200, 450, 800, 1200, 1500]) setTimeout(atTop, ms);
  }, 50);
  new MutationObserver(() => { if (Date.now() < settleUntil) atTop(); }).observe(document, { childList: true, subtree: true });
  // Links to the app that are clicked anyway go nowhere.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && APPLINK.test(a.getAttribute('href') || '')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
