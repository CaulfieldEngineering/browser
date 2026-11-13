// The Reddit filter, in the page (Joe, 2026-11-12: "start building a version of Facebook and one of Reddit that have
// similar filtering features", then "For Reddit, no images allowed. And text-context filtering."). BUILT, NOT OPEN:
// Reddit stays blocked everywhere (locked memory entry 4), the Reddit app opens nothing (Reddit.swift), and this file
// only decides what a Reddit page would show if a Sunday review ever opens it. Settings: filter-config.js, "reddit".
//
// Reddit is text only here, and everything is hidden until it has been judged (so a page this file does not
// understand shows nothing):
//   - No media at all: pictures, video, GIFs, thumbnails, avatars, galleries, embeds and link previews are taken out of
//     the page (and refused on the network by the app, Reddit.swift). No image judge is needed.
//   - Removed outright, with no label, reveal or switch: posts and comments marked NSFW (18+), quarantined ones,
//     promoted ones; anything from a subreddit whose name carries an adult or suggestive term; anything outside the
//     allow-list when it is on (it is, and it is empty until a review names subreddits); and text-context rules: a
//     post or comment whose title, body, flair, subreddit or author carries an adult or suggestive term (the shared
//     words in rules.js and the Reddit terms in filter-config.js).
//   - Pages that do not open: r/all, r/popular, random, the 18+ and quarantine gates, an adult-named subreddit, a
//     subreddit whose description carries the terms, a subreddit off the list.
// The markup is old.reddit.com's (div.thing with data-subreddit, data-nsfw, .over18, .promoted, a.title,
// .linkflairlabel, .usertext-body .md), which the app keeps Reddit on, and the newer pages' elements (shreddit-post,
// shreddit-comment and their attributes) as a second shape. Written from Reddit's documented structure and tested on
// fixture pages only: no agent opened Reddit to write it, so the live site is unproven.
(function () {
  'use strict';
  const g = globalThis;
  if (g.__rdFilter || !/(^|\.)reddit\.com$/i.test(location.hostname)) return;
  const CFG = (g.IGFilterConfig && g.IGFilterConfig.reddit) || {};
  const RULES = g.IGFilterRules || null;
  const state = { removed: 0, ok: 0, blocked: null, passes: 0 };
  g.__rdFilter = state;
  const stat = (name) => { try { g.IGFilterBridge && g.IGFilterBridge.stat && g.IGFilterBridge.stat(name); } catch {} };

  // ---- settings (missing settings fail closed: the allow-list is on and empty) ---------------------------------------
  const ALLOW_ON = !(CFG.allowList && CFG.allowList.on === false);
  const ALLOW = new Set(((CFG.allowList && CFG.allowList.subreddits) || []).map((x) => String(x).toLowerCase()));
  const FEEDS_OFF = new Set((CFG.feedsOff || ['all', 'popular', 'random', 'randnsfw', 'friends', 'mod', 'best', 'home']).map((x) => x.toLowerCase()));
  const PAGES_OFF = (CFG.pagesOff || ['over18', 'quarantine', 'gallery', 'media']).map((x) => x.toLowerCase());
  const SUB_RE = (CFG.subredditPatterns || ['nsfw', 'gonewild', 'porn', 'nude', 'sex', 'xxx']).map((p) => { try { return new RegExp(p, 'i'); } catch { return null; } }).filter(Boolean);
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const TERMS = Object.entries(CFG.terms || {}).filter(([k]) => k !== '_what').flatMap(([, words]) => words);
  const TERM_RE = TERMS.length ? new RegExp('(^|[^\\p{L}\\p{N}_])(' + TERMS.map(esc).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu') : null;
  const LINKS_OFF = /porn|xxx|nsfw|hentai|onlyfans|fansly|redgifs|erome|xvideos|xhamster|xnxx|chaturbate|stripchat|manyvids|fapello|coomer|rule34/i;

  // ---- styles, at document start: nothing shows before it is judged; no media ever -----------------------------------
  const MEDIA = 'img,picture,video,audio,canvas,iframe,embed,object,svg image,image,' +
    'shreddit-player,shreddit-player-2,shreddit-embed,gallery-carousel,faceplate-img,faceplate-carousel,shreddit-aspect-ratio,shreddit-media-lightbox,' +
    '.thumbnail,.expando-button,.media-preview,.media-embed,.video-player,.preview,.link-preview,.gallery-tiles,.crosspost-preview-content .media-preview,' +
    '[slot="thumbnail"],[slot="post-media-container"],[data-testid="post-thumbnail"]';
  const UNIT = '.thing,.search-result,shreddit-post,shreddit-comment,shreddit-profile-comment,search-telemetry-tracker,[data-testid="search-post-unit"]';
  const css = [
    // until the first pass is done the page is blank; a page blocked as a whole stays blank
    'html:not([data-rdf-ready]) body{visibility:hidden !important}',
    'html[data-rdf-blocked] body{display:none !important}',
    MEDIA + '{display:none !important}',
    '*,*::before,*::after{background-image:none !important;list-style-image:none !important;border-image-source:none !important;mask-image:none !important;-webkit-mask-image:none !important}',
    // a post, comment or search result shows only once judged clean
    UNIT.split(',').map((u) => u + ':not([data-rdf-ok])').join(',') + '{display:none !important}',
    // always gone: ads, the bar of other subreddits, trending, sign-up strips, the 18+ switch in search, app prompts
    'shreddit-ad-post,shreddit-comments-page-ad,shreddit-dynamic-ad-link,.promotedlink,.promoted,.ad-container,#ad-frame,.ad-container,#sr-header-area,.sr-list,.trending-subreddits,.listingsignupbar,.infobar,.premium-banner,.goldvertisement,.sidecontentbox,.login-required-popup,[name="include_over_18"],label[for="include_over_18"],input[name="include_over_18"]+label,xpromo-nsfw-blocking-container,xpromo-nsfw-blocking-modal,shreddit-async-loader[bundlename*="xpromo"],.xpromo-popup,#xpromo-bottom-sheet{display:none !important}',
    '[data-rdf-off]{display:none !important}',
    // old Reddit draws its vote arrows as pictures: plain characters instead
    '.arrow.up::before,.arrow.upmod::before{content:"\\25B2" !important}', '.arrow.down::before,.arrow.downmod::before{content:"\\25BC" !important}',
    '.arrow{width:auto !important;height:auto !important;font-size:12px !important;line-height:1.2 !important;text-indent:0 !important}',
  ].join('');
  const addStyle = () => {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById('rdf-style')) return;
    const s = document.createElement('style');
    s.id = 'rdf-style';
    s.textContent = css;
    parent.appendChild(s);
  };
  addStyle();

  // ---- subreddits ----------------------------------------------------------------------------------------------------
  const clean = (name) => String(name || '').trim().replace(/^\/?r\//i, '').replace(/\/.*$/, '').toLowerCase();
  const asWords = (name) => String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');
  /** Why a subreddit is out ('sub-nsfw', 'off-list'), or null. */
  function subWhy(raw) {
    const name = clean(raw);
    if (!name) return 'unknown';
    if (FEEDS_OFF.has(name)) return 'feed-off';
    if (SUB_RE.some((re) => re.test(name))) return 'sub-nsfw';
    if (RULES && RULES.account && RULES.account(asWords(raw))) return 'sub-nsfw';
    if (TERM_RE && TERM_RE.test(asWords(raw))) return 'sub-nsfw';
    if (ALLOW_ON && !ALLOW.has(name)) return 'off-list';
    return null;
  }
  /** The subreddits a path names: "/r/a+b/new/" -> ["a", "b"]; null when it names none. */
  function subsOf(pathname) {
    const m = String(pathname || '').match(/^\/r\/([^/]+)/i);
    return m ? decodeURIComponent(m[1]).split('+').map(clean).filter(Boolean) : null;
  }
  const pageSubs = () => subsOf(location.pathname);

  // ---- text ----------------------------------------------------------------------------------------------------------
  /** Why a piece of text is out ('text'), or null: the shared suggestive, revealing and account words, and Reddit's. */
  function textWhy(text) {
    const t = String(text || '').slice(0, 20000);
    if (!t.trim()) return null;
    if (TERM_RE && TERM_RE.test(t)) return 'text';
    if (RULES && RULES.first && RULES.first('text', t, null)) return 'text';
    return null;
  }
  const nameWhy = (name) => (name && RULES && RULES.account && RULES.account(asWords(name)) ? 'text' : name && TERM_RE && TERM_RE.test(asWords(name)) ? 'text' : null);
  const txt = (el) => (el ? (el.innerText !== undefined ? el.innerText : el.textContent) || '' : '');
  const attr = (el, n) => (el.getAttribute(n) || '').trim();
  const truthy = (v) => v !== null && v !== undefined && !/^(false|0|no)$/i.test(String(v));

  // ---- a post, a comment, a search result ------------------------------------------------------------------------------
  /** The first reason a unit is removed, or null. Unknown shapes are removed ('unknown'): it fails closed. */
  function judge(el) {
    // ----- the newer pages' elements -----
    const tag = el.tagName.toLowerCase();
    if (tag === 'shreddit-post') {
      if (el.hasAttribute('nsfw') && truthy(el.getAttribute('nsfw'))) return 'nsfw';
      if (truthy(el.getAttribute('is-promoted')) && el.hasAttribute('is-promoted')) return 'promoted';
      if (el.hasAttribute('quarantined') || el.hasAttribute('is-quarantined')) return 'quarantined';
      const sub = attr(el, 'subreddit-prefixed-name') || attr(el, 'subreddit-name');
      const sw = /^u\//i.test(sub) ? (ALLOW_ON ? 'off-list' : nameWhy(sub.slice(2))) : subWhy(sub);
      if (sw) return sw;
      if (LINKS_OFF.test(attr(el, 'domain')) || LINKS_OFF.test(attr(el, 'content-href'))) return 'link';
      return nameWhy(attr(el, 'author')) || textWhy([attr(el, 'post-title'), attr(el, 'flair-text'), txt(el)].join('\n'));
    }
    if (tag === 'shreddit-comment' || tag === 'shreddit-profile-comment') {
      const subs = pageSubs();
      const sub = attr(el, 'subreddit-prefixed-name') || (subs && subs.length === 1 ? subs[0] : '');
      const sw = subWhy(sub);
      if (sw) return sw;
      // its own words only (the replies are judged on their own)
      const own = el.querySelector(':scope > [slot="comment"]') || el.querySelector('[slot="comment"]');
      return nameWhy(attr(el, 'author')) || textWhy(own ? txt(own) : '');
    }
    // ----- old Reddit: a search result -----
    if (el.classList.contains('search-result')) {
      if (el.querySelector('.nsfw-stamp, .quarantine-stamp')) return 'nsfw';
      const link = el.querySelector('.search-subreddit-link, a.search-subreddit-link');
      const title = el.querySelector('.search-title, a.search-title');
      const isSub = el.classList.contains('search-result-subreddit');
      const sub = link ? txt(link) : isSub && title ? (title.getAttribute('href') || '').replace(/^.*\/r\//, '') : '';
      const sw = subWhy(sub);
      if (sw) return sw;
      return textWhy(txt(el));
    }
    // ----- old Reddit: a thing -----
    if (!el.classList.contains('thing')) return 'unknown';
    if (attr(el, 'data-nsfw') === 'true' || el.classList.contains('over18') || el.querySelector(':scope > .entry .nsfw-stamp')) return 'nsfw';
    if (attr(el, 'data-promoted') === 'true' || el.classList.contains('promoted') || el.classList.contains('promotedlink')) return 'promoted';
    if (el.classList.contains('quarantine') || attr(el, 'data-quarantine') === 'true' || el.querySelector(':scope > .entry .quarantine-stamp')) return 'quarantined';
    const entry = el.querySelector(':scope > .entry') || el;
    const author = attr(el, 'data-author');
    if (el.classList.contains('message')) return nameWhy(author) || textWhy(txt(entry)); // the inbox: text only
    if (el.classList.contains('subreddit')) { // a row in a list of subreddits
      const a = entry.querySelector('a.title');
      return subWhy(a ? (a.getAttribute('href') || '').replace(/^.*\/r\//, '') : '') || textWhy(txt(entry));
    }
    if (el.classList.contains('morechildren') || el.classList.contains('morerecursion')) return null; // "load more comments"
    const subs = pageSubs();
    const sw = subWhy(attr(el, 'data-subreddit') || (subs && subs.length === 1 ? subs[0] : ''));
    if (sw) return sw;
    if (el.classList.contains('link')) {
      if (LINKS_OFF.test(attr(el, 'data-domain')) || LINKS_OFF.test(attr(el, 'data-url'))) return 'link';
      const parts = [txt(entry.querySelector('a.title')), ...[...entry.querySelectorAll('.linkflairlabel, .flair')].map(txt), txt(entry.querySelector('.usertext-body')), attr(el, 'data-domain')];
      return nameWhy(author) || textWhy(parts.join('\n'));
    }
    if (el.classList.contains('comment')) {
      return nameWhy(author) || textWhy([...entry.querySelectorAll('.flair')].map(txt).join('\n') + '\n' + txt(entry.querySelector('.usertext-body')));
    }
    return 'unknown';
  }

  const judgedAs = new WeakMap(); // unit -> the text length it was judged at
  function check(el) {
    if (!el || el.nodeType !== 1) return;
    const len = (el.textContent || '').length + '|' + el.attributes.length;
    if (judgedAs.get(el) === len) return;
    judgedAs.set(el, len);
    let why;
    try { why = judge(el); } catch (e) { why = 'unknown'; }
    const was = el.getAttribute('data-rdf-gone');
    if (why) {
      el.removeAttribute('data-rdf-ok');
      if (was !== why) { el.setAttribute('data-rdf-gone', why); if (!was) { state.removed++; stat('hidden-rd-' + why); } }
    } else if (!was) { // once removed, a unit stays removed until the page reloads
      if (!el.hasAttribute('data-rdf-ok')) { el.setAttribute('data-rdf-ok', ''); state.ok++; }
    }
  }

  // ---- the page as a whole ---------------------------------------------------------------------------------------------
  /** Why this page does not open, or null. */
  function pageWhy() {
    const path = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const first = path.split('/')[1] || '';
    if (PAGES_OFF.some((p) => path === '/' + p || path.startsWith('/' + p + '/'))) return 'page-off';
    const subs = pageSubs();
    if (subs) { for (const s of subs) { const w = subWhy(s); if (w) return w; } }
    else if (ALLOW_ON) {
      // With the allow-list on, the only pages outside a subreddit are the ones a signed-in person needs.
      const NEEDED = ['login', 'register', 'account', 'settings', 'prefs', 'message', 'submit', 'search', 'password', 'logout', 'api', 'user', 'u', 'comments', 'subreddits'];
      if (path === '/' || !NEEDED.includes(first)) return 'feed-off';
      if (first === 'subreddits' && !/^\/subreddits\/mine/.test(path)) return 'feed-off';
    } else if (FEEDS_OFF.has(first)) return 'feed-off';
    if (/[?&]include_over_18=(on|1|true)/i.test(location.search)) return 'page-off';
    const body = document.body;
    if (!body) return null;
    // The 18+ gate, the quarantine gate, an adult community's notice.
    if (body.querySelector('.interstitial, form[action*="over18"], .quarantine-notice, .content.quarantine, xpromo-nsfw-blocking-container, xpromo-nsfw-blocking-modal, [class*="nsfw-blocking"], shreddit-subreddit-header[nsfw], shreddit-subreddit-header[is-nsfw]')) return 'gate';
    if (body.classList.contains('over18') || body.classList.contains('quarantine')) return 'gate';
    // The subreddit's own name and description (the sidebar of old Reddit; the header of the newer pages).
    const about = body.querySelector('.side .titlebox, shreddit-subreddit-header, [data-testid="subreddit-sidebar"]');
    if (about) {
      if (about.querySelector('.nsfw-stamp, .quarantine-stamp')) return 'gate';
      if (textWhy(txt(about).slice(0, 4000))) return 'sub-text';
    }
    // A person's page: by their name.
    const who = path.match(/^\/(?:user|u)\/([^/]+)/);
    if (who && nameWhy(who[1])) return 'text';
    return null;
  }
  function block(why) {
    if (state.blocked) return;
    state.blocked = why;
    document.documentElement.setAttribute('data-rdf-blocked', why);
    stat('hidden-rd-page-' + why);
    stat('note-rd-blocked'); // one line to the mini PC (js:rd-blocked), no address
  }

  // ---- media and links ---------------------------------------------------------------------------------------------
  function strip(root) {
    if (!root || !root.querySelectorAll) return;
    const all = root.matches && root.matches(MEDIA) ? [root, ...root.querySelectorAll(MEDIA)] : root.querySelectorAll(MEDIA);
    for (const m of all) {
      if (m.hasAttribute('data-rdf-m')) continue;
      m.setAttribute('data-rdf-m', '');
      for (const a of ['src', 'srcset', 'poster', 'data-src', 'data-url', 'data-hls-url', 'data-mpd-url', 'data-seek-preview-url']) if (m.hasAttribute(a)) m.removeAttribute(a);
      for (const s of m.querySelectorAll ? m.querySelectorAll('source, track') : []) s.remove();
      try { if (m.pause) m.pause(); } catch {}
      state.media = (state.media || 0) + 1;
    }
    // Links to the feeds that are off, to the 18+ pages and to media: not shown.
    for (const a of root.querySelectorAll('a[href]')) {
      if (a.hasAttribute('data-rdf-a')) continue;
      a.setAttribute('data-rdf-a', '');
      let u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (!/(^|\.)reddit\.com$/i.test(u.hostname)) continue;
      const subs = subsOf(u.pathname);
      const p = u.pathname.toLowerCase();
      if ((subs && subs.some((s) => FEEDS_OFF.has(s) || SUB_RE.some((re) => re.test(s)))) || PAGES_OFF.some((x) => p === '/' + x || p.startsWith('/' + x + '/'))) a.setAttribute('data-rdf-off', '');
    }
  }

  // ---- watching the page -------------------------------------------------------------------------------------------
  function pass() {
    addStyle();
    const root = document.documentElement;
    if (!document.body) return;
    const why = state.blocked || pageWhy();
    if (why) { block(why); }
    else {
      strip(document.body);
      const units = document.querySelectorAll(UNIT);
      for (const u of units) check(u);
      // A post's own page: when the post itself is removed, so is the page (its comments are about it).
      if (/\/comments\//.test(location.pathname)) {
        const main = document.querySelector('.sitetable.linklisting > .thing.link, shreddit-post');
        if (main && main.hasAttribute('data-rdf-gone')) block('post-' + main.getAttribute('data-rdf-gone'));
      }
    }
    state.passes++;
    root.setAttribute('data-rdf-ready', '');
    root.setAttribute('data-rdf-pass', String(state.passes));
  }
  let timer = 0;
  const soon = () => { if (!timer) timer = setTimeout(() => { timer = 0; pass(); }, 60); };
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) strip(n); // media goes at once, before the pass
    soon();
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'style', 'nsfw', 'class', 'data-nsfw'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pass, { once: true }); else pass();
  addEventListener('load', pass, { once: true });
  // Reddit's newer pages change the address without loading a page: judged again when it changes.
  let href = location.href;
  setInterval(() => { if (location.href !== href) { href = location.href; if (state.blocked) location.reload(); else pass(); } }, 250);
  setInterval(pass, 2000);
  g.__rdFilter.subWhy = subWhy; g.__rdFilter.textWhy = textWhy; // for the tests
})();
