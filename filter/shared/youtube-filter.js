// YouTube (Joe, 2026-11-17: "*sexual* adult content, but not things like true-crime, violence, adult topics. This can be
// based on transcript/captioning, some imagery as long as it doesn't halt an intended video, and titles/channel text
// etc."). Everything it does is the config's `youtube` block (the signed filter config on the laptop), so it is tuned
// from the admin panel with no new build; the values below are only what it does with no config at all.
//
//   - Judges sexual content only. Text: a tile's title, channel name and description snippet; on a watch page the
//     video's own title, channel, description, the captions on screen and the transcript where YouTube has one.
//     Pictures: a tile's thumbnail, at the config's line (sexual only; the revealing-clothing judge only where the
//     config's `revealing` feature is on for youtube.com).
//   - No violence, true-crime or adult-topic rules: a term list `words` counts only when none of `notWhen` (true crime,
//     trial, documentary, news...) is in the same text; `always` counts whatever else is there.
//   - Never stops or removes a video he clicked to play: nothing here pauses, mutes, hides or covers the player or any
//     <video>, on a watch page or Shorts. What it can take is recommendation surfaces only (home, search, the sidebar,
//     shelves, the end screen's tiles). A watch page whose own text is sexual only marks its channel, so that channel's
//     tiles are taken from the recommendations for the rest of the visit.
//   - A thumbnail is not held while it is judged (config thumbnails.hold), so pages never sit blank.
// It is the feature `youtube`; on since 2026-11-19 (Joe: "also our youtube filter still needs to remove \"sexual\" content").
// Joe's own words for what it takes, 2026-11-19: "For youtube: sexual content only - so, this can be things like latex
// models, asmr-type content, explicitly bikini models, things that obviously do not provide any other value". So: a
// video whose evident purpose is sexual appeal (latex and fetish-outfit model videos, sensual or girlfriend-roleplay
// ASMR, bikini, swimsuit and lingerie model videos and try-on hauls). Not: music videos, gear, tutorials, news, comedy,
// sports, fitness instruction, ordinary ASMR (tapping, cooking, whispering), or anything with real other value, even
// with a person in swimwear in it. Terms and the thumbnail line are data (the config's youtube block).
(function (run) { const G = globalThis.FilterGate; if (G && G.when) G.when(run); else run(); })(function () {
  'use strict';
  const F = (name, href) => { const f = globalThis.FilterFeature; return typeof f !== 'function' || f(name, href); };
  const g = globalThis;

  const DEFAULTS = {
    tiles: ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-grid-video-renderer', 'ytd-playlist-video-renderer',
      'ytd-reel-item-renderer', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2', 'yt-lockup-view-model', 'ytd-compact-radio-renderer',
      '.ytp-videowall-still', '.ytp-ce-element', 'ytd-endscreen-element-renderer'],
    // Never touched, nor anything inside them that is not a tile: the player and the video he is watching.
    player: ['#movie_player', '.html5-video-player', 'ytd-player', '#player-container', 'ytd-shorts', 'ytd-reel-video-renderer'],
    watch: { title: ['ytd-watch-metadata h1', 'h1.ytd-watch-metadata', '#title h1'], channel: ['ytd-watch-metadata ytd-channel-name', '#owner #channel-name', '#upload-info #channel-name'], description: ['#description-inline-expander', 'ytd-text-inline-expander', '#description'] },
    tileChannel: ['ytd-channel-name', '#channel-name', '.yt-content-metadata-view-model__metadata-text'],
    captions: { on: true, selector: '.ytp-caption-segment', everySeconds: 2, keepChars: 800 },
    transcript: { on: true },
    // (the thumbnail line: the suggestive judge's own; `revealing` is a line of its own for YouTube, null = not used,
    // since a person in swimwear or gymwear is not by itself in scope here: fitness, sport and travel stay)
    thumbnails: { judge: true, hold: false, minPx: 100, line: { explicit: 0.3, sexy: 0.45, combined: 0.6 }, revealing: null },
    terms: {
      always: ["porn", "porno", "pornhub", "onlyfans", "only fans", "fansly", "nsfw", "xxx", "hentai", "rule 34", "rule34", "camgirl", "cam girl", "striptease", "strip tease", "lap dance", "thirst trap", "thirst traps", "bikini haul", "lingerie haul", "lingerie try on", "lingerie try-on", "lingerie lookbook", "micro bikini", "see through haul", "twerk", "twerking", "boobs", "sexy", "sex tape", "leaked nudes", "nip slip", "wardrobe malfunction", "asmr girlfriend", "latex model", "latex models", "latex catsuit", "latex lookbook", "latex girl", "latex girls", "fetish model", "fetish fashion", "fetish outfit", "bikini model", "bikini models", "bikini girl", "bikini girls", "bikini try on", "bikini lookbook", "bikini photoshoot", "swimsuit model", "swimsuit models", "swimwear model", "swimsuit try on", "lingerie model", "see through try on", "transparent try on", "sheer try on", "no bra", "braless try on", "sensual asmr", "asmr sensual", "asmr kisses", "asmr kissing", "kissing asmr", "asmr gf", "girlfriend asmr", "girlfriend roleplay", "asmr ear licking", "ear licking", "ear eating", "asmr licking", "spicy asmr", "asmr lap", "lewd asmr", "asmr moaning", "fansly asmr"],
      words: ["latex outfit", "latex dress", "latex leggings", "latex fashion", "bondage", "stripper", "strippers", "lingerie", "catsuit", "nude", "nudes", "naked", "topless", "braless", "sex", "sexual", "sexually", "erotic", "erotica", "sensual", "seductive", "cleavage", "booty", "bikini", "hot girls", "babes", "kissing", "fetish", "swimsuit haul", "leggings haul", "yoga pants haul", "yoga pants try on"],
      notWhen: ["true crime", "murder", "murdered", "killer", "serial killer", "homicide", "case", "trial", "court", "convicted", "sentenced", "investigation", "documentary", "news", "police", "detective", "assault", "abuse", "victim", "victims", "survivor", "trafficking", "education", "health", "doctor", "medical", "history", "explained", "lecture", "interview", "podcast", "war", "violence", "tutorial", "overleaf", "tex", "thesis", "equation", "equations", "math", "maths", "paper", "paint", "gloves", "mattress", "pillow", "allergy", "balloon", "balloons", "mask making", "mold", "mould", "casting", "prosthetic", "sfx", "surf", "surfing", "swim meet", "competition", "bodybuilding", "olympics", "volleyball", "bikini atoll", "bikini bottom", "spongebob", "science", "review", "reviewed", "song", "official video", "lyrics", "live at", "cover", "trailer", "movie", "film", "wire", "cable", "tool", "tools", "electrician", "sewing", "sew", "pattern", "diy", "how to", "cosplay", "costume", "halloween", "wetsuit", "superhero", "motorcycle", "racing", "kids", "school"],
      patterns: ["\\basmr\\b.{0,60}\\b(girlfriend|gf|kiss(es|ing)?|sensual|seduc\\w+|lick(s|ing)?|flirt\\w*|cuddl\\w+|in bed|lap|moan\\w*)\\b", "\\b(girlfriend|gf|kiss(es|ing)?|sensual|seduc\\w+|lick(s|ing)?|flirt\\w*|moan\\w*)\\b.{0,60}\\basmr\\b", "\\b(bikini|bikinis|swimsuit|swimsuits|swimwear|lingerie|latex|pvc|leggings|yoga pants|bodysuit|thong|micro|see[\\s-]?through|sheer|transparent)\\b.{0,30}\\b(model|models|try[\\s-]?on|haul|lookbook|photoshoot|photo shoot|fashion show)\\b", "\\b(model|models|try[\\s-]?on|haul|lookbook|photoshoot)\\b.{0,30}\\b(bikini|bikinis|swimsuit|swimwear|lingerie|latex|pvc|bodysuit|thong|see[\\s-]?through|sheer|transparent)\\b", "\\bleather\\b.{0,20}\\b(bodysuit|lingerie|catsuit|leggings)\\b.{0,30}\\b(lookbook|try[\\s-]?on|haul|model)\\b", "rubber[\\s-]?doll", "rubberist", "\\brubber\\s+(catsuit|fetish|gimp|kink)\\w*", "\\bshiny\\s+world\\s+sessions?\\b", "\\bshiny\\s+(channel|fetish|kink|catsuit|doll|rubber|pvc)\\b", "\\bpvc[\\s-]?(catsuit|outfit|leggings|dress|fetish|bodysuit|lingerie)", "\\bgimp[\\s-]?(suit|mask|hood)\\b", "\\b(total|full)\\s+(rubber|body)\\s+enclosure\\b", "dominatrix", "\\bbdsm\\b", "\\bzentai\\b", "fetish[\\s-]?(wear|gear|model|fashion|outfit|shoot|photo)"],
    },
    surfaces: { home: true, search: true, sidebar: true, shelves: true, endScreen: true },
    onSexualWatch: 'mark-channel',
  };

  // ---- the text judge, pure (also used by the tests and the panel) -----------------------------------------------
  const esc = (w) => String(w).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?');
  const termRe = (list) => { const l = (list || []).filter((w) => typeof w === 'string' && w.trim()); return l.length ? new RegExp('(^|[^\\p{L}\\p{N}])#?(' + l.map(esc).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu') : null; };
  function compile(terms) {
    const t = terms || DEFAULTS.terms, pats = [];
    for (const p of Array.isArray(t.patterns) ? t.patterns : []) { try { pats.push(new RegExp(p, 'iu')); } catch {} }
    return { always: termRe(t.always), words: termRe(t.words), notWhen: termRe(t.notWhen), patterns: pats };
  }
  /** Why a text is sexual ('always:<term>', 'word:<term>', 'pattern'), or null. Violence, crime and adult topics are
   *  not rules here; a `words` hit is cancelled by any `notWhen` term in the same text. */
  function sexualText(text, c) {
    const s = String(text || '');
    if (!s.trim()) return null;
    let m;
    // Words he named (2026-11-19; the same as rules.js namedWord): latex in any spelling but LaTeX, goddess, femdom,
    // domme, mistress, joi as a whole word. Never cancelled by a word of other value.
    if ((m = s.match(/latex/giu)) && m.some((x) => x !== 'LaTeX')) return 'always:latex';
    if (/goddess|femdom|domme|mistress/iu.test(s) || /(^|[^\p{L}\p{N}])#?joi(?=$|[^\p{L}\p{N}])/iu.test(s)) return 'always:named';
    if (c.always && (m = s.match(c.always))) return 'always:' + m[2].toLowerCase();
    if (c.patterns.some((p) => p.test(s))) return 'pattern';
    if (c.words && (m = s.match(c.words)) && !(c.notWhen && c.notWhen.test(s))) return 'word:' + m[2].toLowerCase();
    return null;
  }
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };
  g.YouTubeRules = { DEFAULTS, compile, sexualText, merge };

  // ---- the page --------------------------------------------------------------------------------------------------
  if (g.__ytFilter || typeof location === 'undefined' || !/(^|\.)youtube\.com$/i.test(location.hostname) || !F('youtube')) return;
  const fromGate = g.FilterGate && g.FilterGate.config && g.FilterGate.config();
  const C = merge(DEFAULTS, (fromGate && fromGate.youtube) || g.__youtubeConfig || {});
  const T = compile(C.terms);
  const B = g.IGFilterBridge;
  const state = (g.__ytFilter = { removed: 0, judged: 0, flaggedChannels: new Set(), watch: null, reasons: {} });
  const stat = (n) => { try { B && B.stat && B.stat(n); } catch {} };
  const TILE = C.tiles.join(', '), PLAYER = C.player.join(', ');
  // A tile that goes is blanked in place: it keeps its box, so YouTube's grid and lists are exactly as YouTube laid them
  // out (2026-11-19, the same rule as Instagram: docs/instagram-filter-design.md); nothing in it shows or takes a click.
  const css = '[data-ytf-gone],[data-ytf-gone] *{visibility:hidden !important;pointer-events:none !important}[data-ytf-hold] img{visibility:hidden !important}';
  const addStyle = () => { const p = document.head || document.documentElement; if (p && !document.getElementById('ytf-style')) { const s = document.createElement('style'); s.id = 'ytf-style'; s.textContent = css; p.appendChild(s); } };
  addStyle();

  const surfaceOf = (tile) => {
    if (tile.matches('.ytp-videowall-still, .ytp-ce-element, ytd-endscreen-element-renderer')) return 'endScreen';
    if (tile.closest('ytd-watch-next-secondary-results-renderer, #related, #secondary')) return 'sidebar';
    if (tile.closest('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, ytd-shelf-renderer')) return 'shelves';
    if (/^\/results/.test(location.pathname)) return 'search';
    return 'home';
  };
  // A tile is never the player and never holds the video being played.
  const isPlayerish = (el) => { const main = document.querySelector('video.html5-main-video, #movie_player video'); return !!(main && (el === main || el.contains(main))) || (el.matches(PLAYER) && !el.matches(TILE)); };
  const take = (tile, why) => {
    if (tile.hasAttribute('data-ytf-gone') || isPlayerish(tile)) return;
    tile.setAttribute('data-ytf-gone', why);
    tile.removeAttribute('data-ytf-hold');
    try { tile.setAttribute('aria-hidden', 'true'); tile.inert = true; for (const v of tile.querySelectorAll('video')) { v.muted = true; v.pause(); } } catch {} // (a tile's own hover preview, never the player: isPlayerish above)
    state.removed++; state.reasons[why] = (state.reasons[why] || 0) + 1;
    stat('hidden-yt-' + why.split(':')[0]);
  };
  const textOfTile = (tile) => {
    const bits = [tile.innerText || tile.textContent || ''];
    for (const el of [tile, ...tile.querySelectorAll('a[title], a[aria-label], [aria-label], img[alt]')].slice(0, 30)) bits.push(el.getAttribute('title') || '', el.getAttribute('aria-label') || '', el.getAttribute('alt') || '');
    return bits.join(' ').replace(/\s+/g, ' ').slice(0, 1500);
  };
  const channelOfTile = (tile) => { for (const s of C.tileChannel) { const el = tile.querySelector(s); if (el && el.textContent.trim()) return oneLine(el.textContent).toLowerCase(); } return ''; };

  // thumbnails: judged by the same judge as every picture, at YouTube's own line; not held while judged unless asked
  const line = C.thumbnails.line, REVEALING = (g.IGFilterRules && g.IGFilterRules.revealing) || 0.6;
  const thumbFlagged = (s) => {
    if (!s) return null;
    const ex = (s.Porn || 0) + (s.Hentai || 0);
    if (F('pictures') && (ex >= line.explicit || (s.Sexy || 0) >= line.sexy || ex + (s.Sexy || 0) >= line.combined)) return 'thumbnail';
    const rl = typeof C.thumbnails.revealing === 'number' ? C.thumbnails.revealing : F('revealing') && C.thumbnails.revealing !== null ? REVEALING : null;
    if (rl !== null && 'Revealing' in s && (s.Revealing || 0) >= rl) return 'thumbnail-revealing';
    return null;
  };
  const thumbSeen = new WeakMap();
  function judgeThumb(tile) {
    if (!C.thumbnails.judge || !B || !B.classifyUrl) return;
    const img = tile.querySelector('img[src*="ytimg.com"], img[src^="https://i.ytimg"], yt-image img, ytd-thumbnail img, img');
    const src = img && (img.currentSrc || img.src);
    if (!src || !/^https?:/.test(src) || thumbSeen.get(tile) === src) return;
    const r = img.getBoundingClientRect();
    if (r.width && r.width < C.thumbnails.minPx && r.height < C.thumbnails.minPx) return;
    thumbSeen.set(tile, src);
    if (C.thumbnails.hold) tile.setAttribute('data-ytf-hold', '');
    Promise.resolve(B.classifyUrl(src)).then((s) => {
      state.judged++;
      const why = thumbFlagged(s);
      if (why) take(tile, why); else tile.removeAttribute('data-ytf-hold');
    }).catch(() => tile.removeAttribute('data-ytf-hold'));
  }
  const tileSeen = new WeakMap();
  function checkTile(tile) {
    if (tile.hasAttribute('data-ytf-gone') || isPlayerish(tile)) return;
    if (tile.parentElement && tile.parentElement.closest(TILE)) return; // the outer tile is the one judged
    const surf = surfaceOf(tile);
    if (C.surfaces[surf] === false) return;
    const text = textOfTile(tile);
    if (tileSeen.get(tile) !== text) {
      tileSeen.set(tile, text);
      const why = sexualText(text, T);
      if (why) return take(tile, 'text:' + why);
    }
    if (state.flaggedChannels.size) { const ch = channelOfTile(tile); if (ch && state.flaggedChannels.has(ch)) return take(tile, 'channel'); }
    judgeThumb(tile);
  }
  function scan() { addStyle(); for (const t of document.querySelectorAll(TILE)) checkTile(t); }

  // ---- the video being watched: its own words, read; the player never touched ---------------------------------------
  const firstText = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el && el.textContent.trim()) return el.textContent.trim(); } return ''; };
  // A channel's name as one line (YouTube writes it twice in the element, with line breaks between: seen live 2026-11-19).
  const oneLine = (t) => String(t || '').split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean)[0] || '';
  let capText = '', capFor = '';
  function watchCheck() {
    if (!/^\/(watch|shorts)/.test(location.pathname)) { state.watch = null; return; }
    const id = location.pathname + location.search;
    if (capFor !== id) { capFor = id; capText = ''; transcriptFor(id); }
    if (C.captions.on) for (const seg of document.querySelectorAll(C.captions.selector)) { const t = seg.textContent.trim(); if (t && !capText.endsWith(t)) capText = (capText + ' ' + t).slice(-C.captions.keepChars); }
    const title = firstText(C.watch.title), channel = oneLine(firstText(C.watch.channel)), desc = firstText(C.watch.description).slice(0, 1500);
    const why = sexualText(title + ' \n ' + desc, T) || sexualText(capText, T) || sexualText(state.transcript && state.transcript.id === id ? state.transcript.text : '', T);
    state.watch = { id, why, channel: channel.toLowerCase() };
    if (why && channel && C.onSexualWatch === 'mark-channel' && !state.flaggedChannels.has(channel.toLowerCase())) { state.flaggedChannels.add(channel.toLowerCase()); stat('yt-watch-flagged'); }
  }
  // The transcript, where YouTube has one: the caption track named in the page it sent (a full load only).
  async function transcriptFor(id) {
    if (!C.transcript.on) return;
    try {
      let url = null;
      for (const s of document.querySelectorAll('script')) { const m = (s.textContent || '').match(/"captionTracks":\[\{"baseUrl":"([^"]+)"/); if (m) { url = JSON.parse('"' + m[1] + '"'); break; } }
      if (!url || !/^https:\/\/www\.youtube\.com\/api\/timedtext/.test(url)) return;
      const r = await fetch(url + '&fmt=json3', { credentials: 'include' });
      const j = await r.json();
      const text = (j.events || []).flatMap((e) => (e.segs || []).map((x) => x.utf8 || '')).join(' ').replace(/\s+/g, ' ').slice(0, 20000);
      state.transcript = { id, text };
    } catch {}
  }

  let t = 0;
  new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; scan(); }, 200); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  setInterval(() => { watchCheck(); scan(); }, (C.captions.everySeconds || 2) * 1000);
  scan();
});
