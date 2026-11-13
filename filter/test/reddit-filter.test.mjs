// Tests for the Reddit filter (filter/shared/reddit-filter.js with rules.js and filter-config.js) in Chromium or WebKit
// (ENGINE=webkit), on fixture pages served as old.reddit.com and www.reddit.com.
//   node filter/test/reddit-filter.test.mjs
// The fixtures copy the shape of Reddit's markup as documented: old Reddit's div.thing (data-subreddit, data-nsfw,
// .over18, .promoted, a.title, .linkflairlabel, .usertext-body .md, nested comments in .child), its search results
// and sidebar, the 18+ gate (.interstitial), and the newer pages' shreddit-post and shreddit-comment elements.
// No agent opened Reddit for these (Reddit stays blocked; locked memory entry 4): they prove the rules, not that
// Reddit's live pages still look like this. The allow-list is switched on with two subreddits for most pages here;
// as shipped it is on and EMPTY, which the first test proves shows nothing at all.
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
const link = (id, sub, title, o = {}) => `<div class="thing link ${o.cls || ''}" id="${id}" data-subreddit="${sub}" data-author="${o.author || 'someone'}" data-domain="${o.domain || 'self.' + sub}" ${o.nsfw ? 'data-nsfw="true"' : 'data-nsfw="false"'} ${o.promoted ? 'data-promoted="true"' : ''}>
  <a class="thumbnail" href="/r/${sub}/comments/${id}/"><img id="${id}-thumb" src="https://b.thumbs.redditmedia.com/${id}.jpg" width="70" height="70"></a>
  <div class="entry"><p class="title"><a class="title" href="/r/${sub}/comments/${id}/x/">${title}</a>${o.flair ? `<span class="linkflairlabel">${o.flair}</span>` : ''}${o.stamp ? '<span class="nsfw-stamp stamp">NSFW</span>' : ''}</p>
  <p class="tagline">submitted by <a class="author" href="/user/${o.author || 'someone'}">${o.author || 'someone'}</a> to <a class="subreddit" href="/r/${sub}/">r/${sub}</a></p>
  ${o.body ? `<div class="expando"><div class="usertext-body"><div class="md"><p>${o.body}</p></div></div></div>` : ''}</div></div>`;
const comment = (id, sub, body, o = {}) => `<div class="thing comment" id="${id}" data-subreddit="${sub}" data-author="${o.author || 'cm'}"><div class="entry"><p class="tagline"><a class="author" href="/user/${o.author || 'cm'}">${o.author || 'cm'}</a></p>
  <div class="usertext-body"><div class="md"><p>${body}</p></div></div></div><div class="child">${o.child || ''}</div></div>`;
const side = (text, extra = '') => `<div class="side"><div class="titlebox"><h1 class="redditname"><a href="/r/x/">x</a></h1>${extra}<div class="usertext-body"><div class="md"><p>${text}</p></div></div></div></div>`;
const head = `<div id="header"><div id="sr-header-area"><a id="hAll" href="/r/all/">all</a><a id="hPop" href="/r/popular/">popular</a></div><a id="hHome" href="/r/diypedals/">home</a><a id="toAll" href="https://old.reddit.com/r/all/">r/all</a><a id="toGW" href="/r/gonewild/">a link</a></div>`;

const pages = {
  '/r/diypedals/': `${head}<div class="content"><div id="siteTable" class="sitetable linklisting">
      ${link('ok1', 'diypedals', 'First fuzz build, hums a little')}
      ${link('ok2', 'diypedals', 'Tayda order came in', { body: 'Boxes of 3PDT switches and a wire stripper.', flair: 'Build' })}
      ${link('nsfw1', 'diypedals', 'A plain title', { nsfw: true })}
      ${link('nsfw2', 'diypedals', 'Another plain title', { cls: 'over18' })}
      ${link('nsfw3', 'diypedals', 'Stamped only', { stamp: true })}
      ${link('ad1', 'diypedals', 'Buy this', { promoted: true })}
      ${link('quar', 'diypedals', 'Plain', { cls: 'quarantine' })}
      ${link('txt1', 'diypedals', 'Check my OnlyFans')}
      ${link('txt2', 'diypedals', 'Plain title', { body: 'she was basically naked the whole time' })}
      ${link('txt3', 'diypedals', 'Plain title', { flair: 'NSFW' })}
      ${link('txt4', 'diypedals', 'Plain title', { author: 'spicy_amy' })}
      ${link('txt5', 'diypedals', 'Summer #bikini body')}
      ${link('lnk1', 'diypedals', 'Plain title', { domain: 'redgifs.com' })}
      ${link('other', 'pics', 'A sub that is not on the list')}
      ${link('gw', 'gonewild', 'From an adult-named sub')}
      <div class="thing weird" id="odd">a shape the filter does not know</div>
      <video id="vid" src="https://v.redd.it/abc/DASH_720.mp4" poster="https://external-preview.redd.it/p.jpg"></video>
      <iframe id="frame" src="https://www.youtube.com/embed/x"></iframe>
      <div id="bg" style="background-image:url(https://i.redd.it/banner.jpg);width:200px;height:50px">banner text</div>
    </div></div>${side('Build your own guitar pedals. Be kind.')}`,
  '/r/diypedals/comments/abc/first_fuzz/': `${head}<div class="content"><div class="sitetable linklisting">${link('post', 'diypedals', 'First fuzz build', { body: 'Schematic inside.' })}</div>
    <div class="commentarea"><div class="sitetable nestedlisting">
      ${comment('c1', 'diypedals', 'Nice work. Check the ground on the input jack.', { child: comment('c1a', 'diypedals', 'send nudes lol') + comment('c1b', 'diypedals', 'Thanks, that fixed it.') })}
      ${comment('c2', 'diypedals', 'I was so horny for this build', { child: comment('c2a', 'diypedals', 'A clean reply under a removed comment') })}
      ${comment('c3', 'diypedals', 'Looks good', { author: 'onlyfans_kate' })}
      <img id="cimg" src="https://i.redd.it/inline.png">
    </div></div></div>${side('Build your own guitar pedals.')}`,
  '/r/diypedals/comments/bad/x/': `${head}<div class="content"><div class="sitetable linklisting">${link('badpost', 'diypedals', 'Plain', { nsfw: true })}</div>
    <div class="commentarea"><div class="sitetable nestedlisting">${comment('bc1', 'diypedals', 'A clean comment on a removed post')}</div></div></div>`,
  '/r/synthdiy/': `${head}<div class="content"><div class="sitetable">${link('s1', 'synthdiy', 'VCO drift')}</div></div>${side('DIY synths. 18+ community, nsfw posts welcome')}`,
  '/r/audioengineering/': `${head}<div class="content"><div class="sitetable">${link('a1', 'audioengineering', 'Mic placement')}</div></div>${side('Audio.')}`,
  '/r/diypedals+pics/': `<div class="content">${link('m1', 'diypedals', 'ok')}</div>`,
  '/r/gonewild/': `<div class="content">${link('g1', 'gonewild', 'x')}</div>`,
  '/r/all/': `<div class="content">${link('all1', 'diypedals', 'x')}</div>`,
  '/r/popular/': `<div class="content">${link('pop1', 'diypedals', 'x')}</div>`,
  '/': `<div class="content">${link('front1', 'diypedals', 'x')}</div>`,
  '/over18': `<div class="content"><div class="interstitial"><form action="/over18" method="post"><button>Yes</button></form></div></div>`,
  '/r/diypedals/gated/': `<div class="content"><div class="interstitial"><h3>You must be 18+ to view this community</h3></div>${link('gate1', 'diypedals', 'x')}</div>`,
  '/search': `${head}<div class="content"><input name="include_over_18" id="inc18" type="checkbox"><label for="include_over_18" id="inc18l">include NSFW</label>
      <div class="search-result search-result-link" id="sr1"><a class="search-title" href="/r/diypedals/comments/1/">Fuzz face bias</a><a class="search-subreddit-link" href="/r/diypedals/">r/diypedals</a></div>
      <div class="search-result search-result-link" id="sr2"><a class="search-title" href="/r/diypedals/comments/2/">Plain</a><span class="nsfw-stamp stamp">NSFW</span><a class="search-subreddit-link" href="/r/diypedals/">r/diypedals</a></div>
      <div class="search-result search-result-link" id="sr3"><a class="search-title" href="/r/pics/comments/3/">Plain</a><a class="search-subreddit-link" href="/r/pics/">r/pics</a></div>
      <div class="search-result search-result-subreddit" id="sr4"><a class="search-title" href="/r/synthdiy/">r/synthdiy</a></div>
    </div>`,
  '/message/inbox/': `<div class="content"><div class="thing message" id="msg1" data-author="friend"><div class="entry"><div class="md"><p>Got your pedal, thanks</p></div></div></div>
      <div class="thing message" id="msg2" data-author="spam"><div class="entry"><div class="md"><p>hot singles, pics in profile</p></div></div></div></div>`,
  '/user/someone/': `<div class="content">${link('u1', 'diypedals', 'A post of theirs on the list')}${link('u2', 'pics', 'One off the list')}</div>`,
  '/user/xo_nsfw_bella/': `<div class="content">${link('ub1', 'diypedals', 'x')}</div>`,
};
// The newer pages (www.reddit.com), should the app ever be shown them.
const newPages = {
  '/r/diypedals/': `<shreddit-app><shreddit-post id="np1" subreddit-prefixed-name="r/diypedals" post-title="Muff clone" author="dan"><div slot="thumbnail"><img id="npimg" src="https://preview.redd.it/x.jpg"></div><a slot="title">Muff clone</a><div slot="text-body">Works first try</div></shreddit-post>
      <shreddit-post id="np2" nsfw subreddit-prefixed-name="r/diypedals" post-title="Plain" author="dan"><a slot="title">Plain</a></shreddit-post>
      <shreddit-post id="np3" subreddit-prefixed-name="r/pics" post-title="Off the list" author="dan"><a slot="title">Off the list</a></shreddit-post>
      <shreddit-post id="np4" subreddit-prefixed-name="r/diypedals" post-title="so sexy" author="dan"><a slot="title">so sexy</a></shreddit-post>
      <shreddit-ad-post id="npad">An ad</shreddit-ad-post>
      <shreddit-comment id="nc1" author="amy"><div slot="comment">Good solder joints</div><shreddit-comment id="nc2" author="bo"><div slot="comment">nice boobs</div></shreddit-comment></shreddit-comment>
      <shreddit-player id="nplayer" src="https://v.redd.it/x"></shreddit-player></shreddit-app>`,
  '/r/nsfwcommunity/': `<shreddit-app><shreddit-post id="nx1" subreddit-prefixed-name="r/nsfwcommunity" post-title="x"></shreddit-post></shreddit-app>`,
};

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };
const browser = await engine.launch();
const requests = [];
async function context(allow) {
  const ctx = await browser.newContext();
  const html = (b) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>${b}</body></html>`;
  await ctx.route(/https:\/\/old\.reddit\.com\//, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html(pages[new URL(r.request().url()).pathname] || '<div class="content"></div>') }));
  await ctx.route(/https:\/\/www\.reddit\.com\//, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html(newPages[new URL(r.request().url()).pathname] || '<shreddit-app></shreddit-app>') }));
  await ctx.route(/redd\.it|redditmedia|youtube/, (r) => { requests.push(r.request().url()); r.fulfill({ contentType: 'image/png', body: png }); });
  const cfg = fs.readFileSync(path.join(shared, 'filter-config.js'), 'utf8');
  await ctx.addInitScript({ content: cfg + (allow ? `\nglobalThis.IGFilterConfig.reddit.allowList = { on: true, subreddits: ${JSON.stringify(allow)} };` : '') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'rules.js'), 'utf8') });
  await ctx.addInitScript({ content: 'globalThis.IGFilterBridge = { stats: {}, stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; } };' });
  for (const f of ['ig-filter.js', 'fb-tidy.js', 'reddit-filter.js']) await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror:', e.message); failed++; });
  const go = async (p, host = 'old') => { await page.goto(`https://${host}.reddit.com${p}`); await page.waitForFunction(() => document.documentElement.hasAttribute('data-rdf-pass'), null, { timeout: 10000 }); await page.waitForTimeout(250); };
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }, id);
  const blocked = () => page.evaluate(() => document.documentElement.getAttribute('data-rdf-blocked'));
  const text = () => page.evaluate(() => document.body.innerText);
  const bodyGone = () => page.evaluate(() => getComputedStyle(document.body).display === 'none'); // nothing of the page is drawn
  return { ctx, page, go, shown, blocked, text, bodyGone };
}

try {
  // ---- as shipped: the allow-list is on and empty, so nothing shows anywhere ----
  {
    const cfgText = fs.readFileSync(path.join(shared, 'filter-config.js'), 'utf8');
    check('as shipped: "open" is false, the allow-list is on and empty', /"open": false/.test(cfgText) && /"allowList": \{ "on": true, "subreddits": \[\] \}/.test(cfgText));
    const t = await context(null);
    for (const p of ['/r/diypedals/', '/', '/r/all/', '/r/diypedals/comments/abc/first_fuzz/', '/user/someone/', '/search?q=fuzz']) {
      await t.go(p);
      const b = await t.blocked(), tx = (await t.text()).trim();
      const none = b || (!(await t.shown('ok1')) && !(await t.shown('post')) && !(await t.shown('u1')) && !(await t.shown('sr1')));
      check(`as shipped: ${p} shows no post, comment or result`, !!none && (!!b ? await t.bodyGone() : !/fuzz|Tayda|Schematic|ground on the input/i.test(tx)), b || '');
    }
    await t.ctx.close();
  }

  const t = await context(['diypedals', 'synthdiy']);
  const { page, go, shown, blocked } = t;

  // ---- a subreddit on the list: text posts stay, everything flagged goes ----
  await go('/r/diypedals/');
  check('listing: clean text posts stay', (await shown('ok1')) && (await shown('ok2')));
  check('listing: "wire stripper" is not a suggestive word', await shown('ok2'));
  check('nsfw: data-nsfw="true"', !(await shown('nsfw1')));
  check('nsfw: class over18', !(await shown('nsfw2')));
  check('nsfw: the NSFW stamp alone', !(await shown('nsfw3')));
  check('promoted posts', !(await shown('ad1')));
  check('quarantined posts', !(await shown('quar')));
  check('text: an adult platform in the title', !(await shown('txt1')));
  check('text: a term in the body', !(await shown('txt2')));
  check('text: flair', !(await shown('txt3')));
  check("text: the author's name", !(await shown('txt4')));
  check('text: the shared suggestive words (#bikini)', !(await shown('txt5')));
  check('links: a post that links to an adult media site', !(await shown('lnk1')));
  check('allow-list: a post from a subreddit off the list', !(await shown('other')));
  check('subreddits: a post from an adult-named subreddit', !(await shown('gw')));
  check('fails closed: a shape the filter does not know is not shown', !(await shown('odd')));
  check('media: no thumbnail', !(await shown('ok1-thumb')));
  check('media: no video, no embed', !(await shown('vid')) && !(await shown('frame')));
  check('media: a background picture is not drawn, its text stays', (await shown('bg')) && await page.evaluate(() => getComputedStyle(document.getElementById('bg')).backgroundImage === 'none'));
  check('media: addresses are taken off the elements', await page.evaluate(() => !document.getElementById('vid').getAttribute('src') && !document.getElementById('vid').getAttribute('poster') && !document.getElementById('ok1-thumb').getAttribute('src')));
  check('feeds: the bar of other subreddits (r/all, r/popular) is gone', !(await shown('hAll')) && !(await shown('hPop')));
  check('feeds: a link to r/all or to an adult-named subreddit is not shown', !(await shown('toAll')) && !(await shown('toGW')) && (await shown('hHome')));
  check('discreet: nothing on the page says why', !/hidden|filtered|removed|nsfw/i.test(await t.text()));
  const stats = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('counts: by reason, on the device', stats['hidden-rd-nsfw'] === 3 && stats['hidden-rd-promoted'] === 1 && stats['hidden-rd-text'] >= 5 && stats['hidden-rd-off-list'] === 1 && stats['hidden-rd-sub-nsfw'] === 1 && stats['hidden-rd-quarantined'] === 1 && stats['hidden-rd-link'] === 1, JSON.stringify(stats));

  // ---- a post added later (more posts loaded) is judged before it shows ----
  await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<div class="thing link" id="late1" data-subreddit="diypedals" data-nsfw="true"><div class="entry"><a class="title">late</a></div></div><div class="thing link" id="late2" data-subreddit="diypedals" data-nsfw="false"><div class="entry"><a class="title">late and clean</a></div></div><img id="lateimg" src="https://i.redd.it/late.jpg">'; document.querySelector('.sitetable').append(...d.children); });
  await page.waitForTimeout(400);
  check('later posts: judged the same', !(await shown('late1')) && (await shown('late2')) && !(await shown('lateimg')));
  await page.evaluate(() => { document.querySelector('#late2 a.title').textContent = 'late and nsfw now'; });
  await page.waitForTimeout(400);
  check('a post whose text changes is judged again', !(await shown('late2')));

  // ---- comments ----
  await go('/r/diypedals/comments/abc/first_fuzz/');
  check('comments: the post and clean comments stay', (await shown('post')) && (await shown('c1')) && (await shown('c1b')));
  check('comments: a flagged reply goes, its parent stays', !(await shown('c1a')) && (await shown('c1')));
  check('comments: a flagged comment goes with the replies under it', !(await shown('c2')) && !(await shown('c2a')));
  check("comments: by the author's name", !(await shown('c3')));
  check('comments: no inline picture', !(await shown('cimg')));
  await go('/r/diypedals/comments/bad/x/');
  check("a removed post's own page does not open", !!(await blocked()) && !(await shown('bc1')), String(await blocked()));

  // ---- pages that do not open ----
  for (const [p, why] of [['/r/all/', 'r/all'], ['/r/popular/', 'r/popular'], ['/', 'the front page'], ['/r/gonewild/', 'an adult-named subreddit'], ['/r/audioengineering/', 'a subreddit off the list'], ['/r/diypedals+pics/', 'a multireddit with one off the list'], ['/over18', 'the 18+ gate'], ['/r/diypedals/gated/', 'an 18+ notice on a listed subreddit'], ['/r/synthdiy/', 'a listed subreddit whose description is adult'], ['/user/xo_nsfw_bella/', 'a person with an adult name'], ['/search?q=x&include_over_18=on', 'a search that asks for 18+']]) {
    await go(p);
    check(`does not open: ${why}`, !!(await blocked()) && (await t.bodyGone()), String(await blocked()));
  }

  // ---- search, messages, a person's page ----
  await go('/search?q=fuzz');
  check('search: a clean result on the list stays', await shown('sr1'));
  check('search: NSFW, off-list results go; the 18+ switch is gone', !(await shown('sr2')) && !(await shown('sr3')) && !(await shown('inc18')) && !(await shown('inc18l')));
  check('search: a listed subreddit result stays', await shown('sr4'));
  await go('/message/inbox/');
  check('messages: a clean one stays, a come-on goes', (await shown('msg1')) && !(await shown('msg2')));
  await go('/user/someone/');
  check("a person's page: only their posts on the list", (await shown('u1')) && !(await shown('u2')));

  // ---- the newer pages ----
  await go('/r/diypedals/', 'www');
  check('new Reddit: a clean post stays, without its thumbnail', (await shown('np1')) && !(await shown('npimg')));
  check('new Reddit: nsfw, off-list, flagged text, ads, players go', !(await shown('np2')) && !(await shown('np3')) && !(await shown('np4')) && !(await shown('npad')) && !(await shown('nplayer')));
  check('new Reddit: comments by their own text', (await shown('nc1')) && !(await shown('nc2')));
  await go('/r/nsfwcommunity/', 'www');
  check('new Reddit: an adult-named subreddit does not open', !!(await blocked()));
  console.log(`note ${requests.length} media requests reached the test server (the app refuses them on the network itself)`);
  await t.ctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
