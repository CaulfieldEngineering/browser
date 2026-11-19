// Signed-in counterparts of the real skeletons. No Instagram class names or scripts.
const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1)).join('');
const pic = (name, w, h = w, extra = '') => `<img src="https://scontent.cdninstagram.com/v/fx/${name}.jpg" style="display:block;flex-shrink:0;width:${w}px;height:${h}px;object-fit:cover" ${extra}>`;
const icon = (label) => `<svg aria-label="${label}" style="display:block;width:24px;height:24px"><title>${label}</title></svg>`;
const button = (id, text) => `<div${id ? ` id="${id}"` : ''} role="button" tabindex="0" style="display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;padding:4px;box-sizing:border-box">${text}</div>`;
const avatar = (who, size = 44, name = `plain-${who}`) => `<a href="/${who}/" style="display:block">${pic(name, size, size, `alt="${who}'s profile picture"`)}</a>`;
const rowStyle = 'display:flex;align-items:center;gap:12px;padding:12px;box-sizing:border-box';

function navigation(width) {
  const wide = width >= 768;
  const items = [['home', '/', 'Home'], ...(wide ? [['search', '#', 'Search']] : []), ['explore', '/explore/', 'Explore'], ['reels', '/reels/', 'Reels'], ['messages', '/direct/inbox/', 'Messages'], ...(wide ? [['notifications', '#', 'Notifications'], ['create', '#', 'New post']] : []), ['profile', '/joe/', 'Profile']];
  return `<div role="navigation" style="position:fixed;z-index:10;background:white;display:flex;${wide ? 'left:0;top:0;bottom:0;width:180px;flex-direction:column;padding-top:24px' : 'left:0;right:0;bottom:0;height:56px'}">${items.map(([id, href, label]) => `<div style="${wide ? 'height:56px;flex-shrink:0' : 'flex:1;min-width:0'}"><a id="nav-${id}" href="${href}" style="display:flex;align-items:center;justify-content:center;gap:8px;height:100%;box-sizing:border-box">${icon(label)}${wide ? `<span>${id === 'create' ? 'Create' : label}</span>` : ''}</a></div>`).join('')}</div>`;
}
const main = (width, html, max = 935) => `<main role="main" style="margin-left:${width >= 768 ? 200 : 0}px;padding:20px 12px 80px;box-sizing:border-box"><div style="max-width:${max}px;margin:0 auto">${html}</div></main>`;
const page = (width, html) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font:14px/20px Arial,sans-serif;color:#222">${navigation(width)}${html}</body></html>`;
const actions = (n) => `<div style="display:flex;gap:8px;padding:8px">${['Like', 'Comment', 'Share', 'Save'].map((s) => button(`ctl-${s.toLowerCase()}-${n}`, icon(s))).join('')}</div>`;
const comment = (id = 'ctl-comment') => `<textarea id="${id}" aria-label="Add a comment…" style="display:block;width:100%;height:40px;box-sizing:border-box"></textarea>`;

function suggestion(n, prefix = 'sugg', mutuals = false) {
  const who = `${prefix === 'nsugg' ? 'nsug' : 'sug'}${n}`;
  return `<div id="${prefix}${n}" style="${rowStyle}">${avatar(who, mutuals ? 56 : 44)}<div style="flex:1;min-width:0"><a href="/${who}/">${who}</a><div style="display:flex;align-items:center;gap:4px">${mutuals ? seq(3, (k) => pic(`plain-mutual-${n}-${k}`, 14)) : ''}<span>${mutuals ? `${n} mutuals` : n % 2 ? 'Suggested for you' : 'Followed by acct1 + 3 more'}</span></div></div><div role="button" style="color:#4150f7;flex-shrink:0">Follow</div></div>`;
}
function feed(width) {
  const size = Math.min(470, width - 24);
  const carousel = `<div style="padding:12px 0"><h3 id="feed-sugg-head">Suggested for you</h3><div style="display:flex;gap:12px;overflow-x:auto">${seq(4, (n) => `<div id="card${n}" style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:0 0 140px;padding:12px;box-sizing:border-box"><button aria-label="Dismiss">×</button>${avatar(`cardacct${n}`, 64)}<a href="/cardacct${n}/">cardacct${n}</a><span>Followed by x</span><button>Follow</button></div>`)}</div></div>`;
  const posts = seq(5, (n) => `<article id="post${n}" style="margin-bottom:24px"><header style="${rowStyle}">${avatar(`acct${n}`, 32)}<a href="/acct${n}/">acct${n}</a>${n === 2 ? button('ctl-author-follow', 'Follow') : ''}</header><div id="media${n}" style="display:flex;overflow-x:auto;width:${size}px">${pic(`${n === 4 ? 'flag' : 'plain'}-post${n}`, size, size)}${n === 3 ? pic('plain-post3-second', size, size) : ''}</div>${actions(n)}<div>${n === 5 ? 'At the beach #bikini' : `Photo from acct${n}`}</div>${comment(`ctl-comment-field-${n}`)}</article>${n === 3 ? carousel : ''}`);
  const side = width === 1440 ? `<aside style="width:300px;flex-shrink:0"><div style="${rowStyle}">${avatar('joe')}<a href="/joe/">joe</a></div><div style="display:flex;justify-content:space-between"><h3 id="sugg-head">Suggested for you</h3><a href="/explore/people/">See All</a></div><div>${seq(5, (n) => suggestion(n))}</div></aside>` : '';
  return main(width, `<div style="display:flex;justify-content:center;gap:40px"><div style="width:${size}px;flex-shrink:0">${posts}</div>${side}</div>`, 1000);
}

function grid(count, columns, width, flagged = [2, 9], late = 5, explore = false) {
  const cell = (width - (columns - 1) * 4) / columns;
  return `<div id="grid">${seq(Math.ceil(count / columns), (r) => `<div style="display:flex;gap:4px;margin-bottom:4px">${seq(Math.min(columns, count - (r - 1) * columns), (c) => {
    const n = (r - 1) * columns + c;
    return `<div style="width:${cell}px;flex-shrink:0"><a id="tile${n}" href="${explore ? (n % 2 ? '/p/' : '/reel/') : '/gator_club/p/'}ID${n}/" style="display:block"><div><div style="position:relative;padding-bottom:133.33%">${pic(`${flagged.includes(n) ? 'flag' : n === late ? 'late' : 'plain'}-tile${n}`, cell, cell * 1.3333).replace('display:block;', 'display:block;position:absolute;top:0;left:0;')}</div></div></a></div>`;
  })}</div>`)}</div>`;
}
function profile(width, { following = false, flagged = false } = {}) {
  const contentWidth = Math.min(1100, width - (width >= 768 ? 224 : 24));
  const who = flagged ? 'hot.model' : 'gator_club';
  const head = `<header style="display:grid;grid-template-columns:${width < 768 ? 90 : 190}px 1fr;gap:12px;margin-bottom:24px"><section style="grid-row:1/5">${avatar(who, width < 768 ? 80 : 150)}</section><section style="display:flex;align-items:center;gap:12px"><h2 id="profile-name">${who}</h2>${button('ctl-options', icon('Options'))}</section><section><ul style="display:flex;gap:16px;list-style:none;padding:0;margin:0"><li>15 posts</li><li><a href="/${who}/followers/">800 followers</a></li><li><a href="/${who}/following/">120 following</a></li></ul></section><section id="profile-bio">${flagged ? 'onlyfans link below' : 'Live music and community.'}</section><section><div style="display:flex;gap:8px">${button('ctl-follow', `<div>${following ? 'Following' : 'Follow'}</div>`)}${button('ctl-message', 'Message')}${button('similar-btn', icon('Similar accounts'))}</div></section></header>`;
  const highlights = `<div style="display:flex;gap:24px;padding:12px 0">${seq(3, (n) => `<a href="/stories/highlights/ID${n}/">${pic(`plain-highlight${n}`, 56)}<span>Highlights</span></a>`)}</div>`;
  const tabs = `<div role="tablist" style="display:flex;justify-content:space-around;margin:20px 0">${['Posts', 'Reels', 'Tagged'].map((s) => `<a id="ctl-tab-${s.toLowerCase()}" role="tab" href="/${who}/${s === 'Posts' ? '' : s.toLowerCase() + '/'}" style="display:block;padding:8px">${icon(s)}</a>`).join('')}</div>`;
  return main(width, head + highlights + tabs + grid(15, width === 1600 ? 5 : 3, contentWidth), 1100);
}
const follower = (n) => `<div id="follower${n}" style="${rowStyle}">${avatar(`fan${n}`, 32)}<a href="/fan${n}/" style="flex:1">Fan ${n}</a>${button(`ctl-follower-${n}`, n === 2 || n === 5 ? 'Following' : 'Follow')}</div>`;
function post(width) {
  const size = Math.min(540, width - 24);
  return main(width, `<div id="post1"><header style="${rowStyle}">${avatar('gator_club', 32)}<a href="/gator_club/">gator_club</a>${button('ctl-follow', 'Follow')}</header><div id="post-media">${pic('plain-open-post', size, size)}</div><div>Last night's show.</div><div>${seq(3, (n) => `<div style="${rowStyle}">${avatar(`commenter${n}`, 32)}<a href="/commenter${n}/">commenter${n}</a><span>Great show!</span></div>`)}</div>${actions(1)}<form style="display:flex">${comment()}${button('ctl-post', 'Post')}</form></div><h3>More posts from</h3>${grid(6, 3, size, [4], 0)}`, size);
}
function direct(width) {
  const threadWidth = width < 768 ? width - 24 : 540;
  const list = `<div id="thread-list" style="${width < 768 ? '' : 'width:220px;flex-shrink:0'}">${seq(6, (n) => `<a id="thread${n}" href="/direct/t/${n}/" style="${rowStyle}">${pic(`plain-thread${n}`, 40)}<div><span>Account ${n}</span><div>See you later</div></div></a>`)}</div>`;
  const messages = seq(6, (n) => `<div id="message${n}" style="padding:12px">${n === 2 || n === 4 ? pic(`${n === 4 ? 'flag' : 'plain'}-message${n}`, 240, 180) : n === 5 ? `<div>${pic('plain-shared-post', 240, 180)}<a href="/acct1/">acct1</a><a href="/acct1/p/ID123/">Shared post</a></div>` : 'A message in the conversation.'}</div>`);
  return main(width, `<div style="display:flex;gap:20px;${width < 768 ? 'flex-direction:column' : ''}">${list}<section style="width:${threadWidth}px;max-width:100%"><header style="${rowStyle}"><a href="/acct1/">acct1</a>${['Audio call', 'Video call', 'Conversation information'].map((s, i) => button(`ctl-call-${i}`, icon(s))).join('')}</header>${messages}<div style="display:flex;flex-wrap:wrap;gap:8px"><div id="ctl-composer" role="textbox" contenteditable="true" aria-label="Message" style="width:100%;height:42px;border:1px solid #888"></div><button id="ctl-photo" aria-label="Add Photo or Video">Photo</button><button id="ctl-voice" aria-label="Voice Clip">Voice</button>${button('ctl-send', 'Send')}</div></section></div>`);
}
const searchInput = '<input id="ctl-search" aria-label="Search input" style="display:block;width:100%;height:40px;box-sizing:border-box;margin-bottom:20px">';
const result = (n, flag = false) => `<div id="result${n}" style="${rowStyle}">${avatar(`result${n}`, 44, `${flag ? 'flag' : 'plain'}-result${n}`)}<a href="/result${n}/">result${n}</a><span>Result ${n}</span></div>`;
function notifications(width) {
  return main(width, `<div>${seq(4, (n) => `<div id="newfollower${n}" style="${rowStyle}">${avatar(`acct${n}`, 44)}<span><a href="/acct${n}/">acct${n}</a> started following you. 2d</span>${button(`ctl-newfollower-${n}`, 'Follow')}</div>`)}${seq(3, (n) => `<div id="notification${n}" style="${rowStyle}"><a href="/liker${n}/">acct${n}</a><span>liked your photo</span>${pic(`${n === 2 ? 'flag' : 'plain'}-notification${n}`, 44)}</div>`)}<h3 id="notif-sugg-head">Suggested for you</h3><div>${seq(4, (n) => suggestion(n, 'nsugg'))}</div></div>`, 600);
}
function stories(width) {
  return main(width, `<section><header style="${rowStyle}">${avatar('acct1', 32)}<a href="/acct1/">acct1</a><time>2h</time>${['Pause', 'Menu', 'Close'].map((s) => `<button id="ctl-${s.toLowerCase()}" aria-label="${s}">${s}</button>`).join('')}</header>${pic('plain-story', 366, 580)}<div style="display:flex;justify-content:space-between"><button id="ctl-previous" aria-label="Previous">Previous</button><button id="ctl-next" aria-label="Next">Next</button></div><textarea id="ctl-reply" aria-label="Reply to acct1…" style="width:100%;height:40px;box-sizing:border-box"></textarea></section>`);
}
const createDialog = `<div id="create-dialog" role="dialog" aria-label="Create new post" style="position:fixed;z-index:20;right:12px;top:430px;width:280px;padding:12px;background:white;border:1px solid #aaa;box-sizing:border-box"><input id="ctl-file" type="file" style="width:100%"><div style="display:flex;gap:8px"><img src="blob:https://www.instagram.com/abc" style="width:100px;height:100px" alt="Preview">${pic('flag-preview', 100)}</div><div id="ctl-caption" role="textbox" contenteditable="true" aria-label="Write a caption" style="height:40px;border:1px solid #aaa"></div><div style="display:flex">${['Back', 'Next', 'Share'].map((s) => `<button id="ctl-create-${s.toLowerCase()}">${s}</button>`).join('')}</div></div>`;

export const shapes = {};
function add(name, widths, path, render) {
  for (const width of widths) shapes[`${name}@${width}`] = { path, width, height: width < 768 ? 844 : width >= 1440 ? 950 : 760, html: page(width, render(width)) };
}
add('feed', [1440, 1100, 390], '/?variant=following', feed);
add('feed-suggestions-only', [377, 1100], '/?variant=following', (w) => main(w, `<div>${seq(10, (n) => suggestion(n, 'sugg', true))}</div>`, 600) + '<div id="ctl-floating-messages" role="button" style="position:fixed;bottom:70px;right:20px;background:white;padding:12px;z-index:11">Messages</div>');
add('profile-signedin', [1600, 1100, 390], '/gator_club/', profile);
add('profile-following', [1100], '/gator_club/', (w) => profile(w, { following: true }));
add('profile-flagged', [1100], '/hot.model/', (w) => profile(w, { flagged: true }));
add('profile-followers-dialog', [1100], '/gator_club/followers/', (w) => profile(w) + `<div role="dialog" aria-label="Followers" style="position:fixed;right:16px;top:350px;width:320px;height:360px;overflow:auto;background:white;z-index:20"><h2>Followers</h2>${seq(8, follower)}</div>`);
add('people-page', [390], '/gator_club/followers/', (w) => main(w, seq(8, follower)));
add('post-signedin', [1440, 390], '/gator_club/p/ID1/', post);
add('direct', [1440, 390], '/direct/t/123/', direct);
add('explore', [1440, 390], '/explore/', (w) => main(w, searchInput + grid(12, 3, Math.min(935, w - (w >= 768 ? 224 : 24)), [2], 0, true) + seq(2, (n) => result(n))));
add('search-results', [390], '/explore/search/', (w) => main(w, searchInput + seq(6, (n) => result(n, n === 3)) + seq(2, (n) => `<div style="padding:12px"><a href="/explore/tags/tag${n}/">#tag${n}</a></div>`)));
add('notifications', [1440, 390], '/notifications/', notifications);
add('stories', [390], '/stories/acct1/123/', stories);
add('create-dialog', [1440], '/?variant=following', (w) => feed(w) + createDialog);
add('work-insights', [1440], '/accounts/insights/', (w) => main(w, `<h2>Insights</h2><div style="display:flex;gap:16px">${seq(4, (n) => `<div id="insight${n}" style="padding:12px"><h3>${n * 1200} views</h3>${pic(`${n === 3 ? 'flag' : 'plain'}-insight${n}`, 160, 200)}</div>`)}</div><div style="display:flex;gap:24px"><a id="ctl-business" href="https://business.facebook.com/latest/home">Meta Business Suite</a><a id="ctl-ads" href="https://adsmanager.facebook.com/adsmanager/">Ads Manager</a>${button('ctl-boost', 'Boost post')}</div>`));
