// The Instagram filter, in the page (Joe, 2026-11-05; locked memory entry 21). Runs at document start on instagram.com
// in the iPhone Browser, in the Instagram app built from it, and in the laptop extension. The rules are in rules.js;
// the image classifier is reached through IGFilterBridge, which each place provides:
//   IGFilterBridge.classifyUrl(url)   -> Promise<scores|null>   an image on Instagram's CDN, fetched and judged on the device
//   IGFilterBridge.classifyData(data) -> Promise<scores|null>   a data: URL (a video frame drawn here)
//   IGFilterBridge.classifyRect(rect) -> Promise<scores|null>   what is on screen in that rect (a playing video), optional
//
// What it does: a post or Reel that a rule flags is removed outright (display: none, video paused). There is no
// reveal, no blur, no setting and no switch. Images from Instagram's CDN are held invisible until judged, so a flagged
// one never shows; an image that cannot be judged (twice) is treated as flagged. Videos are judged by their poster, a
// drawn frame, and then every two seconds while they play. Feed, Reels, messages, profiles and posting stay as they are.
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
  const state = { removed: 0, judged: 0, failed: 0, ready: false };
  g.__igFilter = state;

  // ---- styles: held media is invisible; removed posts are gone ------------------------------------------------------
  const css = '[data-igf-hold]{visibility:hidden !important}[data-igf-gone]{display:none !important}';
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
    while (u.parentElement && u.parentElement !== document.body && u.parentElement.querySelectorAll('video, img').length <= 2) u = u.parentElement;
    return u;
  }

  function textOf(unit) {
    let t = unit.innerText || '';
    for (const img of unit.querySelectorAll('img[alt]')) t += '\n' + img.getAttribute('alt');
    return t.slice(0, 6000);
  }

  // ---- removing -----------------------------------------------------------------------------------------------------
  function remove(unit, why) {
    if (!unit || unit.hasAttribute('data-igf-gone')) return;
    unit.setAttribute('data-igf-gone', why);
    for (const v of unit.querySelectorAll('video')) { try { v.muted = true; v.pause(); } catch {} }
    if (unit.tagName === 'VIDEO') { try { unit.muted = true; unit.pause(); } catch {} }
    state.removed++;
  }
  const gone = (el) => !!el.closest('[data-igf-gone]');

  // ---- text ---------------------------------------------------------------------------------------------------------
  const textSeen = new WeakMap();
  function checkText(unit) {
    if (gone(unit)) return true;
    const t = textOf(unit);
    if (textSeen.get(unit) === t.length) return false;
    textSeen.set(unit, t.length);
    const hit = RULES.first('text', t, unit);
    if (hit) { remove(unit, hit); return true; }
    const u = RULES.first('unit', unit, { path: location.pathname });
    if (u) { remove(unit, u); return true; }
    return false;
  }

  // ---- images -------------------------------------------------------------------------------------------------------
  const verdicts = new Map(); // url -> Promise<boolean flagged>
  function judgeUrl(url) {
    const key = url.split('?')[0] + '?' + (url.split('?')[1] || '').replace(/(^|&)(_nc_\w+|oh|oe|ccb|edm|ig_cache_key)=[^&]*/g, '');
    if (verdicts.has(key)) return verdicts.get(key);
    const p = (async () => {
      for (let i = 0; i < 2; i++) {
        let s = null;
        try { s = await BRIDGE.classifyUrl(url); } catch {}
        if (s) { state.judged++; return !!RULES.first('image', s); }
      }
      state.failed++;
      return true; // could not be judged: treated as flagged
    })();
    verdicts.set(key, p);
    if (verdicts.size > 4000) verdicts.delete(verdicts.keys().next().value);
    return p;
  }

  const imgDone = new WeakMap(); // img -> the src judged
  function handleImg(img) {
    const src = img.currentSrc || img.src;
    if (!src || !isMediaUrl(src) || imgDone.get(img) === src) return;
    imgDone.set(img, src);
    const unit = unitOf(img);
    if (gone(unit)) return;
    if (checkText(unit)) return;
    img.setAttribute('data-igf-hold', '');
    const go = async () => {
      const r = img.getBoundingClientRect();
      if (img.complete && r.width > 0 && r.width < SMALL && r.height < SMALL) { img.removeAttribute('data-igf-hold'); return; }
      const flagged = await judgeUrl(src);
      if ((img.currentSrc || img.src) !== src) return; // changed meanwhile; the new src is judged on its own
      if (flagged) remove(unitOf(img), 'suggestive-image');
      else img.removeAttribute('data-igf-hold');
    };
    if (img.complete) go(); else img.addEventListener('load', go, { once: true }), img.addEventListener('error', go, { once: true });
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
    let s = null;
    if (data) { try { s = await BRIDGE.classifyData(data); } catch {} }
    else if (!first && BRIDGE.classifyRect && !v.hasAttribute('data-igf-hold')) {
      const r = v.getBoundingClientRect();
      if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight) {
        try { s = await BRIDGE.classifyRect({ x: r.left, y: r.top, width: r.width, height: r.height }); } catch {}
      }
    }
    if (s) { state.judged++; if (RULES.first('image', s)) { remove(unitOf(v), 'suggestive-video'); return 'flagged'; } return 'ok'; }
    return data ? 'error' : 'none';
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
      if (poster && isMediaUrl(poster) && (await judgeUrl(poster))) { remove(unitOf(v), 'suggestive-video'); return; }
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
    for (const img of root.querySelectorAll ? root.querySelectorAll('img') : []) handleImg(img);
    for (const v of root.querySelectorAll ? root.querySelectorAll('video') : []) handleVideo(v);
  }
  const textQueue = new Set();
  let textTimer = 0;
  function queueText(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return;
    const unit = el.closest('article') || el.closest('a[href*="/p/"], a[href*="/reel/"]');
    if (unit) textQueue.add(unit);
    if (!textTimer) textTimer = setTimeout(() => { textTimer = 0; for (const u of textQueue) checkText(u); textQueue.clear(); }, 120);
  }
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') { if (m.target.tagName === 'IMG') handleImg(m.target); else if (m.target.tagName === 'VIDEO') handleVideo(m.target); continue; }
      for (const n of m.addedNodes) { if (n.nodeType === 1) { scan(n); queueText(n); } else if (n.nodeType === 3) queueText(n); }
      if (m.type === 'characterData') queueText(m.target);
    }
    if (!document.getElementById('igf-style')) addStyle();
  });
  mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster'] });
  // The first pass also judges the text already on the page (posts parsed before the observer saw them).
  const start = () => {
    addStyle();
    scan(document.documentElement);
    for (const u of document.querySelectorAll('article, a[href*="/p/"], a[href*="/reel/"]')) checkText(u);
    state.ready = true;
  };
  // Instagram builds its pages late; a second look catches text the observer batched away.
  setTimeout(() => { for (const u of document.querySelectorAll('article, a[href*="/p/"], a[href*="/reel/"]')) checkText(u); }, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
