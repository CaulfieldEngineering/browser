// Flicker on Instagram's feed (Joe, 2026-11-15: "our instagram feed filter just isn't cutting it. Its infuriatingly
// glitchy and is gonna give me epilepsy").
//   node filter/test/ig-flicker.test.mjs            (Chromium; ENGINE=webkit for WebKit)
// A feed built the way Instagram builds it: only the posts near the screen are in the page (its virtual list, as in
// /vfeed/ of ig-filter.test.mjs), so a post scrolled away and back is a NEW element; and React's re-renders, which put
// a new <img> in for the same picture while it is on screen. Pictures: plain, flagged, one judged slowly, carousels,
// videos, a caption the text rules take, and pictures the judge cannot answer at first (the model still loading).
// What is measured, every frame, for every picture on screen, keyed by its address (so a new element for the same
// picture counts as the same picture):
//   reveals  held (on screen, invisible) and then shown: must be at most 1 per picture over the whole session
//   unshows  shown and then held again while on screen: must be 0
//   flagged  frames in which a flagged picture was shown: must be 0
//   fades    the reveal fade started: at most 1 per picture
//   bounces  a post's height changing between whole and collapsed more than once (the first removal of a post never
//            seen before is its one change): must be 0. And a post on screen never collapses under the eyes.
// Run before the fix (git stash) it shows the cause; after it, every number is in bounds.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const pw = require('playwright');
const engine = pw[process.env.ENGINE || 'chromium'];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CDN = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15';

const feed = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=390"><style>html,body{margin:0}
 ul.s{display:flex;overflow-x:auto;margin:0;padding:0;width:390px} ul.s li{flex:0 0 390px;list-style:none}</style></head><body>
<div style="height:120px">stories</div><main role="main"><div id="vroot"><div id="vlist"></div></div></main>
<script>
 const N = 36, EST = 100, OVER = 3;
 const kind = (i) => i % 7 === 3 ? 'flag' : i % 11 === 5 ? 'text' : i % 9 === 2 ? 'carousel' : i % 8 === 6 ? 'video' : i % 10 === 1 ? 'slow' : i % 13 === 4 ? 'late' : 'plain';
 window.kindOf = kind;
 const sizes = new Map(), getSize = (i) => sizes.has(i) ? sizes.get(i) : EST;
 const dist = (a, b) => { let e = 0; for (let r = a; r < b; r++) e += getSize(r); return e; };
 const getIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) return r; return n; };
 const getLastIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) { if (r + 1 < n && getSize(r + 1) === 0) continue; return r; } return n; };
 const zeros = (a, b) => { let e = 0; for (let r = a; r < b; r++) if (getSize(r) === 0) e++; return e; };
 const root = document.getElementById('vroot'), list = document.getElementById('vlist'), kids = new Map();
 let state = { renderStart: 0, renderEnd: 3, visibleStart: 0, visibleEnd: 0 };
 const pic = (name, h) => '<img src="${CDN}/' + name + '.jpg" style="width:390px;height:' + h + 'px;display:block" alt="">';
 const media = (i) => {
   const k = kind(i), h = 420 + (i % 4) * 40;
   if (k === 'carousel') return '<ul class="s">' + [0, 1, 2].map((s) => '<li>' + pic('plain-c' + i + '-' + s, h) + '</li>').join('') + '</ul>';
   if (k === 'video') return '<video poster="${CDN}/plain-v' + i + '.jpg" muted playsinline style="width:390px;height:' + h + 'px;display:block"></video>';
   if (k === 'flag') return pic('flag-f' + i, h);
   if (k === 'slow') return pic('slowjudge-s' + i, h);
   if (k === 'late') return pic('late-l' + i, h);
   return pic('plain-p' + i, h);
 };
 const make = (i) => { const a = document.createElement('article'); a.dataset.i = i;
   a.innerHTML = '<header style="height:40px"><a href="/acct' + i + '/">acct' + i + '</a></header><div class="m">' + media(i) + '</div><a href="/p/FLK' + i + 'x/"><time>1h</time></a><div style="height:30px">' + (kind(i) === 'text' ? 'New drop #lingerie' : 'post ' + i) + '</div>'; return a; };
 const measures = []; let framed = false;
 const flush = () => { framed = false; let f; while ((f = measures.shift())) f(); };
 const measure = (f) => { measures.push(f); if (!framed) { framed = true; requestAnimationFrame(flush); } };
 function render() {
   const end = Math.min(state.renderEnd, N);
   for (const [i, el] of kids) if (i < state.renderStart || i >= end) { el.remove(); kids.delete(i); }
   for (let i = state.renderStart; i < end; i++) if (!kids.has(i)) {
     const next = [...kids.keys()].filter((k) => k > i).sort((a, b) => a - b)[0];
     const el = make(i); list.insertBefore(el, next === undefined ? null : kids.get(next)); kids.set(i, el);
   }
   list.style.cssText = 'display:flex;flex-direction:column;position:relative;padding-top:' + dist(0, state.renderStart) + 'px;padding-bottom:' + dist(state.renderEnd, N) + 'px';
   measure(() => {
     const rs = state.renderStart;
     for (let l = 0; l < list.children.length; l++) {
       const c = list.children[l], e = c.getBoundingClientRect(), n = c.nextElementSibling;
       const u = e.height === 0 ? 0 : n ? n.getBoundingClientRect().top - e.top : list.getBoundingClientRect().bottom - parseFloat(list.style.paddingBottom) - e.top;
       if (getSize(rs + l) !== u) sizes.set(rs + l, u);
     }
   });
 }
 function update() {
   measure(() => {
     const scrollStart = Math.max(0, -root.getBoundingClientRect().top), viewportSize = innerHeight;
     Promise.resolve().then(() => {
       const l = getIndex(scrollStart, N), s = getLastIndex(scrollStart + viewportSize, N) + 1;
       const ns = { renderEnd: s + OVER + zeros(s, N), renderStart: Math.max(0, l - OVER - zeros(0, l)), visibleEnd: s, visibleStart: l };
       if (ns.renderEnd !== state.renderEnd || ns.renderStart !== state.renderStart || ns.visibleEnd !== state.visibleEnd || ns.visibleStart !== state.visibleStart) { state = ns; render(); }
     });
   });
 }
 addEventListener('scroll', update, { capture: true, passive: true });
 render(); update();
 // React's re-renders: a new <img> for the same picture, and the same src set again, on the posts in the page.
 setInterval(() => {
   for (const a of list.children) {
     const img = a.querySelector('.m > img');
     if (img && Math.random() < 0.5) { const n = document.createElement('img'); n.src = img.getAttribute('src'); n.style.cssText = img.style.cssText; n.alt = ''; img.replaceWith(n); }
     else if (img) img.setAttribute('src', img.getAttribute('src'));
   }
 }, 200);
</script></body></html>`;

// The judge: one picture at a time, about as fast as the phone's. "late" cannot be judged on its first two asks.
const fakeBridge = `globalThis.__igFilterRetry = [300, 600, 900];
globalThis.__igFilterLate = 1200;
globalThis.IGFilterBridge = (() => {
  let chain = Promise.resolve();
  const tries = {};
  const clean = { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 };
  return {
    stats: {}, stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
    classifyUrl(u) {
      const ms = /slowjudge/.test(u) ? 700 : 60;
      return (chain = chain.then(() => new Promise((r) => setTimeout(() => {
        const f = u.split('/').pop();
        if (/late/.test(u)) { tries[f] = (tries[f] || 0) + 1; if (tries[f] <= 2) return r({ _error: 'loading' }); }
        r(/flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 } : clean);
      }, ms))));
    },
    classifyData() { return Promise.resolve(clean); },
    report() {}, byHand() { return Promise.resolve([]); }, seenOn() { return Promise.resolve(true); },
  };
})();`;

// The sampler, in the page: every frame, every picture on screen.
const sampler = `(() => {
  const S = globalThis.__flick = { reveals: {}, unshows: {}, flagged: 0, fades: {}, bounces: {}, changes: {}, lastTop: {}, lastBottom: {}, onScreenCollapse: {}, frames: 0, last: {}, post: {} };
  const keyOf = (el) => { const s = el.tagName === 'VIDEO' ? el.getAttribute('poster') : el.getAttribute('src'); return s ? s.split('/').pop() : ''; };
  const collapsed = (a) => a.getBoundingClientRect().height <= 1;
  const shown = (el) => {
    if (el.hasAttribute('data-igf-hold')) return false;
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; }
    const a = el.closest('article'); return !(a && collapsed(a));
  };
  const look = () => {
    S.frames++;
    const now = {};
    for (const el of document.querySelectorAll('article img, article video')) {
      const r = el.getBoundingClientRect(); if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue;
      const k = keyOf(el); if (!k) continue;
      const v = shown(el); now[k] = now[k] || v;
    }
    for (const [k, v] of Object.entries(now)) {
      const was = S.last[k];
      if (v && /flag/.test(k)) S.flagged++;
      if (was === false && v) S.reveals[k] = (S.reveals[k] || 0) + 1;
      if (was === true && !v) S.unshows[k] = (S.unshows[k] || 0) + 1;
    }
    S.last = now; // a picture not on screen this frame starts over (scrolled away and back is not a reveal)
    for (const a of document.querySelectorAll('article')) {
      const i = a.dataset.i, c = collapsed(a), p = S.post[i];
      if (p === undefined) S.post[i] = c; else if (p !== c) { S.post[i] = c; S.changes[i] = (S.changes[i] || 0) + 1; if (S.changes[i] > 1) S.bounces[i] = S.changes[i] - 1; if (c) { const r = a.getBoundingClientRect(); if (S.lastTop[i] !== undefined && S.lastTop[i] < innerHeight && S.lastBottom[i] > 0) S.onScreenCollapse[i] = 1; } }
      if (!c) { const r = a.getBoundingClientRect(); S.lastTop[i] = r.top; S.lastBottom[i] = r.bottom; }
    }
    requestAnimationFrame(look);
  };
  new MutationObserver((ms) => { for (const m of ms) if (m.target.hasAttribute && m.target.hasAttribute('data-igf-in')) { const k = keyOf(m.target); S.fades[k] = (S.fades[k] || 0) + 1; } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-igf-in'] });
  requestAnimationFrame(look);
})();`;

let failed = 0;
let MODE = '';
const check = (name, ok, extra = '') => { name = name.replace('flicker:', 'flicker (' + MODE + '):'); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

// The calm numbers in the rules data are clamped, so no file can do more than change the look.
{
  const vm = await import('node:vm');
  const box = { globalThis: {} }; box.globalThis = box;
  vm.runInNewContext(fs.readFileSync(path.join(shared, 'hide-rules.js'), 'utf8'), box);
  const HR = box.FilterHideRules;
  const t = HR.tuningFor(HR.clean({ tuning: { all: { holdShade: 5, revealFadeMs: -40, revealFadesPerSecond: 99, motionOff: 1, showUnjudged: 1 } } }).tuning, 'www.instagram.com', '/');
  check('tuning: the calm numbers are clamped and nothing else is taken', t.holdShade === 0.3 && t.revealFadeMs === 0 && t.revealFadesPerSecond === 20 && t.motionOff === 1 && !('showUnjudged' in t), JSON.stringify(t));
  const d = HR.tuningFor(null, 'www.instagram.com', '/');
  check('tuning: the defaults match filter-config.js', d.holdShade === 0.12 && d.revealFadeMs === 140 && d.revealFadesPerSecond === 4 && d.motionOff === 0);
}

const browser = await engine.launch();
// Three runs: as the phone is by default; with the phone's Reduce Motion on (no fades at all); and with the fade tuned
// off and no grey through the rules data's tuning (as the laptop hands it in).
for (const mode of ['default', 'reduced', 'tuned']) try {
  const REDUCED = mode === 'reduced';
  MODE = mode;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
  if (mode === 'tuned') await ctx.addInitScript({ content: 'globalThis.__igFilterTune = { revealFadeMs: 0, holdShade: 0, revealFadesPerSecond: 4, motionOff: 0 };' });
  await ctx.route('https://www.instagram.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: feed }));
  await ctx.route(/cdninstagram\.com/, (r) => r.fulfill({ contentType: 'image/png', body: png }).catch(() => {}));
  for (const f of ['filter-config.js', 'rules.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-core.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-filter.js'), 'utf8') });
  await ctx.addInitScript({ content: sampler });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('https://www.instagram.com/flick/');
  await page.waitForTimeout(1500);
  // Slowly down the feed, back up, down again, with pauses (a person reading), the re-renders going on throughout.
  const scroll = (step, steps) => page.evaluate(({ step, steps }) => new Promise((done) => {
    let n = 0; const tick = () => { if (n++ >= steps) return done(); scrollBy(0, step); setTimeout(() => requestAnimationFrame(tick), n % 25 === 0 ? 600 : 30); }; tick();
  }), { step, steps });
  await scroll(40, 260); await page.waitForTimeout(1500);
  await scroll(-40, 260); await page.waitForTimeout(1500);
  await scroll(40, 260); await page.waitForTimeout(1500);
  const S = await page.evaluate(() => globalThis.__flick);
  const max = (o) => Math.max(0, ...Object.values(o));
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const report = { frames: S.frames, maxReveals: max(S.reveals), extraReveals: sum(S.reveals) - Object.keys(S.reveals).length, unshows: sum(S.unshows), flagged: S.flagged, maxFades: max(S.fades), bounces: sum(S.bounces) };
  console.log('flicker (' + mode + '):', JSON.stringify(report));
  if (process.env.VERBOSE) console.log(JSON.stringify({ reveals: S.reveals, unshows: S.unshows, bounces: S.bounces, fades: S.fades }));
  check('flicker: the session ran (frames sampled)', S.frames > 200, String(S.frames));
  check('flicker: each picture is revealed at most once, through scrolling and re-renders', report.maxReveals <= 1, JSON.stringify(S.reveals));
  check('flicker: no picture shown is held again while on screen', report.unshows === 0, JSON.stringify(S.unshows));
  check('flicker: a flagged picture is never shown', report.flagged === 0, String(report.flagged));
  check('flicker: the reveal fade runs at most once per picture', report.maxFades <= 1, JSON.stringify(S.fades));
  check('flicker: no post collapses and comes back, or comes back and collapses (no bouncing)', report.bounces === 0, JSON.stringify(S.changes));
  check('flicker: a removed post never collapses while it is on screen (it goes blank in place, then closes up off screen)', Object.keys(S.onScreenCollapse).length === 0, JSON.stringify(S.onScreenCollapse));
  if (mode !== 'default') check('flicker: no fades at all', sum(S.fades) === 0, JSON.stringify(S.fades));
  if (mode === 'default') check('flicker: a held picture sits on a plain grey', await page.evaluate(() => { const css = document.getElementById('igf-style').textContent; return /\[data-igf-shade\]\{background-color:rgba\(128,128,128,0\.12\)/.test(css); }));
  if (mode === 'tuned') check('flicker: tuned to no grey, none drawn', await page.evaluate(() => !/data-igf-shade\]\{/.test(document.getElementById('igf-style').textContent)));
  // The picture judged clean after the model was loading ("late") is shown in the end, and its post kept its height.
  const late = await page.evaluate(async () => { scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)); const a = document.querySelector('article[data-i="4"]'); return a ? { h: a.getBoundingClientRect().height, held: a.querySelector('img').hasAttribute('data-igf-hold'), gone: a.getAttribute('data-igf-gone') } : null; });
  check('flicker: a picture the judge could not answer at first is shown once judged, its post never collapsed', late && late.h > 300 && !late.held, JSON.stringify(late));
  await ctx.close();
} catch (e) { console.log('FAIL', mode, e.message); failed++; }
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
