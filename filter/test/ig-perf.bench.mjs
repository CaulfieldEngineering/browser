// How long the Instagram filter keeps pictures waiting, and what its scripts cost (Joe, 2026-11-12: "the overall
// experience is insanely slow and clunky and I spend most of my time looking at empty grey boxes").
//   node filter/test/ig-perf.bench.mjs            (Chromium; ENGINE=webkit for WebKit)
// A feed shaped like Instagram's (posts with an avatar, a three-picture carousel, buttons, a caption, links), built
// a few posts at a time as the page scrolls, with the churn a live feed has (counts and styles changing). The fake
// judge works like the phone's: one picture at a time (JUDGE_MS each, default 250), each fetched first (FETCH_MS, in
// parallel, default 120). Prints: when the first picture shows, when every picture on the screen shows, the same after
// a scroll, and the filter's script time (the same run with no filter, subtracted).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const pw = require('playwright');
const engine = pw[process.env.ENGINE || 'chromium'];
const JUDGE_MS = +(process.env.JUDGE_MS || 250), FETCH_MS = +(process.env.FETCH_MS || 120);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CDN = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15';
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=390"><style>
 body{margin:0;width:390px} .s{display:flex;overflow:hidden;width:390px} .s li{flex:0 0 390px;list-style:none} img.m{width:390px;height:488px;background:#333;display:block}
</style></head><body><div id="mount"><main role="main" id="feed"></main>
<div id="tabbar" style="position:fixed;bottom:0;height:50px;display:flex"><a href="/?variant=following">Home</a><a href="/explore/">Explore</a><a href="/reels/">Reels</a><a href="/direct/inbox/">Msg</a><a href="/joe/">me</a></div></div>
<script>
 let n = 0;
 const post = (i) => '<article id="a' + i + '"><div><header style="height:48px;display:flex"><a href="/acct' + i + '/"><img src="${CDN}/av' + i + '.jpg?stp=s150x150" width="32" height="32" alt="acct' + i + '\\'s profile picture"></a><a href="/acct' + i + '/"><span>acct' + i + '</span></a><div role="button">...</div></header>'
   + '<div role="button" tabindex="0"><ul class="s">' + [0, 1, 2].map((k) => '<li><img class="m" alt="Photo by acct' + i + '" src="${CDN}/p' + i + '_' + k + '.jpg?stp=dst-jpg_e35_p1080x1080&_nc_ht=x&oh=' + i + '"></li>').join('') + '</ul></div>'
   + '<section><span role="button"><svg width="24" height="24" aria-label="Like"></svg></span><span role="button"><svg aria-label="Comment"></svg></span><span role="button"><svg aria-label="Share"></svg></span></section>'
   + '<div><span class="likes">' + (i * 7) + ' likes</span></div><div><a href="/acct' + i + '/">acct' + i + '</a> <span>Pedal day ' + i + ', #fuzz #guitar more words here to make a caption</span></div>'
   + '<a href="/p/POST' + i + 'xx/comments/">View all 12 comments</a> <a href="/p/POST' + i + 'xx/"><time>' + i + 'h</time></a></div></article>';
 const more = (k) => { const f = document.getElementById('feed'); let h = ''; for (let j = 0; j < k; j++) h += post(n++); f.insertAdjacentHTML('beforeend', h); };
 more(4);
 addEventListener('scroll', () => { if (innerHeight + scrollY > document.body.scrollHeight - 1500 && n < 60) more(4); });
 // churn, as a live feed has: like counts, a style that animates
 setInterval(() => { for (const s of document.querySelectorAll('.likes')) s.textContent = (parseInt(s.textContent) + 1) + ' likes'; document.getElementById('tabbar').style.opacity = String(0.9 + Math.random() * 0.1); }, 100);
</script></body></html>`;

const fakeBridge = `globalThis.IGFilterBridge = (() => {
  let chain = Promise.resolve();
  return {
    stats: {}, stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
    classifyUrl(u) {
      const fetched = new Promise((r) => setTimeout(r, ${FETCH_MS}));
      const run = fetched.then(() => (chain = chain.then(() => new Promise((r) => setTimeout(r, ${JUDGE_MS})))));
      return run.then(() => ({ Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 }));
    },
    classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.01 }); },
    report() {}, byHand() { return Promise.resolve([]); }, seenOn() { return Promise.resolve(true); },
  };
})();`;

async function run(withFilter) {
  const browser = await engine.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('https://www.instagram.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }));
    await ctx.route(/cdninstagram\.com/, (r) => r.fulfill({ contentType: 'image/png', body: png }));
    if (withFilter) {
      for (const f of ['filter-config.js', 'rules.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
      await ctx.addInitScript({ content: fakeBridge });
      for (const f of ['ig-filter.js', 'ig-tidy.js', 'ig-seen.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror:', e.message));
    const cdp = process.env.ENGINE ? null : await ctx.newCDPSession(p);
    if (cdp) await cdp.send('Performance.enable');
    const t0 = Date.now();
    await p.goto('https://www.instagram.com/?variant=following');
    // a picture shows: laid out on screen and not held by the filter
    const shownOnScreen = () => p.evaluate(() => {
      const imgs = [...document.querySelectorAll('img.m')].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
      const ok = imgs.filter((i) => getComputedStyle(i).visibility === 'visible' && !i.closest('[data-igf-gone]'));
      return { on: imgs.length, shown: ok.length };
    });
    const waitAll = async (since) => {
      let first = null;
      for (;;) {
        const s = await shownOnScreen();
        if (s.shown > 0 && first === null) first = Date.now() - since;
        if (s.on > 0 && s.shown === s.on) return { first, all: Date.now() - since };
        if (Date.now() - since > 30000) return { first, all: null };
        await p.waitForTimeout(20);
      }
    };
    const start = await waitAll(t0);
    // scroll down past ten posts, as Joe would, a screen at a time
    const tS = Date.now();
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 640); await p.waitForTimeout(120); }
    const afterScroll = await waitAll(tS);
    await p.waitForTimeout(3000);
    let script = null;
    if (cdp) { const m = await cdp.send('Performance.getMetrics'); script = Math.round(m.metrics.find((x) => x.name === 'ScriptDuration').value * 1000); }
    const posts = await p.evaluate(() => document.querySelectorAll('article').length);
    return { start, afterScroll, script, posts, total: Date.now() - t0 };
  } finally { await browser.close(); }
}

const base = await run(false);
const filt = await run(true);
console.log(`judge ${JUDGE_MS} ms a picture (one at a time), fetch ${FETCH_MS} ms`);
console.log(`no filter : first picture ${base.start.first} ms, whole screen ${base.start.all} ms; after the scroll ${base.afterScroll.all} ms${base.script === null ? '' : `; script ${base.script} ms`}`);
console.log(`filter    : first picture ${filt.start.first} ms, whole screen ${filt.start.all} ms; after the scroll first ${filt.afterScroll.first} ms, whole screen ${filt.afterScroll.all} ms${filt.script === null ? '' : `; script ${filt.script} ms (the filter's own about ${filt.script - base.script} ms)`}; ${filt.posts} posts`);
