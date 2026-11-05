// The Instagram filter, in the page (Joe, 2026-11-05; locked memory entry 21). Runs at document start on instagram.com
// in the iPhone Browser, in the Instagram app built from it, and in the laptop extension. The rules are in rules.js;
// the image classifier is reached through IGFilterBridge, which each place provides:
//   IGFilterBridge.classifyUrl(url)   -> Promise<scores | {_error} | null>   an image on Instagram's CDN, judged on the device
//   IGFilterBridge.classifyData(data) -> Promise<scores | {_error} | null>   a data: URL (a video frame drawn here)
//   IGFilterBridge.classifyRect(rect) -> Promise<scores | {_error} | null>   what is on screen there (a playing video), optional
//   IGFilterBridge.stat(name)         -> count one event on the device (why a post was hidden), optional
//   IGFilterBridge.warm()             -> start loading the model now, optional
//
// Surfaces: the feed (<article>), post pages, profile grids (posts, reels, tagged), Explore and search grids, the reel
// viewer, stories, messages; pictures as <img> or as a CSS background on the tile; avatars and story rings only when
// they are shown large (120 px or more).
// What it does: a post or Reel that a rule flags is hidden without a word (Joe, 2026-11-05: "i'd prefer not to label the
// pictures. Keep it more discrete"): in the feed and the reel viewer it collapses as if it were not there; in a grid the
// tile stays as a plain blank tile in the page's own colour, so the grid does not reflow. There is no reveal, no blur, no
// setting and no switch; a blank tile cannot be tapped. Pictures from Instagram's CDN are held invisible until judged.
// One that could not be judged yet (the model still loading, the picture not readable) is hidden the same way and tried
// again at 5, 20 and 60 seconds: it fills in quietly once judged clean, and stays hidden if flagged or never judged.
// The reason is counted on the device (IGFilterBridge.stat), never shown on the page. Videos are judged by their
// poster, a drawn frame, then every two seconds while they play. Feed, Reels, messages, profiles and posting stay.
(function () {
  'use strict';
  const g = globalThis;
  if (g.__igFilter) return;
  if (!/(^|\.)instagram\.com$/i.test(location.hostname)) return;
  const RULES = g.IGFilterRules;
  const BRIDGE = g.IGFilterBridge;
  if (!RULES || !BRIDGE) return;

  const MEDIA_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
  const SMALL = 120;           // rendered px: avatars, icons and story rings are not judged
  const FRAME_EVERY = 2000;    // ms between frame checks while a video plays
  const RETRY = g.__igFilterRetry || [5000, 20000, 60000]; // tests shorten it; nothing on the page can reach it
  const state = { removed: 0, judged: 0, failed: 0, ready: false };
  g.__igFilter = state;
  const stat = (name) => { try { BRIDGE.stat && BRIDGE.stat(name); } catch {} };
  try { BRIDGE.warm && BRIDGE.warm(); } catch {}

  // ---- styles: held media is invisible; a hidden post is gone, a hidden grid tile is blank, nothing answers a tap ------
  const css = [
    '[data-igf-hold]{visibility:hidden !important}',
    '[data-igf-gone]:not([data-igf-tile]){display:none !important}',
    '[data-igf-tile]{pointer-events:none !important}',
    '[data-igf-tile]>:not(.igf-ph){display:none !important}',
    '.igf-ph{display:block !important;width:100%;background:transparent;pointer-events:none}',
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
  const onDirect = () => location.pathname.startsWith('/direct');

  // ---- the post a piece of media belongs to ------------------------------------------------------------------------
  // Feed and post pages: <article>. Grids (profile, Explore, search, the Reels tab of a profile): the tile's link.
  // Reels and stories: the largest ancestor that holds this one video. Messages: the media itself, so a thread stays.
  function unitOf(el) {
    if (onDirect()) return el;
    const a = el.closest('article');
    if (a) return a;
    const tile = el.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]');
    if (tile) return tile;
    let u = el;
    // Up to the largest box that holds only this one piece (at most one video and one picture), so hiding one reel or
    // story never takes its neighbours with it.
    const one = (p) => p.querySelectorAll('video').length <= 1 && p.querySelectorAll('img, [style*="background-image"]').length <= 1;
    while (u.parentElement && u.parentElement !== document.body && one(u.parentElement)) u = u.parentElement;
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
  const isTile = (unit) => unit.tagName === 'A' && /\/(p|reel|reels|tv)\//.test(unit.getAttribute('href') || '') && !unit.closest('article');
  function placeholder(unit) {
    if (!isTile(unit) || [...unit.children].some((c) => c.classList && c.classList.contains('igf-ph'))) return;
    const r = unit.getBoundingClientRect();
    unit.setAttribute('data-igf-tile', '');
    const ph = document.createElement('div');
    ph.className = 'igf-ph';
    if (r.height > 0) ph.style.height = Math.round(r.height) + 'px'; else ph.style.aspectRatio = '1';
    unit.prepend(ph);
  }
  const kindOf = (unit) => unit && unit.getAttribute && unit.getAttribute('data-igf-gone');
  /** Hides a post. kind: 'text', 'image', 'video' (for good) or 'checking' (to be tried again). */
  function hide(unit, kind, why) {
    if (!unit) return;
    const was = kindOf(unit);
    if (was && was !== 'checking') return;      // already hidden for good
    if (was === 'checking' && kind === 'checking') return;
    unit.setAttribute('data-igf-gone', kind);
    unit.setAttribute('data-igf-why', why || kind);
    for (const v of unit.tagName === 'VIDEO' ? [unit] : unit.querySelectorAll('video')) { try { v.muted = true; v.pause(); } catch {} }
    placeholder(unit);
    if (kind !== 'checking') { state.removed++; stat('hidden-' + (why || kind)); }
    else { stat('checking-' + (why || 'unjudged')); retry(unit); }
  }
  // Shown again only when every held picture in it has now been judged clean (no tap, no control: the verdict).
  function restore(unit) {
    if (kindOf(unit) !== 'checking') return;
    unit.removeAttribute('data-igf-gone');
    unit.removeAttribute('data-igf-why');
    unit.removeAttribute('data-igf-tile');
    const ph = [...unit.children].find((c) => c.classList && c.classList.contains('igf-ph'));
    if (ph) ph.remove();
    stat('restored');
  }
  const gone = (el) => { const u = el.closest && el.closest('[data-igf-gone]'); return !!u && kindOf(u) !== 'checking'; };

  // ---- text ---------------------------------------------------------------------------------------------------------
  const textSeen = new WeakMap();
  function checkText(unit) {
    if (gone(unit)) return true;
    const t = textOf(unit);
    if (textSeen.get(unit) === t.length) return false;
    textSeen.set(unit, t.length);
    const hit = RULES.first('text', t, unit);
    if (hit) { hide(unit, 'text', 'text'); return true; }
    const u = RULES.first('unit', unit, { path: location.pathname });
    if (u) { hide(unit, 'text', u); return true; }
    return false;
  }

  // ---- images -------------------------------------------------------------------------------------------------------
  // A verdict: { flagged, why } with why 'clean', 'explicit' | 'sexy' | 'combined', or 'unjudged-<reason>'.
  async function ask(fn) {
    let r = null;
    try { r = await fn(); } catch (e) { r = { _error: 'bridge' }; }
    if (r && !r._error && typeof r === 'object' && 'Neutral' in r) { state.judged++; const why = RULES.first('image', r) ? (RULES.explain(r) || 'sexy') : 'clean'; return { flagged: why !== 'clean', why }; }
    state.failed++;
    return { flagged: null, why: 'unjudged-' + ((r && r._error) || 'none') };
  }
  const verdicts = new Map(); // url key -> Promise<verdict>, judged ones only
  const keyOf = (url) => url.split('?')[0] + '?' + (url.split('?')[1] || '').replace(/(^|&)(_nc_\w+|oh|oe|ccb|edm|ig_cache_key)=[^&]*/g, '');
  function judgeUrl(url) {
    const key = keyOf(url);
    if (verdicts.has(key)) return verdicts.get(key);
    const p = ask(() => BRIDGE.classifyUrl(url)).then((v) => { if (v.flagged === null) verdicts.delete(key); else stat(v.flagged ? 'judged-flagged' : 'judged-clean'); return v; });
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
    const bg = (el.style && el.style.backgroundImage) || '';
    const m = bg.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    return m ? m[2] : '';
  }
  const imgDone = new WeakMap(); // element -> the src judged
  function handleImg(img) {
    const src = srcOf(img);
    if (!src || !isMediaUrl(src) || imgDone.get(img) === src) return;
    imgDone.set(img, src);
    const unit = unitOf(img);
    if (gone(unit)) return;
    if (checkText(unit)) return;
    img.setAttribute('data-igf-hold', '');
    holdIn(unit, img);
    const go = async () => {
      const r = img.getBoundingClientRect();
      if ((img.tagName !== 'IMG' || img.complete) && r.width > 0 && r.width < SMALL && r.height < SMALL) { img.removeAttribute('data-igf-hold'); return; }
      const v = await judgeUrl(src);
      if (srcOf(img) !== src) return; // changed meanwhile; the new src is judged on its own
      const u = unitOf(img);
      if (v.flagged) hide(u, 'image', v.why);
      else if (v.flagged === false) img.removeAttribute('data-igf-hold');
      else hide(u, 'checking', v.why);
    };
    if (img.tagName !== 'IMG') { requestAnimationFrame(go); return; } // a background: judged once laid out
    if (img.complete) go(); else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }); }
  }

  // "Still checking": every held picture in the post is tried again; all clean shows it, one flagged hides it for good,
  // and after the last try it stays hidden as "could not be checked".
  const retries = new WeakMap();
  function retry(unit) {
    const n = retries.get(unit) || 0;
    if (n >= RETRY.length) { unit.setAttribute('data-igf-gone', 'unjudged'); state.removed++; stat('hidden-' + (unit.getAttribute('data-igf-why') || 'unjudged')); return; }
    retries.set(unit, n + 1);
    setTimeout(async () => {
      if (kindOf(unit) !== 'checking') return;
      if (!unit.isConnected) return;
      const imgs = [...(held.get(unit) || [])].filter((i) => i.isConnected && i.hasAttribute('data-igf-hold'));
      let allClean = imgs.length > 0, last = 'unjudged-none';
      for (const img of imgs) {
        const v = await judgeUrl(srcOf(img));
        if (v.flagged) { hide(unit, 'image', v.why); return; }
        if (v.flagged === null) { allClean = false; last = v.why; }
      }
      if (allClean) { for (const img of imgs) img.removeAttribute('data-igf-hold'); restore(unit); return; }
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
      if (poster && isMediaUrl(poster)) { const pv = await judgeUrl(poster); if (pv.flagged) { hide(unitOf(v), 'video', pv.why); return; } }
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
  const textQueue = new Set();
  let textTimer = 0;
  function queueText(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || (el.classList && el.classList.contains('igf-ph'))) return;
    const unit = el.closest('article') || el.closest('a[href*="/p/"], a[href*="/reel/"]');
    if (unit) textQueue.add(unit);
    if (!textTimer) textTimer = setTimeout(() => { textTimer = 0; for (const u of textQueue) checkText(u); textQueue.clear(); }, 120);
  }
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') {
        const t = m.target;
        if (t.tagName === 'IMG' || (m.attributeName === 'style' && t.style && t.style.backgroundImage)) handleImg(t);
        else if (t.tagName === 'VIDEO') handleVideo(t);
        continue;
      }
      for (const n of m.addedNodes) { if (n.nodeType === 1) { scan(n); queueText(n); } else if (n.nodeType === 3) queueText(n); }
      if (m.type === 'characterData') queueText(m.target);
    }
    if (!document.getElementById('igf-style')) addStyle();
  });
  mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'style'] });
  // The first pass also judges the text already on the page (posts parsed before the observer saw them).
  const allUnits = () => document.querySelectorAll('article, a[href*="/p/"], a[href*="/reel/"]');
  const start = () => {
    addStyle();
    scan(document.documentElement);
    for (const u of allUnits()) checkText(u);
    state.ready = true;
  };
  // Instagram builds its pages late; a second look catches text the observer batched away.
  setTimeout(() => { for (const u of allUnits()) checkText(u); }, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
