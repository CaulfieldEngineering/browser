// Tests for the Instagram filter's page side (filter/shared) in Chromium, on a fixture page served as instagram.com.
//   node filter/test/ig-filter.test.mjs
// Needs Playwright (PLAYWRIGHT_FROM=<a package.json whose folder has playwright installed>; default: the Blocks repo).
// 1. With a fake classifier: removal, the text rule, small images left alone, unjudgeable images removed, posts that
//    arrive later, no way back. 2. With the real classifier page: the model loads and scores a plain image.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const { chromium } = require('playwright');

// A 1x1-ish PNG for every fake CDN image (the fake bridge decides by address).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>
<main>
 <article id="ok"><header><img id="avatar" src="https://scontent.cdninstagram.com/avatar.jpg" width="32" height="32" alt="someone's profile picture">someone</header>
   <img id="okimg" src="https://scontent.cdninstagram.com/plain.jpg" width="400" height="400"><div>New pedal day. #guitar #fuzz</div></article>
 <article id="img"><img src="https://scontent.cdninstagram.com/flag.jpg" width="400" height="400"><div>Summer.</div></article>
 <article id="txt"><img src="https://scontent.cdninstagram.com/plain2.jpg" width="400" height="400"><div>New drop #Lingerie</div></article>
 <article id="fail"><img src="https://scontent.cdninstagram.com/fail.jpg" width="400" height="400"><div>Hi</div></article>
 <a id="tile" href="/p/abc/"><img src="https://scontent.cdninstagram.com/flag-tile.jpg" width="200" height="200"></a>
</main></body></html>`;

const fakeBridge = `globalThis.IGFilterBridge = {
  calls: [],
  classifyUrl(u) { this.calls.push(u); return new Promise((r) => setTimeout(() => r(/fail/.test(u) ? null : /flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2 } : { Neutral: 0.97, Sexy: 0.01 }), 50)); },
  classifyData() { return Promise.resolve({ Neutral: 0.99 }); },
};`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  await ctx.route('https://www.instagram.com/**', (r) => r.fulfill({ contentType: 'text/html', body: fixture }));
  await ctx.route('https://scontent.cdninstagram.com/**', (r) => r.fulfill({ contentType: 'image/png', body: png }));
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'rules.js'), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-filter.js'), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('https://www.instagram.com/');
  await page.waitForTimeout(800);
  const shown = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display !== 'none' && !e.closest('[data-igf-gone]'));
  const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).visibility === 'visible');
  check('a plain post stays', await shown('#ok'));
  check('its image shows once judged', await visible('#okimg'));
  check('an avatar is not held', await visible('#avatar'));
  check('a flagged image removes its post', !(await shown('#img')));
  check('a caption tag removes its post', !(await shown('#txt')));
  check('an image that cannot be judged removes its post', !(await shown('#fail')));
  check('a flagged grid tile is removed', !(await shown('#tile')));
  // A post that arrives later.
  await page.evaluate(() => { const a = document.createElement('article'); a.id = 'late'; a.innerHTML = '<img src="https://scontent.cdninstagram.com/flag-late.jpg" width="400" height="400"><div>x</div>'; document.querySelector('main').appendChild(a); });
  await page.waitForTimeout(500);
  check('a post that loads later is judged too', !(await shown('#late')));
  // A caption that arrives after the image.
  await page.evaluate(() => { document.querySelector('#ok div').textContent += ' link in bio 🔞'; });
  await page.waitForTimeout(400);
  check('a caption that loads later is judged too', !(await shown('#ok')));
  // No way back: the page's own scripts removing the marker do not bring it back for long, and nothing offers it.
  const marks = await page.$$eval('[data-igf-gone]', (l) => l.length);
  check('removed posts are marked', marks >= 5, `(${marks})`);
  check('no reveal control on the page', (await page.$$eval('button, [role=button]', (l) => l.length)) === 0);

  // 2. The real classifier.
  const p2 = await browser.newPage();
  await p2.goto(pathToFileURL(path.join(shared, 'classifier.html')).href);
  const r = await p2.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#28a'; g.fillRect(0, 0, 300, 500); g.fillStyle = '#fd3'; g.fillRect(40, 60, 200, 120);
    const t0 = performance.now();
    const s = await IGClassifier.classify(c.toDataURL('image/jpeg'));
    return { s, ms: Math.round(performance.now() - t0) };
  });
  const sum = Object.values(r.s).reduce((a, b) => a + b, 0);
  check('the classifier loads and scores an image', sum > 0.9 && 'Sexy' in r.s, JSON.stringify(r));
  check('a plain picture is not flagged', r.s.Sexy < 0.45 && r.s.Porn + r.s.Hentai < 0.3);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
