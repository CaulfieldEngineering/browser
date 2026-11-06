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
//   kind 'unit'  : test(unit, ctx) -> true to remove. For rules that read the post's structure (none yet).
// No rule can show a post another removed; a removed post stays removed until the page reloads.
(function () {
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
  const PATTERNS = Object.entries(ACC.patterns || {}).map(([kind, src]) => ({ kind, re: new RegExp(src, /^OF\b/.test(kind) ? 'u' : 'iu') }));
  const forName = (t) => String(t || '').replace(/[._]+/g, ' ');
  function accountKind(text, captionsOnly) {
    const t = String(text || '');
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

  const rules = [
    { id: 'suggestive-text', kind: 'text', test: (text) => WORD_RE.test(text) || PHRASES.some((r) => r.test(text)) },
    { id: 'revealing-text', kind: 'text', test: (text) => REVEALING_RE.test(text) },
    { id: 'account-terms-text', kind: 'text', test: (text) => CFG.accountRules === true && !!accountKind(text, true) },
    {
      id: 'suggestive-image', kind: 'image',
      test: (s) => !!s && ((s.Porn || 0) + (s.Hentai || 0) >= IMAGE.explicit || (s.Sexy || 0) >= IMAGE.sexy ||
        (s.Porn || 0) + (s.Hentai || 0) + (s.Sexy || 0) >= IMAGE.combined),
    },
    { id: 'revealing-image', kind: 'image', test: (s) => !!s && (s.Revealing || 0) >= REVEALING },
    // Facebook (the Facebook app and facebook.com; Joe, 2026-11-05: "let's start by hiding the default feed, any ads
    // etc."): every sponsored post, Reel, listing or right-rail ad, and the "suggested" injections, wherever they appear.
    { id: 'fb-sponsored', kind: 'unit', test: (unit, ctx) => ctx.site === 'facebook' && sponsored(unit) },
    { id: 'fb-suggested', kind: 'unit', test: (unit, ctx) => ctx.site === 'facebook' && SUGGESTED.test(headText(unit)) },
  ];

  g.IGFilterRules = {
    version: 1,
    rules,
    /** The id of the first rule of `kind` that removes, or null. */
    first(kind, ...args) {
      for (const r of rules) if (r.kind === kind) { try { if (r.test(...args)) return r.id; } catch (e) { /* a broken rule removes nothing */ } }
      return null;
    },
    thresholds: IMAGE,
    revealing: REVEALING,
    facebook: { sponsored, suggested: (unit) => SUGGESTED.test(headText(unit)) },
    /** The kind of term an account's name or bio carries, or null: every kind, the suggestive words, the revealing tags. */
    account(text) {
      if (CFG.accountRules !== true) return null; // switched on with its tests (filter-config.js "accountRules")
      const t = forName(text);
      return accountKind(t, false) || (WORD_RE.test(t) ? 'suggestive words' : null) || (REVEALING_RE.test(t) ? 'revealing-clothing tags' : null);
    },
    accountKinds: () => KINDS.map((k) => k.kind).concat(PATTERNS.map((p) => p.kind)),
    /** Which part of the image line a score crossed ('explicit', 'sexy', 'combined') or null. For the counts on the
     *  device (why a post was hidden); it decides nothing and changes no line. */
    explain(s) {
      if (!s) return null;
      const ex = (s.Porn || 0) + (s.Hentai || 0);
      if (ex >= IMAGE.explicit) return 'explicit';
      if ((s.Sexy || 0) >= IMAGE.sexy) return 'sexy';
      if (ex + (s.Sexy || 0) >= IMAGE.combined) return 'combined';
      if ((s.Revealing || 0) >= REVEALING) return 'revealing';
      return null;
    },
  };
})();
