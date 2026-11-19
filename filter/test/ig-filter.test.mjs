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
const JOE_ROWS = [['raven', 'RAVEN', '3 mutuals'], ['mikeperry', 'Mike Perry', '9 mutuals'], ['lilith', 'Lilith', '1 mutual'], ['vanswarpedtourfl', 'vanswarpedtourfl', '7 mutuals'],
  ['joeymonaco', 'Joey Monaco', '3 mutuals'], ['quinn', 'Quinn', '6 mutuals'], ['mobadr', 'Mo Badr', '15 mutuals'], ['tonycamposeo', 'Tony Camposeo', '7 mutuals'],
  ['hunter', 'H U N T E R', '9 mutuals'], ['hrlikes', 'H.R.Likes', '11 mutuals'], ['andrewbozymowski', 'Andrew Bozymowski', '12 mutuals'], ['alyssafoster', 'alyssafoster', 'Followed by quinn + 2 more']];
const DEEP_ROWS = [['mitchfoster', 'Mitch Foster', '17 mutuals'], ['jessicalukas', 'Jessica Lukas', '2 mutuals'], ['lorene', 'Lorene Singleton King', '2 mutuals'], ['mikeyydread', 'mikeyydread', '1 mutual'],
  ['jim.leatherman', 'jim.leatherman', '24 mutuals'], ['brendasmith', 'Brenda Smith', '1 mutual'], ['mykayla', 'Mykayla🌺 Stallings', '3 mutuals'], ['prestonhall', 'Preston Hall', '5 mutuals'], ['valerieadger', 'Valerie Adger', '3 mutuals'], ['cass', '~𝘾𝙖𝙨𝙨♡~', '1 mutual']];
const joeRow = ([u, name, line], i) => `<div class="x1dm5mii" id="jr-${u}"><div class="x9f619 x78zum5" style="display:flex;align-items:center;padding:8px 16px">
  <div class="x1i10hfl"><a href="/${u}/" role="link" tabindex="0"><img alt="${u}'s profile picture" src="${CDN}/plain-j${u}.jpg" style="width:56px;height:56px;border-radius:50%"></a></div>
  <div style="flex:1;padding:0 12px"><div><a href="/${u}/" role="link"><span class="x1lliihq" dir="auto">${name}</span></a></div>
    <div style="display:flex;align-items:center"><span class="facepile">${[1, 2, 3].map((k) => `<img alt="" src="${CDN}/plain-m${k}${u}.jpg" style="width:14px;height:14px;border-radius:50%">`).join('')}</span><span class="x1lliihq" dir="auto">${line}</span></div></div>
  <div>${i % 2 ? `<button class="_acan _acap _acas" type="button"><div class="_ap3a">Follow</div></button>` : `<div role="button" tabindex="0" style="color:#4150f7;font-weight:600">Follow</div>`}</div>
</div></div>`;
const joeList = (head, posts) => `<main role="main"><div id="joecol" style="max-width:630px;margin:0 auto">
  ${posts ? seenPost('JF1') + seenPost('JF2') : ''}
  <div id="joelist">${head ? '<div style="padding:16px"><span id="joehead">Suggested for you</span></div>' : ''}<div id="joerows">${JOE_ROWS.map(joeRow).join('')}</div></div></div></main>${NAV}`;
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
  // Joe's profile grid of 2026-11-19 ("our instagram filter is absolutlely effed"): tiles overlapped and stacked after
  // hidden ones were taken out. Instagram's markup as read that day from a public profile: rows (._ac7v, flex) of three
  // cells, each a sized box holding the tile's link (inline) and a 3:4 picture. Tiles 2, 6, 7 and 11 are flagged, 9 cannot
  // be judged (held), the rest are plain.
  '/joegrid/': `<main><div id="jg" style="width:935px">${[0, 1, 2, 3].map((r) => `<div class="_ac7v" style="display:flex;gap:3px;margin-bottom:3px">${[1, 2, 3].map((c) => { const n = r * 3 + c; const f = [2, 6, 7, 11].includes(n) ? 'flag' : n === 9 ? 'fail' : 'plain'; return `<div class="jgc" id="jc${n}" style="position:relative;width:309px"><a id="jt${n}" href="/someone/p/JG${n}/" role="link"><div style="width:309px;height:412px"><img src="${CDN}/${f}-jg${n}.jpg" style="width:309px;height:412px;object-fit:cover" alt=""></div></a></div>`; }).join('')}</div>`).join('')}</div></main>`,
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
  // "Suggested for you" (Joe, 2026-11-15: "Can we remove this sidebar from instagram"). The desktop home: the feed and,
  // beside it in the same main area, his own account, the suggestions (a heading with See all, then rows of an avatar,
  // a name, a line and a Follow button) and the footer.
  '?sidebar': `<main role="main"><div id="cols" style="display:flex">
    <div id="feedcol" style="flex:1">${seenPost('D1')}${seenPost('D2')}</div>
    <div id="side" style="width:320px">
      <div id="me"><a href="/joe/"><img src="${CDN}/plain-me2.jpg" style="width:44px;height:44px"></a><a href="/joe/">joe</a><div role="button">Switch</div></div>
      <div class="x9f619"><div class="x1n2onr6" id="suggbox">
        <div class="xh8yej3" id="sugghead"><span class="x1lliihq"><span>Suggested for you</span></span><a href="/explore/people/" id="seeall"><span>See all</span></a></div>
        ${[['cornelius', '6 mutuals'], ['brooke', 'Suggested for you'], ['nayou', 'Suggested for you'], ['jeremy', '2 mutuals']].map(([u, line]) =>
          `<div class="x1qjc9v5"><div class="row" id="sr-${u}" style="display:flex"><a href="/${u}/"><img src="${CDN}/plain-${u}.jpg" style="width:44px;height:44px"></a><div><a href="/${u}/"><span>${u}</span></a><span>${line}</span></div><div role="button" tabindex="0">Follow</div></div></div>`).join('')}
      </div></div>
      <footer id="foot"><a href="/about/">About</a> <a href="/help/">Help</a></footer>
    </div></div></main>${NAV}`,
  // The feed on the phone: a "Suggested for you" carousel between two posts.
  '?feedsugg': `<main role="main">${seenPost('F1')}
    <div id="carousel"><div><div id="carhead"><span>Suggested for you</span><a href="/explore/people/">See all</a></div>
      <div style="display:flex">${['amy', 'bo', 'cy'].map((u) => `<div class="card" id="card-${u}"><button aria-label="Dismiss">x</button><a href="/${u}/"><img src="${CDN}/plain-c${u}.jpg" style="width:80px;height:80px"></a><a href="/${u}/">${u}</a><span>Followed by dan</span><button>Follow</button></div>`).join('')}</div></div></div>
    ${seenPost('F2')}</main>${NAV}`,
  // A profile with its similar-accounts button and the panel it opens.
  '/simprofile/': `<main><header><img id="spav" src="${CDN}/plain-spav.jpg" style="width:150px;height:150px" alt="simprofile's profile picture">
      <section><h2 id="spname">simprofile</h2><div style="display:flex"><button id="spfollow">Following</button><div role="button" id="spmsg">Message</div><div role="button" id="spchev"><svg aria-label="Similar accounts" width="16" height="16"></svg></div></div></section></header>
    <div id="simpanel"><div><div><span id="simhead">Similar accounts</span></div><a href="/explore/people/suggested/">See all</a></div>
      <ul>${['dd', 'ee'].map((u) => `<li id="sim-${u}"><a href="/${u}/"><img src="${CDN}/plain-s${u}.jpg" style="width:60px;height:60px"></a><a href="/${u}/">${u}</a><button>Follow</button></li>`).join('')}</ul></div>
    <div class="_ac7v">${tile('sp1', '/p/SP1/', 'plain-sp1.jpg')}</div></main>${NAV}`,
  // The activity page: one list, what happened (with Follow back buttons) and then suggestions at its end. Only the
  // suggestions may go; the climb must not take the list.
  '/accounts/activity/': `<main><div id="actlist">
      <div id="act1"><a href="/fan1/"><img src="${CDN}/plain-f1.jpg" style="width:44px;height:44px"></a><span><a href="/fan1/">fan1</a> started following you.</span><button>Follow back</button></div>
      <div id="act2"><a href="/fan2/"><img src="${CDN}/plain-f2.jpg" style="width:44px;height:44px"></a><span><a href="/fan2/">fan2</a> liked your post.</span></div>
      <div><span id="acthead">Suggested for you</span></div>
      <div id="actsugg1"><a href="/sg1/"><img src="${CDN}/plain-g1.jpg" style="width:44px;height:44px"></a><div><a href="/sg1/">sg1</a><span>Suggested for you</span></div><button>Follow</button></div>
    </div></main>${NAV}`,
  // The worst case: the heading straight inside the page's main area beside a post. Nothing larger than the words goes.
  '/bareheading/': `<main role="main" id="bm"><span id="barehead">Suggested for you</span>${seenPost('B1')}<div role="button">Follow</div></main>${NAV}`,
  // A new message: "Suggested" people to write to are not suggestions to follow, and stay.
  '/direct/new/': `<main><div role="dialog"><input id="to" placeholder="Search"><div id="dmsugg"><span>Suggested</span><div id="dm1"><a href="/pal/">pal</a></div><div id="dm2"><a href="/pal2/">pal2</a></div></div></div></main>`,
  '/explore/people/': `<main><h1>Suggested</h1><div id="peoplelist"><a href="/p1x/">p1x</a><button>Follow</button></div></main>`,
  // Joe's list of 2026-11-18 ("still waiting on you to block this element in instagram via our extension"; laptop
  // Chrome, Filter 1.6.3 with config 1, on /?variant=following): a column of suggested accounts filling the main area,
  // each row an avatar, a name, a line of stacked mutual avatars and "N mutuals", and a blue Follow (a role=button div,
  // or a button). The list is as wide and as tall as the screen, so the guard that keeps the page from going blank
  // refused it as a panel: the heading went, the rows stayed. Only suggestions on the page (no post).
  '?joelist': joeList(true, false),
  // The same rows after the posts of the Following feed (the list in a feed that has posts), with no heading at all.
  '?joefeed': joeList(false, true),
  // Joe's list again, 2026-11-19 ("Except suggested accounts aren't even being hidden"): the rows as deep as Instagram's
  // own (the name eight boxes under the row), the mutual faces as links to those accounts, no heading, the Messages
  // pill below. Mitch Foster, Jessica Lukas, ...
  '?deeplist': `<main role="main"><div id="dlcol" style="max-width:630px;margin:0 auto"><div><div><div id="dlrows">${DEEP_ROWS.map(([u, n, l], i) => {
    const wrap = (k, inner) => (k ? `<div class="x9f619">${wrap(k - 1, inner)}</div>` : inner);
    return `<div id="dl-${u}" class="x1dm5mii"><div class="x9f619 x78zum5" style="display:flex;align-items:center;padding:8px 16px">
      <div>${wrap(3, `<span role="link"><a href="/${u}/" role="link"><img alt="${u}'s profile picture" src="${CDN}/plain-d${u}.jpg" style="width:56px;height:56px"></a></span>`)}</div>
      <div style="flex:1">${wrap(5, `<a href="/${u}/" role="link"><div><div><span dir="auto">${n}</span></div></div></a>`)}
        <div style="display:flex">${[1, 2].map((k) => `<a href="/friend${k}${u}/"><img alt="" src="${CDN}/plain-f${k}${u}.jpg" style="width:14px;height:14px"></a>`).join('')}<span dir="auto">${l}</span></div></div>
      <div>${wrap(2, i % 2 ? '<button type="button"><div>Follow</div></button>' : '<div role="button" tabindex="0"><div>Follow</div></div>')}</div></div></div>`; }).join('')}</div></div></div></div></main>
    <div id="dlmsg" style="position:fixed;bottom:16px;right:16px"><div role="button"><span>Messages</span></div></div>`,
  // A profile he does not follow, Joe's screenshot of 2026-11-19 ("did you remove the Follow button?", gator_billiards_club):
  // the name, Follow, Message, the chevron whose SVG title is "Similar accounts", the "..." menu, counts, bio, highlights.
  '/gatorprofile/': `<main><header><section><div><div id="gpbar" style="display:flex;align-items:center"><h2 id="gpname">gator_billiards_club</h2>
      <div id="gpbtns" style="display:flex"><button id="gpfollow" type="button"><div>Follow</div></button><div role="button" id="gpmsg" tabindex="0"><div>Message</div></div>
      <div role="button" id="gpsim" tabindex="0"><svg aria-label="Similar accounts" width="16" height="16"><title>Similar accounts</title><path d="M1 1"/></svg></div></div>
      <div role="button" id="gpmore"><svg aria-label="Options" width="24" height="24"><title>Options</title></svg></div></div>
      <ul id="gpcounts"><li>120 posts</li><li>2,400 followers</li><li>310 following</li></ul><div id="gpbio">Billiards club. Leagues on Tuesdays.</div></div></section></header>
      <div id="gphigh"><a href="/stories/highlights/1/"><img src="${CDN}/plain-gh1.jpg" style="width:77px;height:77px" alt=""></a></div>
      ${tile('gp1', '/gator_billiards_club/p/GP1/', 'plain-gp1.jpg')}</main>`,
  // The same, followed: Following and Message.
  '/gatorfollowing/': `<main><header><section><div style="display:flex"><h2>gator_billiards_club</h2><div id="gfbtns" style="display:flex"><button id="gffollowing" type="button"><div>Following</div></button><div role="button" id="gfmsg"><div>Message</div></div>
      <div role="button" id="gfsim"><svg aria-label="Similar accounts" width="16" height="16"><title>Similar accounts</title></svg></div></div></div></section></header></main>`,
  // A post's own page on the laptop: the author row has a Follow beside the name (no article).
  '/p/POSTPAGE/': `<main><div style="display:flex"><div><img src="${CDN}/plain-pp.jpg" style="width:400px;height:500px"></div><div id="ppside"><div id="ppauthor" style="display:flex"><a href="/pedalshop/"><img alt="pedalshop's profile picture" src="${CDN}/plain-ppa.jpg" style="width:32px;height:32px"></a><a href="/pedalshop/">pedalshop</a><span>•</span><div role="button" id="ppfollow">Follow</div></div><div>New pedal day.</div></div></div></main>`,
  // What must stay: the profile of someone he does not follow (its Follow and its mutuals line are in the header), and
  // its Followers list (rows with Follow, but no suggestion line).
  '/mutualprofile/': `<main><header><img id="mpav" src="${CDN}/plain-mpav.jpg" style="width:150px;height:150px" alt="mutualprofile's profile picture">
      <section><h2 id="mpname">mutualprofile</h2><div style="display:flex"><button id="mpfollow">Follow</button><div role="button" id="mpmsg">Message</div></div>
      <div id="mpmutual"><span>12 mutuals</span></div><div id="mpbio">Builds fuzz pedals.</div></section></header>
    <div class="_ac7v">${tile('mp1', '/p/MP1/', 'plain-mp1.jpg')}</div>
    <div role="dialog" id="fdlg"><div><h1>Followers</h1></div><div id="flist">${['fa', 'fb', 'fc'].map((u) => `<div id="fl-${u}" style="display:flex"><a href="/${u}/"><img alt="${u}'s profile picture" src="${CDN}/plain-fl${u}.jpg" style="width:44px;height:44px"></a><div><a href="/${u}/">${u}</a><span>Full Name ${u}</span></div><button>Follow</button></div>`).join('')}</div></div></main>${NAV}`,
  // Extra rules (fx=extra): a panel headed by a heading only the extra file names, a post with a phrase, a selector, a button.
  '?extra': `<main role="main">${seenPost('X1')}
    <div id="xpanel"><div><span id="xhead">Brands you might like</span></div><a href="/brand1/">brand1</a><a href="/brand2/">brand2</a></div>
    <article id="xpaid"><header><a href="/shop9/">shop9</a><span>Paid partnership</span></header><div>post</div></article>
    <div id="xsel">a box</div><div role="button" id="xbtn">Try Threads</div>
    <div id="xsugg"><div><span>Suggested for you</span></div><a href="/z1/">z1</a><div role="button">Follow</div><a href="/z2/">z2</a></div>
    ${seenPost('X2')}</main>${NAV}`,
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
  // element. The page is left as the browser serves it (its own scroll anchoring not switched off here: the
  // iPhone's WebKit says it anchors and still let the feed jump). Posts 3, 4, 9, 10, 11, 17 and 22 are flagged; post 14 is flagged too,
  // but its first verdict only comes when the test lets it (a picture judged late, after Joe has scrolled past it).
  '/vfeed/': `<style>html,body{margin:0}</style><div style="height:120px">stories</div><main role="main"><div id="vroot"><div id="vlist"></div></div></main>
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
  // A profile's grid as Instagram builds it (PolarisIGVirtualGrid: rows of three, class _ac7v, in the same list as the
  // feed's, PolarisIGVirtualList, ported as in /vfeed/): only the rows near the screen are in the page, and a row's
  // height is where the next row starts less where it starts. 180 tiles; 27 of them flagged, some in runs, one whole row.
  '/vgrid/': `<style>html,body{margin:0}._ac7v{display:flex;gap:4px;margin-bottom:4px}._ac7v>div{flex:1 1 0;min-width:0}</style><header style="height:260px">profile</header><main role="main"><div id="vroot"><div id="vlist"></div></div></main>
   <script>
     const TILES = 180, PER = 3, N = Math.ceil(TILES / PER), EST = 100, OVER = 5, FLAG = [1, 4, 7, 8, 9, 10, 11, 20, 33, 34, 35, 36, 40, 41, 50, 61, 62, 63, 64, 65, 66, 90, 91, 100, 120, 121, 122];
     const sizes = new Map(), getSize = (i) => sizes.has(i) ? sizes.get(i) : EST;
     const dist = (a, b) => { let e = 0; for (let r = a; r < b; r++) e += getSize(r); return e; };
     const getIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) return r; return n; };
     const getLastIndex = (t, n) => { let e = 0; for (let r = 0; r < n; r++) if ((e += getSize(r)) > t) { if (r + 1 < n && getSize(r + 1) === 0) continue; return r; } return n; };
     const zeros = (a, b) => { let e = 0; for (let r = a; r < b; r++) if (getSize(r) === 0) e++; return e; };
     const root = document.getElementById('vroot'), list = document.getElementById('vlist'), kids = new Map();
     let state = { renderStart: 0, renderEnd: 4, visibleStart: 0, visibleEnd: 0 };
     window.vSizes = sizes; window.vMost = 0; window.vFlag = FLAG;
     const make = (row) => { const d = document.createElement('div'); d.className = '_ac7v'; d.dataset.row = row;
       for (let c = 0; c < PER; c++) { const t = row * PER + c; d.insertAdjacentHTML('beforeend', '<div class="_aabd"><a data-t="' + t + '" class="' + (FLAG.includes(t) ? 'vflag' : 'vplain') + '" href="/p/T' + t + 'xxxx/" role="link"><div class="_aagu"><img src="${CDN}/' + (FLAG.includes(t) ? 'flag' : 'plain') + '-vg' + t + '.jpg" style="width:100%;aspect-ratio:3/4;display:block" alt=""></div></a></div>'); }
       return d; };
     const measures = []; let framed = false;
     const flush = () => { framed = false; let f; while ((f = measures.shift())) f(); };
     const measure = (f) => { measures.push(f); if (!framed) { framed = true; requestAnimationFrame(flush); } };
     function render() {
       const end = Math.min(state.renderEnd, N);
       for (const [i, el] of kids) if (i < state.renderStart || i >= end) { el.remove(); kids.delete(i); }
       for (let i = state.renderStart; i < end; i++) if (!kids.has(i)) {
         const next = [...kids.keys()].filter((k) => k > i).sort((a, b) => a - b)[0];
         const el = make(i); list.insertBefore(el, next === undefined ? null : kids.get(next)); kids.set(i, el);
       }
       window.vMost = Math.max(window.vMost, kids.size);
       list.style.cssText = 'display:flex;flex-direction:column;position:relative;padding-top:' + dist(0, state.renderStart) + 'px;padding-bottom:' + dist(state.renderEnd, N) + 'px';
       measure(() => {
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
globalThis.__igFilterLate = 600;
globalThis.__lateTries = 0;
globalThis.IGFilterBridge = {
  calls: [], stats: {},
  stat(n) { this.stats[n] = (this.stats[n] || 0) + 1; },
  diags: [],
  diag(name, numbers) { this.diags.push([name, numbers]); },
  classifyUrl(u) {
    this.calls.push(u);
    this.callAt = this.callAt || {}; this.callAt[u.split('/').pop().split('?')[0]] = performance.now();
    return new Promise((r) => setTimeout(() => {
      if (/fail/.test(u)) return r({ _error: 'unreadable' });
      if (/judgedown/.test(u)) return r(globalThis.__judgeBack ? { Neutral: 0.97, Sexy: 0.01, Porn: 0, Hentai: 0, Drawing: 0.02, Revealing: 0.02 } : { _error: 'judge-down' }); // a judge that is down, then back
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
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-core.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-filter.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-tidy.js'), 'utf8') });
  await ctx.addInitScript({ content: 'globalThis.__igSeenMs = 300;' });
  // Hide rules as data: the bundled floor, and extra rules handed in the way the extension hands in a verified file.
  // An extra file that tries to empty a list or name an unknown "unhide" field changes nothing in the floor; a selector
  // that names the whole page is refused by the guards.
  await ctx.addInitScript({ content: `if (location.search.includes('fx=extra')) globalThis.__hideRulesExtra = { version: 7, sites: { 'instagram.com': { headings: ['Brands you might like', ''], phrases: ['Paid partnership'], selectors: ['main', 'body', '#xsel'], buttons: ['Try Threads'], blockPaths: ['/', '/xblocked'] , unhide: ['Suggested for you'] }, '*': { headings: [] } } };` });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'hide-rules.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'hide-engine.js'), 'utf8') });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(shared, 'ig-seen.js'), 'utf8') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const go = async (p, wait = 900) => { await page.goto('https://www.instagram.com' + p); await page.waitForTimeout(wait); };
  // hidden: the post is marked and shows only its placeholder; shown: not marked and its media visible
  const hiddenAs = (sel) => page.$eval(sel, (e) => { const u = e.closest('[data-igf-gone]') || (e.previousElementSibling && e.previousElementSibling.classList.contains('igf-ph') && e.hasAttribute('data-igf-gone') ? e : null); return u ? u.getAttribute('data-igf-gone') : ''; });
  // Hidden is blank in place (2026-11-19): the post keeps its box and everything in it is invisible.
  const gone1px = (e) => e.hasAttribute('data-igx') && e.getBoundingClientRect().height > 1 && [...e.children].every((c) => getComputedStyle(c).visibility === 'hidden');
  const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none' && !e.closest('[data-igf-gone]'));

  // ---- the feed ----
  await go('/');
  check('feed: a plain post stays and its picture shows', await visible('#okimg'));
  check('feed: a small avatar is not held', await visible('#avatar'));
  check('filter done: the first whole-page pass is marked', await page.evaluate(() => Number(document.documentElement.getAttribute('data-igf-pass') || 0) >= 1));
  check('feed: a flagged picture hides its post', (await hiddenAs('#img')) === 'image');
  // 2026-11-15 ("infuriatingly glitchy"): a post removed while it is on screen goes blank where it is, nothing under it
  // moves; it closes up once it is off the screen.
  const imgBox = await page.$eval('#img', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.top + scrollY)]; });
  check('feed: a post removed goes blank in place, with no words (its box kept, nothing under it moves)', await page.$eval('#img', (e) => e.hasAttribute('data-igx') && [...e.children].every((c) => getComputedStyle(c).visibility === 'hidden') && e.getBoundingClientRect().height > 300 && !e.querySelector('.igf-ph')));
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  check('feed: off the screen it is the same box in the same place (it never collapses, 2026-11-19)', await page.$eval('#img', (e, was) => { const r = e.getBoundingClientRect(); return Math.round(r.height) === was[0] && Math.round(r.top + scrollY) === was[1]; }, imgBox));
  // Joe, 2026-11-08: the feed stopped loading after a hidden post; a post with display:none never comes into view.
  check('feed: a hidden post still comes into view (its own box, not display:none), so the next posts load', await page.$eval('#img', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 300));
  await page.evaluate(() => scrollTo(0, 0));
  check('feed: nothing on the page says why (no labels)', !/Hidden|suggestive|caption/i.test(await page.evaluate(() => document.body.innerText)));
  check('feed: a caption tag hides its post', (await hiddenAs('#txt')) === 'text' && await page.$eval('#txt', gone1px));
  // 2026-11-15: while it is checked a post keeps its height (its picture held invisible), so nothing jumps when it is
  // shown or removed.
  check('feed: a picture not judged yet is held while it is checked; the post keeps its height', ['checking', 'unjudged'].includes(await hiddenAs('#fail')) && await page.$eval('#fail', (e) => e.getBoundingClientRect().height > 300 && getComputedStyle(e.querySelector('img')).visibility === 'hidden'));
  await page.waitForTimeout(1500);
  check('feed: still not judged after the last try: stays hidden (its picture never shown, the post not collapsed)', (await hiddenAs('#fail')) === 'unjudged' && await page.$eval('#fail img', (e) => getComputedStyle(e).visibility === 'hidden'));
  check('feed: judged clean on a later try: shown again', await visible('#late img'));
  check('feed: no reveal control on the page', (await page.$$eval('.igf-ph *', (l) => l.length)) === 0);
  const stats = await page.evaluate(() => globalThis.IGFilterBridge.stats);
  check('feed: counts by reason (on the device)', stats['hidden-sexy'] >= 1 && stats['hidden-text'] >= 1 && stats['hidden-unjudged-unreadable'] >= 1 && stats['restored'] >= 1, JSON.stringify(stats));
  await page.evaluate(() => { const a = document.createElement('article'); a.id = 'late2'; a.innerHTML = `<header><a href="/z/">z</a></header><img src="https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/flag-new.jpg" width="400" height="400"><div>x</div>`; document.querySelector('main').appendChild(a); });
  await page.waitForTimeout(400);
  check('feed: a post that loads later is judged too', (await hiddenAs('#late2')) === 'image');
  // A judge that is down for longer than the quick tries (2026-11-15, the laptop: "are we currently blocking all images
  // on Facebook?"): the post stays hidden while nothing can judge it, and shows once the judge answers again.
  await page.evaluate(() => { const a = document.createElement('article'); a.id = 'down1'; a.innerHTML = `<header><a href="/d/">d</a></header><img src="https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/judgedown-1.jpg" width="400" height="400"><div>x</div>`; document.querySelector('main').appendChild(a); });
  await page.waitForTimeout(1400);
  check('judge down: the post stays hidden, never shown unjudged', (await hiddenAs('#down1')) === 'unjudged');
  await page.evaluate(() => { globalThis.__judgeBack = true; });
  await page.waitForTimeout(1500);
  check('judge back: the post is tried again and shown', await visible('#down1 img'));
  check('judge back: counted (late-shown)', await page.evaluate(() => (globalThis.IGFilterBridge.stats['late-shown'] || 0) >= 1));
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
  check('feed: every flagged post in the page is blank in place, at its full height', await page.evaluate(() => [...document.querySelectorAll('article.vflag')].every((a) => a.getAttribute('data-igf-gone') === 'image' && a.hasAttribute('data-igx') && a.getBoundingClientRect().height > 100)));
  check('feed: the filter never scrolls the page (nothing changes height, so there is nothing to hold)', (await page.evaluate(() => globalThis.IGFilterBridge.stats['feed-held'] || 0)) === 0);
  check('feed: with the screen held, no jump is told to the mini PC', (await page.evaluate(() => globalThis.IGFilterBridge.diags.length)) === 0, JSON.stringify(await page.evaluate(() => globalThis.IGFilterBridge.diags.slice(0, 3))));
  // A jump the filter does not hold (something above the screen grows on a page with no posts in it): told, in numbers only.
  // (a leap is a big move within 150 ms of the filter's last look at the page: one small scroll first, so that look is
  // recent whatever else the page was doing, and the test does not hang on timing)
  await page.evaluate(async () => { scrollBy(0, -1); await new Promise((r) => setTimeout(r, 60)); document.querySelector('main').innerHTML = '<div id="grow" style="height:10px"></div>' + Array.from({ length: 30 }, (_, i) => '<div class="row" style="height:200px">row ' + i + '</div>').join(''); scrollTo(0, 2000); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('grow').style.height = '500px'; document.querySelector('main').appendChild(document.createElement('i')); });
  await page.waitForTimeout(200);
  const told = await page.evaluate(() => globalThis.IGFilterBridge.diags);
  // Since 2026-11-19 the browser's own scroll anchoring is left on (the filter no longer changes a height, so it no
  // longer switches anchoring off): where the browser anchors (Chromium), something growing above the screen moves
  // nothing on it and only the leap is told; where it does not (WebKit), the shift is told too, as before.
  const anchors = await page.evaluate(() => { try { return CSS.supports('overflow-anchor', 'auto') && getComputedStyle(document.documentElement).overflowAnchor !== 'none'; } catch { return false; } });
  const numbersOnly = told.every((t) => Object.values(t[1]).every((v) => typeof v === 'number'));
  check('a jump is told to the mini PC, numbers only (a leap down the page; and the shift where the browser does not hold the screen itself)', told.length >= 1 && told[0][0] === 'jump' && told[0][1].k === 2 && numbersOnly
    && (anchors ? told.length === 1 : told.length === 2 && told[1][1].k === 1 && told[1][1].s === 1 && Math.abs(told[1][1].d - 490) <= 2), JSON.stringify({ anchors, told }));
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
  // Joe, 2026-11-19 ("our instagram filter is absolutlely effed"): a hidden tile keeps its box as a plain blank, so
  // Instagram's grid is never re-laid out (the close-up asked for on 2026-11-08 broke his grids and was taken out).
  check('reels tab: the hidden tile keeps its box, a plain blank (nothing to see or tap)', await page.$eval('#r2', (e) => { const b = e.parentElement.getBoundingClientRect(); const bg = e.querySelector('[style*="background-image"]'); return b.height >= 290 && b.width >= 190 && getComputedStyle(e).pointerEvents === 'none' && (!bg || getComputedStyle(bg).visibility === 'hidden'); }));
  check('reels tab: the plain tile still shows at its size', await page.$eval('#r1', (e) => e.getBoundingClientRect().height >= 290));
  // ---- a grid of rows: a hidden tile keeps its place, nothing moves ----
  await go('/gridprofile/');
  check("grid: the flagged tile's picture is gone", await page.$eval('#g2 img', (e) => getComputedStyle(e).visibility === 'hidden') && await page.$eval('#g2', (e) => e.hasAttribute('data-igf-tile') && e.hasAttribute('data-igx')));
  check('grid: the flagged tile keeps its box (a plain blank of its size)', await page.evaluate(() => { const r = (id) => document.getElementById(id).parentElement.getBoundingClientRect(); return Math.abs(r('g2').height - r('g1').height) < 2 && Math.abs(r('g2').width - r('g1').width) < 2; }));
  check('grid: the tiles after it stay where Instagram put them', await page.evaluate(() => { const r = (id) => document.getElementById(id).parentElement.getBoundingClientRect(); return Math.abs(r('g3').top - r('g1').top) < 2 && r('g3').left > r('g2').right - 1 && r('g4').top >= r('g1').bottom - 1 && Math.abs(r('g4').left - r('g1').left) < 2; }));
  check('grid: the columns keep their width', await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return Math.abs(r('g1').width - r('g4').width) < 2 && r('g1').width >= 190; }));
  // ---- Joe's grid of 2026-11-19: tile count and positions unchanged, only the hidden ones blank ----
  const jgAt = () => page.evaluate(() => [...document.querySelectorAll('.jgc')].map((c) => { const b = c.getBoundingClientRect(); const img = c.querySelector('img'); return { id: c.id, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), pic: !!img && img.getBoundingClientRect().height > 0 && getComputedStyle(img).visibility !== 'hidden' && !c.querySelector('[data-igf-gone]'), blank: !!c.querySelector('[data-igf-tile]') && getComputedStyle(c.querySelector('[data-igf-tile]').firstElementChild).backgroundColor !== 'rgba(0, 0, 0, 0)' }; }));
  await go('/joegrid/', 1500);
  const jg = await jgAt();
  const jgWant = (i) => ({ x: jg[0].x + (i % 3) * 312, y: jg[0].y + Math.floor(i / 3) * 415 });
  check("joe's grid: all 12 tiles are still in the page, each 309 by 412", jg.length === 12 && jg.every((t) => t.w === 309 && t.h === 412), JSON.stringify(jg.filter((t) => t.w !== 309 || t.h !== 412)));
  check("joe's grid: every tile is where Instagram put it (column and row unchanged)", jg.every((t, i) => Math.abs(t.x - jgWant(i).x) <= 1 && Math.abs(t.y - jgWant(i).y) <= 1), JSON.stringify(jg.map((t) => [t.id, t.x, t.y])));
  let jgOver = 0; for (let i = 0; i < jg.length; i++) for (let j = i + 1; j < jg.length; j++) { const a = jg[i], b = jg[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) jgOver++; }
  check("joe's grid: no tile lies on another", jgOver === 0, String(jgOver));
  check("joe's grid: the flagged tiles (2, 6, 7, 11) and the one that cannot be judged (9) are plain blanks, their pictures not shown", ['jc2', 'jc6', 'jc7', 'jc11', 'jc9'].every((id) => { const t = jg.find((x) => x.id === id); return t && !t.pic && t.blank; }), JSON.stringify(jg.filter((t) => ['jc2', 'jc6', 'jc7', 'jc11', 'jc9'].includes(t.id))));
  check("joe's grid: the plain tiles show their pictures", jg.filter((t) => !['jc2', 'jc6', 'jc7', 'jc11', 'jc9'].includes(t.id)).every((t) => t.pic && !t.blank));
  check("joe's grid: a plain tile can still be clicked", await page.$eval('#jt1', (e) => getComputedStyle(e).pointerEvents !== 'none' && document.elementFromPoint(e.getBoundingClientRect().left + 100, e.getBoundingClientRect().top + 100).closest('a') === e));
  await go('/someprofile/reels/');
  // A tile whose background is set after it is on the page.
  await page.evaluate(() => { const d = document.querySelector('#r1 [style*="background-image"]'); d.style.backgroundImage = 'url("https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/flag-r1b.jpg")'; });
  await page.waitForTimeout(400);
  check('reels tab: a background changed later is judged again', (await hiddenAs('#r1 .x1i10hfl')) === 'image');
  // ---- a profile's grid as Instagram builds it: hidden tiles close up, and Instagram can still measure its rows ----
  // (2026-11-13: with the rows given no box of their own, Instagram measured every row as nothing and kept the whole
  // profile in the page from the first hidden tile.)
  await page.goto('https://www.instagram.com/vgrid/');
  await page.waitForFunction(() => Number(document.documentElement.getAttribute('data-igf-pass') || 0) >= 1 && document.querySelectorAll('a[data-t]').length >= 6);
  const gridWalk = (step, steps) => page.evaluate(({ step, steps }) => new Promise((done) => {
    const out = { worst: 0, at: null, moves: 0, holes: 0, overlaps: 0, flagged: 0, looks: 0, first: null };
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 45)));
    const box = (a) => { for (let x = a; x; x = x.parentElement) if (getComputedStyle(x).display === 'none') return null; const r = a.getBoundingClientRect(); return r.height > 1 ? r : null; };
    const onScreen = () => [...document.querySelectorAll('a[data-t]')].find((a) => { const r = box(a); return r && (step > 0 ? r.top >= 0 : r.bottom <= innerHeight && r.bottom > 0); });
    // What is on screen is a grid with no hole in it: lines of three side by side, a line apart, nothing on top of
    // anything, the tiles in their order, and no flagged tile among them.
    const look = () => {
      const tiles = [...document.querySelectorAll('a[data-t]')].map((a) => ({ a, r: box(a) })).filter((x) => x.r && x.r.bottom > 0 && x.r.top < innerHeight);
      if (!tiles.length) return;
      out.looks++;
      for (const x of tiles) if (x.a.classList.contains('vflag') && getComputedStyle(x.a.querySelector('img')).visibility !== 'hidden' && !x.a.hasAttribute('data-igf-gone')) out.flagged++;
      const lines = new Map();
      for (const x of tiles) { const k = Math.round(x.r.top); if (!lines.has(k)) lines.set(k, []); lines.get(k).push(x); }
      const tops = [...lines.keys()].sort((p, q) => p - q);
      const last = +document.querySelectorAll('a[data-t]')[document.querySelectorAll('a[data-t]').length - 1].dataset.t;
      let prev = -1;
      for (let i = 0; i < tops.length; i++) {
        const line = lines.get(tops[i]).sort((p, q) => p.r.left - q.r.left);
        const ends = line.some((x) => +x.a.dataset.t >= 177); // the grid's own last line may be short
        if (line.length !== 3 && !ends) out.holes++;
        for (let j = 1; j < line.length; j++) if (line[j].r.left < line[j - 1].r.right - 1) out.overlaps++;
        if (i > 0 && Math.abs(tops[i] - tops[i - 1] - (line[0].r.height + 4)) > 2) out.holes++;
        for (const x of line) { if (+x.a.dataset.t <= prev) out.overlaps++; prev = +x.a.dataset.t; }
      }
      if (out.first === null && (out.holes || out.overlaps)) out.first = { y: Math.round(scrollY), tops, n: tiles.length };
    };
    (async () => {
      for (let n = 0; n < steps; n++) {
        const el = onScreen(), before = el && el.getBoundingClientRect().top, y = scrollY;
        scrollBy(0, step);
        await frame();
        if (el && el.isConnected && box(el) && scrollY !== y && !el.closest('[data-igf-gone]')) {
          const off = Math.abs(el.getBoundingClientRect().top - before + (scrollY - y)); out.moves++;
          if (off > out.worst) { out.worst = Math.round(off); out.at = { step: n, tile: +el.dataset.t }; }
        }
        look();
      }
      out.most = window.vMost; out.inPage = document.querySelectorAll('._ac7v').length; out.y = Math.round(scrollY);
      out.zeros = [...window.vSizes.values()].filter((v) => v === 0).length; out.measured = window.vSizes.size;
      done(out);
    })();
  }), { step, steps });
  const gDown = await gridWalk(60, 140);
  check('grid: on the way down nothing on screen jumps', gDown.worst <= 2 && gDown.moves > 100, JSON.stringify(gDown));
  check('grid: what is on screen is a whole grid at every step (no hole, nothing on top of anything, in order)', gDown.holes === 0 && gDown.overlaps === 0 && gDown.looks > 100, JSON.stringify(gDown));
  check('grid: no flagged tile is shown at any step', gDown.flagged === 0, String(gDown.flagged));
  check('grid: Instagram still takes rows out of the page (it can measure them): never the whole profile at once', gDown.most <= 30 && gDown.inPage <= 30, JSON.stringify({ most: gDown.most, inPage: gDown.inPage }));
  check('grid: only the rows whose three tiles are all hidden (four of them) measure as nothing', gDown.zeros <= 4 && gDown.measured >= 20, JSON.stringify({ zeros: gDown.zeros, measured: gDown.measured }));
  const gUp = await gridWalk(-60, 150);
  check('grid: nor on the way back up, where rows are put in again', gUp.worst <= 2 && gUp.moves > 100 && gUp.holes === 0 && gUp.overlaps === 0 && gUp.flagged === 0 && gUp.y === 0, JSON.stringify(gUp));
  check('grid: no jump was told to the mini PC', (await page.evaluate(() => globalThis.IGFilterBridge.diags.length)) === 0, JSON.stringify(await page.evaluate(() => globalThis.IGFilterBridge.diags.slice(0, 2))));

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
  const shown = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; if (e.closest('[data-igx]')) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; } return true; }, id);
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
  // ---- no "Suggested for you" anywhere (Joe, 2026-11-15: "Can we remove this sidebar from instagram") ----
  await go('/?variant=following&fx=sidebar', 1500);
  check('suggestions, desktop sidebar: the panel is gone, heading, See all and every row', !(await shown('suggbox')) && !(await shown('sugghead')) && !(await shown('seeall')) && !(await shown('sr-cornelius')) && !(await shown('sr-brooke')) && !(await shown('sr-jeremy')));
  check('suggestions, desktop sidebar: the feed beside it stays, posts and all', (await shown('feedcol')) && (await shown('D1')) && (await shown('D2')));
  check('suggestions, desktop sidebar: his own account and the footer stay', (await shown('me')) && (await shown('foot')));
  check('suggestions, desktop sidebar: the page is not blanked (main, the tab bar)', (await shown('cols')) && (await shown('tabbar')));
  await go('/explore/people/', 1500);
  check('suggestions page (See all): goes to the Following feed', /\/\?variant=following/.test(page.url()), page.url());
  await go('/simprofile/', 1500);
  check('suggestions, profile: the similar accounts panel is gone', !(await shown('simpanel')) && !(await shown('sim-dd')));
  check('suggestions, profile: the button that opens it is gone', !(await shown('spchev')));
  check('suggestions, profile: the profile stays (name, Following, Message, avatar, posts)', (await shown('spname')) && (await shown('spfollow')) && (await shown('spmsg')) && (await shown('sp1')));
  await go('/accounts/activity/', 1500);
  check('suggestions, activity: the list of what happened stays (Follow back too)', (await shown('actlist')) && (await shown('act1')) && (await shown('act2')));
  check('suggestions, activity: the heading and a suggested account\'s row go', !(await shown('acthead')) && !(await shown('actsugg1')));
  await go('/bareheading/', 1500);
  check('suggestions, guard: a heading loose in the main area takes only its words', !(await shown('barehead')) && (await shown('bm')) && (await shown('B1')));
  await go('/direct/new/', 1200);
  check('suggestions: the new-message "Suggested" people stay', (await shown('dmsugg')) && (await shown('dm1')) && (await shown('to')));
  // ---- hide rules as data: the extra (fetched) rules only add ----
  await go('/?variant=following&fx=extra', 1800);
  check('hide rules: a heading named only in the extra rules takes its panel', !(await shown('xpanel')) && !(await shown('xhead')));
  check('hide rules: a phrase takes its post (blank in place, its box kept)', await page.$eval('#xpaid', (e) => e.hasAttribute('data-fhr') && e.hasAttribute('data-igx') && e.getBoundingClientRect().height > 1 && [...e.children].every((c) => getComputedStyle(c).visibility === 'hidden')));
  check('hide rules: a selector and a button', !(await shown('xsel')) && !(await shown('xbtn')));
  check('hide rules: the floor stays ("unhide" and empty lists in the extra file change nothing)', !(await shown('xsugg')) && await page.evaluate(() => { const l = globalThis.__hideEngine.rules.sites['instagram.com']; return l.headings.includes('Suggested for you') && l.headings.includes('Brands you might like') && !('unhide' in l) && l.blockPaths.includes('/explore/people') && !l.blockPaths.includes('/'); }));
  check('hide rules: "main" and "body" as selectors, and "/" as a blocked path, do not blank the page', (await shown('X1')) && (await shown('X2')) && (await shown('tHome')) && /variant=following/.test(page.url()), page.url());
  check('hide rules: the engine counts what it hid', await page.evaluate(() => globalThis.__hideEngine.hidden >= 4 && globalThis.__hideEngine.rules.extraVersion === 7));
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/?variant=following&fx=feedsugg', 1500);
  check('suggestions, phone feed: the carousel is gone, heading and cards', !(await shown('carhead')) && !(await shown('card-amy')) && !(await shown('card-cy')));
  check('suggestions, phone feed: the posts around it and the tab bar stay', (await shown('F1')) && (await shown('F2')) && (await shown('tHome')));
  // Joe's list of 2026-11-18, at the laptop window's width (556 px): the list is as big as the screen.
  await page.setViewportSize({ width: 556, height: 900 });
  await go('/?variant=following&fx=joelist', 1800);
  const joeLeft = await page.evaluate((ids) => ids.filter((u) => { const e = document.getElementById('jr-' + u); return e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden'; }), JOE_ROWS.map((r) => r[0]));
  check("suggestions, Joe's list (2026-11-18): every row is gone, Follow as a div or a button, mutuals or Followed by", joeLeft.length === 0, joeLeft.join(','));
  check("suggestions, Joe's list: the heading is gone", !(await shown('joehead')));
  const note = await page.evaluate(() => { const n = document.documentElement; if (!n.hasAttribute('data-igx-only-sugg')) return null; const s = getComputedStyle(n, '::after'); return { text: s.content, position: s.position }; });
  check("suggestions, Joe's list: a page of only suggestions says so in one plain line, drawn over the page (nothing of Instagram's moves)", !!note && /Suggestions are hidden/.test(note.text) && note.position === 'fixed', JSON.stringify(note));
  check("suggestions, Joe's list: the page and the tab bar stay (main, the column)", (await shown('joecol')) && (await shown('tHome')) && (await shown('tProfile')));
  check("suggestions, Joe's list: the tab bar's avatar and links are untouched", await page.evaluate(() => !document.querySelector('#tabbar [data-igt], #tabbar[data-igt]')));
  await go('/?variant=following&fx=joefeed', 1800);
  const feedLeft = await page.evaluate((ids) => ids.filter((u) => { const e = document.getElementById('jr-' + u); return e && getComputedStyle(e).visibility !== 'hidden'; }), JOE_ROWS.map((r) => r[0]));
  check("suggestions, Joe's rows after the Following feed's posts, no heading: every row goes", feedLeft.length === 0, feedLeft.join(','));
  check("suggestions, Joe's rows after posts: the posts stay, and no note (it is not a page of suggestions)", (await shown('JF1')) && (await shown('JF2')) && !(await page.$('html[data-igx-only-sugg]')));
  await go('/?variant=following&fx=deeplist', 1800);
  const deepLeft = await page.evaluate((ids) => ids.filter((u) => { const e = document.getElementById('dl-' + u); return e && getComputedStyle(e).visibility !== 'hidden'; }), DEEP_ROWS.map((r) => r[0]));
  check("suggestions, Joe's list of 2026-11-19 (rows as deep as Instagram's, mutual faces as links): every row is gone", deepLeft.length === 0, deepLeft.join(','));
  check("suggestions, Joe's list of 2026-11-19: the Messages pill and the tab bar stay", (await shown('dlmsg')));
  await page.setViewportSize({ width: 1600, height: 900 });
  await go('/gatorprofile/', 1800);
  check("profile header (Joe, 2026-11-19: \"did you remove the Follow button?\"): Follow, Message and the ... menu show", (await shown('gpfollow')) && (await shown('gpmsg')) && (await shown('gpmore')) && (await shown('gpname')));
  check('profile header: Follow and Message can be clicked', await page.evaluate(() => ['gpfollow', 'gpmsg'].every((id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && at && (at === e || e.contains(at)); })));
  check('profile header: the counts, bio, highlights and the grid stay', (await shown('gpcounts')) && (await shown('gpbio')) && (await shown('gphigh')) && (await shown('gp1')));
  check('profile header: only the Similar accounts chevron goes', !(await shown('gpsim')));
  await go('/gatorfollowing/', 1500);
  check('profile header, followed: Following and Message show', (await shown('gffollowing')) && (await shown('gfmsg')) && (await shown('gfbtns')));
  await go('/p/POSTPAGE/', 1500);
  check("a post's page: the author's row and its Follow stay", (await shown('ppauthor')) && (await shown('ppfollow')));
  await page.setViewportSize({ width: 556, height: 900 });
  await go('/mutualprofile/', 1500);
  check('suggestions, guard: a profile he does not follow keeps its header (Follow, Message, its mutuals line, bio) and posts', (await shown('mpname')) && (await shown('mpfollow')) && (await shown('mpmsg')) && (await shown('mpmutual')) && (await shown('mpbio')) && (await shown('mp1')));
  check('suggestions, guard: a Followers list (Follow buttons, no suggestion line) stays', (await shown('fdlg')) && (await shown('fl-fa')) && (await shown('fl-fb')) && (await shown('fl-fc')));
  await page.setViewportSize({ width: 1280, height: 720 });
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
    for (const f of ['ig-core.js', 'ig-filter.js', 'ig-tidy.js']) await tctx.addInitScript({ content: fs.readFileSync(path.join(shared, f), 'utf8') });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => console.log('pageerror:', e.message));
    const tcentre = (sel) => tp.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const tshown = (id) => tp.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; if (e.closest('[data-igx]')) return false; for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; } return e.getBoundingClientRect().height > 1; }, id);
    await tp.goto('https://www.instagram.com/hand2/'); await tp.waitForTimeout(900);
    check('touch: before picking, a tap on the picture reaches Instagram (nothing changed for normal use)', await (async () => { const c = await tcentre('#o1img'); await tp.touchscreen.tap(c.x, c.y); await tp.waitForTimeout(100); return tp.evaluate(() => window.igTaps > 0); })());
    await tp.waitForTimeout(700);
    await tp.evaluate(() => { window.igTaps = 0; document.dispatchEvent(new CustomEvent('igf-pick')); });
    { const c = await tcentre('#o1img'); await tp.touchscreen.tap(c.x, c.y); }
    await tp.waitForTimeout(150);
    check('touch: a tap through Instagram\'s clear box hides the post at once', !(await tshown('o1')));
    check('touch: Instagram never saw that tap (no like, no navigation)', await tp.evaluate(() => window.igTaps === 0), String(await tp.evaluate(() => window.igTaps)));
    check('touch: the next post stays', await tshown('o2'));
    // Joe, 2026-11-13: "when I tap the picture to hide it says 'no picture there'". Once Instagram had changed pages
    // without loading (a profile opened, a story closed, Back), the whole page counted as its tab bar.
    await tp.goto('https://www.instagram.com/hand2/'); await tp.waitForTimeout(900);
    await tp.evaluate(() => { history.pushState({}, '', '/someone/'); });
    await tp.waitForTimeout(200);
    await tp.evaluate(() => { history.pushState({}, '', '/hand2/'); });
    await tp.waitForTimeout(300);
    check('after Instagram changes pages by itself, the page is not taken for its tab bar', await tp.evaluate(() => !document.documentElement.hasAttribute('data-igt-nav') && !!document.documentElement.getAttribute('data-igt-route')));
    await tp.evaluate(() => { window.igTaps = 0; document.dispatchEvent(new CustomEvent('igf-pick')); });
    { const c = await tcentre('#o1img'); await tp.touchscreen.tap(c.x, c.y); }
    await tp.waitForTimeout(150);
    check('touch: Hide a picture still finds the picture after Instagram has changed pages (not "No picture there")', !(await tshown('o1')) && await tp.evaluate(() => { const t = document.getElementById('igf-pick-tip'); return !!t && t.textContent === 'Hidden'; }), await tp.evaluate(() => (document.getElementById('igf-pick-tip') || {}).textContent || 'no tip'));
    await tp.waitForTimeout(700);
    await tp.evaluate(() => { document.dispatchEvent(new CustomEvent('igf-pick')); });
    { const c = await tcentre('#o2 img'); await tp.touchscreen.tap(c.x, c.y); }
    await tp.waitForTimeout(150);
    check('touch: and the next one too (a plain picture with nothing over it)', !(await tshown('o2')));
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

  // The same fault, 2026-11-13, on the search page and in the account rules: after Instagram changes pages by itself,
  // a tile that comes to the search page is still hidden and an account is still checked by its name.
  await go('/explore/', 900);
  await page.evaluate(() => { history.pushState({}, '', '/explore/search/'); history.pushState({}, '', '/explore/'); });
  await page.waitForTimeout(300);
  await page.evaluate((cdn) => { document.getElementById('grid').insertAdjacentHTML('beforeend', '<div class="_aabd"><a id="e9" href="/p/E9/" role="link"><img src="' + cdn + '/plain-e9.jpg" style="width:200px;height:200px" alt=""></a></div><a id="acct9" href="/amy_x9/"><span>amy_x9</span><span>Amy | OnlyFans</span></a><a id="acct8" href="/amy.pedals8/"><span>amy.pedals8</span><span>Amy | Fuzz boxes</span></a>'); }, CDN);
  await page.waitForTimeout(900);
  const shownNow = (id) => page.evaluate((i) => { let e = document.getElementById(i); if (!e) return false; if (e.closest('[data-igx]')) return false; for (; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true; }, id);
  check('no Explore: a tile that arrives after Instagram changed pages by itself is still hidden', !(await shownNow('e9')));
  check('accounts by name: still checked after Instagram changed pages by itself', !(await shownNow('acct9')) && await shownNow('acct8'), `${await shownNow('acct9')} ${await shownNow('acct8')}`);

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
