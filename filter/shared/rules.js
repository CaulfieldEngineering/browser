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
  const IMAGE = { explicit: 0.3, sexy: 0.45, combined: 0.6 };

  const rules = [
    { id: 'suggestive-text', kind: 'text', test: (text) => WORD_RE.test(text) || PHRASES.some((r) => r.test(text)) },
    {
      id: 'suggestive-image', kind: 'image',
      test: (s) => !!s && ((s.Porn || 0) + (s.Hentai || 0) >= IMAGE.explicit || (s.Sexy || 0) >= IMAGE.sexy ||
        (s.Porn || 0) + (s.Hentai || 0) + (s.Sexy || 0) >= IMAGE.combined),
    },
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
  };
})();
