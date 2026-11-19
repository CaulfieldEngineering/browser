// YouTube, Joe's spec of 2026-11-19: "For youtube: sexual content only - so, this can be things like latex models,
// asmr-type content, explicitly bikini models, things that obviously do not provide any other value".
//   node filter/test/youtube-scope.test.mjs
// Both kinds, on pages shaped like YouTube's as it was read live on 2026-11-19 (search: ytd-video-renderer and the Shorts
// shelf's ytm-shorts-lockup-view-model-v2; the watch page's sidebar: yt-lockup-view-model; the end screen's stills
// inside the player): in scope is removed, out of scope is shown, by title, channel words and thumbnail; a tile that
// goes is blank in place (YouTube's layout exactly as it was); the player and the video being played are never touched.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const pw = require('playwright');
const engine = pw[process.env.ENGINE || 'chromium'];
let failed = 0, n = 0;
const check = (name, ok, x = '') => { n++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : x}`); if (!ok) failed++; };

// ---- titles: in scope and out of scope ----
export const IN_SCOPE = ['Latex model photoshoot 4K', 'Latex catsuit try on', 'Black latex leggings haul', 'ASMR girlfriend takes care of you', 'Sensual ASMR ear licking',
  'ASMR kisses and whispers for sleep', 'Bikini model beach shoot 2026', 'Micro bikini try on haul', 'Swimsuit model lookbook', 'Lingerie try-on',
  'ASMR | your gf cuddles you in bed (roleplay)', 'Sheer try on haul', 'Transparent try on haul with Mia', 'Yoga pants try on', 'Fetish fashion show highlights',
  'Hot girls dancing compilation', 'Leather bodysuit lookbook', 'Her OnlyFans story', 'Thirst trap compilation', 'Topless beach day'];
export const OUT_OF_SCOPE = ['LaTeX tutorial for beginners: write your thesis in Overleaf', 'ASMR tapping and scratching for sleep (no talking)', 'ASMR cooking: crispy fried chicken',
  'Whispered ASMR reading you a bedtime story', 'Olympic beach volleyball final highlights', 'How to paint a wall with latex paint', '10 minute ab workout at home',
  'Learn to swim freestyle: technique drills', 'Fuzz pedal demo', 'Surfing Pipeline in a storm', 'Bikini Atoll: the nuclear tests explained', 'SpongeBob: best of Bikini Bottom',
  'Taylor Swift - official video', 'Maldives travel vlog: snorkeling with manta rays', 'Bodybuilding competition posing routine', 'Latex allergy: what nurses should know',
  'Making a latex mask: SFX prosthetic tutorial', 'Deftones live at Rock am Ring', 'ASMR barber shop haircut roleplay', 'Triathlon wetsuit review',
  'The Golden State Killer: a true crime documentary', 'Sex education for parents: a doctor explains', 'Stand-up comedy special: full show', 'Evening news, November 19',
  'Winter coat try on haul', 'Best wire stripper tools reviewed', 'How to sew lingerie: a bralette pattern tutorial', 'Thrifted jeans try-on haul', 'Spider-Man cosplay: making the suit',
  'Leather jacket lookbook for men', 'School uniform haul for kids', 'Catsuit costume DIY for Halloween', 'Motorcycle leather racing suit review',
  'How to make a latex dress: SFX tutorial', 'ASMR with my wife: tapping and scratching'];
const ctx = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(shared, 'youtube-filter.js'), 'utf8'), ctx);
const Y = ctx.globalThis.YouTubeRules;
// the terms the laptop runs with: the signed config's, where it carries any (else the module's own)
const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'config', 'filter-config.json'), 'utf8'));
const merged = Y.merge(Y.DEFAULTS, cfg.youtube || {});
const T = Y.compile(merged.terms);
check('config: YouTube is on, for youtube.com', cfg.features.youtube && cfg.features.youtube.on === true && (cfg.features.youtube.sites || []).includes('youtube.com'), JSON.stringify(cfg.features.youtube));
check('config: its thumbnails are not held while judged, and the revealing-clothing line is not used on YouTube', merged.thumbnails.hold === false && merged.thumbnails.revealing === null, JSON.stringify(merged.thumbnails));
for (const s of IN_SCOPE) check(`title in scope, removed: "${s}"`, !!Y.sexualText(s, T));
for (const s of OUT_OF_SCOPE) check(`title out of scope, shown: "${s}"`, !Y.sexualText(s, T), String(Y.sexualText(s, T)));

// ---- pages ----
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// [id, title, channel, thumbnail kind]: "sexy" is a thumbnail the suggestive judge flags (a bikini model), "skin" one only
// the revealing-clothing judge would (a swimmer, a fitness instructor: out of scope on YouTube), "plain" neither.
const SEARCH = [['s1', 'Bikini model beach shoot 2026', 'Beach Models', 'plain'], ['s2', 'Learn to swim freestyle: technique drills', 'Swim Coach', 'skin'],
  ['s3', 'Summer vlog day 4', 'Daily Vlogs', 'sexy'], ['s4', 'Fuzz pedal demo', 'Pedal Shop', 'plain'], ['s5', 'ASMR tapping and scratching for sleep', 'Quiet Sounds', 'plain'],
  ['s6', 'Sensual ASMR ear licking', 'ASMR Love', 'plain'], ['s7', '10 minute ab workout at home', 'Fit At Home', 'skin'], ['s8', 'Latex catsuit try on', 'Shiny Looks', 'plain']];
const SHORTS = [['h1', 'Micro bikini try on haul', '', 'plain'], ['h2', 'Guitar lick of the day', '', 'plain'], ['h3', 'day at the pool', '', 'sexy'], ['h4', 'Olympic beach volleyball rally', '', 'skin']];
const SIDE = [['w1', 'Lingerie try-on', 'Looks', 'plain'], ['w2', 'Delay pedal shootout', 'Pedal Shop', 'plain'], ['w3', 'Morning routine', 'Daily Vlogs', 'sexy'], ['w4', 'Deftones live at Rock am Ring', 'Rock am Ring', 'plain']];
const thumb = (id, kind, w, h) => `<a href="/watch?v=${id}" style="display:block;width:${w}px;height:${h}px"><img src="https://i.ytimg.com/vi/${kind}-${id}/hq720.jpg" style="display:block;width:${w}px;height:${h}px"></a>`;
const searchPage = `<!doctype html><html><body style="margin:0;font:14px Roboto,Arial"><div id="masthead" style="height:56px"><input id="search" aria-label="Search" style="width:400px"></div>
<ytd-search style="display:block;margin:0 auto;width:1000px"><div id="contents">
${SEARCH.slice(0, 4).map(([id, t, ch, k]) => `<ytd-video-renderer id="${id}" style="display:flex;gap:16px;margin:8px 0;height:202px">${thumb(id, k, 360, 202)}<div><h3><a id="video-title" title="${t}" href="/watch?v=${id}">${t}</a></h3><ytd-channel-name>${ch}\n   ${ch}</ytd-channel-name></div></ytd-video-renderer>`).join('')}
<ytd-reel-shelf-renderer style="display:block;margin:16px 0"><h2>Shorts</h2><div style="display:flex;gap:8px">${SHORTS.map(([id, t, , k]) => `<ytm-shorts-lockup-view-model-v2 id="${id}" style="display:block;width:210px"><ytm-shorts-lockup-view-model style="display:block"><a href="/shorts/${id}" style="display:block;width:210px;height:373px"><img src="https://i.ytimg.com/vi/${k}-${id}/oar2.jpg" style="display:block;width:210px;height:373px"></a><h3><a href="/shorts/${id}" title="${t}">${t}</a></h3></ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2>`).join('')}</div></ytd-reel-shelf-renderer>
${SEARCH.slice(4).map(([id, t, ch, k]) => `<ytd-video-renderer id="${id}" style="display:flex;gap:16px;margin:8px 0;height:202px">${thumb(id, k, 360, 202)}<div><h3><a id="video-title" title="${t}" href="/watch?v=${id}">${t}</a></h3><ytd-channel-name>${ch}</ytd-channel-name></div></ytd-video-renderer>`).join('')}
</div></ytd-search></body></html>`;
const watchPage = (title) => `<!doctype html><html><body style="margin:0;font:14px Roboto,Arial"><div style="display:flex;gap:24px;width:1400px;margin:0 auto">
<div id="primary" style="width:960px"><ytd-player id="ytd-player" style="display:block"><div id="movie_player" class="html5-video-player" style="position:relative;width:960px;height:540px;background:#000">
  <video class="html5-main-video" id="v" autoplay playsinline style="width:960px;height:540px"></video>
  <div class="ytp-endscreen-content" style="position:absolute;left:0;top:0"><a class="ytp-videowall-still" id="e1" href="/watch?v=e1" style="display:block;width:200px;height:112px"><span class="ytp-videowall-still-info-title">Bikini model beach shoot</span></a><a class="ytp-videowall-still" id="e2" href="/watch?v=e2" style="display:block;width:200px;height:112px"><span class="ytp-videowall-still-info-title">Fuzz face clone build</span></a></div>
</div></ytd-player>
<ytd-watch-metadata style="display:block"><h1>${title}</h1><div id="owner"><ytd-channel-name id="channel-name">Pedal Shop\n   \n  Pedal Shop</ytd-channel-name></div><div id="description">A demo.</div></ytd-watch-metadata></div>
<div id="secondary" style="width:400px">${SIDE.map(([id, t, ch, k]) => `<yt-lockup-view-model id="${id}" style="display:flex;gap:8px;margin:0 0 8px;height:94px">${thumb(id, k, 168, 94)}<div><h3 title="${t}"><a href="/watch?v=${id}">${t}</a></h3><span class="yt-content-metadata-view-model__metadata-text">${ch}</span></div></yt-lockup-view-model>`).join('')}</div></div>
<canvas id="c" width="640" height="360" style="display:none"></canvas><script>
const c = document.getElementById('c'), x = c.getContext('2d'); let t = 0; setInterval(() => { t++; x.fillStyle = 'hsl(' + (t * 7 % 360) + ',40%,40%)'; x.fillRect(0, 0, 640, 360); }, 50);
const v = document.getElementById('v'); v.muted = false; v.srcObject = c.captureStream(20); v.play().catch(() => { v.muted = true; v.play(); });
window.pauses = 0; v.addEventListener('pause', () => window.pauses++);
</script></body></html>`;
const rects = () => [...document.querySelectorAll('body *')].map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.tagName, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); });
const seen = (ids) => Object.fromEntries(ids.map((id) => { const e = document.getElementById(id); return [id, e.hasAttribute('data-ytf-gone') || getComputedStyle(e).visibility === 'hidden' ? 'gone' : 'shown']; }));

const browser = await engine.launch({ headless: true, args: process.env.ENGINE ? [] : ['--autoplay-policy=no-user-gesture-required'] });
try {
  const open = async (filtered, url, body) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://i.ytimg.com/**', (r) => r.fulfill({ contentType: 'image/png', body: png }));
    await page.route('https://www.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html', body }));
    if (filtered) {
      await page.addInitScript((yt) => {
        // the device's judges: "sexy" is flagged by the suggestive judge, "skin" only scores high on revealing clothing
        globalThis.IGFilterBridge = { classifyUrl: async (u) => (/\/sexy-/.test(u) ? { Porn: 0.1, Hentai: 0, Sexy: 0.9, Neutral: 0.05, Drawing: 0, Revealing: 0.97 } : /\/skin-/.test(u) ? { Porn: 0.02, Hentai: 0, Sexy: 0.2, Neutral: 0.7, Drawing: 0, Revealing: 0.85 } : { Porn: 0.01, Hentai: 0, Sexy: 0.01, Neutral: 0.97, Drawing: 0, Revealing: 0.05 }), stat: () => {} };
        globalThis.__youtubeConfig = yt;
      }, { ...(cfg.youtube || {}), captions: { everySeconds: 1 } });
      await page.addInitScript({ path: path.join(shared, 'youtube-filter.js') });
    }
    await page.goto(url);
    await page.waitForTimeout(filtered ? 3500 : 800);
    return page;
  };
  // search and its Shorts shelf
  let base = await open(false, 'https://www.youtube.com/results?search_query=x', searchPage);
  const before = await base.evaluate(rects); await base.close();
  let page = await open(true, 'https://www.youtube.com/results?search_query=x', searchPage);
  const st = await page.evaluate(seen, [...SEARCH, ...SHORTS].map((r) => r[0]));
  check('search: in scope by title goes (bikini model, sensual ASMR, latex try-on)', st.s1 === 'gone' && st.s6 === 'gone' && st.s8 === 'gone', JSON.stringify(st));
  check('search: in scope by thumbnail goes (a plain title, a thumbnail the suggestive judge flags)', st.s3 === 'gone', JSON.stringify(st));
  check('search: out of scope stays (a swimming lesson and a workout whose thumbnails show skin, a pedal demo, ordinary ASMR)', st.s2 === 'shown' && st.s7 === 'shown' && st.s4 === 'shown' && st.s5 === 'shown', JSON.stringify(st));
  check('Shorts shelf: in scope goes by title and by thumbnail; a guitar short and a volleyball rally stay', st.h1 === 'gone' && st.h3 === 'gone' && st.h2 === 'shown' && st.h4 === 'shown', JSON.stringify(st));
  const after = await page.evaluate(rects);
  const moved = before.filter((r, i) => r !== after[i]);
  check('search: the layout is exactly as YouTube made it (every box where it was; a tile that goes is blank in place)', before.length === after.length && moved.length === 0, moved.slice(0, 4).join(' | '));
  check('search: nothing is display:none, and a blank tile takes no click', await page.evaluate(() => [...document.querySelectorAll('[data-ytf-gone]')].every((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).pointerEvents === 'none')));
  check('search: the search field is untouched', await page.evaluate(() => getComputedStyle(document.getElementById('search')).visibility === 'visible'));
  check('search: thumbnails are never held while they are judged', !(await page.$('[data-ytf-hold]')));
  await page.close();
  // a watch page: the video he chose, the sidebar, the end screen
  for (const [label, title] of [['an ordinary video', 'Fuzz pedal demo'], ['a video whose own title is in scope', 'Latex catsuit try on haul']]) {
    base = await open(false, 'https://www.youtube.com/watch?v=x', watchPage(title));
    const wb = await base.evaluate(rects); await base.close();
    page = await open(true, 'https://www.youtube.com/watch?v=x', watchPage(title));
    await page.waitForTimeout(4000);
    const w = await page.evaluate(() => { const v = document.getElementById('v'), p = document.getElementById('movie_player'), cs = (e) => getComputedStyle(e);
      return { paused: v.paused, pauses: window.pauses, t: v.currentTime, muted: v.muted, playerShown: cs(p).visibility === 'visible' && cs(p).display !== 'none' && cs(v).visibility === 'visible' && cs(v).display !== 'none',
        marked: !!document.querySelector('#movie_player[data-ytf-gone], ytd-player[data-ytf-gone], video[data-ytf-gone], #primary[data-ytf-gone], ytd-watch-metadata[data-ytf-gone]'), inert: p.inert || v.inert,
        why: globalThis.__ytFilter.watch && globalThis.__ytFilter.watch.why, channel: globalThis.__ytFilter.watch && globalThis.__ytFilter.watch.channel }; });
    check(`watch, ${label}: the player and the video are never paused, muted, hidden, covered or marked`, !w.paused && w.pauses === 0 && w.t > 3 && !w.muted && w.playerShown && !w.marked && !w.inert, JSON.stringify(w));
    const sw = await page.evaluate(seen, [...SIDE.map((r) => r[0]), 'e1', 'e2']);
    check(`watch, ${label}: the sidebar loses what is in scope (a lingerie try-on, a flagged thumbnail) and keeps the rest`, sw.w1 === 'gone' && sw.w3 === 'gone' && sw.w4 === 'shown' && (title === 'Fuzz pedal demo' ? sw.w2 === 'shown' : true), JSON.stringify(sw));
    check(`watch, ${label}: the end screen loses the in-scope still and keeps the other`, sw.e1 === 'gone' && sw.e2 === 'shown', JSON.stringify(sw));
    if (title !== 'Fuzz pedal demo') check('watch: a video in scope is still played; its channel (read as one line) goes from the recommendations instead', !!w.why && w.channel === 'pedal shop' && sw.w2 === 'gone', JSON.stringify({ w, sw }));
    const wa = await page.evaluate(rects), wm = wb.filter((r, i) => r !== wa[i]);
    check(`watch, ${label}: the layout is exactly as YouTube made it`, wb.length === wa.length && wm.length === 0, wm.slice(0, 4).join(' | '));
    await page.close();
  }
} finally { await browser.close(); }
console.log(failed ? `${failed} FAILED of ${n}` : `all ${n} passed`);
process.exit(failed ? 1 : 0);
