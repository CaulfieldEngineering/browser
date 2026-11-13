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
const pw = require('playwright');
const chromium = pw[process.env.ENGINE || 'chromium']; // ENGINE=webkit runs the same tests in WebKit

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CDN = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15';
const tile = (id, href, file) => `<div class="_aabd"><a id="${id}" href="${href}" role="link"><div class="_aagu"><div class="_aagv"><img src="${CDN}/${file}" class="x5yr21d" style="width:200px;height:200px" alt=""></div></div></a></div>`;
const bgTile = (id, href, file) => `<div class="x1qjc9v5"><a id="${id}" href="${href}" role="link"><div class="x1lliihq" style="width:200px;height:300px"><div class="x1i10hfl" style="background-image: url(&quot;${CDN}/${file}&quot;); width:200px; height:300px; background-size:cover"></div></div><div class="x6s0dn4">12.3K</div></a></div>`;
// Instagram's bottom tab bar on the phone: five slots, the search tab labelled "Explore", the profile tab an avatar.
const NAV = `<div class="x1n2onr6" id="tabbar" style="position:fixed;left:0;right:0;bottom:0;height:50px;display:flex">
  <div class="slot" style="flex:1"><a id="tHome" href="/?variant=following" role="link"><svg width="24" height="24" aria-label="Home"></svg></a></div>
  <div class="slot" style="flex:1"><a id="tSearch" href="/explore/" role="link"><svg width="24" height="24" aria-label="Search"></svg><span>Explore</span></a></div>
  <div class="slot" style="flex:1"><a id="tReels" href="/reels/" role="link"><svg width="24" height="24" aria-label="Reels"></svg><span>Reels</span></a></div>
  <div class="slot" style="flex:1"><a id="tMsg" href="/direct/inbox/" role="link"><svg width="24" height="24" aria-label="Messages"></svg></a></div>
  <div class="slot" style="flex:1"><a id="tProfile" href="/joe/" role="link"><img src="${CDN}/plain-me.jpg" style="width:24px;height:24px" alt="joe's profile picture"></a></div>
</div>`;
// The "use the app" strip Instagram floats above the bar, with its own close control.
const BANNER = `<div id="appbanner" style="position:fixed;right:0;bottom:50px;height:36px;display:flex"><a href="https://apps.apple.com/app/instagram/id389801252">Use the app</a><button id="bannerx" aria-label="Close"><svg width="12" height="12" viewBox="0 0 10 10"><path d="M1 1l8 8"/></svg></button></div>`;
const reelViewer = (names, start) => `<main><div id="sc" style="height:600px;overflow-y:scroll;scroll-snap-type:y mandatory">${names.map((n, i) =>
  `<div class="slide" id="${n.split('-')[1]}" style="height:600px;scroll-snap-align:start"><div><video poster="${CDN}/${n}.jpg" playsinline muted style="width:340px;height:600px"></video></div><div><a href="/creator${i}/">creator${i}</a></div></div>`).join('')}</div>
  <script>document.getElementById('sc').scrollTop = ${start} * 600;</script></main>`;
// The Following feed with posts that carry their own links (/p/<id>/), tall enough that two fit on the screen at once.
const seenPost = (id) => `<article id="${id}" style="height:340px"><header><a href="/acct${id}/">acct${id}</a></header><a href="/p/${id}xxxx/"><time>1h</time></a><div>post ${id}</div></article>`;
const pages = {
  '?seen': `<main role="main">${['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].map(seenPost).join('')}</main>`,
  // The recording of 2026-11-10: the same four posts added to the bottom again, twice.
  '?repeat': `<main role="main">${['R1', 'R2', 'R3', 'R4'].map(seenPost).join('')}${['R1', 'R2', 'R3', 'R4'].map((id) => seenPost(id).replace(`id="${id}"`, `id="${id}b"`)).join('')}</main>`,
  '?seenprofile': `<main><header>acctS1</header>${seenPost('S1')}</main>`,
  '/': `<main role="main">
   <article id="ok"><header><a href="/pedalshop/"><img id="avatar" src="${CDN}/avatar.jpg" width="32" height="32" alt="pedalshop's profile picture"></a><a href="/pedalshop/">pedalshop</a></header>
     <img id="okimg" src="${CDN}/plain.jpg" width="400" height="400"><div>New pedal day. #guitar #fuzz</div></article>
   <article id="img"><header><a href="/someone/">someone</a></header><img src="${CDN}/flag.jpg" width="400" height="400"><div>Summer.</div></article>
   <article id="txt"><header><a href="/shop/">shop</a></header><img src="${CDN}/plain2.jpg" width="400" height="400"><div>New drop #Lingerie</div></article>
   <article id="fail"><header><a href="/x/">x</a></header><img src="${CDN}/fail.jpg" width="400" height="400"><div>Hi</div></article>
   <article id="late"><header><a href="/y/">y</a></header><img src="${CDN}/late.jpg" width="400" height="400"><div>Hi</div></article>
   <div id="tidy"><a id="openapp" href="https://apps.apple.com/app/instagram/id389801252">Open app</a><button id="openig">Open Instagram</button><a id="scheme" href="instagram://media?id=1">View</a>
     <div role="dialog" id="sheet"><span>See this post in the app</span><button id="notnow" onclick="this.closest('[role=dialog]').remove()">Not now</button></div></div>
   </main>${NAV}${BANNER}`,
  '/someprofile/': `<main><nav><a id="home" href="/">Home</a><a id="favs" href="/?variant=favorites">Favorites</a></nav><header><img id="bigavatar" src="${CDN}/flag-avatar.jpg" style="width:150px;height:150px" alt="someprofile's profile picture"></header>
   <div class="_ac7v">${tile('p1', '/p/AAA/', 'plain-p1.jpg')}${tile('p2', '/p/BBB/', 'flag-p2.jpg')}</div></main>${NAV}${BANNER}`,
  '/gridprofile/': `<main><div id="rows">${[[1, 2, 3], [4, 5, 6]].map((row) => `<div class="_ac7v" style="display:flex;gap:4px;margin-bottom:4px">${row.map((n) => tile('g' + n, '/p/G' + n + '/', (n === 2 ? 'flag' : 'plain') + '-g' + n + '.jpg')).join('')}</div>`).join('')}</div></main>`,
  '/someprofile/reels/': `<main><div class="x1qjc9v5">${bgTile('r1', '/someprofile/reel/C1/', 'plain-r1.jpg')}${bgTile('r2', '/someprofile/reel/C2/', 'flag-r2.jpg')}</div></main>`,
  '/someprofile/tagged/': `<main>${tile('t1', '/p/TTT/', 'flag-t1.jpg')}${tile('t2', '/p/UUU/', 'plain-t2.jpg')}</main>`,
  '/explore/': `<main><input id="search" placeholder="Search"><div id="spin" role="progressbar" style="width:32px;height:32px"></div><div id="grid">${bgTile('e1', '/other/reel/E1/', 'flag-e1.jpg')}${tile('e2', '/p/E2/', 'plain-e2.jpg')}${bgTile('e3', '/other/reel/E3/', 'fail-e3.jpg')}</div></main>${NAV}${BANNER}`,
  '/explore/search/': `<main><input id="search" value="pedal"><a id="acct" href="/pedalshop/">pedalshop</a>${tile('s1', '/p/S1/', 'plain-s1.jpg')}</main>`,
  '/explore/search/keyword/': `<main>
    <div role="search"><input id="q" value="pedal" placeholder="Search"></div>
    <div role="tablist"><a role="tab" id="tabTop" href="#">Top</a><a role="tab" id="tabReels" href="#">Reels</a><a role="tab" id="tabAccounts" href="#">Accounts</a></div>
    <div id="results">
      <a id="r1" href="/pedalshop/"><img id="r1img" src="${CDN}/plain-av1.jpg" style="width:44px;height:44px"><span>pedalshop</span></a>
      <a id="r2" href="/explore/tags/fuzz/"><span>#fuzz</span></a>
      <a id="r3" href="/flagged_acct/"><img id="r3img" src="${CDN}/flag-av3.jpg" style="width:44px;height:44px"><span>flagged_acct</span></a>
    </div>
    <div id="sugg"><div><span id="suggHead">Suggested for you</span><a href="#">See all</a></div>
      <div><a href="/someone1/"><img src="${CDN}/plain-s1.jpg" style="width:150px;height:150px">someone1</a><a href="/someone2/"><img src="${CDN}/plain-s2.jpg" style="width:150px;height:150px">someone2</a></div></div>
    <div id="trend"><h3>Trending</h3><a href="/explore/tags/a/">#a</a><a href="/explore/tags/b/">#b</a></div>
    <div id="bigrow"><a href="/pedalshop2/"><img id="bigimg" src="${CDN}/plain-big.jpg" style="width:90px;height:90px">pedalshop2</a></div>
    ${tile('kw1', '/p/KW1/', 'plain-kw1.jpg')}
    <video id="kwv" src="${CDN}/v.mp4" style="width:200px;height:300px"></video>
  </main>${NAV}`,
  '/spa/': `<main id="m"></main><script>
    // Like Instagram: one page, new "pages" by pushState, the old scroll left behind, the comment box focused by the page.
    const feed = () => { m.innerHTML = Array.from({ length: 60 }, (_, i) => '<article style="height:300px">post ' + i + ' <a href="/p/P' + i + '/comments/" class="open">comments</a></article>').join(''); };
    const comments = () => { m.innerHTML = '<div id="caption" style="height:120px">the caption</div>' + Array.from({ length: 80 }, (_, i) => '<div style="height:60px">comment ' + i + '</div>').join('') + '<textarea id="add" placeholder="Add a comment"></textarea>'; };
    feed();
    window.openComments = () => { history.pushState({ p: 'c' }, '', '/p/P10/comments/'); comments(); document.getElementById('add').focus(); scrollTo(0, 99999); };
    addEventListener('popstate', () => { feed(); scrollTo(0, 1200); });
  </script>`,
  '/explore/search/names/': `<main><input id="q" value="amy">
    <div><a id="n1" href="/amy.pedals/"><img src="${CDN}/plain-n1.jpg" style="width:44px;height:44px"><span>amy.pedals</span><span>Amy | Fuzz boxes</span></a></div>
    <div><a id="n2" href="/spicy.amy/"><img src="${CDN}/plain-n2.jpg" style="width:44px;height:44px"><span>spicy.amy</span><span>Amy</span></a></div>
    <div><a id="n3" href="/amy_x/"><img src="${CDN}/plain-n3.jpg" style="width:44px;height:44px"><span>amy_x</span><span>Amy | OnlyFans</span></a></div>
    <div><a id="n4" href="/amymodel/"><span>amymodel</span><span>Model 📸 DM for collab</span></a></div>
  </main>`,
  '/followers/': `<main><div role="dialog"><h1>Followers</h1>
    <div id="f1row"><a href="/studio.dan/"><span>studio.dan</span></a><span>Dan, live sound</span><button>Remove</button></div>
    <div id="f2row"><a href="/xo.bella/"><span>xo.bella</span></a><span>🔞 links below</span><button>Remove</button></div>
  </div></main>`,
  '/bella.x/': `<main><header><img id="pav" src="${CDN}/plain-pav.jpg" style="width:150px;height:150px" alt="bella.x's profile picture">
      <section><h2 id="pname">bella.x</h2><div id="pcounts">120 posts 4,000 followers</div><div id="pbio">Exclusive content 🔞 link below</div><a id="plink" href="https://l.instagram.com/?u=x">my.link</a></section></header>
    <div class="_ac7v">${tile('bp1', '/p/BP1/', 'plain-bp1.jpg')}${tile('bp2', '/p/BP2/', 'plain-bp2.jpg')}</div></main>${NAV}`,
  '/pedal.dan/': `<main><header><img id="dav" src="${CDN}/plain-dav.jpg" style="width:150px;height:150px" alt="pedal.dan's profile picture">
      <section><h2 id="dname">pedal.dan</h2><div id="dbio">Guitar pedals, audio electronics. Gym rat. DM for collab.</div></section></header>
    <div class="_ac7v">${tile('dp1', '/p/DP1/', 'plain-dp1.jpg')}</div></main>${NAV}`,
  // A post still being checked when Joe has scrolled past it, then shown again; overflow-anchor:none, as in WebKit.
  '/anchor/': `<style>html,body{overflow-anchor:none}</style><main><article id="lateup"><header><a href="/y/">y</a></header><img src="${CDN}/late-up.jpg" width="400" height="400"><div>Hi</div></article>
   ${Array.from({ length: 8 }, (_, i) => `<article id="an${i}" style="height:500px"><header><a href="/p${i}/">p${i}</a></header><div>post ${i}</div></article>`).join('')}</main>
   <script>scrollTo(0, 1500);</script>`,
  // Instagram's feed as it really is (Joe, 2026-11-12: "specific images will trigger some bug where it jumps 3 or so
  // images back up"): only the posts near the screen are in the page. This is Instagram's own list, ported line for
  // line from its page code as served on 2026-11-12 (modules PolarisIGVirtualList.react and PolarisSizeCache): the
  // posts from renderStart to renderEnd are in the page and the rest is padding by the sizes it has measured; on every
  // scroll it finds the first post on screen from those sizes and how far the list has scrolled, keeps `overscan`
  // posts either side, and after every change measures each post in the page again (next post's top less its own).
  // The window scrolls, and for that Instagram makes no scroll correction of its own. A post put in again is a new
  // element. overflow-anchor:none, as in WebKit. Posts 3, 4, 9, 10, 11, 17 and 22 are flagged; post 14 is flagged too,
  // but its first verdict only comes when the test lets it (a picture judged late, after Joe has scrolled past it).
  '/vfeed/': `<style>html,body{overflow-anchor:none;margin:0}</style><div style="height:120px">stories</div><main role="main"><div id="vroot"><div id="vlist"></div></div></main>
   <script>
     const N = 40, EST = 100, OVER = 3, FLAG = [3, 4, 9, 10, 11, 17, 22], LATE = [14];
     const sizes = new Map(), getSize = (i) => sizes.has(i) ? sizes.get(i) : EST;
     const dist = (a, b) => { let e = 0; for (let r = a; r < b; r++) e += getSize(r); return e; };
     const getIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) return r; return n; };
     const getLastIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) { if (r + 1 < n && getSize(r + 1) === 0) continue; return r; } return n; };
     const zeros = (a, b) => { let e = 0; for (let r = a; r < b; r++) if (getSize(r) === 0) e++; return e; };
     const root = document.getElementById('vroot'), list = document.getElementById('vlist'), kids = new Map();
     let state = { renderStart: 0, renderEnd: 3, visibleStart: 0, visibleEnd: 0 };
     window.vMounts = 0;
     const make = (i) => { const a = document.createElement('article'); a.dataset.i = i; const k = FLAG.includes(i) ? 'flag' : LATE.includes(i) ? 'verylate-flag' : 'plain'; a.className = k === 'plain' ? 'vplain' : 'vflag';
       a.innerHTML = '<header style="height:40px"><a href="/acct' + i + '/">acct' + i + '</a></header><img src="${CDN}/' + k + '-vf' + i + '.jpg" style="width:390px;height:' + (420 + (i % 4) * 40) + 'px;display:block"><a href="/p/VFEED' + i + 'x/"><time>1h</time></a><div style="height:30px">post ' + i + '</div>'; return a; };
     // its batching of reads and writes: the reads of a frame, then the writes
     const measures = []; let framed = false;
     const flush = () => { framed = false; let f; while ((f = measures.shift())) f(); };
     const measure = (f) => { measures.push(f); if (!framed) { framed = true; requestAnimationFrame(flush); } };
     function render() {
       const end = Math.min(state.renderEnd, N);
       for (const [i, el] of kids) if (i < state.renderStart || i >= end) { el.remove(); kids.delete(i); }
       for (let i = state.renderStart; i < end; i++) if (!kids.has(i)) {
         const next = [...kids.keys()].filter((k) => k > i).sort((a, b) => a - b)[0];
         const el = make(i); list.insertBefore(el, next === undefined ? null : kids.get(next)); kids.set(i, el); window.vMounts++;
       }
       list.style.cssText = 'display:flex;flex-direction:column;position:relative;padding-top:' + dist(0, state.renderStart) + 'px;padding-bottom:' + dist(state.renderEnd, N) + 'px';
       measure(() => { // componentDidUpdate: every post in the page is measured again
         const rs = state.renderStart;
         for (let l = 0; l < list.children.length; l++) {
           const c = list.children[l], e = c.getBoundingClientRect(), n = c.nextElementSibling;
           const u = e.height === 0 ? 0 : n ? n.getBoundingClientRect().top - e.top : list.getBoundingClientRect().bottom - parseFloat(list.style.paddingBottom) - e.top;
           if (getSize(rs + l) !== u) sizes.set(rs + l, u);
         }
       });
     }
     function update() {
       measure(() => {
         const scrollStart = Math.max(0, -root.getBoundingClientRect().top), viewportSize = innerHeight;
         Promise.resolve().then(() => {
           const l = getIndex(scrollStart, N), s = getLastIndex(scrollStart + viewportSize, N) + 1;
           const ns = { renderEnd: s + OVER + zeros(s, N), renderStart: Math.max(0, l - OVER - zeros(0, l)), visibleEnd: s, visibleStart: l };
           if (ns.renderEnd !== state.renderEnd || ns.renderStart !== state.renderStart || ns.visibleEnd !== state.visibleEnd || ns.visibleStart !== state.visibleStart) { state = ns; render(); }
         });
       });
     }
     addEventListener('scroll', update, { capture: true, passive: true });
     render(); update();
   </script>`,
  '/captions/': `<main>
    <article id="c1"><header><a href="/x/">x</a></header><div>New drop, link in bio for my content</div></article>
    <article id="c2"><header><a href="/y/">y</a></header><div>Find me on fansly</div></article>
    <article id="c3"><header><a href="/z/">z</a></header><div>Made spicy ramen tonight</div></article>
    <article id="c4"><header><a href="/w/">w</a></header><div>One of the best fuzz pedals</div></article>
  </main>`,
  // The reel viewer: one scrolling column of full-height slides (opened on the second, as from a shared link).
  '/reels/V1/': reelViewer(['plain-v1', 'flag-v2', 'flag-v3', 'plain-v4'], 1),
  '/reels/V2/': reelViewer(['plain-w1', 'flag-w2'], 1),
  '/reels/V3/': reelViewer(['plain-x1', 'late-x2', 'plain-x3'], 1),
  '/stories/someone/111/': `<main><section id="story"><img id="st" src="${CDN}/flag-st.jpg" style="width:360px;height:640px"></section>
    <button aria-label="Next" onclick="window.storyNext = (window.storyNext || 0) + 1">›</button><button aria-label="Close" onclick="window.storyClosed = true">×</button></main>`,
  '/stories/someone/222/': `<main><section id="story2"><img id="st2" src="${CDN}/flag-st2.jpg" style="width:360px;height:640px"></section>
    <button aria-label="Close" onclick="window.storyClosed = true">×</button></main>`,
  '/hand/': `<main>
    <article id="h1"><header><a href="/a/">a</a></header><a href="/p/HAND111/"><img id="h1img" src="${CDN}/plain-h1.jpg" width="400" height="400"></a><div>Saturday #beach</div></article>
    <article id="h2"><header><a href="/b/">b</a></header><a href="/p/HAND222/"><img id="h2img" src="${CDN}/plain-h2.jpg" width="400" height="400"></a><div>pedals</div></article>
  </main>`,
  // Instagram's real shape for a feed picture: a clear box laid over it takes the touch (double-tap to like) and stops
  // it becoming a click; the old pick mode waited for a click and never got one.
  '/hand2/': `<main>
    <article id="o1"><header><a href="/a/">a</a></header><div role="button" style="position:relative;width:390px;height:390px"><div class="_aagv"><img id="o1img" src="${CDN}/plain-o1.jpg" style="width:390px;height:390px;display:block"></div><div class="_aagw" id="o1cover" style="position:absolute;inset:0"></div></div><a href="/p/OVER111/"><time>1h</time></a></article>
    <article id="o2" style="height:600px"><header><a href="/b/">b</a></header><img src="${CDN}/plain-o2.jpg" style="width:390px;height:390px"><a href="/p/OVER222/">x</a></article>
    <script>
      window.igTaps = 0;
      for (const ev of ['touchend', 'pointerup', 'mouseup']) document.getElementById('o1cover').addEventListener(ev, (e) => { window.igTaps++; e.preventDefault(); });
      document.getElementById('o1cover').addEventListener('click', () => { window.igTaps++; });
    </script></main>`,
  // A story as Instagram shows it on the phone: one video (its poster the picture), the owner's avatar beside it, the
  // whole viewer one box inside the app's root. A tap on the story (anywhere) closes it, as Instagram's does.
  '/stories/vidstory/333/': `<div id="mount_0_0_x"><div id="app"><section id="viewer" style="width:390px;height:780px;position:relative">
      <header id="sthead"><a href="/vidstory/"><img src="${CDN}/plain-vsav.jpg" style="width:32px;height:32px" alt="vidstory's profile picture"></a><span>vidstory</span></header>
      <div id="stmedia"><video id="stv" poster="${CDN}/flag-vs1.jpg" playsinline muted style="width:390px;height:700px"></video></div>
      <button aria-label="Next" id="stnext" style="position:absolute;right:0;top:0;width:10px;height:10px" onclick="window.storyNext = (window.storyNext || 0) + 1; document.getElementById('stv').setAttribute('poster', '${CDN}/plain-vs2.jpg')">›</button>
    </section></div></div>
    <script>
      window.storyClosedByTap = 0;
      for (const ev of ['pointerup', 'touchend', 'click']) document.getElementById('viewer').addEventListener(ev, (e) => { if (e.target.id !== 'stnext') window.storyClosedByTap++; });
    </script>`,
  '/stories/plainstory/444/': `<div id="mount_0_0_y"><div id="app2"><section id="viewer2" style="width:390px;height:780px;position:relative">
      <header><img src="${CDN}/plain-psav.jpg" style="width:32px;height:32px" alt="plainstory's profile picture"></header>
      <div><img id="psimg" src="${CDN}/plain-ps1.jpg" style="width:390px;height:700px;display:block"></div>
      <button aria-label="Next" id="psnext" style="position:absolute;right:0;top:0;width:10px;height:10px" onclick="window.storyNext = (window.storyNext || 0) + 1">›</button>
    </section></div></div>
    <script>
      window.storyTaps = 0;
      for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) document.getElementById('viewer2').addEventListener(ev, (e) => { if (e.target.id !== 'psnext') window.storyTaps++; });
    </script>`,
  '/revealing/': `<main>
   <article id="rv1"><header><a href="/a/">a</a></header><img src="${CDN}/rev-1.jpg" width="400" height="400"><div>Saturday.</div></article>
   <article id="rv2"><header><a href="/b/">b</a></header><img src="${CDN}/plain-rv2.jpg" width="400" height="400"><div>leg day #gymgirl</div></article>
   <article id="rv3"><header><a href="/c/">c</a></header><img src="${CDN}/half-rv3.jpg" width="400" height="400"><div>new shorts, wire stripper in hand</div></article>
   <article id="rv4"><header><a href="/d/">d</a></header><img src="${CDN}/nsfwonly-rv4.jpg" width="400" height="400"><div>x</div></article>
   <nav><a id="explorelink" href="/explore/">Explore</a></nav></main>`,
  '/reels/C9/': `<main><div class="x78zum5"><div class="xh8yej3" id="viewer"><div><video id="rv" poster="${CDN}/flag-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator/">creator</a> caption</div></div>
   <div class="xh8yej3" id="viewer2"><div><video id="rv2" poster="${CDN}/plain-poster.jpg" playsinline muted style="width:360px;height:640px"></video></div><div><a href="/creator2/">creator2</a> fine</div></div></div></main>${NAV}`,
  // Speed (2026-11-12): a big picture still loading is asked for at once; a small one waits; pictures taken off the
  // page before their turn are not judged at all; a picture that waited on screen is counted and fades in.
  '/speed/': `<main role="main">
    <article id="sp1"><header><a href="/a/">a</a></header><img id="slowbig" src="${CDN}/slowload-big.jpg" style="width:390px;height:390px;display:block"><div>one</div></article>
    <article id="sp2"><header><a href="/b/"><img id="slowsmall" src="${CDN}/slowload-small.jpg" style="width:32px;height:32px" alt="b's profile picture"></a></header><img id="waited" src="${CDN}/slowjudge-w.jpg" style="width:390px;height:390px;display:block"><div>two</div></article>
    <div id="pile"></div>
    <script>
      window.addPile = () => { const pile = document.getElementById('pile'); let h = ''; for (let i = 0; i < 12; i++) h += '<article class="pl"><img class="plimg" src="${CDN}/pile-' + i + '.jpg" style="width:390px;height:390px;display:block"><div>p</div></article>';
        pile.insertAdjacentHTML('beforeend', h); [...pile.querySelectorAll('.pl')].slice(4).forEach((a) => a.remove()); };
    </script></main>`,
  '/stories/someone/': `<main><button aria-label="Next">›</button><div id="ring"><img id="ringimg" src="${CDN}/flag-ring.jpg" style="width:56px;height:56px"></div><section id="story"><img id="storyimg" src="${CDN}/flag-story.jpg" style="width:360px;height:640px"></section></main>`,
};

const fakeBridge = `globalThis.__igFilterRetry = [150, 300, 450];
globalThis.__lateTries = 0;
globalThis.IGFilterBridge = {
  calls: [], stats: {},
  stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
  classifyUrl(u) {
    this.calls.push(u);
    this.callAt = this.callAt || {}; this.callAt[u.split('/').pop().split('?')[0]] = performance.now();
    return new Promise((r) => setTimeout(() => {
      if (/fail/.test(u)) return r({ _error: 'unreadable' });
      if (/verylate/.test(u) && !globalThis.__lateOut) { globalThis.__lateGo = () => { globalThis.__lateOut = true; r({ Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 }); }; return; } // judged when the test says
      if (/late/.test(u)) return r(++globalThis.__lateTries < 2 ? { _error: 'loading' } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 });
      if (/rev/.test(u)) return r({ Neutral: 0.9, Sexy: 0.1, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.92 });
      if (/half/.test(u)) return r({ Neutral: 0.9, Sexy: 0.1, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.3 });
      if (/nsfwonly/.test(u)) return r({ Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02 });
      r(/flag/.test(u) ? { Sexy: 0.8, Neutral: 0.2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.1 } : { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 });
    }, /slowjudge/.test(u) ? 500 : 30));
  },
  classifyData() { return Promise.resolve({ Neutral: 0.99, Sexy: 0, Porn: 0, Hentai: 0, Drawing: 0, Revealing: 0.01 }); },
  reports: [],
  report(r) { this.reports.push(r); },
  byHand() { return Promise.resolve(JSON.parse(sessionStorage.getItem('igf-byhand') || '[]')); },
  seenOn() { return Promise.resolve(sessionStorage.getItem('igs-off') !== '1'); },
};`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  await ctx.route('https://www.instagram.com/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    const q = new URL(r.request().url()).searchParams.get('fx');
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${(q && pages['?' + q]) || pages[p] || '<main></main>'}</body></html>` });
  });
  await ctx.route(/cdninstagram\.com/, async (r) => {
    if (/slowload/.test(r.request().url())) await new Promise((ok) => setTimeout(ok, 1500)); // a picture slow to load
    r.fulfill({ contentType: 'image/png', body: png }).catch(() => {});
  });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'filter-config.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'rules.js'), 'utf8') });
  await ctx.addInitScript({ content: fakeBridge });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-filter.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-tidy.js'), 'utf8') });
  await ctx.addInitScript({ content: 'globalThis.__igSeenMs = 300;' });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-seen.js'), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const go = async (p, wait = 900) => { await page.goto('https://www.instagram.com' + p); await page.waitForTimeout(wait); };
  // hidden: the post is marked and shows only its placeholder; shown: not marked and its media visible
  const hiddenAs = (sel) => page.$eval(sel, (e) => { const u = e.closest('[data-igf-gone]') || (e.previousElementSibling && e.previousElementSibling.classList.contains('igf-ph') && e.hasAttribute('data-igf-gone') ? e : null); return u ? u.getAttribute('data-igf-gone') : ''; });
  const gone1px = (e) => e.getBoundingClientRect().height <= 1 && getComputedStyle(e).opacity === '0';
  const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none' && !e.closest('[data-igf-gone]'));

  // ---- the feed ----
  await go('/');
  check('feed: a plain post stays and its picture shows', await visible('#okimg'));
  check('feed: a small avatar is not held', await visible('#avatar'));
  check('filter done: the first whole-page pass is marked', await page.evaluate(() => Number(document.documentElement.getAttribute('data-igf-pass') || 0) >= 1));
  check('feed: a flagged picture hides its post', (await hiddenAs('#img')) === 'image');
  check('feed: a hidden post collapses entirely, with no words', await page.$eval('#img', (e) => e.getBoundingClientRect().height <= 1 && getComputedStyle(e).opacity === '0' && !e.querySelector('.igf-ph')));
  // Joe, 2026-11-08: the feed stopped loading after a hidden post; a post with display:none never comes into view.
  check('feed: a hidden post still comes into view (one invisible pixel, not display:none), so the next posts load', await page.$eval('#img', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height === 1));
  check('feed: nothing on the page says why (no labels)', !/Hidden|suggestive|caption/i.test(await page.evaluate(() => document.body.innerText)));
  check('feed: a caption tag hides its post', (await hiddenAs('#txt')) === 'text' && await page.$eval('#txt', gone1px));
  check('feed: a picture not judged yet is hidden while it is checked', (await hiddenAs('#fail')) === 'checking' && await page.$eval('#fail', gone1px));
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

  // Joe, 2026-11-08: "It keeps pushing back up when we get to a certain point".
  await page.goto('https://www.instagram.com/anchor/');
  const drift = await page.evaluate(() => new Promise((done) => {
    const tops = [], t0 = performance.now();
    const look = () => { tops.push(Math.round(document.getElementById('an4').getBoundingClientRect().top)); if (performance.now() - t0 < 900) requestAnimationFrame(look); else done({ tops: [...new Set(tops)], state: document.getElementById('lateup').getAttribute('data-igf-gone') || 'shown' }); };
    look();
  }));
  check('feed: a post above the screen that is checked and then shown again does not move the feed', Math.max(...drift.tops) - Math.min(...drift.tops) <= 1 && drift.state === 'shown', JSON.stringify(drift));
  // Joe, 2026-11-12: "I scroll down slowly and specific images will trigger some bug where it jumps 3 or so images back up.
  // So then I scroll back down and hit the same offending image again".
  await page.goto('https://www.instagram.com/vfeed/');
  await page.waitForFunction(() => Number(document.documentElement.getAttribute('data-igf-pass') || 0) >= 1 && document.querySelectorAll('article').length >= 2);
  // Scrolls in small steps and, at each, checks that the post on screen moved by the step and nothing else; `until`
  // stops early. A flagged post must never be seen on the way: its picture held or its post collapsed, at every step.
  const slow = async (step, steps, until = -1) => page.evaluate(({ step, steps, until }) => new Promise((done) => {
    const out = { worst: 0, at: null, shown: 0, last: 0, moves: 0 };
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 45)));
    const onScreen = () => [...document.querySelectorAll('article')].find((a) => { const r = a.getBoundingClientRect(); return r.height > 1 && (step > 0 ? r.top >= 0 : r.bottom <= innerHeight && r.bottom > 0); });
    const flaggedShown = () => { let n = 0; for (const a of document.querySelectorAll('article.vflag')) { const r = a.getBoundingClientRect(), img = a.querySelector('img'); if (r.height > 1 && r.bottom > 0 && r.top < innerHeight && img && getComputedStyle(img).visibility !== 'hidden') n++; } return n; };
    (async () => {
      for (let n = 0; n < steps; n++) {
        const stop = until >= 0 && document.querySelector('article[data-i="' + until + '"]');
        if (stop && stop.getBoundingClientRect().top < 200) break;
        const el = onScreen(), before = el && el.getBoundingClientRect().top, y = scrollY;
        scrollBy(0, step);
        await frame();
        if (el && el.isConnected && el.getBoundingClientRect().height > 1 && y + step >= 0) {
          const off = Math.abs(el.getBoundingClientRect().top - before + step); out.moves++;
          if (off > out.worst) { out.worst = Math.round(off); out.at = { step: n, post: +el.dataset.i }; }
        }
        out.shown += flaggedShown();
      }
      const el = onScreen(); out.last = el ? +el.dataset.i : -1; out.held = globalThis.__igFilter.held; out.mounts = window.vMounts;
      done(out);
    })();
  }), { step, steps, until });
  // A picture judged late: Joe has scrolled past its post (14) and is looking at the next (15) when the verdict comes.
  const to15 = await slow(70, 200, 15);
  const late = await page.evaluate(() => new Promise((done) => {
    const el = () => document.querySelector('article[data-i="15"]'), top = () => { const e = el(); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    const p14 = document.querySelector('article[data-i="14"]');
    const out = { before: top(), was14: p14 ? p14.getAttribute('data-igf-gone') || 'held' : 'out', above: p14 ? p14.getBoundingClientRect().top < 0 : null, tops: [] };
    globalThis.__lateGo();
    const t0 = performance.now();
    const look = () => { out.tops.push(top()); if (performance.now() - t0 < 1200) requestAnimationFrame(look); else { out.tops = [...new Set(out.tops)]; const a = document.querySelector('article[data-i="14"]'); out.is14 = a ? a.getAttribute('data-igf-gone') : 'out'; done(out); } };
    look();
  }));
  check('feed: the way down to the late post never jumps', to15.worst <= 2 && to15.moves > 50 && to15.shown === 0, JSON.stringify(to15));
  check('feed: the late post was past the top of the screen and not yet judged', late.was14 === 'held' && late.above === true, JSON.stringify(late));
  check('feed: a post hidden after Joe scrolled past it does not throw the screen back up (the hidden posts above are put in again)', late.tops.every((t) => t !== null && Math.abs(t - late.before) <= 1) && late.is14 !== 'out' && late.is14 !== null, JSON.stringify(late));
  const down = await slow(70, 90);
  check('feed: scrolling slowly on down past hidden posts, what is on screen never jumps', down.worst <= 2 && down.moves > 60 && down.last >= 20 && down.shown === 0, JSON.stringify(down));
  const up = await slow(-70, 260);
  check('feed: nor on the way back up, where runs of hidden posts are put in again and collapse again', up.worst <= 2 && up.moves > 150 && up.last <= 2 && up.shown === 0, JSON.stringify(up));
  const again = await slow(70, 200);
  check('feed: nor down again', again.worst <= 2 && again.moves > 150 && again.last >= 20 && again.shown === 0, JSON.stringify(again));
  check('feed: every flagged post in the page is collapsed', await page.evaluate(() => [...document.querySelectorAll('article.vflag')].every((a) => a.getAttribute('data-igf-gone') === 'image' && a.getBoundingClientRect().height <= 1)));
  check('feed: held still is counted on the device', (await page.evaluate(() => globalThis.IGFilterBridge.stats['feed-held'] || 0)) >= 3);
  // ---- the home feed is the Following feed ("I see the same 10 accounts and its not even people I know") ----
  await go('/', 700);
  check('following: opening instagram.com lands on the Following feed', new URL(page.url()).search === '?variant=following', page.url());
  await go('/?variant=home', 700);
  check("following: Instagram's own suggested feed (variant=home) goes to Following", new URL(page.url()).search === '?variant=following', page.url());
  await go('/?variant=favorites', 700);
  check('following: an address with a variant is left as it is', new URL(page.url()).search === '?variant=favorites', page.url());
  await go('/someprofile/', 700);
  check('following: a profile is left as it is', new URL(page.url()).pathname === '/someprofile/', page.url());
  await page.click('#home');
  await page.waitForTimeout(700);
  check('following: the home tab goes to the Following feed', new URL(page.url()).search === '?variant=following', page.url());
  await go('/someprofile/', 500);
  await page.evaluate(() => { history.pushState({}, '', '/'); });
  await page.waitForTimeout(700);
  check('following: Instagram changing the address to "/" goes to Following', new URL(page.url()).search === '?variant=following', page.url());
  // ---- posts already seen are skipped the next time the feed opens (Joe, 2026-11-10: "not show me literally the same
  // posts every time I open the app") ----
  const FEED = '/?variant=following&fx=seen';
  const seenState = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('article')].map((a) => [a.id, a.hasAttribute('data-igs-seen') ? 'skipped' : a.hasAttribute('data-igs-noted') ? 'noted' : '-'])));
  await go(FEED, 900);
  let st = await seenState();
  check('seen: posts on screen for a moment are noted', st.S1 === 'noted' && st.S2 === 'noted', JSON.stringify(st));
  check('seen: posts not reached are not', st.S5 === '-' && st.S8 === '-', JSON.stringify(st));
  check('seen: nothing is skipped on the visit that saw it', !Object.values(st).includes('skipped'));
  await go(FEED, 900);
  st = await seenState();
  check('seen: on the next open, the posts seen before are skipped', st.S1 === 'skipped' && st.S2 === 'skipped', JSON.stringify(st));
  check('seen: a skipped post keeps one invisible pixel, so the feed keeps loading', await page.$eval('#S1', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height === 1 && getComputedStyle(e).opacity === '0'));
  check('seen: the first post not seen yet is at the top', await page.$eval('#S3', (e) => Math.abs(e.getBoundingClientRect().top - document.querySelector('main').getBoundingClientRect().top) <= 3));
  check('seen: counted on the device', (await page.evaluate(() => globalThis.IGFilterBridge.stats['seen-skipped'])) >= 2);
  await page.evaluate(() => { sessionStorage.setItem('igs-off', '1'); document.dispatchEvent(new Event('igs-off')); });
  await page.waitForTimeout(100);
  check('seen: turned off in the menu, the skipped posts come back at once', await page.$eval('#S1', (e) => e.getBoundingClientRect().height >= 300));
  await go(FEED, 900);
  st = await seenState();
  check('seen: turned off, nothing is skipped on a fresh open', !Object.values(st).includes('skipped'), JSON.stringify(st));
  await page.evaluate(() => { sessionStorage.removeItem('igs-off'); document.dispatchEvent(new Event('igs-on')); });
  await go('/someprofile/?fx=seenprofile', 700);
  check('seen: off the home feed (a profile), a seen post is not skipped', await page.$eval('#S1', (e) => e.getBoundingClientRect().height >= 300 && !e.hasAttribute('data-igs-seen')));

  await go('/?variant=following&fx=repeat', 700);
  check('repeats: a post already further up the feed, added again at the bottom, is skipped', await page.$eval('#R1b', (e) => e.getBoundingClientRect().height === 1) && await page.$eval('#R4b', (e) => e.getBoundingClientRect().height === 1));
  check('repeats: the first copy stays', await page.$eval('#R1', (e) => e.getBoundingClientRect().height >= 300));
  await page.evaluate(() => { const m = document.querySelector('main'); m.insertAdjacentHTML('beforeend', '<article id="R2c" style="height:340px"><a href="/p/R2xxxx/">x</a></article><article id="R9" style="height:340px"><a href="/p/R9xxxx/">x</a></article>'); });
  await page.waitForTimeout(300);
  check('repeats: one added later is skipped too, a new post after it is not', await page.$eval('#R2c', (e) => e.getBoundingClientRect().height === 1) && await page.$eval('#R9', (e) => e.getBoundingClientRect().height >= 300));

  // ---- a profile's posts grid, and its large avatar ----
  await go('/someprofile/');
  check('profile grid: a plain tile shows', await visible('#p1 img'));
  check('profile grid: a flagged tile is hidden', (await hiddenAs('#p2 img')) === 'image');
  check('profile: a large avatar is judged; flagged, only the picture goes (a plain circle)', await page.$eval('#bigavatar', (e) => !!e.getAttribute('data-igf-avatar') && getComputedStyle(e).objectPosition.startsWith('-99999px') && getComputedStyle(e).borderRadius === '50%'));
  // ---- a profile's Reels tab: background-image tiles ----
  await go('/someprofile/reels/');
  check('reels tab: a plain background tile shows', await page.$eval('#r1 [style*="background-image"]', (e) => getComputedStyle(e).visibility === 'visible' && !e.closest('[data-igf-gone]')));
  check('reels tab: a flagged background tile is hidden', (await hiddenAs('#r2 [style*="background-image"]')) === 'image');
  // Joe, 2026-11-08: "for where tiles are blocked, can we just skip it instead of leaving the hole?"
  check('reels tab: the hidden tile is taken out, no blank left (nothing to see or tap)', await page.$eval('#r2', (e) => e.getBoundingClientRect().height === 0 && e.getBoundingClientRect().width === 0));
  check('reels tab: the plain tile still shows at its size', await page.$eval('#r1', (e) => e.getBoundingClientRect().height >= 290));
  // ---- a grid of rows: the tiles after a hidden one close up ----
  await go('/gridprofile/');
  check('grid: the flagged tile is taken out', await page.$eval('#g2', (e) => e.getBoundingClientRect().height === 0));
  check('grid: the next tile moves into its place', await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return Math.abs(r('g3').top - r('g1').top) < 2 && Math.abs(r('g3').left - r('g1').right - 4) < 3; }));
  check('grid: a tile from the next row moves up to fill the row', await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return Math.abs(r('g4').top - r('g1').top) < 2; }));
  check('grid: the columns keep their width', await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return Math.abs(r('g1').width - r('g4').width) < 2 && r('g1').width >= 190; }));
  await go('/someprofile/reels/');
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
  // ---- the tab bar: the same four tabs on every page (Home, Search, Messages, Profile; no Reels tab) ----
  const tabsOn = async (p) => {
    await go(p, 1200);
    return page.evaluate(() => ['tHome', 'tSearch', 'tReels', 'tMsg', 'tProfile'].filter((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) if (getComputedStyle(x).display === 'none') return false; return true; }).join(','));
  };
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ['/', '/someprofile/', '/explore/', '/explore/search/keyword/', '/reels/C9/']) {
    const t = await tabsOn(p);
    check(`tab bar on ${p}: Home, Search, Messages, Profile`, t === 'tHome,tSearch,tMsg,tProfile', t);
  }
  await go('/someprofile/', 1200);
  const widths = await page.evaluate(() => [...document.querySelectorAll('#tabbar .slot')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => Math.round(x.getBoundingClientRect().width)));
  check('tab bar: the four tabs share the row equally (the Reels slot is gone, not left blank)', widths.length === 4 && Math.max(...widths) - Math.min(...widths) <= 1 && widths.reduce((x, y) => x + y, 0) >= 385, JSON.stringify(widths));
  check('tab bar: the profile avatar in it is still there', await page.evaluate(() => getComputedStyle(document.querySelector('#tProfile img')).display !== 'none'));
  await go('/explore/', 1200);
  check('search, empty: no spinner left under the search box', await page.evaluate(() => getComputedStyle(document.getElementById('spin')).display === 'none'));
  check('search, empty: the search box stays', await page.evaluate(() => getComputedStyle(document.getElementById('search')).display !== 'none'));
  check('the "use the app" strip is gone with its close control, nothing left above the bar', await page.evaluate(() => getComputedStyle(document.getElementById('appbanner')).display === 'none'));
  await page.setViewportSize({ width: 1280, height: 720 });
  // ---- the search page, plain ("get rid of all of the junk and images that come along with the Instagram search page") ----
  await go('/explore/search/keyword/', 1200);
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; } return true; }, id);
  check('search: the search field stays', await shown('q'));
  check('search: an account result stays, with its small avatar (judged clean)', (await shown('r1')) && (await shown('r1img')));
  check('search: a hashtag result stays', await shown('r2'));
  check('search: a flagged avatar is out of sight, a plain circle in its place', await page.$eval('#r3img', (e) => !!e.getAttribute('data-igf-avatar') && getComputedStyle(e).objectPosition.startsWith('-99999px')));
  check('search: its row stays, with the username, so he can find the person', (await shown('r3')) && /flagged_acct/.test(await page.$eval('#r3', (e) => e.innerText)));
  check('search: "Suggested for you" is gone, heading and accounts', !(await shown('suggHead')) && !(await shown('sugg')));
  check('search: "Trending" is gone', !(await shown('trend')));
  check('search: a picture larger than a small avatar is gone', !(await shown('bigimg')));
  check('search: the Top and Reels tabs are gone, Accounts stays', !(await shown('tabTop')) && !(await shown('tabReels')) && (await shown('tabAccounts')));
  check('search: post and reel tiles are gone', !(await shown('kw1')));
  check('search: videos are gone', !(await shown('kwv')));
  // ---- accounts by name and bio; the new caption terms ----
  await go('/explore/search/names/', 1200);
  check('names: an ordinary account stays', await shown('n1'));
  check('names: a username with a term ("spicy.amy") goes, row and all', !(await shown('n2')));
  check('names: a full name with a term ("Amy | OnlyFans") goes', !(await shown('n3')));
  check('names: "DM for collab" with "model" goes', !(await shown('n4')));
  await go('/followers/', 1000);
  check('follow lists: an ordinary follower stays', await shown('f1row'));
  check('follow lists: one whose line carries a term goes', !(await shown('f2row')));
  await go('/bella.x/', 1200);
  check('bios: the name stays', await shown('pname'));
  check('bios: the bio, its link and the counts go', !(await shown('pbio')) && !(await shown('plink')) && !(await shown('pcounts')));
  check('bios: the avatar goes', !(await shown('pav')));
  check('bios: the posts grid goes', !(await shown('bp1')) && !(await shown('bp2')));
  await go('/pedal.dan/', 1200);
  check('bios: an ordinary bio (pedals, audio, the gym, "DM for collab" without "model") leaves the profile as it is', (await shown('dbio')) && (await shown('dav')) && (await shown('dp1')));
  await go('/captions/', 900);
  check('captions: "link in bio for my content" hides the post', !(await shown('c1')));
  check('captions: an adult platform hides the post', !(await shown('c2')));
  check('captions: "spicy ramen" stays (spicy alone is for names and bios only)', await shown('c3'));
  check('captions: "of" in a sentence stays', await shown('c4'));
  const acst = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('counts: accounts by name or bio, and avatars, on the device', true, JSON.stringify(acst));
  // ---- the reel and story viewers skip a hidden slide ----
  const onScreenSlide = () => page.evaluate(() => { const sc = document.getElementById('sc'); const r = sc.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.top + r.height / 2); const s = el && el.closest('.slide'); return s ? s.id : ''; });
  await go('/reels/V1/', 1800);
  check('reels: opened on a hidden reel, the viewer goes on to the next one that is not (two in a row skipped)', (await onScreenSlide()) === 'v4', await onScreenSlide());
  await go('/reels/V2/', 1500);
  check('reels: the last reel hidden, the viewer goes back to the one before', (await onScreenSlide()) === 'w1', await onScreenSlide());
  await go('/reels/V3/', 0);
  // watched from the first moment: its first answer ("still loading") and the next look can be a few ms apart in WebKit
  const held = await page.waitForFunction(() => { const x = document.getElementById('x2'); return !!x && x.hasAttribute('data-igf-slide-hold') && getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility === 'hidden'; }, null, { timeout: 3000, polling: 10 }).then(() => true, () => false);
  check('reels: a reel still being checked holds its place (not collapsed, not shown)', held);
  await page.waitForTimeout(900);
  check('reels: once it passes, it is shown where it was', await page.evaluate(() => { const x = document.getElementById('x2'); return !x.hasAttribute('data-igf-gone') && getComputedStyle(x).visibility === 'visible'; }) && (await onScreenSlide()) === 'x2', await onScreenSlide());
  await go('/stories/someone/111/', 900);
  check('stories: a hidden story advances to the next', await page.evaluate(() => window.storyNext === 1 && !window.storyClosed));
  await go('/stories/someone/222/', 900);
  check('stories: the last story hidden closes the viewer', await page.evaluate(() => window.storyClosed === true));
  // ---- hidden by hand (the menu's circle-slash, then a tap) ----
  await go('/hand/', 1000);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('igf-pick')));
  check('by hand: picking says what to do', await page.evaluate(() => { const t = document.getElementById('igf-pick-tip'); return !!t && /tap a picture to hide it/i.test(t.textContent) && getComputedStyle(t).visibility === 'visible'; }));
  const centre = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  { const c = await centre('#h1img'); await page.mouse.click(c.x, c.y); }
  await page.waitForTimeout(150);
  check('by hand: the tapped picture\'s post is hidden at once', !(await shown('h1')));
  check('by hand: and the page says so ("Hidden"), then the note goes', await page.evaluate(() => /^Hidden$/.test((document.getElementById('igf-pick-tip') || {}).textContent || '')) && await page.waitForFunction(() => !document.getElementById('igf-pick-tip'), null, { timeout: 2000 }).then(() => true, () => false));
  check('by hand: the dimming layer is gone', await page.evaluate(() => !document.getElementById('igf-pick')));
  check('by hand: one tap only; the next tap does nothing', await page.evaluate(() => !document.documentElement.hasAttribute('data-igf-picking')) && (await shown('h2')));
  const rec = await page.evaluate(() => globalThis.IGFilterBridge.reports[0]);
  check('by hand: a record with the id, both judges\' scores, the surface, the time (no picture, no address)', !!rec && rec.id === 'instagram:HAND111' && rec.surface === 'feed' && rec.scores && 'Revealing' in rec.scores && 'Sexy' in rec.scores && !!rec.at && !/https?:/.test(JSON.stringify(rec)), JSON.stringify(rec));
  check('by hand: counted on the device', (await page.evaluate(() => globalThis.IGFilterBridge.stats['hidden-by-hand'])) === 1);
  await page.evaluate(() => sessionStorage.setItem('igf-byhand', JSON.stringify(['instagram:HAND111'])));
  await go('/hand/', 1000);
  check('by hand: remembered: that post stays hidden when it comes back', !(await shown('h1')) && (await shown('h2')));
  await page.evaluate(() => sessionStorage.removeItem('igf-byhand'));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('igf-pick')));
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
  check('by hand: a tap on no picture cancels, nothing hidden, and says "No picture there"', (await shown('h2')) && await page.evaluate(() => !document.documentElement.hasAttribute('data-igf-picking') && /No picture there/.test((document.getElementById('igf-pick-tip') || {}).textContent || '')));
  // ---- hidden by hand, on the phone: touches, Instagram's clear box over the picture, stories ----
  {
    const tctx = await browser.newContext({ hasTouch: true, isMobile: chromium === pw.chromium, viewport: { width: 390, height: 844 } });
    await tctx.route('https://www.instagram.com/**', (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${pages[p] || '<main></main>'}</body></html>` }); });
    await tctx.route(/cdninstagram\.com/, (r) => r.fulfill({ contentType: 'image/png', body: png }));
    for (const f of ['filter-config.js', 'rules.js']) await tctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
    await tctx.addInitScript({ content: fakeBridge });
    for (const f of ['ig-filter.js', 'ig-tidy.js']) await tctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => console.log('pageerror:', e.message));
    const tcentre = (sel) => tp.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const tshown = (id) => tp.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; } return e.getBoundingClientRect().height > 1; }, id);
    await tp.goto('https://www.instagram.com/hand2/'); await tp.waitForTimeout(900);
    check('touch: before picking, a tap on the picture reaches Instagram (nothing changed for normal use)', await (async () => { const c = await tcentre('#o1img'); await tp.touchscreen.tap(c.x, c.y); await tp.waitForTimeout(100); return tp.evaluate(() => window.igTaps > 0); })());
    await tp.waitForTimeout(700);
    await tp.evaluate(() => { window.igTaps = 0; document.dispatchEvent(new CustomEvent('igf-pick')); });
    { const c = await tcentre('#o1img'); await tp.touchscreen.tap(c.x, c.y); }
    await tp.waitForTimeout(150);
    check('touch: a tap through Instagram\'s clear box hides the post at once', !(await tshown('o1')));
    check('touch: Instagram never saw that tap (no like, no navigation)', await tp.evaluate(() => window.igTaps === 0), String(await tp.evaluate(() => window.igTaps)));
    check('touch: the next post stays', await tshown('o2'));
    await tp.goto('https://www.instagram.com/stories/plainstory/444/'); await tp.waitForTimeout(900);
    await tp.evaluate(() => { window.storyTaps = 0; document.dispatchEvent(new CustomEvent('igf-pick')); });
    { const c = await tcentre('#psimg'); await tp.touchscreen.tap(c.x, c.y); }
    await tp.waitForTimeout(200);
    check('story: hide a picture works in a story', await tp.$eval('#psimg', (e) => getComputedStyle(e).visibility === 'hidden'));
    check('story: the tap did not reach the story (it neither closed nor moved it)', await tp.evaluate(() => window.storyTaps === 0), String(await tp.evaluate(() => window.storyTaps)));
    check('story: the viewer then goes on to the next story, as a hidden story does', await tp.evaluate(() => window.storyNext === 1));
    check('story: the app itself is still on screen (no grey page)', await tshown('viewer2'));
    if (chromium === pw.chromium) {
      // the two-finger tap that opens the app's menu
      await tp.waitForTimeout(700);
      const cdp = await tctx.newCDPSession(tp);
      await tp.evaluate(() => { window.storyTaps = 0; });
      const pts = [{ x: 150, y: 400, id: 1 }, { x: 240, y: 420, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await tp.waitForTimeout(100);
      const taps = await tp.evaluate(() => window.storyTaps);
      // the first finger's touchstart / pointerdown reach the page before the second finger lands; nothing after does
      check('story: a two-finger tap does not close or advance the story (no release, no click reaches it)', taps <= 2 && await tp.evaluate(() => window.storyNext === 1), String(taps));
    }
    // a video story with only its avatar beside it: hidden, it is covered; the app around it stays
    await tp.goto('https://www.instagram.com/stories/vidstory/333/'); await tp.waitForTimeout(1200);
    check('story viewer: Instagram\'s app around a hidden story is still laid out (no grey page)', (await tshown('viewer')) && (await tshown('sthead')) && (await tshown('stnext')));
    check('story viewer: the hidden story moved on to the next', await tp.evaluate(() => window.storyNext === 1 && window.storyClosedByTap === 0));
    await tp.waitForTimeout(4600); // a video with no frames to read is let go after its 4 s wait for the first frame
    check('story viewer: the next story in the same box (a plain one) is judged and shown, not left blank', await tp.$eval('#stv', (e) => getComputedStyle(e).visibility === 'visible' && !e.closest('[data-igf-gone]')), await tp.$eval('#stv', (e) => (e.closest('[data-igf-gone]') || e).outerHTML.slice(0, 200)));
    await tctx.close();
  }
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
  // WebKit applies the media query a moment after the resize
  await page.waitForFunction(() => { const e = document.getElementById('explorelink'); return e && getComputedStyle(e).display !== 'none'; }, null, { timeout: 2000 }).catch(() => {});
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
  check('navigation settled: the first page is marked at once', (await page.evaluate(() => document.documentElement.getAttribute('data-igt-settled'))) === '/spa/');
  await page.evaluate(() => scrollTo(0, 1200));
  await page.evaluate(() => window.openComments());
  await page.waitForTimeout(150);
  check('navigation settled: not while a new page is held', (await page.evaluate(() => document.documentElement.getAttribute('data-igt-settled'))) === null);
  await page.waitForTimeout(1800);
  check('a new page (comments) starts at the top, its caption in view', await page.evaluate(() => scrollY === 0 && document.getElementById('caption').getBoundingClientRect().top >= 0), String(await page.evaluate(() => scrollY)));
  check('the comment box the page focused is let go (no keyboard pulling the page down)', await page.evaluate(() => document.activeElement !== document.getElementById('add')));
  await page.evaluate(() => scrollTo(0, 2000)); // a late scroll the page (or WebKit) makes by itself, about 2 s in
  await page.waitForTimeout(300);
  check('a late scroll Joe did not make is put back to the top too', await page.evaluate(() => scrollY) === 0, String(await page.evaluate(() => scrollY)));
  check('a page put back at the top is noted for the mini PC, once for that page', (await page.evaluate(() => globalThis.IGFilterBridge.stats['note-top'] || 0)) === 1, String(await page.evaluate(() => globalThis.IGFilterBridge.stats['note-top'] || 0)));
  await page.evaluate(() => history.back());
  await page.waitForTimeout(1200);
  check('Back returns to the same place in the feed', await page.evaluate(() => scrollY) === 1200, String(await page.evaluate(() => scrollY)));
  check('navigation settled: Back is marked at once', (await page.evaluate(() => document.documentElement.getAttribute('data-igt-settled'))) === '/spa/');
  await page.evaluate(() => window.openComments());
  await page.waitForTimeout(100);
  await page.dispatchEvent('main', 'touchstart');
  await page.evaluate(() => scrollTo(0, 800));
  await page.waitForTimeout(1700);
  check('once Joe scrolls a new page himself, it stays where he put it', await page.evaluate(() => scrollY) === 800, String(await page.evaluate(() => scrollY)));
  const settledAt = await page.waitForFunction(() => document.documentElement.getAttribute('data-igt-settled') === '/p/P10/comments/', null, { timeout: 6000 }).then(() => true, () => false);
  check('navigation settled: a new page is marked when its hold ends', settledAt);
  // Joe, 2026-11-12: "Swiping images just completely reloads the page". Swiping a post's pictures only changes
  // ?img_index in the address (Instagram's own code); that is the same page, and it stays where it is.
  await page.goto('https://www.instagram.com/spa/');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-igt-settled') === '/spa/');
  await page.evaluate(() => { scrollTo(0, 1200); const t = new URLSearchParams(location.search); t.set('img_index', '2'); history.replaceState({ ...history.state }, '', '?' + t.toString()); });
  await page.waitForTimeout(500);
  check("swiping a post's pictures (the address gains ?img_index) is not a new page: nothing is put back at the top", await page.evaluate(() => scrollY) === 1200 && new URL(page.url()).search === '?img_index=2', String(await page.evaluate(() => scrollY)));
  await page.evaluate(() => { history.replaceState({ ...history.state }, '', '?img_index=3'); document.getElementById('m').appendChild(document.createElement('div')); dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(300);
  check('nor on the next picture, a change to the page or a scroll', await page.evaluate(() => scrollY) === 1200, String(await page.evaluate(() => scrollY)));
  check('and no "put back at the top" line goes to the mini PC for it', (await page.evaluate(() => globalThis.IGFilterBridge.stats['note-top'] || 0)) === 0);

  // ---- speed: asked while loading, nothing judged that left the page, the wait counted ----
  await page.goto('https://www.instagram.com/speed/', { waitUntil: 'commit' });
  await page.waitForFunction(() => globalThis.IGFilterBridge && IGFilterBridge.callAt && IGFilterBridge.callAt['slowload-big.jpg'], null, { timeout: 1200 }).catch(() => {});
  const early = await page.evaluate(() => ({ asked: !!(IGFilterBridge.callAt || {})['slowload-big.jpg'], loaded: document.getElementById('slowbig').complete, small: !!(IGFilterBridge.callAt || {})['slowload-small.jpg'], held: document.getElementById('slowbig').hasAttribute('data-igf-hold') }));
  check('speed: a big picture still loading is asked for at once', early.asked && !early.loaded, JSON.stringify(early));
  check('speed: a small picture still loading is not asked for', !early.small);
  await page.waitForFunction(() => document.getElementById('slowbig').complete && document.getElementById('slowsmall').complete && !document.getElementById('waited').hasAttribute('data-igf-hold'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ big: getComputedStyle(document.getElementById('slowbig')).visibility, small: getComputedStyle(document.getElementById('slowsmall')).visibility, smallAsked: !!IGFilterBridge.callAt['slowload-small.jpg'], stats: IGFilterBridge.stats }));
  check('speed: both show once loaded; the avatar was never judged', after.big === 'visible' && after.small === 'visible' && !after.smallAsked, JSON.stringify(after));
  check('speed: a picture that waited on screen is counted by how long (wait-1: 0.15 to 0.6 s)', (after.stats['wait-1'] || 0) >= 1 && (after.stats['wait-0'] || 0) + (after.stats['wait-1'] || 0) + (after.stats['wait-2'] || 0) >= 2, JSON.stringify(after.stats));
  await page.evaluate(() => { IGFilterBridge.calls.length = 0; window.addPile(); });
  await page.waitForFunction(() => document.querySelectorAll('.plimg').length === 4 && [...document.querySelectorAll('.plimg')].every((i) => !i.hasAttribute('data-igf-hold')), null, { timeout: 5000 }).catch(() => {});
  const pile = await page.evaluate(() => ({ asked: IGFilterBridge.calls.filter((u) => /pile-/.test(u)).map((u) => +u.match(/pile-(\d+)/)[1]).sort((a, b) => a - b), dropped: __igFilter.dropped || 0, shown: [...document.querySelectorAll('.plimg')].filter((i) => getComputedStyle(i).visibility === 'visible').length }));
  check('speed: pictures taken off the page before their turn are not judged; the rest show', pile.asked.join() === '0,1,2,3' && pile.dropped >= 8 && pile.shown === 4, JSON.stringify(pile));

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
  // The lanes (2026-11-12): the revealing-clothing judge in two workers; pictures asked for together get the same
  // scores as one at a time; one lane when asked for one; and in the page itself when no worker can start.
  const lanes = await p2.evaluate(async () => {
    const until = Date.now() + 20000;
    while (IGClip.width() < 2 && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { g.fillStyle = 'hsl(' + rnd() * 360 + ',' + rnd() * 90 + '%,' + (10 + rnd() * 80) + '%)'; g.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 120, 30 + rnd() * 120); } return c.toDataURL('image/jpeg', 0.9); };
    const imgs = [mk(358, 448), mk(252, 448), mk(448, 448), mk(300, 448), mk(448, 300), mk(224, 224)];
    const one = []; for (const d of imgs) one.push(JSON.stringify(await IGClassifier.classify(d)));
    const together = (await Promise.all(imgs.map((d) => IGClassifier.classify(d)))).map((x) => JSON.stringify(x));
    return { width: IGClip.width(), clip: IGClip.info(), same: one.every((s, i) => s === together[i]), one, together };
  });
  check('classifier: the revealing-clothing judge runs in two lanes (workers)', lanes.width === 2 && lanes.clip.mode === 'workers', JSON.stringify(lanes.clip));
  check('classifier: pictures judged together score exactly as one at a time', lanes.same, lanes.same ? '' : JSON.stringify([lanes.one, lanes.together]));
  const plain = await p2.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 500; const g = c.getContext('2d'); g.fillStyle = '#28a'; g.fillRect(0, 0, 300, 500); g.fillStyle = '#fd3'; g.fillRect(40, 60, 200, 120); return c.toDataURL('image/jpeg'); });
  const two = await p2.evaluate((d) => IGClassifier.classify(d), plain);
  const p3 = await browser.newPage();
  let noWorkerFile = false;
  await p3.route('https://classifier.test/**', (rt) => {
    const rel = decodeURIComponent(new URL(rt.request().url()).pathname).replace(/^\/+/, '');
    const f = path.join(shared, rel);
    if ((noWorkerFile && rel === 'clip-worker.js') || !fs.existsSync(f)) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p3.goto('https://classifier.test/classifier.html?lanes=1');
  const oneLane = await p3.evaluate(async (d) => { const s = await IGClassifier.classify(d); const until = Date.now() + 40000; while (IGClip.info().lanes < 1 && Date.now() < until) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 1500)); return { s, width: IGClip.width(), clip: IGClip.info() }; }, plain);
  check('classifier: one lane when the app asks for one', oneLane.width === 1 && oneLane.clip.lanes === 1 && oneLane.clip.mode === 'workers' && typeof oneLane.s.Revealing === 'number', JSON.stringify(oneLane.clip));
  check('classifier: one lane or two, the same picture gets the same scores', JSON.stringify(oneLane.s) === JSON.stringify(two), JSON.stringify([oneLane.s, two]));
  // No worker can start (its file is missing): the model runs in the page, as it did before the lanes.
  noWorkerFile = true;
  await p3.goto('https://classifier.test/classifier.html');
  const noWorker = await p3.evaluate(async (d) => { const s = await IGClassifier.classify(d); return { s, width: IGClip.width(), clip: IGClip.info() }; }, plain);
  check('classifier: with no worker the judge runs in the page and answers the same', noWorker.clip.mode === 'page' && noWorker.width === 1 && JSON.stringify(noWorker.s) === JSON.stringify(two), JSON.stringify([noWorker.clip, noWorker.s]));
  await p3.close();
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
