// YouTube (youtube-filter.js; Joe, 2026-11-17: "*sexual* adult content, but not things like true-crime, violence, adult
// topics. This can be based on transcript/captioning, some imagery as long as it doesn't halt an intended video, and
// titles/channel text etc.").   node filter/test/youtube.test.mjs
// Proves: the text judge flags sexual titles and captions and not true crime, violence, a sexual-assault trial or adult
// topics; on a page built like YouTube's, a sexual tile goes from the feed, the others stay, a thumbnail judged
// suggestive takes its tile, and a playing video with a sexual title and captions is never paused, muted, hidden or
// removed (its channel's other tiles go from the sidebar instead). The pages are not YouTube's: they prove the rules,
// not that YouTube's live markup still matches the selectors (those are config, youtube.tiles).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const { chromium } = require('playwright');
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };

// ---- the text judge, alone ----
const ctx = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(shared, 'youtube-filter.js'), 'utf8'), ctx);
const Y = ctx.globalThis.YouTubeRules, T = Y.compile(Y.DEFAULTS.terms);
const sexual = ['Sexy bikini try on haul 2026', 'Lingerie try-on haul', 'and now she takes off the lingerie', 'Her OnlyFans story', 'Topless beach day', 'Thirst trap compilation'];
const not = ['The Golden State Killer: a true crime documentary', 'Most brutal street fights caught on camera', 'Serial killer case: the sexual assault trial explained',
  'Taxes, mortgages and other adult topics', 'War footage: the battle of Kursk', 'Sex education for parents: a doctor explains', 'Naked body found: the case that shocked a town', 'Fuzz pedal demo', 'Mixing kick and bass'];
for (const s of sexual) check(`text: sexual is flagged: "${s}"`, !!Y.sexualText(s, T), Y.sexualText(s, T));
for (const s of not) check(`text: not flagged: "${s}"`, !Y.sexualText(s, T), Y.sexualText(s, T));
const T2 = Y.compile({ always: ['pedal demo'], words: [], notWhen: [], patterns: ['\\bfuzz\\b'] });
check('text: the terms are data: a config can add a term and a pattern', !!Y.sexualText('Fuzz pedal demo', T2) && !Y.sexualText('Fuzz pedal demo', T));

// ---- the page ----
const home = `<!doctype html><body><div id="contents">${[['t1', 'Sexy bikini try on haul 2026'], ['t2', 'The Golden State Killer: a true crime documentary'], ['t3', 'Most brutal street fights caught on camera'], ['t4', 'Taxes, mortgages and other adult topics'], ['t5', 'Fuzz face clone build']]
  .map(([id, t]) => `<ytd-rich-item-renderer id="${id}"><a href="/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hq.jpg" width="320" height="180"></a><h3><a id="video-title">${t}</a></h3><ytd-channel-name>Ch ${id}</ytd-channel-name></ytd-rich-item-renderer>`).join('')}</div></body>`;
const watch = `<!doctype html><body><div id="primary"><div id="movie_player" class="html5-video-player"><video class="html5-main-video" id="v" autoplay playsinline width="640" height="360"></video>
  <div class="ytp-caption-window"><span class="ytp-caption-segment">and now she takes off the lingerie</span></div></div>
  <ytd-watch-metadata><h1>Lingerie try on haul</h1><ytd-channel-name>Racy Channel</ytd-channel-name></ytd-watch-metadata></div>
  <div id="secondary"><ytd-compact-video-renderer id="side1"><h3>Morning vlog</h3><ytd-channel-name>Racy Channel</ytd-channel-name></ytd-compact-video-renderer>
  <ytd-compact-video-renderer id="side2"><h3>Delay pedal shootout</h3><ytd-channel-name>Pedal Shop</ytd-channel-name></ytd-compact-video-renderer></div>
  <canvas id="c" width="640" height="360" style="display:none"></canvas><script>
  const c = document.getElementById('c'), x = c.getContext('2d'); let t = 0; setInterval(() => { t++; x.fillStyle = 'hsl(' + (t * 7 % 360) + ',40%,40%)'; x.fillRect(0, 0, 640, 360); }, 50);
  const v = document.getElementById('v'); v.muted = false; v.srcObject = c.captureStream(20); v.play().catch(() => { v.muted = true; v.play(); });
  </script></body>`;
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.route('https://i.ytimg.com/**', (r) => r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('https://www.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body: new URL(r.request().url()).pathname === '/watch' ? watch : home }));
  // a judge that flags one thumbnail, as the device's judge would a suggestive one
  await page.addInitScript(() => {
    globalThis.IGFilterBridge = { classifyUrl: async (u) => (/\/t5\//.test(u) ? { Porn: 0.9, Hentai: 0, Sexy: 0.05, Neutral: 0.05, Revealing: 0.1 } : { Porn: 0.01, Hentai: 0, Sexy: 0.01, Neutral: 0.97, Revealing: 0.05 }), stat: () => {} };
    globalThis.__youtubeConfig = { captions: { everySeconds: 1 } };
  });
  await page.addInitScript({ path: path.join(shared, 'youtube-filter.js') });
  await page.goto('https://www.youtube.com/'); await page.waitForTimeout(2500);
  const tiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('ytd-rich-item-renderer')].map((e) => [e.id, e.getAttribute('data-ytf-gone') || 'shown'])));
  check('page: a sexual title goes from the feed', /^text:/.test(tiles.t1), JSON.stringify(tiles));
  check('page: true crime, violence and adult topics stay', tiles.t2 === 'shown' && tiles.t3 === 'shown' && tiles.t4 === 'shown', JSON.stringify(tiles));
  check('page: a thumbnail judged suggestive takes its tile; thumbnails are not held while judged', tiles.t5 === 'thumbnail' && !(await page.$('[data-ytf-hold]')));
  await page.goto('https://www.youtube.com/watch?v=x');
  const before = await page.evaluate(() => { const v = document.getElementById('v'); return { muted: v.muted }; });
  await page.waitForTimeout(8000);
  const w = await page.evaluate(() => { const v = document.getElementById('v'); const p = document.getElementById('movie_player'); return { paused: v.paused, t: Math.round(v.currentTime), muted: v.muted, gone: !!document.querySelector('#movie_player[data-ytf-gone], #movie_player [data-ytf-gone], video[data-ytf-gone]'), shown: getComputedStyle(p).display !== 'none' && getComputedStyle(v).visibility !== 'hidden', side1: document.getElementById('side1').getAttribute('data-ytf-gone') || 'shown', side2: document.getElementById('side2').getAttribute('data-ytf-gone') || 'shown', flagged: globalThis.__ytFilter && globalThis.__ytFilter.watch && globalThis.__ytFilter.watch.why }; });
  check('playing: the watched video was judged sexual from its title and captions', !!w.flagged, String(w.flagged));
  check('playing: and it is never paused, muted, hidden or removed', !w.paused && w.t >= 6 && w.muted === before.muted && !w.gone && w.shown, JSON.stringify(w));
  check('playing: its channel goes from the sidebar instead; other recommendations stay', w.side1 === 'channel' && w.side2 === 'shown', JSON.stringify(w));
} finally { await browser.close(); }
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
