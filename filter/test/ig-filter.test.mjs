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
  '/explore/': `<main><input id="search" placeholder="Search"><div id="grid">${bgTile('e1', '/other/reel/E1/', 'flag-e1.jpg')}${tile('e2', '/p/E2/', 'plain-e2.jpg')}${bgTile('e3', '/other/reel/E3/', 'fail-e3.jpg')}</div></main>`,
  '/explore/search/': `<main><input id="search" value="pedal"><a id="acct" href="/pedalshop/">pedalshop</a>${tile('s1', '/p/S1/', 'plain-s1.jpg')}</main>`,
  '/revealing/': `<main>
   <article id="rv1"><header><a href="/a/">a</a></header><img src="${CDN}/rev-1.jpg" width="400" height="400"><div>Saturday.</div></article>
   <article id="rv2"><header><a href="/b/">b</a></header><img src="${CDN}/plain-rv2.jpg" width="400" height="400"><div>leg day #gymgirl</div></article>
   <article id="rv3"><header><a href="/c/">c</a></header><img src="${CDN}/half-rv3.jpg" width="400" height="400"><div>new shorts, wire stripper in hand</div></article>
   <article id="rv4"><header><a href="/d/">d</a></header><img src="${CDN}/nsfwonly-rv4.jpg" width="400" height="400"><div>x</div></article>
   <nav><a id="explorelink" href="/explore/">Explore</a></nav></main>`,
  '/reels/C9/': `<main><div class="x78zum5"><div class="xh8yej3" id="viewer"><div><video id="rv" poster="${CDN}/flag-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator/">creator</a> caption</div></div>
   <div class="xh8yej3" id="viewer2"><div><video id="rv2" poster="${CDN}/plain-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator2/">creator2</a> fine</div></div></div></main>`,
  '/stories/someone/': `<main><div id="ring"><img id="ringimg" src="${CDN}/flag-ring.jpg" style="width:56px;height:56px"></div><section id="story"><img id="storyimg" src="${CDN}/flag-story.jpg" style="width:360px;height:640px"></section></main>`,
  '/spa/': `<main id="m"></main><script>
    // Like Instagram: one page, new "pages" by pushState, the old scroll left behind, the comment box focused by the page.
    const feed = () => { m.innerHTML = Array.from({ length: 60 }, (_, i) => '<article style="height:300px">post ' + i + ' <a href="/p/P' + i + '/comments/" class="open">comments</a></article>').join(''); };
    const comments = () => { m.innerHTML = '<div id="caption" style="height:120px">the caption</div>' + Array.from({ length: 80 }, (_, i) => '<div style="height:60px">comment ' + i + '</div>').join('') + '<textarea id="add" placeholder="Add a comment"></textarea>'; };
    feed();
    window.openComments = () => { history.pushState({ p: 'c' }, '', '/p/P10/comments/'); comments(); document.getElementById('add').focus(); scrollTo(0, 99999); };
    addEventListener('popstate', () => { feed(); scrollTo(0, 1200); });
  </script>`,
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
      if (/late/.test(u)) return r(++globalThis.__lateTries < 2 ? { _error: 'loading' } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 });
      if (/rev/.test(u)) return r({ Neutral: 0.9, Sexy: 0.1, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.92 });
      if (/half/.test(u)) return r({ Neutral: 0.9, Sexy: 0.1, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.3 });
      if (/nsfwonly/.test(u)) return r({ Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02 });
      r(/flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 });
    }, 30));
  },
  classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.01 }); },
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
  // ---- Explore: gone ("let's get rid of the explore page"); search stays ----
  await go('/explore/');
  check('explore: the grid is gone, every tile, plain or not', await page.evaluate(() => ['e1', 'e2', 'e3'].every((id) => getComputedStyle(document.getElementById(id)).display === 'none')));
  check('explore: the search box stays', await visible('#search'));
  await go('/explore/search/');
  check('search results: accounts listed, no recommended posts', (await visible('#acct')) && await page.$eval('#s1', (e) => getComputedStyle(e).display === 'none'));
  // ---- revealing clothing (any person; gender-neutral) ----
  await go('/revealing/');
  check('revealing: a picture the judge scores revealing hides its post', (await hiddenAs('#rv1')) === 'image');
  check('revealing: a caption tag (#gymgirl) hides its post', (await hiddenAs('#rv2')) === 'text');
  check('revealing: under the line, and ordinary words (shorts, wire stripper), the post stays', (await hiddenAs('#rv3')) === '' && await visible('#rv3 img'));
  check('revealing: an answer without the revealing judge is not a verdict (held as still checking)', ['checking', 'unjudged'].includes(await hiddenAs('#rv4')));
  const rstats = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('revealing: counted on its own lines', rstats['hidden-revealing'] >= 1 && rstats['hidden-revealing-text'] >= 1, JSON.stringify(rstats));
  check('explore link: hidden on a wide screen (the laptop)', !(await visible('#explorelink')));
  await page.setViewportSize({ width: 390, height: 844 });
  check('explore link: kept on a phone, where it is the search tab', await visible('#explorelink'));
  await page.setViewportSize({ width: 1280, height: 720 });
  // ---- the reel viewer ----
  await go('/reels/C9/', 1200);
  check('reel viewer: a reel whose poster is flagged is hidden', (await hiddenAs('#rv')) === 'video' || (await hiddenAs('#rv')) === 'image', await hiddenAs('#rv'));
  check('reel viewer: a plain reel is not hidden', (await hiddenAs('#rv2')) === '');
  // ---- stories ----
  await go('/stories/someone/');
  check('stories: a small story ring is not held', await visible('#ringimg'));
  check('stories: a flagged story picture is hidden', ['image'].includes(await hiddenAs('#storyimg')));

  // ---- a newly opened page starts at the top; Back keeps the place in the feed ----
  await go('/spa/', 300);
  await page.evaluate(() => scrollTo(0, 1200));
  await page.evaluate(() => window.openComments());
  await page.waitForTimeout(1800);
  check('a new page (comments) starts at the top, its caption in view', await page.evaluate(() => scrollY === 0 && document.getElementById('caption').getBoundingClientRect().top >= 0), String(await page.evaluate(() => scrollY)));
  check('the comment box the page focused is let go (no keyboard pulling the page down)', await page.evaluate(() => document.activeElement !== document.getElementById('add')));
  await page.evaluate(() => history.back());
  await page.waitForTimeout(1200);
  check('Back returns to the same place in the feed', await page.evaluate(() => scrollY) === 1200, String(await page.evaluate(() => scrollY)));
  await page.evaluate(() => window.openComments());
  await page.waitForTimeout(100);
  await page.dispatchEvent('main', 'touchstart');
  await page.evaluate(() => scrollTo(0, 800));
  await page.waitForTimeout(1700);
  check('once Joe scrolls a new page himself, it stays where he put it', await page.evaluate(() => scrollY) === 800, String(await page.evaluate(() => scrollY)));

  // ---- the real classifier ----
  const p2 = await browser.newPage();
  const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', wasm: 'application/wasm', onnx: 'application/octet-stream', jpg: 'image/jpeg' };
  await p2.route('https://classifier.test/**', (r) => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, '');
    const f = rel.startsWith('eval/') && process.env.EVAL_IMAGES ? path.join(process.env.EVAL_IMAGES, rel.slice(5)) : path.join(shared, rel);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p2.goto('https://classifier.test/classifier.html');
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
  check('classifier: the revealing-clothing judge loads and answers', typeof r.s.Revealing === 'number' && r.info.clip.ready, JSON.stringify(r.info.clip));
  check('classifier: a plain picture is not revealing', r.s.Revealing < 0.6, String(r.s.Revealing));
  // Optional, local only: EVAL_IMAGES=<folder with rev/ and neg/ photos> prints the revealing score of each.
  if (process.env.EVAL_IMAGES) {
    for (const kind of ['rev', 'neg']) for (const f of fs.readdirSync(path.join(process.env.EVAL_IMAGES, kind))) {
      const v = await p2.evaluate(async (u) => { const img = new Image(); img.src = u; await img.decode(); return IGClip.revealing(img); }, `https://classifier.test/eval/${kind}/${f}`);
      console.log(`     eval ${kind} ${v.toFixed(2)} ${f}`);
    }
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
