// Takes fixtures from live Instagram, signed out, as skeletons (IGCore.skeleton in filter/shared/ig-core.js): structure,
// roles, labels, route shapes and the layout styles only; every name, word and picture is replaced, so nothing of
// anyone's page is in the repo. Nobody signs in: these are the public, signed-out pages.
//   node filter/test/tools/capture-skeletons.mjs <public account> [name filter]
// Writes filter/test/fixtures/instagram/real-*.html. On a machine where instagram.com is blocked by the hosts file
// (the mini PC), give the addresses to use: IG_HOST_IP and IG_CDN_IP (from a DNS-over-HTTPS lookup of www.instagram.com
// and scontent.cdninstagram.com); this is the agents' own access and no browser Joe uses is changed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const pw = require('playwright');
const core = fs.readFileSync(path.join(here, '..', '..', 'shared', 'ig-core.js'), 'utf8');
const out = path.join(here, '..', 'fixtures', 'instagram');
const [account, only = ''] = process.argv.slice(2);
if (!account) { console.error('usage: node capture-skeletons.mjs <public account> [name filter]'); process.exit(2); }
const args = [];
if (process.env.IG_HOST_IP) args.push(`--host-resolver-rules=MAP instagram.com ${process.env.IG_HOST_IP}, MAP *.instagram.com ${process.env.IG_HOST_IP}` + (process.env.IG_CDN_IP ? `, MAP *.cdninstagram.com ${process.env.IG_CDN_IP}` : ''));
const browser = await pw.chromium.launch({ args });
const P = `https://www.instagram.com/${account}/`;
const wide = { viewport: { width: 1600, height: 950 } }, narrow = { viewport: { width: 390, height: 844 }, hasTouch: true };
const jobs = [
  ['real-profile-wide', P, wide], ['real-profile-laptop', P, { viewport: { width: 1100, height: 760 } }], ['real-profile-narrow', P, narrow],
  ['real-profile-reels-wide', P + 'reels/', wide], ['real-post-wide', 'POST', wide], ['real-post-narrow', 'POST', narrow],
].filter((j) => !only || j[0].includes(only) || j[0] === 'real-profile-wide');
let post = '';
for (const [name, url0, opts] of jobs) {
  const url = url0 === 'POST' ? post : url0;
  if (!url) { console.log(name, 'no address'); continue; }
  const ctx = await browser.newContext({ locale: 'en-US', bypassCSP: true, ...opts });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);
    // The sign-up wall is not part of a signed-in page: closed if it can be, else taken out.
    await page.evaluate(() => { for (const d of document.querySelectorAll('[role="dialog"]')) { const x = d.querySelector('[aria-label="Close"]'); if (x) (x.closest('[role="button"],button') || x).click(); } });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { for (const d of document.querySelectorAll('[role="dialog"]')) { let top = d; while (top.parentElement && top.parentElement !== document.body && !top.parentElement.querySelector('main, [role="main"], nav')) top = top.parentElement; top.remove(); } document.body.style.overflow = ''; });
    await page.waitForTimeout(500);
    if (!post) { const hs = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href'))); const h = hs.find((x) => /\/p\//.test(x)); if (h) post = new URL(h, url).href; }
    await page.addScriptTag({ content: core });
    const info = await page.evaluate(() => { let i = 0; return { html: IGCore.skeleton(document.body, { src: () => 'https://scontent.cdninstagram.com/v/fx/plain-' + (++i) + '.jpg' }), surface: IGCore.surfaceNow(), n: document.querySelectorAll('*').length }; });
    fs.writeFileSync(path.join(out, name + '.html'), info.html);
    console.log(name, info.surface, info.n, 'elements', info.html.length, 'bytes');
  } catch (e) { console.log(name, 'failed', String(e).slice(0, 300)); }
  await ctx.close();
}
await browser.close();
