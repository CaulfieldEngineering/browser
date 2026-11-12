// The Instagram filter, in the page (Joe, 2026-11-05; locked memory entry 21). Runs at document start on instagram.com
// in the iPhone Browser, in the Instagram app built from it, and in the laptop extension. The rules are in rules.js;
// the image classifier is reached through IGFilterBridge, which each place provides:
//   IGFilterBridge.classifyUrl(url)   -> Promise<scores | {_error} | null>   an image on Instagram's CDN, judged on the device
//   IGFilterBridge.classifyData(data) -> Promise<scores | {_error} | null>   a data: URL (a video frame drawn here)
//   IGFilterBridge.classifyRect(rect) -> Promise<scores | {_error} | null>   what is on screen there (a playing video), optional
//   IGFilterBridge.stat(name)         -> count one event on the device (why a post was hidden), optional
//   IGFilterBridge.warm()             -> start loading the model now, optional
//   IGFilterBridge.width()            -> Promise<how many pictures the judge takes at a time>, optional
//
// Surfaces: the feed (<article>), post pages, profile grids (posts, reels, tagged), Explore and search grids, the reel
// viewer, stories, messages; pictures as <img> or as a CSS background on the tile; avatars and story rings only when
// they are shown large (120 px or more).
// What it does: a post or Reel that a rule flags is hidden without a word (Joe, 2026-11-05: "i'd prefer not to label the
// pictures. Keep it more discrete"): in the feed and the reel viewer it collapses as if it were not there; in a grid the
// tile is taken out and the tiles after it close up (2026-11-08; before, it stayed a blank). A tile still being checked
// stays a plain blank in the page's own colour. There is no reveal, no blur, no setting and no switch; a blank tile
// cannot be tapped. Pictures from Instagram's CDN are held invisible until judged.
// One that could not be judged yet (the model still loading, the picture not readable) is hidden the same way and tried
// again at 5, 20 and 60 seconds: it fills in quietly once judged clean, and stays hidden if flagged or never judged.
// The reason is counted on the device (IGFilterBridge.stat), never shown on the page. Videos are judged by their
// poster, a drawn frame, then every two seconds while they play. Feed, Reels, messages, profiles and posting stay.
(function () {
  'use strict';
  const g = globalThis;
  if (g.__igFilter) return;
  // Instagram, and since 2026-11-05 Facebook (the Facebook app built from the Browser, and facebook.com): the same
  // judges and the same discreet removal; only the shape of a post differs (unitOf), and Facebook's ads and suggested
  // injections are rules of their own in rules.js.
  const SITE = /(^|\.)instagram\.com$/i.test(location.hostname) ? 'instagram'
    : /(^|\.)(facebook\.com|messenger\.com)$/i.test(location.hostname) ? 'facebook' : null;
  if (!SITE) return;
  const RULES = g.IGFilterRules;
  const BRIDGE = g.IGFilterBridge;
  if (!RULES || !BRIDGE) return;

  const MEDIA_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
  const CFG = g.IGFilterConfig || {}; // filter-config.js, also shown on the Devices dashboard
  const SMALL = CFG.smallPx || 120;                                // rendered px: avatars, icons and small story rings are not judged
  const FRAME_EVERY = (CFG.frameEverySeconds || 2) * 1000;         // between frame checks while a video plays
  const RETRY = g.__igFilterRetry || (CFG.retrySeconds || [5, 20, 60]).map((x) => x * 1000); // tests shorten it
  const state = { removed: 0, judged: 0, failed: 0, ready: false, held: 0 };
  g.__igFilter = state;
  const stat = (name) => { try { BRIDGE.stat && BRIDGE.stat(name); } catch {} };
  try { BRIDGE.warm && BRIDGE.warm(); } catch {}

  // ---- styles: held media is invisible; a hidden post is gone, a hidden grid tile is blank, nothing answers a tap ------
  const css = [
    '[data-igf-hold]{visibility:hidden !important}',
    '@keyframes igf-in{from{opacity:0}to{opacity:1}}',
    '[data-igf-in]{animation:igf-in .18s ease-out}',
    '[data-igf-gone]:not([data-igf-tile]):not([data-igf-slide-hold]):not([data-igf-cover]){display:none !important}',
    // In the reel and story viewers a hidden slide is covered, not removed (Joe, 2026-11-12: "A lot of times when it
    // blocks a slide too it completely shuts down the app. Like grey box."): the viewer measures its slides, so a slide
    // taken out of the layout left it blank and stuck. The slide keeps its box; its pictures and videos are invisible.
    '[data-igf-cover]{background:#000 !important}',
    '[data-igf-cover] img,[data-igf-cover] video,[data-igf-cover] [style*="background-image"],img[data-igf-cover],video[data-igf-cover],[data-igf-cover][style*="background-image"]{visibility:hidden !important}',
    // Hide a picture (the menu's Tools): while picking, the page is dimmed a little and says what to do.
    '#igf-pick{position:fixed !important;inset:0 !important;z-index:2147483647 !important;background:rgba(0,0,0,.22) !important;touch-action:none !important;-webkit-user-select:none !important;user-select:none !important;-webkit-touch-callout:none !important}',
    '#igf-pick-tip{position:fixed !important;left:50% !important;top:calc(env(safe-area-inset-top, 0px) + 14px) !important;transform:translateX(-50%) !important;padding:9px 16px !important;border-radius:18px !important;background:rgba(18,18,18,.92) !important;color:#fff !important;font:500 15px/1.2 -apple-system,BlinkMacSystemFont,system-ui,sans-serif !important;white-space:nowrap !important;pointer-events:none !important;z-index:2147483647 !important}',
    // A hidden feed post keeps one invisible pixel in the page instead of none (Joe, 2026-11-08: "my feed seems to stop
    // after a few scrolls down - presumably it stops once something gets blocked"): Instagram loads the next posts when
    // the last ones come into view, and a post with display:none never comes into view.
    'article[data-igf-gone]:not([data-igf-tile]):not([data-igf-slide-hold]):not([data-igf-cover]){display:block !important;height:1px !important;min-height:0 !important;max-height:1px !important;margin:0 !important;padding:0 !important;border:0 !important;overflow:hidden !important;opacity:0 !important;pointer-events:none !important}',
    // A grid whose blocked tile was taken out: its rows give their tiles to one grid so the rest close up (Joe,
    // 2026-11-08: "for where tiles are blocked, can we just skip it instead of leaving the hole?"). Anything else in it
    // (a spinner, a row not marked yet) spans the full width, as before.
    '[data-igf-grid]{display:grid !important;grid-template-columns:repeat(var(--igf-cols,3),minmax(0,1fr)) !important;column-gap:var(--igf-cgap,0px) !important;row-gap:var(--igf-rgap,0px) !important}',
    '[data-igf-grid]>:not([data-igf-row]){grid-column:1/-1}',
    '[data-igf-row]{display:contents !important}',
    '[data-igf-row]>*{margin:0 !important;width:auto !important;min-width:0 !important;max-width:none !important}',
    '[data-igf-row]>[data-igf-cell-gone]{display:none !important}',
    // A reel or story still being checked holds its place in the viewer (its picture held invisible), not collapsed.
    '[data-igf-slide-hold]{visibility:hidden !important}',
    '[data-igf-tile]{pointer-events:none !important}',
    '[data-igf-tile]>:not(.igf-ph){display:none !important}',
    '.igf-ph{display:block !important;width:100%;background:transparent;pointer-events:none}',
    // An avatar judged suggestive: a plain circle the same size, the picture moved out of sight (no icon, no word).
    'img[data-igf-avatar]{object-position:-99999px -99999px !important;background:rgba(128,128,128,.28) !important;border-radius:50% !important;visibility:visible !important}',
    // A profile flagged by its name or bio: no posts, reels or tagged grids.
    'html[data-igf-account] main a[href*="/p/"],html[data-igf-account] main a[href*="/reel/"],html[data-igf-account] main a[href*="/tv/"]{display:none !important}',
    '[data-igf-bio]{display:none !important}',
  ].join('');
  const addStyle = () => {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById('igf-style')) return; // at document start there may be no <html> yet
    const s = document.createElement('style');
    s.id = 'igf-style';
    s.textContent = css;
    parent.appendChild(s);
  };
  addStyle();

  const isMediaUrl = (u) => { try { return MEDIA_HOST.test(new URL(u, location.href).hostname); } catch { return false; } };
  const onDirect = () => SITE === 'instagram' ? location.pathname.startsWith('/direct')
    : /(^|\.)messenger\.com$/i.test(location.hostname) || location.pathname.startsWith('/messages');

  // ---- the post a piece of media belongs to ------------------------------------------------------------------------
  // Feed and post pages: <article>. Grids (profile, Explore, search, the Reels tab of a profile): the tile's link.
  // Reels and stories: the largest ancestor that holds this one video. Messages: the media itself, so a thread stays.
  const FB_TILE = 'a[href*="/marketplace/item/"]';
  function unitOf(el) {
    if (onDirect()) return el;
    if (SITE === 'facebook') {
      // A feed or group post, a Reel, a story card; a Marketplace listing's tile.
      const post = el.closest('[role="article"]') || el.closest('[data-pagelet^="FeedUnit"]');
      if (post) return post;
      const listing = el.closest(FB_TILE);
      if (listing) return listing;
    } else {
      // A profile's header is not a post: a picture there (the avatar) stands alone; the bio rule handles the header.
      if (el.closest('main header')) return el;
      const a = el.closest('article');
      if (a) return a;
      const tile = el.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]');
      if (tile) return tile;
    }
    let u = el;
    // Up to the largest box that holds only this one piece (at most one video and one picture), so hiding one reel or
    // story never takes its neighbours with it. Never the page itself (2026-11-12: a video story with only its avatar
    // beside it climbed to Instagram's whole app, and hiding it left a grey screen): not to a box that is or holds the
    // page's main area, its tab bar, a dialog or Instagram's root.
    const one = (p) => p.querySelectorAll('video').length <= 1 && p.querySelectorAll('img, [style*="background-image"]').length <= 1;
    const PAGE = 'main, [role="main"], [role="dialog"], nav, [data-igt-nav], [id^="mount"]';
    const tooBig = (p) => p === document.documentElement || p.parentElement === document.body || p.matches(PAGE) || !!p.querySelector(PAGE);
    while (u.parentElement && u.parentElement !== document.body && one(u.parentElement) && !tooBig(u.parentElement)) u = u.parentElement;
    return u;
  }

  function textOf(unit) {
    let t = unit.innerText || '';
    for (const img of unit.querySelectorAll('img[alt]')) t += '\n' + img.getAttribute('alt');
    return t.slice(0, 6000);
  }

  // ---- hiding ---------------------------------------------------------------------------------------------------------
  // A grid tile (a link to a post or reel on a profile, Explore or search) keeps its place as a blank of the same size;
  // anything else collapses. No text, no icon.
  const isTile = (unit) => unit.tagName === 'A' && (SITE === 'facebook' ? unit.matches(FB_TILE) && !unit.closest('[role="article"]')
    : /\/(p|reel|reels|tv)\//.test(unit.getAttribute('href') || '') && !unit.closest('article'));
  function placeholder(unit) {
    if (!isTile(unit) || [...unit.children].some((c) => c.classList && c.classList.contains('igf-ph'))) return;
    const r = unit.getBoundingClientRect();
    unit.setAttribute('data-igf-tile', '');
    const ph = document.createElement('div');
    ph.className = 'igf-ph';
    if (r.height > 0) ph.style.height = Math.round(r.height) + 'px'; else ph.style.aspectRatio = '1';
    unit.prepend(ph);
  }
  // A tile hidden for good leaves the grid: its row is found (the nearest box whose siblings also hold tiles), the rows'
  // container becomes one grid with the same columns and gaps, and the tile's cell is dropped, so the tiles after it move
  // up. A tile still being checked keeps its blank (it may come back). Rows Instagram adds later are marked as they come.
  const TILE_SEL = SITE === 'facebook' ? FB_TILE : 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]';
  const holdsTile = (el) => el.nodeType === 1 && !!(el.matches(TILE_SEL) || el.querySelector(TILE_SEL));
  const gridObs = new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.parentElement && n.parentElement.hasAttribute('data-igf-grid') && holdsTile(n)) n.setAttribute('data-igf-row', '');
  });
  function skipTile(unit) {
    // The cell: the nearest box (the tile or above) with a sibling that also holds a tile. Its parent is the row.
    let cell = unit;
    while (cell.parentElement && cell.parentElement !== document.body && ![...cell.parentElement.children].some((c) => c !== cell && holdsTile(c))) cell = cell.parentElement;
    if (cell === unit) return;  // tiles straight in one grid: the tile's own display:none already closes it up
    const row = cell.parentElement, grid = row && row.parentElement;
    if (!grid || grid === document.body || row === document.body) { placeholder(unit); return; } // no grid found: keep the blank
    if (!grid.hasAttribute('data-igf-grid')) {
      const cells = [...row.children].filter(holdsTile), rows = [...grid.children].filter(holdsTile);
      const a = cells[0] && cells[0].getBoundingClientRect(), b = cells[1] && cells[1].getBoundingClientRect();
      const r1 = rows[0] && rows[0].getBoundingClientRect(), r2 = rows[1] && rows[1].getBoundingClientRect();
      grid.style.setProperty('--igf-cols', String(Math.max(1, ...rows.map((r) => [...r.children].filter(holdsTile).length))));
      if (a && b) grid.style.setProperty('--igf-cgap', Math.max(0, Math.round(b.left - a.right)) + 'px');
      if (r1 && r2) grid.style.setProperty('--igf-rgap', Math.max(0, Math.round(r2.top - r1.bottom)) + 'px');
      for (const r of rows) r.setAttribute('data-igf-row', '');
      grid.setAttribute('data-igf-grid', '');
      gridObs.observe(grid, { childList: true });
    }
    row.setAttribute('data-igf-row', '');
    cell.setAttribute('data-igf-cell-gone', '');
  }
  // After a post collapses, Instagram is told the page moved, so it checks whether to load the next ones.
  const nudge = () => { try { dispatchEvent(new Event('scroll')); } catch {} };
  // A post above the screen that collapses or comes back must not move what is on screen (Joe, 2026-11-08: "It keeps
  // pushing back up when we get to a certain point"): WebKit does not hold the scroll still when the page above changes
  // height, so a post still being checked, shown again seconds later after Joe scrolled past it, threw the feed back up.
  // Facebook: the first post at or below the top of the screen is kept where it was. Instagram: hold(), below.
  const POST_SEL = SITE === 'facebook' ? '[role="article"]' : 'article';
  function keepPlace(unit, change) {
    if (inViewer() || isTile(unit)) { change(); return; }
    if (HOLD) { hold(); change(); hold(unit); return; }
    if (unit.getBoundingClientRect().top >= 0) { change(); return; }
    const anchor = [...document.querySelectorAll(POST_SEL)].find((a) => a !== unit && !unit.contains(a) && !a.contains(unit) && a.getBoundingClientRect().top >= 0);
    const before = anchor && anchor.getBoundingClientRect().top;
    change();
    if (!anchor) return;
    const d = anchor.getBoundingClientRect().top - before;
    if (Math.abs(d) < 1) return;
    const sc = scrollerOf(anchor);
    if (sc) sc.scrollTop += d; else scrollBy(0, d);
  }
  // ---- Instagram's feed holds still (Joe, 2026-11-12: "I scroll down slowly and specific images will trigger some bug
  // where it jumps 3 or so images back up. So then I scroll back down and hit the same offending image again") ---------
  // Instagram keeps only the posts near the screen in the page (its PolarisIGVirtualList): the ones scrolled past are
  // taken out and their room is left as padding, by the sizes it measures; when the page moves back up they are put in
  // again, as new elements at full height. A post this filter collapsed was measured at one pixel, so put in again it
  // pushed everything under it down by a whole post, and Instagram does not correct the scroll for that in a window
  // that scrolls. The filter then collapsed it again, and its own place-keeping (2026-11-08) kept the screen where the
  // push had left it by scrolling the page up, which made Instagram put in the next post above; when that one was
  // hidden too, the same again. So a run of hidden posts above threw the screen back by as many posts ("3 or so"). It
  // started with any move up the page: Joe scrolling back, or the filter's own scroll when a post he had passed was
  // hidden late (a picture judged after he scrolled by, a video frame, a post still being checked).
  // Chrome holds the screen still by itself when the page above it changes (scroll anchoring); WebKit, so the iPhone,
  // does not. So it is done here, for anything that changes the page above the screen, ours or Instagram's: the post
  // at the top of the screen is noted by where it is in the page, and when it is found somewhere else without a
  // scroll, the page is scrolled by the difference, before the screen is drawn again. What is hidden is hidden exactly
  // as before; only the scroll position is kept.
  // Not at the very top of the page (new posts there are meant to show), not in the reel and story viewers, and not
  // where the browser holds the screen itself (Chrome on the laptop: doing it twice would move it the other way).
  const HOLD = SITE === 'instagram';
  let nativeAt = 0, nativeIs = false;
  const holdsItself = () => {
    const now = Date.now();
    if (now - nativeAt < 1000) return nativeIs;
    nativeAt = now; nativeIs = false;
    try {
      nativeIs = !!(g.CSS && CSS.supports('overflow-anchor', 'auto')) && getComputedStyle(document.documentElement).overflowAnchor !== 'none' && (!document.body || getComputedStyle(document.body).overflowAnchor !== 'none');
    } catch {}
    return nativeIs;
  };
  let marks = [], markSc = null; // the posts on screen, top first: {el, at: its top in the page}
  const posOf = (sc) => (sc ? sc.scrollTop : g.scrollY || 0);
  function mark() {
    marks = []; markSc = null;
    if (inViewer()) return;
    let sc;
    for (const el of document.querySelectorAll(POST_SEL)) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0) continue; // scrolled past
      if (sc === undefined) { sc = scrollerOf(el); markSc = sc; }
      marks.push({ el, at: r.top + posOf(sc) });
      if (marks.length >= 3 || r.top > innerHeight) break;
    }
  }
  // `changed`: the post this filter has just collapsed or shown again. When it is the one at the top of the screen, the
  // next post is the one held (as before 2026-11-12), so what is under it stays where it was.
  function hold(changed) {
    if (!HOLD || holdsItself()) return 0;
    let d = 0;
    const m = changed && changed.nodeType === 1 ? marks.find((x) => x.el !== changed) : marks[0];
    if (m && m.el.isConnected && !inViewer() && (!markSc || markSc.isConnected)) {
      const pos = posOf(markSc);
      d = m.el.getBoundingClientRect().top + pos - m.at;
      if (Math.abs(d) < 1 || pos <= 0) d = 0;
      else {
        if (markSc) markSc.scrollTop += d; else { try { scrollBy({ top: d, left: 0, behavior: 'instant' }); } catch { scrollBy(0, d); } }
        state.held++;
        stat('feed-held');
      }
    }
    mark();
    return d;
  }
  const kindOf = (unit) => unit && unit.getAttribute && unit.getAttribute('data-igf-gone');
  // ---- the reel and story viewers: a hidden slide is skipped (Joe, 2026-11-05: "when a reel is blocked it needs to
  // skip right over it, cause now it just hangs up since the timer doesn't run so I manually have to swipe") ----------
  const inViewer = () => /^\/(reels?|stories)\//.test(location.pathname) || /\/reel\//.test(location.pathname);
  const onScreen = (el) => { const r = el.getBoundingClientRect(); const y = innerHeight / 2; return r.height > 0 && r.top <= y && r.bottom >= y; };
  const shownSlide = (el) => el && getComputedStyle(el).display !== 'none' && !el.hasAttribute('data-igf-gone') && !el.querySelector('[data-igf-gone]');
  function scrollerOf(el) {
    for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (/(auto|scroll)/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 1) return x;
    }
    return null;
  }
  /** After the slide on screen was hidden: the next one that is not, else the one before, else close the viewer. */
  function skipPast(unit, wasOnScreen) {
    if (!wasOnScreen) return;
    if (/^\/stories\//.test(location.pathname)) {
      const next = document.querySelector('button[aria-label="Next"], [role="button"][aria-label="Next"], [aria-label="Next story"]');
      const close = document.querySelector('button[aria-label="Close"], [role="button"][aria-label="Close"]');
      if (next) next.click(); else if (close) close.click(); else history.back();
      stat('skipped-story');
      return;
    }
    const sc = scrollerOf(unit);
    const slideOf = (x) => { if (!sc) return x; while (x && x.parentElement !== sc) x = x.parentElement; return x || unit; };
    const slide = slideOf(unit);
    let next = slide, prev = slide;
    while ((next = next && next.nextElementSibling) && !shownSlide(next)) {}
    while ((prev = prev && prev.previousElementSibling) && !shownSlide(prev)) {}
    const go = next || prev;
    if (!go) { history.back(); stat('skipped-reel'); return; }
    if (sc) sc.scrollTo({ top: go.offsetTop - sc.firstElementChild.offsetTop, behavior: 'instant' }); else go.scrollIntoView({ block: 'start', behavior: 'instant' });
    const v = go.querySelector('video');
    if (v && !v.hasAttribute('data-igf-hold')) { try { v.play(); } catch {} }
    stat('skipped-reel');
  }

  /** Hides a post. kind: 'text', 'image', 'video' (for good) or 'checking' (to be tried again). */
  function hide(unit, kind, why) {
    if (!unit) return;
    const was = kindOf(unit);
    if (was && was !== 'checking') return;      // already hidden for good
    if (was === 'checking' && kind === 'checking') return;
    const viewer = inViewer() && !isTile(unit);
    const wasOnScreen = viewer && onScreen(unit);
    keepPlace(unit, () => {
      if (viewer && kind === 'checking') unit.setAttribute('data-igf-slide-hold', ''); else unit.removeAttribute('data-igf-slide-hold');
      if (viewer && kind !== 'checking') unit.setAttribute('data-igf-cover', ''); // covered, never taken out of the viewer
      if (viewer) unit.setAttribute('data-igf-for', mediaKey(unit));
      unit.setAttribute('data-igf-gone', kind);
      unit.setAttribute('data-igf-why', why || kind);
    });
    for (const v of unit.tagName === 'VIDEO' ? [unit] : unit.querySelectorAll('video')) { try { v.muted = true; v.pause(); } catch {} }
    if (kind !== 'checking' && isTile(unit)) skipTile(unit); else placeholder(unit);
    if (!isTile(unit)) setTimeout(nudge, 50);
    if (kind !== 'checking') { state.removed++; stat('hidden-' + (why || kind)); if (viewer) skipPast(unit, wasOnScreen); }
    else { stat('checking-' + (why || 'unjudged')); retry(unit); }
  }
  // Shown again only when every held picture in it has now been judged clean (no tap, no control: the verdict).
  function restore(unit) {
    if (kindOf(unit) !== 'checking') return;
    keepPlace(unit, () => {
      unit.removeAttribute('data-igf-gone');
      unit.removeAttribute('data-igf-why');
      unit.removeAttribute('data-igf-tile');
      unit.removeAttribute('data-igf-slide-hold');
    });
    const ph = [...unit.children].find((c) => c.classList && c.classList.contains('igf-ph'));
    if (ph) ph.remove();
    stat('restored');
  }
  const gone = (el) => { const u = el.closest && el.closest('[data-igf-gone]'); return !!u && kindOf(u) !== 'checking'; };
  // The viewers reuse their boxes: after a hidden story or reel, Instagram puts the next one's picture into the same
  // elements. A slide hidden for one picture is let go when its picture changes, and the new one is judged on its own
  // (held until then), so the next story is neither stuck blank nor shown unjudged.
  function mediaKey(unit) {
    let best = '', area = -1;
    for (const m of unit.matches && unit.matches('img, video, [style*="background-image"]') ? [unit] : unit.querySelectorAll('img, video, [style*="background-image"]')) {
      const r = m.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; best = keyOf(srcOf(m) || m.getAttribute('src') || ''); }
    }
    return best;
  }
  function releaseIfChanged(unit) {
    if (!unit || !unit.hasAttribute || !unit.hasAttribute('data-igf-for') || !inViewer()) return false;
    if (unit.getAttribute('data-igf-for') === mediaKey(unit)) return false;
    for (const a of ['data-igf-gone', 'data-igf-why', 'data-igf-cover', 'data-igf-slide-hold', 'data-igf-for']) unit.removeAttribute(a);
    retries.delete(unit);
    return true;
  }

  // ---- text ---------------------------------------------------------------------------------------------------------
  const textSeen = new WeakMap();
  function checkText(unit) {
    if (gone(unit)) return true;
    if (byHand.size) { const id = idOf(unit, null); if (id && byHand.has(id)) { hide(unit, 'image', 'by-hand'); return true; } }
    const t = textOf(unit);
    if (textSeen.get(unit) === t.length) return false;
    textSeen.set(unit, t.length);
    const hit = RULES.first('text', t, unit);
    if (hit) { hide(unit, 'text', hit === 'revealing-text' ? 'revealing-text' : 'text'); return true; }
    const u = RULES.first('unit', unit, { path: location.pathname, site: SITE });
    if (u) { hide(unit, 'text', u); return true; }
    return false;
  }

  // ---- images -------------------------------------------------------------------------------------------------------
  // A verdict: { flagged, why } with why 'clean', 'explicit' | 'sexy' | 'combined', or 'unjudged-<reason>'.
  async function ask(fn) {
    let r = null;
    try { r = await fn(); } catch (e) { r = { _error: 'bridge' }; }
    // Judged only when both judges answered (nsfwjs and the revealing-clothing model); otherwise "still checking".
    if (r && !r._error && typeof r === 'object' && 'Neutral' in r && 'Revealing' in r) { state.judged++; const why = RULES.first('image', r) ? (RULES.explain(r) || 'sexy') : 'clean'; return { flagged: why !== 'clean', why, scores: r }; }
    state.failed++;
    return { flagged: null, why: 'unjudged-' + ((r && r._error) || 'none') };
  }
  const verdicts = new Map(); // url key -> Promise<verdict>, judged ones only
  const scoresOf = new Map(); // url key -> the two judges' scores (for a hand-hidden picture's record)
  const keyOf = (url) => url.split('?')[0] + '?' + (url.split('?')[1] || '').replace(/(^|&)(_nc_\w+|oh|oe|ccb|edm|ig_cache_key)=[^&]*/g, '');
  // The judge takes one picture at a time, and a feed asks for dozens at once (every slide of every carousel, posts
  // below the screen). Asked all at once, the pictures on screen waited behind all of them: grey boxes for seconds
  // (Joe, 2026-11-12: "I spend most of my time looking at empty grey boxes"). So the page keeps the queue: a few in
  // flight (one being judged while the next are fetched), and each time one is done the next is the picture nearest
  // the screen: on screen first, then just below, a carousel's next slide, then the rest. Nothing is shown sooner
  // than before it is judged; only the order changes.
  // In flight: as many as the judge takes at a time (its lanes: two or three on the phone, clip.js) being judged, and
  // two more being fetched meanwhile. The bridge says how many lanes; until it has, the settings' number.
  let IN_FLIGHT = CFG.judgeInFlight || 4;
  try { Promise.resolve(BRIDGE.width && BRIDGE.width()).then((n) => { if (n > 0) { IN_FLIGHT = Math.min(8, n + 2); pump(); } }, () => {}); } catch {}
  const waiting = []; // { url, els: Set, resolve }
  const waitingByKey = new Map();
  let flying = 0;
  function nearness(els) {
    let best = Infinity;
    for (const el of els) {
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { best = Math.min(best, 1e7); continue; }
      const dy = r.bottom < 0 ? -r.bottom * 2 : r.top > innerHeight ? r.top - innerHeight : 0; // above the screen: scrolled past
      const dx = r.right <= 0 ? -r.right : r.left >= innerWidth ? r.left - innerWidth + 1 : 0;   // a carousel's other slides
      best = Math.min(best, dy + dx * 1.5);
    }
    return best;
  }
  function pump() {
    while (flying < IN_FLIGHT && waiting.length) {
      let at = 0, near = Infinity;
      for (let i = 0; i < waiting.length; i++) { const d = nearness(waiting[i].els); if (d < near) { near = d; at = i; if (d === 0) break; } }
      const job = waiting.splice(at, 1)[0];
      waitingByKey.delete(keyOf(job.url));
      // A picture no longer on the page (Instagram takes posts far above the screen out again): not judged at all, so
      // the judge is free for what is coming. If it is put back, it is asked for again.
      if (near === Infinity && job.els.size) { for (const el of job.els) imgDone.delete(el); state.dropped = (state.dropped || 0) + 1; job.resolve({ flagged: null, why: 'unjudged-gone' }); continue; }
      flying++;
      ask(() => BRIDGE.classifyUrl(job.url)).then(job.resolve, () => job.resolve({ flagged: null, why: 'unjudged-bridge' })).finally(() => { flying--; pump(); });
    }
  }
  function queued(url, el) {
    const key = keyOf(url);
    const w = waitingByKey.get(key);
    if (w) { if (el) w.els.add(el); return w.promise; }
    const job = { url, els: new Set(el ? [el] : []) };
    job.promise = new Promise((r) => { job.resolve = r; });
    waiting.push(job);
    waitingByKey.set(key, job);
    queueMicrotask(pump); // a batch of pictures added together is ordered as one
    return job.promise;
  }
  // A scroll changes what is nearest; the next pick reads it fresh, so nothing else to do here.
  function judgeUrl(url, el) {
    const key = keyOf(url);
    if (verdicts.has(key)) { const w = waitingByKey.get(key); if (w && el) w.els.add(el); return verdicts.get(key); }
    const p = queued(url, el).then((v) => { if (v.flagged === null) verdicts.delete(key); else { stat(v.flagged ? 'judged-flagged' : 'judged-clean'); scoresOf.set(key, v.scores); } return v; });
    verdicts.set(key, p);
    if (verdicts.size > 4000) verdicts.delete(verdicts.keys().next().value);
    return p;
  }

  const held = new WeakMap(); // unit -> Set of imgs held in it
  function holdIn(unit, img) { let s = held.get(unit); if (!s) held.set(unit, (s = new Set())); s.add(img); }
  // The picture an element shows: an <img>'s current source, or a CSS background (Instagram's reel and grid tiles are
  // often a <div> with an inline background-image, not an <img>).
  function srcOf(el) {
    if (el.tagName === 'IMG') return el.currentSrc || el.src || '';
    if (el.tagName === 'VIDEO') { const p = el.getAttribute('poster'); return p && isMediaUrl(p) ? new URL(p, location.href).href : ''; }
    const bg = (el.style && el.style.backgroundImage) || '';
    const m = bg.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    return m ? m[2] : '';
  }
  const imgDone = new WeakMap(); // element -> the src judged
  // A picture judged clean is let go. One that had been waiting where Joe could see it comes in with a short fade
  // instead of popping in (2026-11-12); one judged before it was ever on screen just shows. How long it waited on
  // screen is counted on the device in five steps (wait-0: under 0.15 s or never on screen, wait-1: under 0.6 s,
  // wait-2: under 1.5 s, wait-3: under 4 s, wait-4: longer), so the grey boxes can be measured on the phone itself.
  const onScreenAt = new WeakMap(); // a held picture -> when it first was on screen while held
  const waitIO = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && !onScreenAt.has(e.target)) onScreenAt.set(e.target, Date.now()); })
    : null;
  function show(el) {
    el.removeAttribute('data-igf-hold');
    if (waitIO) waitIO.unobserve(el);
    const at = onScreenAt.get(el);
    onScreenAt.delete(el);
    const ms = at ? Date.now() - at : 0;
    stat('wait-' + (ms < 150 ? 0 : ms < 600 ? 1 : ms < 1500 ? 2 : ms < 4000 ? 3 : 4));
    if (ms < 120 || !el.isConnected) return;
    el.setAttribute('data-igf-in', '');
    setTimeout(() => el.removeAttribute('data-igf-in'), 260);
  }
  function handleImg(img) {
    const src = srcOf(img);
    if (!src || !isMediaUrl(src) || imgDone.get(img) === src) return;
    imgDone.set(img, src);
    const unit = unitOf(img);
    releaseIfChanged(unit.closest ? unit.closest('[data-igf-for]') || unit : unit);
    if (gone(unit)) return;
    if (byHand.size) { const id = idOf(unit, img); if (id && byHand.has(id)) { hide(unit, 'image', 'by-hand'); return; } }
    if (checkText(unit)) return;
    img.setAttribute('data-igf-hold', '');
    holdIn(unit, img);
    if (waitIO) waitIO.observe(img);
    const go = async () => {
      const r = img.getBoundingClientRect();
      // On search and Explore pages every picture is judged, small avatars too (only small ones are kept there).
      const small = /^\/explore(\/|$)/.test(location.pathname) ? 0 : SMALL;
      if ((img.tagName !== 'IMG' || img.complete) && r.width > 0 && r.width < small && r.height < small) { img.removeAttribute('data-igf-hold'); return; }
      const v = await judgeUrl(src, img);
      if (srcOf(img) !== src) { handleImg(img); return; } // changed meanwhile (a srcset's other size): the new one is judged on its own
      if (!img.isConnected) return;
      const u = unitOf(img);
      // An account's avatar (search results, lists, a profile's header): only the picture goes, the row stays, so
      // he can still find people (Joe, 2026-11-05: "let's block the picture but keep the line").
      if (v.flagged && SITE === 'instagram' && isAvatar(img)) { img.setAttribute('data-igf-avatar', v.why); img.removeAttribute('data-igf-hold'); stat('hidden-avatar'); return; }
      if (v.flagged) hide(u, 'image', v.why);
      else if (v.flagged === false) show(img);
      else hide(u, 'checking', v.why);
    };
    if (img.tagName !== 'IMG') { requestAnimationFrame(go); return; } // a background: judged once laid out
    if (img.complete) { go(); return; }
    // Still loading. A picture whose box is already big enough to be judged is asked for now, while the page is still
    // loading it, so the answer is often there when the picture is (2026-11-12; before, the question waited for the
    // picture to finish loading). A small or not yet laid out one waits for its size, as before.
    const r0 = img.getBoundingClientRect();
    const small0 = /^\/explore(\/|$)/.test(location.pathname) ? 0 : SMALL;
    if (r0.width > 0 && r0.height > 0 && (r0.width >= small0 || r0.height >= small0)) { go(); return; }
    img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true });
  }

  // "Still checking": every held picture in the post is tried again; all clean shows it, one flagged hides it for good,
  // and after the last try it stays hidden as "could not be checked".
  const retries = new WeakMap();
  function retry(unit) {
    const n = retries.get(unit) || 0;
    if (n >= RETRY.length) { const vw = inViewer() && unit.hasAttribute('data-igf-slide-hold'), was = vw && onScreen(unit); unit.removeAttribute('data-igf-slide-hold'); if (vw) unit.setAttribute('data-igf-cover', ''); unit.setAttribute('data-igf-gone', 'unjudged'); state.removed++; if (vw) skipPast(unit, was); stat('hidden-' + (unit.getAttribute('data-igf-why') || 'unjudged')); return; }
    retries.set(unit, n + 1);
    setTimeout(async () => {
      if (kindOf(unit) !== 'checking') return;
      if (!unit.isConnected) return;
      const imgs = [...(held.get(unit) || [])].filter((i) => i.isConnected && i.hasAttribute('data-igf-hold'));
      let allClean = imgs.length > 0, last = 'unjudged-none';
      for (const img of imgs) {
        const v = await judgeUrl(srcOf(img), img);
        if (v.flagged) { hide(unit, 'image', v.why); return; }
        if (v.flagged === null) { allClean = false; last = v.why; }
      }
      if (allClean) {
        for (const img of imgs) { if (img.tagName === 'VIDEO') img.removeAttribute('data-igf-hold'); else show(img); }
        restore(unit);
        for (const v of imgs) if (v.tagName === 'VIDEO') { try { v.muted = true; if (onScreen(unit)) v.play(); } catch {} } // it plays, where it was
        return;
      }
      unit.setAttribute('data-igf-why', last);
      retry(unit);
    }, RETRY[n]);
  }

  // ---- videos -------------------------------------------------------------------------------------------------------
  const vids = new Set();
  const vidState = new WeakMap();
  function frameData(v) {
    try {
      if (v.readyState < 2 || !v.videoWidth) return null;
      const c = document.createElement('canvas');
      const k = 224 / Math.max(v.videoWidth, v.videoHeight);
      c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8); // throws on a tainted (cross-origin) frame
    } catch { return null; }
  }
  async function judgeFrame(v, first) {
    const data = frameData(v);
    let verdict = null;
    if (data) verdict = await ask(() => BRIDGE.classifyData(data));
    else if (!first && BRIDGE.classifyRect && !v.hasAttribute('data-igf-hold')) {
      const r = v.getBoundingClientRect();
      if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight) verdict = await ask(() => BRIDGE.classifyRect({ x: r.left, y: r.top, width: r.width, height: r.height }));
    }
    if (verdict && verdict.flagged) { hide(unitOf(v), 'video', verdict.why); return 'flagged'; }
    return verdict && verdict.flagged === false ? 'ok' : 'none';
  }
  function handleVideo(v) {
    if (vidState.has(v)) return;
    vidState.set(v, { last: 0 });
    vids.add(v);
    const unit = unitOf(v);
    if (gone(unit) || checkText(unit)) return;
    v.setAttribute('data-igf-hold', '');
    const wasMuted = v.muted;
    try { v.muted = true; } catch {} // no sound from a video not yet judged
    const release = () => { if (!gone(v)) { v.removeAttribute('data-igf-hold'); } };
    (async () => {
      const poster = v.getAttribute('poster');
      if (poster && isMediaUrl(poster)) {
        const pv = await judgeUrl(poster, v);
        if (pv.flagged) { hide(unitOf(v), 'video', pv.why); return; }
        // Not judged yet: the reel waits as "still checking" (held, tried again), never shown unjudged.
        if (pv.flagged === null) { const u = unitOf(v); holdIn(u, v); hide(u, 'checking', pv.why); return; }
      }
      // A first frame, drawn here while the video is still invisible (works when the frame is not cross-origin).
      const until = Date.now() + 4000;
      while (Date.now() < until && v.readyState < 2) await new Promise((r) => setTimeout(r, 150));
      const first = await judgeFrame(v, true);
      if (first === 'flagged') return;
      release();
      if (!wasMuted && v.muted && !gone(v)) { try { v.muted = false; } catch {} }
    })();
  }
  // While playing: a frame every two seconds (drawn here, or from the screen through the bridge).
  setInterval(() => {
    for (const v of vids) {
      if (!v.isConnected) { vids.delete(v); continue; }
      if (gone(v) || v.paused || v.hasAttribute('data-igf-hold')) continue;
      const st = vidState.get(v);
      if (st.busy || Date.now() - st.last < FRAME_EVERY) continue;
      st.busy = true; st.last = Date.now();
      judgeFrame(v, false).finally(() => { st.busy = false; });
    }
  }, 500);



  // ---- hidden by hand ---------------------------------------------------------------------------------------------
  // Joe, 2026-11-05: "Let's just add a settings button to report should be blocked", then "Something discrete" and
  // "Or just a block icon or something". The app's menu has a plain circle-slash; after it, the next picture or video
  // he taps is hidden at once, the same discreet way, and stays hidden on this device. A short record goes to the app
  // (IGFilterBridge.report): the post or media id, the two judges' scores, the rules that fired, the time and the surface.
  // Never the picture, never an address. No undo. One tap, or it lapses after 20 seconds (picking, below).
  const byHand = new Set();
  try { Promise.resolve(BRIDGE.byHand && BRIDGE.byHand()).then((ids) => { for (const id of ids || []) byHand.add(String(id)); recheckByHand(); }).catch(() => {}); } catch {}
  function idOf(unit, el) {
    const links = [];
    if (unit && unit.matches && unit.matches('a[href]')) links.push(unit);
    if (unit && unit.querySelectorAll) links.push(...unit.querySelectorAll('a[href]'));
    for (const a of links) {
      const h = a.getAttribute('href') || '';
      const m = h.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/) || h.match(/\/marketplace\/item\/(\d+)/) || h.match(/(?:story_fbid=|fbid=|\/posts\/|\/videos\/|\/reel\/)([\w-]{5,})/);
      if (m) return SITE + ':' + m[1];
    }
    const src = el && srcOf(el);
    const file = src && src.split('?')[0].split('/').pop();
    return file ? SITE + ':media:' + file.replace(/\.\w+$/, '').slice(0, 80) : null;
  }
  const surfaceOf = (unit) => {
    const p = location.pathname;
    if (/^\/explore/.test(p) || /^\/search/.test(p)) return 'search';
    if (/^\/stories/.test(p)) return 'story';
    if (/^\/(reels?|watch)\b/.test(p) || /\/reel\//.test(p)) return 'reel';
    if (onDirect()) return 'messages';
    if (unit && unit.tagName === 'A') return 'grid';
    if (/^\/(\?|$)/.test(p + location.search.slice(0, 1)) || p === '/') return 'feed';
    return unit && unit.matches && unit.matches('article, [role="article"]') ? 'feed' : 'profile';
  };
  function recheckByHand() {
    if (!byHand.size) return;
    for (const u of document.querySelectorAll(UNITS + ', img, video')) {
      const unit = u.tagName === 'IMG' || u.tagName === 'VIDEO' ? unitOf(u) : u;
      const id = idOf(unit, u.tagName === 'IMG' || u.tagName === 'VIDEO' ? u : null);
      if (id && byHand.has(id) && !kindOf(unit)) hide(unit, 'image', 'by-hand');
    }
  }
  // The picture under a tap: what the page shows there (Instagram lays a clear box over its pictures for its own taps,
  // so every element at the point is looked through), else any picture whose box holds the point.
  const PICKABLE = 'img, video, [style*="background-image"]';
  const bigEnough = (m) => { const r = m.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; };
  function pickAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.id === 'igf-pick' || el.id === 'igf-pick-tip') continue;
      if (el.closest('[data-igt-nav], nav, [role="navigation"]')) return null;
      if (el.matches(PICKABLE) && bigEnough(el)) return el;
    }
    let best = null, area = Infinity;
    for (const m of document.querySelectorAll(PICKABLE)) {
      const r = m.getBoundingClientRect();
      if (!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) || !bigEnough(m) || m.closest('[data-igt-nav], nav, [role="navigation"]')) continue;
      if (r.width * r.height < area) { area = r.width * r.height; best = m; } // the smallest: the slide, not the backdrop
    }
    return best;
  }
  function hideByHand(el) {
    const unit = unitOf(el);
    const id = idOf(unit, el);
    const src = srcOf(el);
    const scores = src ? scoresOf.get(keyOf(src)) || null : null;
    const text = textOf(unit);
    const rules = RULES.rules.filter((r) => { try { return r.kind === 'text' ? r.test(text) : r.kind === 'unit' ? r.test(unit, { path: location.pathname, site: SITE }) : false; } catch { return false; } }).map((r) => r.id);
    if (SITE === 'instagram' && RULES.account && RULES.account(text)) rules.push('account:' + RULES.account(text));
    if (id) byHand.add(id);
    if (SITE === 'instagram' && isAvatar(el)) { el.setAttribute('data-igf-avatar', 'by-hand'); el.removeAttribute('data-igf-hold'); stat('hidden-by-hand'); }
    else hide(unit, 'image', 'by-hand'); // counted as hidden-by-hand
    try { BRIDGE.report && BRIDGE.report({ id, site: SITE, surface: surfaceOf(unit), scores, rules, at: new Date().toISOString() }); } catch {}
  }
  // Picking (Joe, 2026-11-12: "I click it and then I have to click the picture but it doesn't hide anything"): it waited
  // for a click, and on Instagram a tap on a picture never becomes one (its double-tap-to-like and story taps take the
  // touch first), so nothing happened. Now, while picking, the page is covered by a faint layer that says "Tap a
  // picture to hide it", and every touch, pointer and mouse event is stopped at the window before Instagram sees it
  // (these listeners are the page's first, added at document start), so a tap in a story neither closes nor advances
  // it. The tap is read on touchend (or the click, with a mouse). The picture goes at once; the layer says "Hidden",
  // or "No picture there" if the tap was not on one, and picking ends. It lapses after 20 seconds.
  const TAP_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'gesturestart', 'gesturechange', 'gestureend'];
  const swallow = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  let pick = null; // { shield, tip, timer, done }
  function say(text, ms) {
    const tip = document.createElement('div');
    tip.id = 'igf-pick-tip';
    tip.textContent = text;
    (document.documentElement || document).appendChild(tip);
    setTimeout(() => tip.remove(), ms);
  }
  function endPick(message) {
    if (!pick) return;
    clearTimeout(pick.timer);
    pick.shield.remove();
    pick = null;
    // the touch's own leftovers (the mouse events WebKit makes after a touch) are still stopped for a moment
    afterPickUntil = Date.now() + 500;
    document.documentElement.removeAttribute('data-igf-picking');
    if (message) say(message, 1100);
  }
  let afterPickUntil = 0;
  function pickAtPoint(x, y) {
    const el = pickAt(x, y);
    if (!el) { endPick('No picture there'); return; }
    endPick('Hidden');
    try { hideByHand(el); } catch (e) { try { hide(unitOf(el), 'image', 'by-hand'); } catch {} }
  }
  function onPickEvent(e) {
    swallow(e);
    if (e.type === 'touchend') {
      const t = e.changedTouches && e.changedTouches[0];
      if (t && (!e.touches || e.touches.length === 0)) pickAtPoint(t.clientX, t.clientY);
    } else if (e.type === 'click') pickAtPoint(e.clientX, e.clientY);
  }
  function startPick() {
    if (pick) return;
    const root = document.documentElement;
    const shield = document.createElement('div');
    shield.id = 'igf-pick';
    const tip = document.createElement('div');
    tip.id = 'igf-pick-tip';
    tip.textContent = 'Tap a picture to hide it';
    shield.appendChild(tip);
    for (const ev of ['touchstart', 'touchmove']) shield.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root.appendChild(shield); // outside Instagram's own tree, so its re-renders leave it alone
    root.setAttribute('data-igf-picking', '');
    pick = { shield, timer: setTimeout(() => endPick(''), 20000) };
    for (const v of document.querySelectorAll('video')) { try { if (!v.paused && onScreen(v)) { v.pause(); setTimeout(() => { if (!gone(v)) { try { v.play(); } catch {} } }, 400); } } catch {} }
  }
  document.addEventListener('igf-pick', startPick);
  // The two-finger tap that opens the app's menu (Joe, 2026-11-12: "when I two finger tap in a story it closes the
  // story"): a touch with two or more fingers, and everything after it until every finger is up, never reaches the
  // page; the clicks and mouse events WebKit makes from it in the next moment are stopped too.
  let multi = false, multiUntil = 0, pointers = 0;
  const onGuard = (e) => {
    if (pick && (e.isTrusted || e.type === 'click')) { onPickEvent(e); return; } // (a click from a script: the app's tests)
    if (!e.isTrusted) return; // the filter's own clicks (a hidden story's Next) and the page's go through
    const now = Date.now();
    const t = e.type;
    if (t === 'pointerdown') pointers++;
    if (t === 'touchstart' && e.touches && e.touches.length >= 2) multi = true;
    if (t === 'pointerdown' && e.pointerType === 'touch' && pointers >= 2) multi = true;
    if (multi || now < multiUntil || now < afterPickUntil) {
      swallow(e);
      if (t === 'touchend' || t === 'touchcancel') { if (!e.touches || e.touches.length === 0) { multi = false; multiUntil = now + 600; } }
    }
    if (t === 'pointerup' || t === 'pointercancel') pointers = Math.max(0, pointers - 1);
    if (t === 'touchend' && e.touches && e.touches.length === 0) pointers = 0;
  };
  // touchstart and touchmove are listened to passively, so scrolling never waits on this script (stopping them still
  // works; while picking, the layer's touch-action:none and its own listeners below keep the page from moving).
  for (const ev of TAP_EVENTS) addEventListener(ev, onGuard, { capture: true, passive: ev === 'touchstart' || ev === 'touchmove' });

  // ---- accounts by name and bio (Instagram) ----------------------------------------------------------------------
  // Joe, 2026-11-05: "let's also do like a textual search. In like profile names or bios". A row in search results,
  // a follow list or a suggestion list whose username or name carries one of the terms (rules.js account()) goes
  // entirely. On a profile whose name or bio does, the header keeps only the name; the bio, its link, the avatar and
  // the posts, reels and tagged grids go.
  const RESERVED = /^(p|reel|reels|explore|direct|stories|accounts|tv|about|legal|developer|privacy|web|challenge|emails|session)$/;
  const profileOf = (href) => { const m = String(href || '').match(/^\/([A-Za-z0-9._]{1,30})\/?$/); return m && !RESERVED.test(m[1]) ? m[1] : null; };
  function isAvatar(img) {
    if (img.tagName !== 'IMG') return false;
    if (/profile picture/i.test(img.getAttribute('alt') || '')) return true;
    const a = img.closest('a[href]');
    const r = img.getBoundingClientRect();
    return !!a && !!profileOf(a.getAttribute('href')) && r.width > 0 && r.width <= 64;
  }
  // An element's text as its pieces joined by spaces (inline spans run together in innerText: "xo.bella🔞").
  function pieces(el, max = 1200) {
    const out = [], walk = document.createTreeWalker(el, 4);
    let n, len = 0;
    while ((n = walk.nextNode()) && len < max) {
      const t = n.data.trim();
      if (!t || (n.parentElement && n.parentElement.closest('[data-igf-bio]'))) continue;
      out.push(t); len += t.length + 1;
    }
    return out.join(' ');
  }
  const rowsSeen = new WeakMap();
  function checkAccountRows() {
    for (const a of document.querySelectorAll('a[href]')) {
      const who = profileOf(a.getAttribute('href'));
      if (!who || a.closest('article, header, [data-igt-nav], nav, [data-igf-gone]')) continue;
      // The row: the largest box around this link that holds no other account.
      let row = a;
      for (let i = 0; i < 5 && row.parentElement && row.parentElement !== document.body; i++) {
        const others = [...row.parentElement.querySelectorAll('a[href]')].map((x) => profileOf(x.getAttribute('href'))).filter((x) => x && x !== who);
        if (others.length || row.parentElement.querySelector('input, [data-igt-nav], nav')) break;
        row = row.parentElement;
      }
      const text = who + ' ' + pieces(row, 300);
      if (rowsSeen.get(row) === text) continue;
      rowsSeen.set(row, text);
      if (RULES.account(text)) hide(row, 'text', 'account-name');
    }
  }
  let profileDone = '', flaggedPath = '';
  function checkProfile() {
    const root = document.documentElement;
    const m = location.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/(reels\/|tagged\/)?$/);
    const who = m && !RESERVED.test(m[1]) ? m[1] : null;
    if (!who) { root.removeAttribute('data-igf-account'); profileDone = ''; flaggedPath = ''; return; }
    const header = document.querySelector('main header') || document.querySelector('header');
    if (!header) return;
    const text = who + ' ' + pieces(header);
    const key = location.pathname + '|' + text.length;
    if (profileDone === key) return;
    profileDone = key;
    // Once flagged, a profile stays flagged on that page (its header text shrinks as the bio goes).
    const kind = flaggedPath === location.pathname || RULES.account(text);
    if (!kind) { root.removeAttribute('data-igf-account'); return; }
    flaggedPath = location.pathname;
    if (!root.hasAttribute('data-igf-account')) stat('hidden-account-bio');
    root.setAttribute('data-igf-account', '');
    for (const img of header.querySelectorAll('img')) { img.setAttribute('data-igf-avatar', 'account'); img.removeAttribute('data-igf-hold'); }
    // The header keeps only the name: everything that is not the name's heading goes.
    const keep = (el) => {
      for (const c of [...el.children]) {
        if (c.matches('h1, h2')) continue;
        if (!c.querySelector('h1, h2')) { c.setAttribute('data-igf-bio', ''); continue; } // the avatar, the bio, its link, the counts
        keep(c);
      }
    };
    keep(header);
  }
  let accountsNow = () => {};
  if (SITE === 'instagram') {
    let accRuns = 0, accTimer = 0;
    const accounts = accountsNow = () => {
      accTimer = 0;
      try { checkAccountRows(); checkProfile(); accRuns++; } catch (e) { accRuns = -1; }
      if (document.documentElement) document.documentElement.setAttribute('data-igf-acc', String(accRuns)); // for the tests
    };
    setInterval(accounts, 700);
    document.addEventListener('DOMContentLoaded', accounts, { once: true });
    new MutationObserver(() => { if (!accTimer) accTimer = setTimeout(accounts, 150); }).observe(document, { childList: true, subtree: true });
  }

  // ---- watching the page --------------------------------------------------------------------------------------------
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'IMG') handleImg(root);
    else if (root.tagName === 'VIDEO') handleVideo(root);
    else if (root.style && root.style.backgroundImage) handleImg(root);
    if (!root.querySelectorAll) return;
    for (const img of root.querySelectorAll('img, [style*="background-image"]')) handleImg(img);
    for (const v of root.querySelectorAll('video')) handleVideo(v);
  }
  // What a post is, for the text and structure rules: Instagram's article or grid tile; Facebook's article, feed unit
  // or Marketplace tile.
  const UNITS = SITE === 'facebook' ? '[role="article"], [data-pagelet^="FeedUnit"], ' + FB_TILE : 'article, a[href*="/p/"], a[href*="/reel/"]';
  const textQueue = new Set();
  let textTimer = 0;
  function queueText(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || (el.classList && el.classList.contains('igf-ph'))) return;
    const unit = el.closest(UNITS);
    if (unit) textQueue.add(unit);
    if (!textTimer) textTimer = setTimeout(() => { textTimer = 0; for (const u of textQueue) checkText(u); textQueue.clear(); }, 120);
  }
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') {
        const t = m.target;
        if (t.tagName === 'IMG' || (m.attributeName === 'style' && t.style && t.style.backgroundImage)) handleImg(t);
        else if (t.tagName === 'VIDEO') {
          // A viewer's video element given the next reel or story: judged again from the start.
          if (inViewer() && vidState.has(t) && (m.attributeName === 'poster' || m.attributeName === 'src')) {
            const u = unitOf(t);
            releaseIfChanged(u.closest ? u.closest('[data-igf-for]') || u : u);
            vidState.delete(t);
          }
          handleVideo(t);
        }
        continue;
      }
      for (const n of m.addedNodes) { if (n.nodeType === 1) { scan(n); queueText(n); } else if (n.nodeType === 3) queueText(n); }
      if (m.type === 'characterData') queueText(m.target);
    }
    if (!document.getElementById('igf-style')) addStyle();
  });
  mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'style'] });
  // Instagram's feed held still (hold(), above): looked at whenever posts are put in or taken out, a picture finishes
  // loading (its post may grow), and on every scroll (which also notes the post now on screen).
  if (HOLD) {
    state.hold = hold; // ig-seen.js collapses posts too, and keeps the place through this
    new MutationObserver(hold).observe(document, { childList: true, subtree: true });
    document.addEventListener('load', hold, true);
    addEventListener('scroll', hold, { capture: true, passive: true });
    addEventListener('resize', hold, { passive: true });
  }
  // The first pass also judges the text already on the page (posts parsed before the observer saw them).
  const allUnits = () => document.querySelectorAll(UNITS);
  // "Filter done": data-igf-pass counts the whole-page passes finished (pictures sent to the judges, text and account
  // checks done). The first is at load; the app tests wait on it instead of on time.
  let passes = 0;
  const passDone = () => { passes++; if (document.documentElement) document.documentElement.setAttribute('data-igf-pass', String(passes)); };
  const start = () => {
    addStyle();
    scan(document.documentElement);
    for (const u of allUnits()) checkText(u);
    accountsNow();
    state.ready = true;
    passDone();
  };
  // Instagram builds its pages late; a second look catches text the observer batched away.
  setTimeout(() => { for (const u of allUnits()) checkText(u); accountsNow(); passDone(); }, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
