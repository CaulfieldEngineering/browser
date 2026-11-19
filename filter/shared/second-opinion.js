// The second opinion (2026-11-19). Joe, in HQ chat: "perhaps we can send perpetual browsing data to a local llm on the
// minipc that reviews content as well for real-time adjustments", after the filter hid fine posts (Fender and NASA
// reels scored as explicit), and then "we can most likely catch most of what i'm looking at in the text, title,
// comments, channel, captions". So a page sends what it shows as text (title, channel or account, caption or
// description, the visible comments, hashtags, bio) and, for a picture the on-device judges scored near their lines,
// the picture itself, to the local model on the mini PC (Devices server, POST /api/filter-review; docs/second-opinion.md).
//
// The rules, the same on every device and on the mini PC (which loads this file for its tests and the nightly tuner):
//   1. The on-device judges run first and decide alone whenever they are sure. An on-device TEXT rule's removal and a
//      picture past the rescue caps (or flagged by both judges) is never overridden: the model cannot show it.
//   2. The model may REMOVE anything it is asked about: a borderline picture the device would show, or a post or tile
//      whose text is sexual or suggestive by Joe's rules (the text-first pass the word lists miss).
//   3. The model may SHOW (rescue) only a picture in the rescuable zone (flagged by one judge alone, every flagging
//      score under its cap, the other judge quiet), and only on a vision verdict of "fine" at rescueMin or more. Text
//      alone never rescues a picture.
//   4. No answer within timeoutMs (about 3 s), an error, or the flag off: the on-device decision stands.
// Everything is in the signed config's `secondOpinion` block (the laptop) or filter-config.js `secondOpinion` (the
// iPhone builds), off until tested. Nothing here can turn a judge off or move one of its lines.
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.SecondOpinion) return;

  const DEFAULTS = {
    on: false,
    sites: ['instagram.com', 'youtube.com'],
    timeoutMs: 3000,
    batch: 8, // 8 texts and a picture answer in about 2 s on the mini PC (measured 2026-11-19)
    endpoint: 'http://100.92.203.47:4500/api/filter-review',
    // Text-first: which units send their text (every YouTube tile, every Instagram post with a caption).
    text: { youtube: true, instagram: true, comments: true, maxComments: 8 },
    // A picture is sent only when its scores are near a line (below) or in the rescuable zone (above).
    band: {
      below: { explicit: 0.1, sexy: 0.1, combined: 0.1, revealing: 0.15 },
      above: { explicit: 0.4, sexy: 0.25, combined: 0.2, revealing: 0.15 },
      quiet: { explicit: 0.2, sexy: 0.2, revealing: 0.3 },
    },
    removeMin: 0.6,
    rescueMin: 0.85,
    // Whether a vision "fine" may show a rescuable picture at all. Off here (the floor); the configs turn it on for a
    // model that keeps every known-bad picture removed with it on (devices repo, the tuner's test). Measured 2026-11-19:
    // Qwen3-VL-2B missed a third of the known-bad pictures (rescue would have shown two); Qwen3-VL-4B kept all 53.
    rescue: false,
    holdNear: true,
    // A small share of the pictures the device is sure of are sent too, for the nightly tuner's numbers only: their
    // verdict is logged and never applied (decide() keeps a sure removal whatever the model says).
    audit: 0.05,
  };
  // Hard limits no config can pass (the tuner and the panel included): a rescue cap never above these.
  const CEILING = { explicit: 0.8, sexy: 0.8, combined: 0.9, revealing: 0.85 };
  const FLOORS = { removeMin: 0.5, rescueMin: 0.8 };

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  function merge(a, b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
    const out = Array.isArray(a) ? a.slice() : { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k], v) : v;
    return out;
  }
  /** The settings in force: the defaults, then filter-config.js (iPhone), then the signed config (laptop). */
  function settings(extra) {
    let s = merge(DEFAULTS, (g.IGFilterConfig && g.IGFilterConfig.secondOpinion) || {});
    try { const c = g.FilterGate && g.FilterGate.config && g.FilterGate.config(); if (c && c.secondOpinion) s = merge(s, c.secondOpinion); } catch {}
    if (extra) s = merge(s, extra);
    return s;
  }
  /** The lines the on-device judges use (rules.js and filter-config.js), never changed here. */
  function lines() {
    const C = g.IGFilterConfig || {}, R = g.IGFilterRules || {};
    const sug = R.thresholds || C.suggestive || { explicit: 0.3, sexy: 0.45, combined: 0.6 };
    return { explicit: num(sug.explicit, 0.3), sexy: num(sug.sexy, 0.45), combined: num(sug.combined, 0.6), revealing: num(typeof R.revealing === 'number' ? R.revealing : C.revealing, 0.6) };
  }
  const metrics = (s) => {
    const ex = num(s.Porn, 0) + num(s.Hentai, 0), sx = num(s.Sexy, 0);
    return { explicit: ex, sexy: sx, combined: ex + sx, revealing: num(s.Revealing, 0) };
  };

  /** Where a picture's scores sit: 'confident' (the device removes and no one may show it), 'rescuable' (the device
   *  removes; a vision "fine" may show it), 'near' (the device shows; the model may remove it), 'clear' (the device
   *  shows; only a text verdict may remove the post), or 'none' (no scores). */
  function zone(scores, opts) {
    if (!scores || typeof scores !== 'object' || scores._error) return 'none';
    const S = opts && opts.settings ? opts.settings : settings(), L = (opts && opts.lines) || lines(), m = metrics(scores);
    const flags = Object.keys(L).filter((k) => m[k] >= L[k]);
    if (flags.length) {
      const nsfw = flags.some((k) => k !== 'revealing'), clip = flags.includes('revealing');
      if (nsfw && clip) return 'confident'; // both judges
      const q = S.band.quiet || {};
      if (nsfw && m.revealing >= num(q.revealing, 0.3)) return 'confident';
      if (clip && (m.explicit >= num(q.explicit, 0.2) || m.sexy >= num(q.sexy, 0.2))) return 'confident';
      for (const k of flags) if (m[k] >= Math.min(L[k] + num(S.band.above[k], 0), CEILING[k])) return 'confident';
      return 'rescuable';
    }
    for (const k of Object.keys(L)) if (m[k] >= L[k] - num(S.band.below[k], 0)) return 'near';
    return 'clear';
  }

  /** The final call for one unit. onDevice: 'remove' or 'show' (what the device decided); textRule: true when an
   *  on-device text rule removed it; scores: its picture's scores or null; verdict: the model's answer or null. */
  function decide({ onDevice, textRule = false, scores = null, verdict = null }, opts) {
    const S = opts && opts.settings ? opts.settings : settings();
    const z = zone(scores, { settings: S, lines: opts && opts.lines });
    const device = onDevice === 'remove' || textRule || z === 'confident' || z === 'rescuable' ? 'remove' : 'show';
    if (textRule || z === 'confident') return { final: 'remove', why: textRule ? 'device text rule' : 'device sure', zone: z };
    if (!verdict || !['remove', 'fine'].includes(verdict.verdict)) return { final: device, why: verdict ? 'model unsure' : 'no answer', zone: z };
    const conf = num(verdict.confidence, 0);
    if (verdict.verdict === 'remove' && conf >= Math.max(num(S.removeMin, 0.6), FLOORS.removeMin)) return { final: 'remove', why: 'model: remove', zone: z };
    if (verdict.verdict === 'fine' && z === 'rescuable' && S.rescue === true && verdict.by === 'vision' && conf >= Math.max(num(S.rescueMin, 0.85), FLOORS.rescueMin)) return { final: 'show', why: 'model: fine (picture)', zone: z };
    return { final: device, why: 'device stands', zone: z };
  }

  /** Whether a unit is worth asking about. kind: 'text' (a post or tile's text) or 'picture' (with scores). */
  function worth(unit, S) {
    S = S || settings();
    const z = zone(unit.scores, { settings: S });
    const hasText = unit.text && Object.values(unit.text).some((v) => (Array.isArray(v) ? v.length : String(v || '').trim()));
    const audit = z === 'confident' && Math.random() < Math.min(num(S.audit, 0), 0.2);
    return { ask: z === 'rescuable' || z === 'near' || audit || (hasText && z !== 'confident'), image: z === 'rescuable' || z === 'near' || audit, zone: z };
  }

  /** Whether the second opinion runs on this page (on, and the site in its list). */
  function on(href) {
    const S = settings();
    if (!S.on) return false;
    let h = '';
    try { h = new URL(href || (g.location && g.location.href) || '', 'https://x.invalid').hostname.toLowerCase(); } catch {}
    return (S.sites || []).some((s) => s === '*' || h === s || h.endsWith('.' + s));
  }

  const trim = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : undefined);
  /** One unit as sent: known fields only, short. */
  function shape(u, S) {
    const t = u.text || {};
    const text = {
      title: trim(t.title, 300), channel: trim(t.channel, 120), account: trim(t.account, 120), caption: trim(t.caption, 1200),
      description: trim(t.description, 800), bio: trim(t.bio, 300),
      hashtags: Array.isArray(t.hashtags) ? t.hashtags.slice(0, 30).map((x) => trim(String(x), 60)).filter(Boolean) : undefined,
      comments: S.text.comments && Array.isArray(t.comments) ? t.comments.slice(0, num(S.text.maxComments, 8)).map((x) => trim(String(x), 300)).filter(Boolean) : undefined,
    };
    for (const k of Object.keys(text)) if (text[k] === undefined || (Array.isArray(text[k]) && !text[k].length)) delete text[k];
    return { id: String(u.id).slice(0, 80), site: trim(u.site, 80), surface: trim(u.surface, 30), url: trim(u.url, 400), onDevice: u.onDevice === 'remove' ? 'remove' : 'show', scores: u.scores || undefined, image: typeof u.image === 'string' && u.image.startsWith('data:image/') ? u.image : undefined, imageUrl: trim(u.imageUrl, 1000), text };
  }

  /** Ask the mini PC about some units. Resolves to { [id]: verdict } or null (off, no transport, timeout, error):
   *  the caller then keeps its own decision. The transport is the device's bridge (IGFilterBridge.secondOpinion: the
   *  extension's service worker, or the iPhone app), never the page's own network. */
  async function ask(units, opts) {
    const S = settings(opts && opts.settings);
    const B = g.IGFilterBridge;
    if (!S.on || !B || typeof B.secondOpinion !== 'function' || !Array.isArray(units) || !units.length) return null;
    const list = units.slice(0, num(S.batch, 8)).map((u) => {
      const w = worth(u, S);
      const x = shape(u, S);
      if (!w.image) { delete x.image; delete x.imageUrl; }
      return x;
    });
    const timeout = Math.min(num(S.timeoutMs, 3000), 5000);
    let timer;
    try {
      const r = await Promise.race([B.secondOpinion({ items: list, timeoutMs: timeout }), new Promise((res) => { timer = setTimeout(() => res(null), timeout); })]);
      if (!r || !Array.isArray(r.verdicts)) return null;
      const out = {};
      for (const v of r.verdicts) if (v && typeof v.id === 'string') out[v.id] = v;
      return out;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  g.SecondOpinion = { version: 1, DEFAULTS, CEILING, FLOORS, settings, lines, zone, decide, worth, on, shape, ask };
})();
