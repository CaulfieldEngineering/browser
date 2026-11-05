// Tests for the Instagram filter's page side (filter/shared) in Chromium, on fixture pages served as instagram.com.
//   node filter/test/ig-filter.test.mjs
// Needs Playwright (PLAYWRIGHT_FROM=<a package.json whose folder has playwright installed>; default: the Blocks repo).
// The fixtures copy the shape of Instagram's own markup for each surface: the feed (<article>), a profile's posts grid
// (links to /p/ holding an <img>), its Reels tab and Explore (links to /<user>/reel/ holding a <div> with an inline
// background-image), the reel viewer (a <video> with a poster), stories and avatars, and Instagram's "open the app"
// prompts. A fake classifier decides by address: "flag" is suggestive, "fail" cannot be judged, "late" cannot be judged
// at first and then is clean. Then the real classifier page scores a plain picture.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const { chromium } = require('playwright');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CDN = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15';
const tile = (id, href, file) => `<div class="_aabd"><a id="${id}" href="${href}" role="link"><div class="_aagu"><div class="_aagv"><img src="${CDN}/${file}" class="x5yr21d" style="width:200px;height:200px" alt=""></div></div></a></div>`;
const bgTile = (id, href, file) => `<div class="x1qjc9v5"><a id="${id}" href="${href}" role="link"><div class="x1lliihq" style="width:200px;height:300px"><div class="x1i10hfl" style="background-image: url(&quot;${CDN}/${file}&quot;); width:200px; height:300px; background-size:cover"></div></div><div class="x6s0dn4">12.3K</div></a></div>`;
const pages = {
  '/': `<main role="main">
   <article id="ok"><header><a href="/pedalshop/"><img id="avatar" src="${CDN}/avatar.jpg" width="32" height="32" alt="pedalshop's profile picture"></a><a href="/pedalshop/">pedalshop</a></header>
     <img id="okimg" src="${CDN}/plain.jpg" width="400" height="400"><div>New pedal day. #guitar #fuzz</div></article>
   <article id="img"><header><a href="/someone/">someone</a></header><img src="${CDN}/flag.jpg" width="400" height="400"><div>Summer.</div></article>
   <article id="txt"><header><a href="/shop/">shop</a></header><img src="${CDN}/plain2.jpg" width="400" height="400"><div>New drop #Lingerie</div></article>
   <article id="fail"><header><a href="/x/">x</a></header><img src="${CDN}/fail.jpg" width="400" height="400"><div>Hi</div></article>
   <article id="late"><header><a href="/y/">y</a></header><img src="${CDN}/late.jpg" width="400" height="400"><div>Hi</div></article>
   <div id="tidy"><a id="openapp" href="https://apps.apple.com/app/instagram/id389801252">Open app</a><button id="openig">Open Instagram</button><a id="scheme" href="instagram://media?id=1">View</a>
     <div role="dialog" id="sheet"><span>See this post in the app</span><button id="notnow" onclick="this.closest('[role=dialog]').remove()">Not now</button></div></div>
   </main>`,
  '/someprofile/': `<main><header><img id="bigavatar" src="${CDN}/flag-avatar.jpg" style="width:150px;height:150px" alt="someprofile's profile picture"></header>
   <div class="_ac7v">${tile('p1', '/p/AAA/', 'plain-p1.jpg')}${tile('p2', '/p/BBB/', 'flag-p2.jpg')}</div></main>`,
  '/someprofile/reels/': `<main><div class="x1qjc9v5">${bgTile('r1', '/someprofile/reel/C1/', 'plain-r1.jpg')}${bgTile('r2', '/someprofile/reel/C2/', 'flag-r2.jpg')}</div></main>`,
  '/someprofile/tagged/': `<main>${tile('t1', '/p/TTT/', 'flag-t1.jpg')}${tile('t2', '/p/UUU/', 'plain-t2.jpg')}</main>`,
  '/explore/': `<main>${bgTile('e1', '/other/reel/E1/', 'flag-e1.jpg')}${tile('e2', '/p/E2/', 'plain-e2.jpg')}${bgTile('e3', '/other/reel/E3/', 'fail-e3.jpg')}</main>`,
  '/reels/C9/': `<main><div class="x78zum5"><div class="xh8yej3" id="viewer"><div><video id="rv" poster="${CDN}/flag-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator/">creator</a> caption</div></div>
   <div class="xh8yej3" id="viewer2"><div><video id="rv2" poster="${CDN}/plain-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator2/">creator2</a> fine</div></div></div></main>`,
  '/stories/someone/': `<main><div id="ring"><img id="ringimg" src="${CDN}/flag-ring.jpg" style="width:56px;height:56px"></div><section id="story"><img id="storyimg" src="${CDN}/flag-story.jpg" style="width:360px;height:640px"></section></main>`,
};

const fakeBridge = `globalThis.__igFilterRetry = [150, 300, 450];
globalThis.__lateTries = 0;
globalThis.IGFilterBridge = {
  calls: [], stats: {},
  stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
  classifyUrl(u) {
    this.calls.push(u);
    return new Promise((r) => setTimeout(() => {
      if (/fail/.test(u)) return r({ _error: 'unreadable' });
      if (/late/.test(u)) return r(++globalThis.__lateTries < 2 ? { _error: 'loading' } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02 });
      r(/flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0 } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02 });
    }, 30));
  },
  classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0 }); },
};`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  await ctx.route('https://www.instagram.com/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>${pages[p] || '<main></main>'}</body></html>` });
  });
  await ctx.route(/cdninstagram\.com/, (r) => r.fulfill({ contentType: 'image/png', body: png }));
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'rules.js'), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-filter.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-tidy.js'), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const go = async (p, wait = 900) => { await page.goto('https://www.instagram.com' + p); await page.waitForTimeout(wait); };
  // hidden: the post is marked and shows only its placeholder; shown: not marked and its media visible
  const hiddenAs = (sel) => page.$eval(sel, (e) => { const u = e.closest('[data-igf-gone]') || (e.previousElementSibling && e.previousElementSibling.classList.contains('igf-ph') && e.hasAttribute('data-igf-gone') ? e : null); return u ? u.getAttribute('data-igf-gone') : ''; });
  const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none' && !e.closest('[data-igf-gone]'));

  // ---- the feed ----
  await go('/');
  check('feed: a plain post stays and its picture shows', await visible('#okimg'));
  check('feed: a small avatar is not held', await visible('#avatar'));
  check('feed: a flagged picture hides its post', (await hiddenAs('#img')) === 'image');
  check('feed: a hidden post collapses entirely, with no words', await page.$eval('#img', (e) => getComputedStyle(e).display === 'none' && !e.querySelector('.igf-ph')));
  check('feed: nothing on the page says why (no labels)', !/Hidden|suggestive|caption/i.test(await page.evaluate(() => document.body.innerText)));
  check('feed: a caption tag hides its post', (await hiddenAs('#txt')) === 'text' && await page.$eval('#txt', (e) => getComputedStyle(e).display === 'none'));
  check('feed: a picture not judged yet is hidden while it is checked', (await hiddenAs('#fail')) === 'checking' && await page.$eval('#fail', (e) => getComputedStyle(e).display === 'none'));
  await page.waitForTimeout(1500);
  check('feed: still not judged after the last try: stays hidden', (await hiddenAs('#fail')) === 'unjudged');
  check('feed: judged clean on a later try: shown again', await visible('#late img'));
  check('feed: no reveal control on the page', (await page.$$eval('.igf-ph *', (l) => l.length)) === 0);
  const stats = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('feed: counts by reason (on the device)', stats['hidden-sexy'] >= 1 && stats['hidden-text'] >= 1 && stats['hidden-unjudged-unreadable'] >= 1 && stats['restored'] >= 1, JSON.stringify(stats));
  await page.evaluate(() => { const a = document.createElement('article'); a.id = 'late2'; a.innerHTML = `<header><a href="/z/">z</a></header><img src="https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/flag-new.jpg" width="400" height="400"><div>x</div>`; document.querySelector('main').appendChild(a); });
  await page.waitForTimeout(400);
  check('feed: a post that loads later is judged too', (await hiddenAs('#late2')) === 'image');
  await page.evaluate(() => { document.querySelector('#ok div').textContent += ' link in bio 🔞'; });
  await page.waitForTimeout(400);
  check('feed: a caption that loads later is judged too', (await hiddenAs('#ok')) === 'text');
  // ---- Instagram's "open the app" prompts ----
  check('prompts: "Open app" link hidden', !(await visible('#openapp')));
  check('prompts: "Open Instagram" button hidden', !(await visible('#openig')));
  check('prompts: an instagram:// link hidden', !(await visible('#scheme')));
  check('prompts: "See this post in the app" answered "Not now"', await page.evaluate(() => !document.getElementById('sheet')));

  // ---- a profile's posts grid, and its large avatar ----
  await go('/someprofile/');
  check('profile grid: a plain tile shows', await visible('#p1 img'));
  check('profile grid: a flagged tile is hidden', (await hiddenAs('#p2 img')) === 'image');
  check('profile: a large avatar is judged (and hidden when flagged)', (await hiddenAs('#bigavatar')) === 'image');
  // ---- a profile's Reels tab: background-image tiles ----
  await go('/someprofile/reels/');
  check('reels tab: a plain background tile shows', await page.$eval('#r1 [style*="background-image"]', (e) => getComputedStyle(e).visibility === 'visible' && !e.closest('[data-igf-gone]')));
  check('reels tab: a flagged background tile is hidden', (await hiddenAs('#r2 [style*="background-image"]')) === 'image');
  check('reels tab: the hidden tile stays a blank of the same size: no picture, no count, no words', await page.$eval('#r2', (e) => { const ph = e.querySelector('.igf-ph'); return !!ph && ph.getBoundingClientRect().height >= 290 && getComputedStyle(e.querySelector('.x6s0dn4')).display === 'none' && e.innerText.trim() === ''; }));
  check('reels tab: a blank tile does not answer taps (no reveal)', await page.$eval('#r2', (e) => getComputedStyle(e).pointerEvents === 'none'));
  check('reels tab: the grid does not reflow (the plain tile is still where it was)', await page.$eval('#r1', (e) => e.getBoundingClientRect().height >= 290));
  // A tile whose background is set after it is on the page.
  await page.evaluate(() => { const d = document.querySelector('#r1 [style*="background-image"]'); d.style.backgroundImage = 'url("https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/flag-r1b.jpg")'; });
  await page.waitForTimeout(400);
  check('reels tab: a background changed later is judged again', (await hiddenAs('#r1 .x1i10hfl')) === 'image');
  // ---- a profile's tagged grid ----
  await go('/someprofile/tagged/');
  check('tagged grid: flagged hidden, plain shown', (await hiddenAs('#t1 img')) === 'image' && (await visible('#t2 img')));
  // ---- Explore ----
  await go('/explore/');
  check('explore: a flagged reel tile (background) is hidden', (await hiddenAs('#e1 [style*="background-image"]')) === 'image');
  check('explore: a plain post tile shows', await visible('#e2 img'));
  check('explore: a tile not judged is a plain blank while it is checked', ['checking', 'unjudged'].includes(await hiddenAs('#e3 [style*="background-image"]')) && await page.$eval('#e3', (e) => !!e.querySelector('.igf-ph') && e.innerText.trim() === ''));
  // ---- the reel viewer ----
  await go('/reels/C9/', 1200);
  check('reel viewer: a reel whose poster is flagged is hidden', (await hiddenAs('#rv')) === 'video' || (await hiddenAs('#rv')) === 'image', await hiddenAs('#rv'));
  check('reel viewer: a plain reel is not hidden', (await hiddenAs('#rv2')) === '');
  // ---- stories ----
  await go('/stories/someone/');
  check('stories: a small story ring is not held', await visible('#ringimg'));
  check('stories: a flagged story picture is hidden', ['image'].includes(await hiddenAs('#storyimg')));

  // ---- the real classifier ----
  const p2 = await browser.newPage();
  await p2.goto(pathToFileURL(path.join(shared, 'classifier.html')).href);
  const r = await p2.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#28a'; g.fillRect(0, 0, 300, 500); g.fillStyle = '#fd3'; g.fillRect(40, 60, 200, 120);
    const t0 = performance.now();
    const [s1, s2] = await Promise.all([IGClassifier.classify(c.toDataURL('image/jpeg')), IGClassifier.classify(c.toDataURL('image/png'))]);
    return { s: s1, same: JSON.stringify(Object.keys(s2).sort()) === JSON.stringify(Object.keys(s1).sort()), ms: Math.round(performance.now() - t0), info: IGClassifier.info() };
  });
  const sum = Object.values(r.s).reduce((a, b) => a + b, 0);
  check('classifier: loads and scores a picture (two at once, one after the other)', sum > 0.9 && 'Sexy' in r.s && r.same, JSON.stringify(r));
  check('classifier: a plain picture is not flagged', r.s.Sexy < 0.45 && r.s.Porn + r.s.Hentai < 0.3);
  check('classifier: reports its backend and timing', !!r.info.backend && r.info.n === 2, JSON.stringify(r.info));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
