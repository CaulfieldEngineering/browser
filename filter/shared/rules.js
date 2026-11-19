// The Instagram filter's rules (Joe, 2026-11-05; locked memory entry 21). One file, shared by the iPhone Browser, the
// Instagram app built from it, and the laptop extension, so every place judges a post the same way.
//
// Today there is one rule set: suggestive posts and Reels are removed outright (never blurred, nothing to tap to see
// them), judged on the device from the caption and hashtags and an on-device image classifier. Nothing is sent off
// the device. Joe, 2026-11-05: "Let's just try the suggestive content for now and we can build on it". So rules are a
// list: a new one (ads, suggested posts, hours) is one more entry, and ig-filter.js does not change.
//
// A rule: { id, kind, test }.
//   kind 'text'  : test(text, unit) -> true to remove. text = the post's visible text (caption, hashtags, alt text).
//   kind 'image' : test(scores) -> true to remove. scores = the classifier's {Drawing, Hentai, Neutral, Porn, Sexy}, 0..1.
//   kind 'unit'  : test(unit, ctx) -> true to remove. For rules that read the post's structure. ctx: {path, site, work}.
// No rule can show a post another removed; a removed post stays removed until the page reloads.
// Started by the filter config gate where there is one (the laptop: FilterGate runs it once the signed config is read),
// at once everywhere else. FilterFeature(name) says whether a feature is on for this page; with no gate, always.
(function (run) { const G = globalThis.FilterGate; if (G && G.when) G.when(run); else run(); })(function () {
  const F = (name, href) => { const f = globalThis.FilterFeature; return typeof f !== "function" || f(name, href); };
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.IGFilterRules) return;

  // Words and tags that mark a post as suggestive. Whole words, any case; # optional. Kept to the clearly sexual and
  // the "thirst" vocabulary, so fitness, fashion and business posts mostly pass on text and are judged by the image.
  // Words with an everyday meaning in Joe's own trades (wire strippers, "sheer volume") are left to the image rule.
  const WORDS = [
    'nsfw', 'nude', 'nudes', 'naked', 'topless', 'braless', 'nipple', 'nipples', 'lingerie', 'boudoir', 'thong', 'thongs',
    'bikini', 'bikinis', 'bikinimodel', 'microbikini', 'swimsuitmodel', 'lingeriemodel', 'onlyfans', 'fansly', 'onlyfansgirl',
    'sexy', 'sexygirl', 'sexygirls', 'hotgirl', 'hotgirls', 'thirsttrap', 'thirsttraps', 'booty', 'bootyshake', 'twerk',
    'twerking', 'cleavage', 'curvygirl', 'thicc', 'baddie', 'baddies', 'seductive', 'sensual', 'erotic', 'erotica',
    'spicycontent', 'spicy18', 'adultcontent', 'xxx', 'porn', 'pornstar', 'camgirl', 'feet pics',
    'feetpics', 'bodysuit', 'catsuit', 'seethrough', 'underboob', 'sideboob', 'upskirt', 'wetshirt', 'pawg',
  ];
  const PHRASES = [
    /link in (my )?bio.{0,40}(18\+|🔞|spicy|exclusive|uncensored|private)/i,
    /(18\+|🔞)/,
    /\b(of|0f) link\b/i,
    /\buncensored\b/i,
    /\bfull (video|vid) (on|in) (my )?(of|telegram|bio)\b/i,
    /🍑.{0,12}(💦|🔥|😈)|(💦|😈).{0,12}🍑/u,
  ];
  const WORD_RE = new RegExp('(^|[^\\p{L}\\p{N}_])#?(' + WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s?')).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu');

  // The classifier's line. Porn and Hentai are explicit; Sexy is "suggestive" (swimwear, lingerie, posing). Strict on
  // purpose: a false removal costs a post he did not need; a miss is what this is for.
  // The lines come from filter-config.js (also shown on the Devices dashboard); without it, the same values here.
  const CFG = g.IGFilterConfig || {};
  const IMAGE = CFG.suggestive || { explicit: 0.3, sexy: 0.45, combined: 0.6 };

  // Revealing clothing (Joe, 2026-11-05: "Can we try upping the filtering on instagram? Like, shorter tank-tops, bikinis,
  // gymwear etc."). Its own category beside the suggestive one, gender-neutral (no gender model; agreed to skip it for
  // now). The image side is the zero-shot judge (clip.js): scores.Revealing, the share of the revealing prompts; a
  // picture is hidden from 0.6 (on a check of public-domain photos, revealing ones scored 0.86 to 0.99 and everyday
  // ones, people at the gym in loose clothes included, 0.27 or less). The text side: these words and tags. Ordinary gear
  // and clothing words (shorts, t-shirt, gym, workout) are not on it.
  const REVEALING = typeof CFG.revealing === 'number' ? CFG.revealing : 0.6;
  const REVEALING_WORDS = [
    'swimwear', 'swimsuit', 'swimsuits', 'bathingsuit', 'bikinibody', 'bikiniseason', 'gymwear', 'gymgirl', 'gymgirls',
    'fitgirl', 'fitgirls', 'fitnessgirl', 'fitnessgirls', 'fitnessmodel', 'fitness model', 'fitspo', 'sportsbra',
    'sports bra', 'croptop', 'crop top', 'yogapants', 'yoga pants', 'gymoutfit', 'gym outfit', 'bodygoals', 'beachbody',
  ];
  const REVEALING_RE = new RegExp('(^|[^\p{L}\p{N}_])#?(' + REVEALING_WORDS.map((w) => w.replace(/ /g, '\s?')).join('|') + ')(?=$|[^\p{L}\p{N}_])', 'iu');

  // Accounts by name or bio, and the same terms in captions (Joe, 2026-11-05: "let's also do like a textual search. In
  // like profile names or bios", "And captions"). The terms are filter-config.js's "accounts" (by kind; the dashboard
  // shows the kinds, never the words). Captions use every kind but "names and bios only" (so "spicy ramen" passes);
  // names and bios use them all, plus the suggestive words and the revealing-clothing tags. A username's dots and
  // underscores count as spaces ("spicy.amy" is "spicy amy").
  const ACC = CFG.accounts || { kinds: {}, patterns: {} };
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s._-]?');
  const termRe = (list) => (list.length ? new RegExp('(^|[^\\p{L}\\p{N}])(' + list.map(esc).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu') : null);
  const KINDS = Object.entries(ACC.kinds || {}).map(([kind, words]) => ({ kind, re: termRe(words), captions: kind !== 'names and bios only' }));
  // A pattern this engine cannot read (the laptop's config may use a newer syntax than a phone has) is dropped, never thrown.
  const PATTERNS = Object.entries(ACC.patterns || {}).map(([kind, src]) => { try { return { kind, re: new RegExp(src, /^OF\b/.test(kind) ? 'u' : 'iu') }; } catch { return null; } }).filter(Boolean);
  // Words Joe named, on every site and wherever words are read: a post, a caption, an account's name and bio
  // (2026-11-19: "let's completely block the word latex, perhaps ignoring anything as LaTeX"; "anything "goddess" "joi"
  // "femdom" "domme" "mistress""). latex as a word or inside one (#latexmodel), any case, except the exact spelling
  // LaTeX; goddess, femdom, domme, mistress anywhere in a word; joi only as a whole word (Joie, Joint and enjoin stay).
  // In code, not a pattern, because the one exception is by case.
  const NAMED_RE = /goddess|femdom|domme|mistress/iu, JOI_RE = /(^|[^\p{L}\p{N}])#?joi(?=$|[^\p{L}\p{N}])/iu;
  function namedWord(text) {
    const t = String(text || '');
    if (NAMED_RE.test(t) || JOI_RE.test(t)) return true;
    const m = t.match(/latex/giu);
    return !!m && m.some((x) => x !== 'LaTeX');
  }
  const forName = (t) => String(t || '').replace(/[._]+/g, ' ');
  function accountKind(text, captionsOnly) {
    const t = String(text || '');
    if (namedWord(t)) return 'words he named';
    for (const k of KINDS) if (k.re && (!captionsOnly || k.captions) && k.re.test(t)) return k.kind;
    for (const p of PATTERNS) if (p.re.test(t)) return p.kind;
    return null;
  }

  // Facebook marks an ad with the word "Sponsored", often spelled out in pieces, in an SVG, or only as an aria-label,
  // and with links to its ad pages. Any of these makes a post an ad.
  // The opening words of a post, its text pieces joined by spaces (Facebook's spans run together in innerText).
  function headText(unit) {
    if (!unit || !unit.ownerDocument) return '';
    const parts = [], walk = unit.ownerDocument.createTreeWalker(unit, 4 /* text */);
    let n, len = 0;
    while ((n = walk.nextNode()) && len < 400) { const t = n.data.trim(); if (t) { parts.push(t); len += t.length + 1; } }
    return parts.join(' ');
  }
  const SUGGESTED = /\b(suggested for you|suggested groups|suggested pages|suggested posts|suggested reels|people you may know|reels and short videos|follow more pages|groups you might like)\b/i;
  function sponsored(unit) {
    if (!unit || !unit.querySelector) return false;
    // "Sponsored" (capital S, a word of its own) among a post's first words, where Facebook puts it in place of the time.
    if (/(^|[^\p{L}])Sponsored($|[^\p{L}])/u.test(headText(unit).slice(0, 160))) return true;
    if (unit.querySelector('[aria-label="Sponsored" i], a[href*="/ads/about"], a[href*="ad_preferences"], a[href*="/ads/preferences"]')) return true;
    for (const t of unit.querySelectorAll('svg text, svg title')) if (/^\s*Sponsored\s*$/i.test(t.textContent || '')) return true;
    for (const el of unit.querySelectorAll('[aria-labelledby]')) {
      for (const id of el.getAttribute('aria-labelledby').split(/\s+/)) { const l = id && unit.ownerDocument.getElementById(id); if (l && /^\s*Sponsored\s*$/i.test(l.textContent || '')) return true; }
    }
    return false;
  }

  // Facebook, by the author's name (2026-11-13, the Instagram account rule of 2026-11-05 brought to Facebook: "let's
  // also do like a textual search. In like profile names or bios"): the name a post is headed with (its first heading
  // link), judged like an Instagram account's name. Only the name: the post's own words are the text rules' job.
  function authorOf(unit) {
    if (!unit || !unit.querySelector) return '';
    const a = unit.querySelector('h2 a, h3 a, h4 a, h2 strong, h3 strong, h4 strong, strong a');
    return a ? (a.textContent || '').trim().slice(0, 80) : '';
  }
  const accountOf = (text) => {
    const t = forName(text);
    return accountKind(t, false) || (WORD_RE.test(t) ? 'suggestive words' : null) || (REVEALING_RE.test(t) ? 'revealing-clothing tags' : null);
  };

  // ---- work surfaces (Joe, 2026-11-16: "Yeah we need to make sure that our filters do not interfere with work") ----
  // filter-config.js "work": the addresses of his work tools, checked first by every part of the filter on every
  // device. On one, only a picture or video judged suggestive is taken off, and only that element; the ad, suggestion,
  // rail, feed and page rules and the redirects stay out. A post by one of his own Pages is never an ad or a suggestion.
  // Scopes are plain data: a host suffix, a host suffix with a path prefix, or "*" with a path. The personal feeds can
  // never be a scope (PERSONAL below), whatever a file says, so this list can never turn the feed filtering off.
  const WORK_CFG = CFG.work || {};
  const PERSONAL = /^((www|m|mobile|web|touch|mbasic|l|lm)\.)?(facebook|instagram|messenger)\.com$/;
  const FEEDISH = /^\/(reels?|watch|explore|stories|home|index|search|direct|messages|marketplace|friends|groups|notifications|videos?|share|feeds?|p|tv|gaming|live|\?|$)(\/|\.|$)/;
  function workScope(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toLowerCase();
    if (!s || s.length > 120 || /\s/.test(s)) return null;
    const cut = s.indexOf('/'), host = cut < 0 ? s : s.slice(0, cut), path = cut < 0 ? '' : s.replace(/\/+$/, '').slice(cut);
    if (!(host === '*' || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host))) return null;
    if (/^(reels?|stories)\./.test(host)) return null;
    if ((host === '*' || PERSONAL.test(host)) && (path.length < 3 || FEEDISH.test(path))) return null; // never a feed
    return { host, path };
  }
  const workScopes = [];
  const addWork = (list) => { for (const raw of Array.isArray(list) ? list.slice(0, 200) : []) { const w = workScope(raw); if (w && !workScopes.some((x) => x.host === w.host && x.path === w.path)) workScopes.push(w); } };
  addWork(WORK_CFG.surfaces);
  const OWN_PAGES = (Array.isArray(WORK_CFG.pages) ? WORK_CFG.pages : []).filter((p) => typeof p === 'string' && p.trim().length >= 3).map((p) => p.trim().toLowerCase());
  function onWork(href) {
    let u;
    try { u = new URL(href, g.location ? g.location.href : undefined); } catch { return false; }
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase(), path = (u.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
    return workScopes.some((w) => (w.host === '*' || host === w.host || host.endsWith('.' + w.host))
      && (!w.path || path === w.path || path.startsWith(w.path + '/')));
  }
  /** A post headed by one of his own Pages (his ad, his posts). Never taken as an ad or a suggestion. */
  const ownPost = (unit) => { if (!OWN_PAGES.length) return false; const a = authorOf(unit).toLowerCase(); return !!a && OWN_PAGES.includes(a); };

  const rules = [
    { id: 'suggestive-text', kind: 'text', test: (text) => WORD_RE.test(text) || PHRASES.some((r) => r.test(text)) },
    { id: 'revealing-text', kind: 'text', test: (text) => REVEALING_RE.test(text) },
    { id: 'account-terms-text', kind: 'text', test: (text) => !!accountKind(text, true) },
    {
      id: 'suggestive-image', kind: 'image',
      test: (s) => !!s && ((s.Porn || 0) + (s.Hentai || 0) >= IMAGE.explicit || (s.Sexy || 0) >= IMAGE.sexy ||
        (s.Porn || 0) + (s.Hentai || 0) + (s.Sexy || 0) >= IMAGE.combined),
    },
    { id: 'revealing-image', kind: 'image', test: (s) => !!s && (s.Revealing || 0) >= REVEALING },
    // Facebook (the Facebook app and facebook.com; Joe, 2026-11-05: "let's start by hiding the default feed, any ads
    // etc."): every sponsored post, Reel, listing or right-rail ad, and the "suggested" injections, wherever they appear.
    { id: 'fb-sponsored', kind: 'unit', test: (unit, ctx) => ctx.site === 'facebook' && !ctx.work && !ownPost(unit) && sponsored(unit) },
    { id: 'fb-suggested', kind: 'unit', test: (unit, ctx) => ctx.site === 'facebook' && !ctx.work && !ownPost(unit) && SUGGESTED.test(headText(unit)) },
    { id: 'fb-account-name', kind: 'unit', test: (unit, ctx) => ctx.site === 'facebook' && !!accountOf(authorOf(unit)) },
  ];

  // Each rule answers to a feature of the filter config (2026-11-17; Joe: "any change to the filter is just a change to
  // the back-end"). Where there is a config gate (the laptop), a rule runs only where its feature is on for the page;
  // elsewhere every rule runs, as before. Text rules can also come as data (the config's textRules: words and patterns,
  // per site), so a new hand-curated rule needs no new build.
  const FEATURE = {
    'suggestive-image': 'pictures', 'revealing-image': 'revealing',
    'suggestive-text': 'captions', 'revealing-text': 'captions', 'account-terms-text': 'captions',
    'fb-sponsored': 'fb.ads', 'fb-suggested': 'fb.suggested', 'fb-account-name': 'fb.authorNames',
  };
  const ruleOn = (r) => F(r.feature || FEATURE[r.id] || r.id);
  /** Text rules from data: [{ id, words: [...], patterns: [...], feature }]. Whole words, any case; a pattern is a
   *  regular expression's source (data, not code), tried case-blind. A bad pattern is dropped, never thrown. */
  function addTextRules(list) {
    for (const d of Array.isArray(list) ? list.slice(0, 100) : []) {
      if (!d || typeof d.id !== 'string' || rules.some((r) => r.id === d.id)) continue;
      const words = (Array.isArray(d.words) ? d.words : []).filter((w) => typeof w === 'string' && w.trim()).slice(0, 500);
      const pats = [];
      for (const p of Array.isArray(d.patterns) ? d.patterns.slice(0, 100) : []) { try { pats.push(new RegExp(p, 'iu')); } catch {} }
      const re = words.length ? termRe(words) : null;
      if (!re && !pats.length) continue;
      rules.push({ id: d.id, kind: 'text', feature: typeof d.feature === 'string' ? d.feature : 'textRules', test: (text) => !!(re && re.test(text)) || pats.some((x) => x.test(text)) });
    }
  }

  g.IGFilterRules = {
    version: 1,
    rules,
    addTextRules,
    /** The id of the first rule of `kind` that removes, or null. Only rules whose feature is on for this page. */
    first(kind, ...args) {
      for (const r of rules) if (r.kind === kind && ruleOn(r)) { try { if (r.test(...args)) return r.id; } catch (e) { /* a broken rule removes nothing */ } }
      return null;
    },
    /** The built-in rules of `kind`, whatever their feature (the laptop's open-web alt-text check has a feature of its own). */
    firstAny(kind, ...args) {
      for (const r of rules) if (r.kind === kind && !r.feature) { try { if (r.test(...args)) return r.id; } catch (e) {} }
      return null;
    },
    thresholds: IMAGE,
    revealing: REVEALING,
    facebook: { sponsored: (unit) => !ownPost(unit) && sponsored(unit), suggested: (unit) => !ownPost(unit) && SUGGESTED.test(headText(unit)) },
    /** Work surfaces (filter-config.js "work"): on(href) is true on one; add(list) takes more scopes (the laptop's
     *  signed rules data), each checked by the same guard, so no list can name a personal feed. */
    work: { on: onWork, add: addWork, ownPost, scope: workScope, scopes: () => workScopes.map((w) => w.host + w.path) },
    /** The kind of term an account's name or bio carries, or null: every kind, the suggestive words, the revealing tags. */
    account(text) { return accountOf(text); },
    accountKinds: () => ['words he named'].concat(KINDS.map((k) => k.kind), PATTERNS.map((p) => p.kind)),
    namedWord,
    /** Which part of the image line a score crossed ('explicit', 'sexy', 'combined') or null. For the counts on the
     *  device (why a post was hidden); it decides nothing and changes no line. */
    explain(s) {
      if (!s) return null;
      const ex = (s.Porn || 0) + (s.Hentai || 0);
      if (!F('pictures')) return (s.Revealing || 0) >= REVEALING && F('revealing') ? 'revealing' : null;
      if (ex >= IMAGE.explicit) return 'explicit';
      if ((s.Sexy || 0) >= IMAGE.sexy) return 'sexy';
      if (ex + (s.Sexy || 0) >= IMAGE.combined) return 'combined';
      if ((s.Revealing || 0) >= REVEALING && F('revealing')) return 'revealing';
      return null;
    },
  };
});
