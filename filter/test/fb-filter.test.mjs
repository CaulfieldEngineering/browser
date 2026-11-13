// Tests for the Facebook side of the filter (filter/shared: rules.js's Facebook rules, ig-filter.js on Facebook,
// fb-tidy.js) in Chromium, on fixture pages served as facebook.com.
//   node filter/test/fb-filter.test.mjs
// The fixtures copy the shape of Facebook's own markup: posts as [role="article"] in a [role="feed"], the side column
// as [role="complementary"], rails by aria-label, Marketplace listings as links to /marketplace/item/. Ads are marked
// the ways Facebook marks them: the word "Sponsored" in the header, an aria-label, an SVG text, a link to its ad pages.
// These pages are not Facebook: they prove the rules, not that Facebook's live markup still matches them.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const { chromium } = require('playwright');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CDN = 'https://scontent-iad3-1.xx.fbcdn.net/v/t39.30808-6';
const post = (id, head, body, img = '') => `<div role="article" id="${id}" aria-posinset="1"><div><h4><a href="/someone">${head}</a></h4>${body}</div>${img ? `<img src="${CDN}/${img}" style="width:400px;height:300px">` : ''}</div>`;
const pages = {
  '/': `<div role="main"><div role="feed">${post('home1', 'Someone', '<span>Hello</span>', 'plain-home.jpg')}</div></div>`,
  '/notifications/': `<div role="main"><h1>Notifications</h1><div id="n1"><a href="/someone">Someone commented on your post.</a></div></div>`,
  '/groups/pedals/': `<div role="banner"><a id="logo" href="/">Facebook</a><a id="homeLink" href="/home.php">Home</a><a id="notifLink" href="/notifications/">Notifications</a><a id="videoTab" href="/watch/">Video</a><a id="reelsTab" href="https://www.facebook.com/reel/?s=tab">Reels</a><button id="openapp">Open app</button></div>
    <div role="main">
      <div aria-label="Stories" id="stories"><a href="/stories/1">a</a><a href="/stories/2">b</a></div>
      <div role="feed">
        ${post('friend', 'A friend', '<span dir="auto">New pedal board</span>', 'plain-friend.jpg')}
        ${post('ad1', 'Shop', '<span>Sponsored</span><span dir="auto">Buy now</span>')}
        ${post('ad2', 'Brand', '<a aria-label="Sponsored" href="#">·</a><span dir="auto">Try it</span>')}
        ${post('ad3', 'Brand3', '<svg><text>Sponsored</text></svg><span dir="auto">Deal</span>')}
        ${post('ad4', 'Brand4', '<a href="/ads/about/?entry_product=ad_preferences">Why am I seeing this ad?</a>')}
        ${post('sugg', 'Pedal Pages', '<span>Suggested for you</span><span dir="auto">Follow</span>')}
        ${post('pymk', 'People', '<span>People you may know</span>')}
        ${post('hot', 'Someone else', '<span dir="auto">Summer</span>', 'flag-hot.jpg')}
        ${post('rev', 'Gym page', '<span dir="auto">Leg day #gymgirl</span>')}
        ${post('revpic', 'A page', '<span dir="auto">Beach day</span>', 'rev-beach.jpg')}
        ${post('byname', 'Spicy Amy 🔞', '<span dir="auto">Good morning</span>')}
        ${post('ofname', 'Kate | OnlyFans', '<span dir="auto">New week</span>')}
        <div role="article" id="gif"><h4><a href="/friend2">Friend Two</a></h4><span dir="auto">lol</span><img id="gifimg" src="https://media.tenor.com/abc/tenor.gif" style="width:300px;height:200px"><img id="emoji" src="https://cdn.example.org/emoji.png" style="width:16px;height:16px"><img id="own" src="https://www.facebook.com/captcha/tfbimage.php?x=1" style="width:200px;height:70px"><a id="sharedreel" href="/reel/123456789/">a reel a friend shared</a></div>
      </div>
    </div>
    <div role="complementary" id="rail"><div><div id="railAd"><span>Sponsored</span><a href="https://shop.example/">Shop</a></div><div id="contacts"><h3>Contacts</h3><a href="/messages/t/1">A friend</a></div></div></div>`,
  '/marketplace/': `<div role="main">
      <a id="m1" href="/marketplace/item/111/"><img src="${CDN}/plain-m1.jpg" style="width:200px;height:200px"><span>Fuzz pedal $40</span></a>
      <a id="m2" href="/marketplace/item/222/"><img src="${CDN}/plain-m2.jpg" style="width:200px;height:200px"><span>Sponsored</span><span>Big sale</span></a>
      <a id="m3" href="/marketplace/item/333/"><img src="${CDN}/flag-m3.jpg" style="width:200px;height:200px"><span>Dress</span></a>
    </div>`,
  '/messages/t/1/': `<div role="main"><div id="thread"><div id="msg1">hey</div><img id="mimg" src="${CDN}/flag-msg.jpg" style="width:300px;height:300px"><div id="msg2">ok</div></div></div>`,
  '/watch/': `<div role="main"><div role="feed">${post('w1', 'Some page', '<span>A video chosen for you</span>', 'plain-w1.jpg')}</div></div>`,
  '/reel/': `<div role="main"><div id="reelfeed">reels chosen for you</div></div>`,
  '/reel/123456789/': `<div role="main"><div id="onereel">one reel a friend shared</div></div>`,
  '/adultpage/': `<div role="main"><div><h1 id="aname">Bella</h1><span id="aintro">Exclusive content 🔞 link below</span></div>
      <a id="aphoto" href="/photo/?fbid=1"><img src="${CDN}/plain-ap.jpg" style="width:200px;height:200px"></a>
      <div role="feed">${post('apost', 'Bella', '<span dir="auto">hi</span>', 'plain-apost.jpg')}</div></div>`,
  '/pedalpage/': `<div role="main"><div><h1 id="pname2">Fuzz Pedals Co</h1><span>Hand-built pedals. DM for custom orders.</span></div>
      <div role="feed">${post('ppost', 'Fuzz Pedals Co', '<span dir="auto">New batch</span>', 'plain-ppost.jpg')}</div></div>`,
  '/profile.php': `<div role="main"><h1 id="name">A friend</h1>${post('pp', 'A friend', '<span dir="auto">Old photo</span>', 'plain-pp.jpg')}</div>`,
};

const fakeBridge = `globalThis.IGFilterBridge = {
  stats: {}, stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; try { if (/^note-/.test(n)) sessionStorage.setItem('notes', (sessionStorage.getItem('notes') || '') + n + ' '); } catch {} },
  classifyUrl(u) { return new Promise((r) => setTimeout(() => r(/rev-/.test(u) ? { Sexy: 0.05, Neutral: 0.9, Porn: 0, Hentai: 0, Drawing: 0.05, Revealing: 0.9 } : /flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 }), 30)); },
  classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.01 }); },
};`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  await ctx.route(/https:\/\/(www|m)\.facebook\.com\//, (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p.startsWith('/captcha/')) return r.fulfill({ contentType: 'image/png', body: png });
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>${pages[p] || '<div role="main"></div>'}</body></html>` });
  });
  await ctx.route(/fbcdn\.net|tenor\.com|example\.org/, (r) => r.fulfill({ contentType: 'image/png', body: png }));
  for (const f of ['filter-config.js', 'rules.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  for (const f of ['ig-filter.js', 'fb-tidy.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const go = async (p, wait = 900) => { await page.goto('https://www.facebook.com' + p); await page.waitForTimeout(wait); };
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }, id);

  // ---- no News Feed: home goes to Notifications ----
  await go('/', 900);
  check('home: facebook.com goes to Notifications, not the News Feed', new URL(page.url()).pathname === '/notifications/', page.url());
  await page.goto('https://m.facebook.com/home.php'); await page.waitForTimeout(900);
  check('home: m.facebook.com/home.php goes to Notifications', new URL(page.url()).pathname === '/notifications/', page.url());
  check('notifications: shown as they are', await shown('n1'));

  // ---- a group feed: ads and suggestions gone, friends' posts stay ----
  await go('/groups/pedals/', 1200);
  check("feed: a friend's post stays, with its picture", (await shown('friend')) && await page.evaluate(() => getComputedStyle(document.querySelector('#friend img')).visibility === 'visible'));
  check('ads: "Sponsored" in the header', !(await shown('ad1')));
  check('ads: marked only by an aria-label', !(await shown('ad2')));
  check('ads: "Sponsored" drawn as SVG text', !(await shown('ad3')));
  check('ads: a link to the ad pages', !(await shown('ad4')));
  check('suggested: "Suggested for you" injection', !(await shown('sugg')));
  check('suggested: "People you may know"', !(await shown('pymk')));
  check('filter: a suggestive picture hides its post', !(await shown('hot')));
  check('filter: revealing-clothing tags hide a post', !(await shown('rev')));
  // ---- 2026-11-13: brought up to the Instagram app ----
  check('filter: a revealing-clothing picture hides its post (the second judge)', !(await shown('revpic')));
  check("accounts: a post whose author's name carries an adult term", !(await shown('byname')) && !(await shown('ofname')));
  check('pictures from outside Facebook: not shown (they cannot be judged); the post stays', (await shown('gif')) && !(await shown('gifimg')));
  check('pictures from outside Facebook: a small icon stays', await shown('emoji'));
  check("pictures from outside Facebook: facebook.com's own (the sign-in check's picture) is left as it was", await shown('own'));
  check('video tabs: the Video and Reels tabs are gone; a reel a friend shared stays', !(await shown('videoTab')) && !(await shown('reelsTab')) && (await shown('sharedreel')));
  check('rails: the Stories rail', !(await shown('stories')));
  check('right rail: the sponsored part is gone', !(await shown('railAd')));
  check('right rail: contacts stay', await shown('contacts'));
  check('prompts: "Open app" hidden, the top bar stays', !(await shown('openapp')) && (await shown('notifLink')));
  check('discreet: no word on the page says why', !/Hidden|filtered/i.test(await page.evaluate(() => document.body.innerText)));
  const stats = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('counts: ads and suggestions counted on the device', stats['hidden-fb-sponsored'] >= 4 && stats['hidden-fb-suggested'] >= 2, JSON.stringify(stats));
  await page.click('#notifLink'); await page.waitForTimeout(300);
  await go('/groups/pedals/', 600);
  await page.click('#homeLink'); await page.waitForTimeout(900);
  check('home link: goes to Notifications', new URL(page.url()).pathname === '/notifications/', page.url());

  // ---- the Video and Reels tabs go to Notifications; a named reel opens ----
  await page.evaluate(() => sessionStorage.removeItem('notes'));
  for (const p of ['/watch/', '/reel/', '/watch/latest/']) {
    await go(p, 900);
    check(`video tabs: ${p} goes to Notifications`, new URL(page.url()).pathname === '/notifications/', page.url());
  }
  await go('/reel/123456789/', 600);
  check('video tabs: a reel that is named still opens', new URL(page.url()).pathname === '/reel/123456789/' && (await shown('onereel')));
  await go('/watch/?v=42', 600);
  check('video tabs: a video that is named still opens', new URL(page.url()).pathname === '/watch/');
  const notes = await page.evaluate(() => sessionStorage.getItem('notes') || '');
  check('reporting: what the page was made to do is said to the app (js: lines)', (notes.match(/note-fb-home /g) || []).length >= 3, notes);

  // ---- a profile, Page or group by its name and intro ----
  await go('/adultpage/', 1200);
  check('accounts: a Page whose intro carries an adult term keeps only its name', (await shown('aname')) && !(await shown('aphoto')) && !(await shown('apost')));
  await go('/pedalpage/', 1200);
  check('accounts: an ordinary Page is untouched ("DM for custom orders")', (await shown('pname2')) && (await shown('ppost')));

  // ---- Marketplace: listings stay, sponsored and suggestive ones go ----
  await go('/marketplace/', 1000);
  check('marketplace: a listing stays', (await shown('m1')) && await page.evaluate(() => getComputedStyle(document.querySelector('#m1 img')).visibility === 'visible'));
  // Since 2026-11-08 a tile hidden for good is taken out and the next ones close up (Joe: "can we just skip it instead of
  // leaving the hole?"), so nothing of it is drawn at all.
  const takenOut = (id) => page.evaluate((i) => { const e = document.getElementById(i); const r = e.getBoundingClientRect(); return e.hasAttribute('data-igf-gone') && r.width === 0 && r.height === 0; }, id);
  check('marketplace: a sponsored listing is gone (taken out, the next listing moves up)', await takenOut('m2'));
  check('marketplace: a suggestive listing is gone (taken out)', await takenOut('m3'));

  // ---- Messages and profiles keep working ----
  await go('/messages/t/1/', 900);
  check('messages: the thread stays; only a flagged picture goes', (await shown('msg1')) && (await shown('msg2')) && !(await shown('mimg')));
  await go('/profile.php?id=1', 900);
  check('profiles: shown, posts judged like any other', (await shown('name')) && (await shown('pp')));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
