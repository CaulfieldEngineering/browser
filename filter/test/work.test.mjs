// Work surfaces (filter-config.js "work"; Joe, 2026-11-16: "Yeah we need to make sure that our filters do not interfere
// with work"). In Chromium, on fixture pages served as Facebook's and Instagram's work tools and as the feed:
//   node filter/test/work.test.mjs
// Proves: a work page is never sent elsewhere and none of its cards, panels or buttons is taken; a suggestive picture
// there still goes (by itself) and one not judged yet stays hidden; his own Page's ad shows in the feed while every
// other ad and suggestion still goes; the personal feeds can never be made a work surface; the lines did not move.
// These pages are not Meta's: they prove the rules, not that Meta's live markup still matches them.
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
const img = (id, name, w = 400, h = 300) => `<img id="${id}" src="${CDN}/${name}" style="width:${w}px;height:${h}px">`;
const post = (id, head, body, pic = '') => `<div role="article" id="${id}"><div><h4><a href="/x">${head}</a></h4>${body}</div>${pic}</div>`;

// Ads Manager as it is built: settings cards, each a box with a heading, controls and sometimes a video preview; the
// ad preview is drawn like a feed post with "Sponsored" in its header.
const adsManager = `<div role="main"><div id="nav"><a href="/adsmanager/manage/campaigns">Campaigns</a><a href="/adsmanager/manage/ads">Ads</a></div>
  <div id="cardEffects" class="card"><h3>Add video effects</h3><label><input type="checkbox" id="aiToggle"> Enhancements</label><button id="effectsBtn">Edit</button>
    <video id="cardVideo" poster="${CDN}/plain-poster.jpg" muted style="width:320px;height:180px"></video></div>
  <div id="cardMedia" class="card"><h3>Media</h3><button id="mediaBtn">Edit media</button>${img('cardPic', 'plain-media.jpg', 300, 200)}</div>
  <div id="cardFlag" class="card"><h3>Placements</h3><button id="placeBtn">Edit placements</button>${img('flagPic', 'flag-placement.jpg', 300, 200)}</div>
  <div id="cardSlow" class="card"><h3>Text</h3><button id="textBtn">Edit text</button>${img('slowPic', 'slow-unjudged.jpg', 300, 200)}</div>
  <div id="preview">${post('adPreview', 'Wonderland Audio', '<span>Sponsored</span><span dir="auto">Tertiary, out now</span><a href="/ads/about/?entry_product=ad_preferences">Why am I seeing this ad?</a>', img('previewPic', 'plain-preview.jpg'))}</div>
  <div aria-label="Suggested for you" id="sugRail"><a href="/a">a</a><a href="/b">b</a></div>
</div>`;
const businessInbox = `<div role="main"><div id="comments">${post('c1', 'A customer', '<span dir="auto">Does it ship to Canada?</span>')}
  ${post('c2', 'Wonderland Audio', '<span>Sponsored</span><span dir="auto">Tertiary, out now</span>', img('c2pic', 'plain-c2.jpg'))}</div>
  <div aria-label="Reels" id="reelsShelf"><a href="/latest/reels_composer">Create reel</a><a href="/latest/posts">Posts</a></div></div>`;
const groupFeed = `<div role="main"><div role="feed">
  ${post('friend', 'A friend', '<span dir="auto">New pedal board</span>', img('friendPic', 'plain-friend.jpg'))}
  ${post('ad', 'Some Shop', '<span>Sponsored</span><span dir="auto">Buy now</span>')}
  ${post('ownAd', 'Wonderland Audio', '<span>Sponsored</span><span dir="auto">Tertiary, out now</span><div id="ownAdComments"><span dir="auto">Love this plugin</span></div>', img('ownAdPic', 'plain-ownad.jpg'))}
  ${post('ownFlag', 'Wonderland Audio', '<span>Sponsored</span><span dir="auto">Another ad</span>', img('ownFlagPic', 'flag-ownad.jpg'))}
  ${post('ownPost', 'Wonderland Audio', '<span dir="auto">A post of his</span><a id="boost" href="/ad_center/create/boostpost/?entry_point=www_profile_plus">Boost post</a>')}
  ${post('sugg', 'Pedal Pages', '<span>Suggested for you</span>')}
  ${post('fakeOwn', 'Wonderland Audio Deals', '<span>Sponsored</span>')}
  ${post('hot', 'Someone else', '<span dir="auto">Summer</span>', img('hotPic', 'flag-hot.jpg'))}
</div></div>`;
const ownPage = `<div role="main"><h1 id="pageName">Wonderland Audio</h1><div id="adminBar"><a id="pdash" href="/professional_dashboard/">Professional dashboard</a><a id="adcenter" href="/ad_center/">Ad Center</a><button id="promote">Promote</button></div>
  <div id="pymkBox"><span dir="auto">People you may know</span><a href="/p1">Person</a><a href="/p1/add">Add</a></div>
  <div role="feed">${post('pagePost', 'Wonderland Audio', '<span dir="auto">Tertiary</span><a id="boost2" href="/ad_center/create/boostpost/">Boost post</a>', img('pagePic', 'plain-page.jpg'))}</div></div>`;

const fakeBridge = `globalThis.IGFilterBridge = {
  stats: {}, stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
  classifyUrl(u) { return new Promise((r) => setTimeout(() => r(/slow-/.test(u) ? { _error: 'loading' } : /flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 }), 30)); },
  classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.01 }); },
};`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const pages = {
    'adsmanager.facebook.com/': adsManager, 'adsmanager.facebook.com/adsmanager/manage/ads/edit': adsManager,
    'business.facebook.com/': businessInbox, 'business.facebook.com/latest/inbox/all': businessInbox,
    'www.facebook.com/groups/pedals/': groupFeed, 'www.facebook.com/wonderlandaudiofx': ownPage,
    'www.facebook.com/notifications/': '<div role="main"><h1>Notifications</h1></div>',
    'www.instagram.com/': '<main><div id="feed">feed</div><aside><div id="sfy"><span>Suggested for you</span><a href="/a">a</a><a href="/b">b</a></div></aside></main>',
    'www.instagram.com/accounts/insights': '<main><div id="insights"><h2>Insights</h2><div id="sfy2"><span>Suggested for you</span><a href="/a">a</a><a href="/b">b</a></div></div></main>',
  };
  await ctx.route(/https:\/\/(adsmanager|business|www|m)\.(facebook|instagram)\.com\//, (r) => {
    const u = new URL(r.request().url());
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head></head><body>${pages[u.hostname + u.pathname.replace(/\/$/, '') ] || pages[u.hostname + u.pathname] || '<div role="main"></div>'}</body></html>` });
  });
  await ctx.route(/fbcdn\.net/, (r) => r.fulfill({ contentType: 'image/png', body: png }));
  for (const f of ['filter-config.js', 'rules.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  for (const f of ['ig-filter.js', 'ig-tidy.js', 'fb-tidy.js', 'hide-rules.js', 'hide-engine.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const go = async (url, wait = 1200) => { await page.goto(url); await page.waitForTimeout(wait); };
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; } return true; }, id);
  const all = async (ids) => { const out = {}; for (const i of ids) out[i] = await shown(i); return out; };

  // ---- Ads Manager ----
  await go('https://adsmanager.facebook.com/', 1500);
  check('ads manager: its own "/" is not sent to Notifications', new URL(page.url()).hostname === 'adsmanager.facebook.com' && new URL(page.url()).pathname === '/', page.url());
  await go('https://adsmanager.facebook.com/adsmanager/manage/ads/edit', 2000);
  let s = await all(['nav', 'cardEffects', 'aiToggle', 'effectsBtn', 'cardMedia', 'mediaBtn', 'cardPic', 'cardFlag', 'placeBtn', 'cardSlow', 'textBtn', 'adPreview', 'previewPic', 'sugRail']);
  check('ads manager: every settings card and its controls stay', s.nav && s.cardEffects && s.aiToggle && s.effectsBtn && s.cardMedia && s.mediaBtn && s.cardFlag && s.placeBtn && s.cardSlow && s.textBtn, JSON.stringify(s));
  check('ads manager: a clean picture is shown', s.cardPic);
  check('ads manager: his ad preview ("Sponsored") is shown, with its picture', s.adPreview && s.previewPic);
  check('ads manager: no rail or suggestion rule runs there', s.sugRail);
  check('ads manager: a suggestive picture still goes, by itself (its card stays)', !(await shown('flagPic')) && s.cardFlag);
  check('ads manager: a picture not judged yet stays hidden (never shown unjudged), its card stays', !(await shown('slowPic')) && s.cardSlow);

  // ---- Business Suite ----
  await go('https://business.facebook.com/', 1200);
  check('business suite: its own "/" is not sent to Notifications', new URL(page.url()).pathname === '/', page.url());
  await go('https://business.facebook.com/latest/inbox/all', 1500);
  s = await all(['c1', 'c2', 'c2pic', 'reelsShelf']);
  check('business suite: comments, his ad and its picture, his own content shelf all stay', s.c1 && s.c2 && s.c2pic && s.reelsShelf, JSON.stringify(s));

  // ---- his own Page ----
  await go('https://www.facebook.com/wonderlandaudiofx', 1500);
  s = await all(['pageName', 'pdash', 'adcenter', 'promote', 'pagePost', 'boost2', 'pagePic']);
  check("his Page: the admin bar (Professional dashboard, Ad Center, Promote) and Boost stay", Object.values(s).every(Boolean), JSON.stringify(s));
  check('his Page: is not sent to Notifications', new URL(page.url()).pathname === '/wonderlandaudiofx', page.url());

  // ---- the personal feed: as strong as before ----
  await go('https://www.facebook.com/', 1200);
  check('feed: facebook.com still goes to Notifications', new URL(page.url()).pathname === '/notifications/', page.url());
  await go('https://www.facebook.com/groups/pedals/', 1800);
  s = await all(['friend', 'friendPic', 'ad', 'sugg', 'hot', 'fakeOwn', 'ownAd', 'ownAdComments', 'ownAdPic', 'ownFlag', 'ownPost', 'boost']);
  check("feed: a friend's post stays", s.friend && s.friendPic, JSON.stringify(s));
  check('feed: every other ad still goes', !s.ad && !s.fakeOwn);
  check('feed: suggestions still go', !s.sugg);
  check('feed: a suggestive picture still hides its post', !s.hot);
  check('feed: his own ad shows, with its picture and its comments', s.ownAd && s.ownAdPic && s.ownAdComments);
  check('feed: his own post with a suggestive picture still goes, as any post in the feed', !s.ownFlag);
  check('feed: his own post and its Boost button stay', s.ownPost && s.boost);

  // ---- Instagram: suggestions go everywhere, his insights page included (suggestions are never work) ----
  await go('https://www.instagram.com/', 2000);
  check('instagram feed: "Suggested for you" still goes', !(await shown('sfy')));
  await go('https://www.instagram.com/accounts/insights/', 2000);
  check('instagram insights: shown, and its suggestions still go', (await shown('insights')) && !(await shown('sfy2')));

  // ---- the guard: no list can make a personal feed a work surface ----
  const guard = await page.evaluate(() => {
    const W = globalThis.IGFilterRules.work;
    const refused = ['facebook.com', 'www.facebook.com', 'm.facebook.com/', 'instagram.com', 'instagram.com/explore', 'facebook.com/reel/1', 'facebook.com/watch',
      'facebook.com/groups/pedals', 'facebook.com/home.php', 'facebook.com/messages', 'messenger.com', '*', '*/', 'reels.facebook.com', 'instagram.com/stories/x', 'www.instagram.com/p/abc'].filter((x) => W.scope(x));
    W.add(['facebook.com', 'instagram.com', 'www.facebook.com/', '*']);
    const merged = globalThis.FilterHideRules.merge(globalThis.FilterHideRules.bundled, { version: 9, work: ['facebook.com', 'instagram.com/explore', 'm.facebook.com'], sites: {} });
    W.add(merged.work);
    const stillFeed = ['https://www.facebook.com/', 'https://m.facebook.com/home.php', 'https://www.instagram.com/', 'https://www.instagram.com/explore/', 'https://www.facebook.com/reel/1', 'https://www.facebook.com/groups/pedals/'].filter((u) => W.on(u));
    const work = ['https://adsmanager.facebook.com/adsmanager/manage', 'https://business.facebook.com/latest/inbox', 'https://www.facebook.com/professional_dashboard/', 'https://studio.youtube.com/channel/x', 'https://wonderland.example/wp-admin/post.php'].filter((u) => !W.on(u));
    const prefix = W.on('https://www.facebook.com/wonderlandaudiofxfake') || W.on('https://www.instagram.com/wonderlandaudio2/');
    return { refused, stillFeed, work, prefix };
  });
  check('guard: no feed, Reels, Explore, group, messages or home scope is taken', guard.refused.length === 0, JSON.stringify(guard.refused));
  check('guard: after adding feed scopes by hand and by signed data, the feeds are still not work surfaces', guard.stillFeed.length === 0, JSON.stringify(guard.stillFeed));
  check('work: Ads Manager, Business Suite, the dashboard, YouTube Studio, wp-admin are work surfaces', guard.work.length === 0, JSON.stringify(guard.work));
  check('work: a scope is a whole path segment (another account with a longer name is not his)', !guard.prefix);

  // ---- the lines did not move ----
  const lines = await page.evaluate(() => ({ t: globalThis.IGFilterRules.thresholds, r: globalThis.IGFilterRules.revealing, c: globalThis.IGFilterConfig.suggestive }));
  check('lines: suggestive and revealing lines unchanged (0.3 / 0.45 / 0.6, revealing 0.6)', JSON.stringify(lines.t) === '{"explicit":0.3,"sexy":0.45,"combined":0.6}' && lines.r === 0.6, JSON.stringify(lines));
  check('no page errors', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
