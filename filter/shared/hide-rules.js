// Hide rules as data (2026-11-15). The filter's "take this off the page" rules, as lists rather than code, so a new one
// reaches the laptop without a Chrome Web Store review: the extension fetches a signed rules file (filter/rules/ in this
// repo, signed by a key kept off this repo) and hide-engine.js applies it. What is here is the floor and is bundled:
// a fetched file can only ADD to these lists. There is no field that removes or turns off anything, here or in the
// built-in filter (rules.js, ig-filter.js, ig-tidy.js, fb-tidy.js), so a rules file can tighten and never loosen.
// Data only (strings: exact headings, short phrases, CSS selectors, path prefixes); no code, no regular expressions.
//
// The shape, per scope. A scope is where its lists apply: a host suffix ("instagram.com"), a host suffix with a path
// prefix ("facebook.com/groups", "instagram.com/explore"), or "*" for every site the filter runs on. Scope is a plain
// parameter of the data, edited like any list; no site or tool is special-cased in code.
//   headings:   exact words of a heading (any case); the panel it heads goes (the smallest box that starts with the
//               heading and holds two or more links or buttons; else only the words)
//   buttons:    a button or link whose text or aria-label is exactly this goes
//   phrases:    an element whose own text contains this (4+ characters, any case) goes, with its list item or post
//   selectors:  CSS selectors; what they match goes
//   blockPaths: a path starting with this ("/explore/people") goes to the site's home instead (never "/" itself)
// Nothing that would take the page's main area, its navigation, a search field, a dialog or nearly the whole screen is
// ever hidden (hide-engine.js), so a bad rule can take a corner at most.
(function () {
  'use strict';
  const LIMITS = { sites: 60, perList: 200, text: 120, selector: 300 };
  const LISTS = ['headings', 'buttons', 'phrases', 'selectors', 'blockPaths'];
  const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const okSelector = (s) => { if (typeof document === 'undefined' || !document.createDocumentFragment) return true; try { document.createDocumentFragment().querySelector(s); return true; } catch { return false; } };
  const ok = {
    headings: (s) => str(s, LIMITS.text),
    buttons: (s) => str(s, LIMITS.text),
    phrases: (s) => str(s, LIMITS.text) && s.trim().length >= 4,
    selectors: (s) => str(s, LIMITS.selector) && !/[{}]/.test(s) && okSelector(s),
    blockPaths: (s) => str(s, LIMITS.text) && /^\/[^\s]+/.test(s) && s !== '/',
  };
  /** A rules object reduced to what is allowed: known lists of valid strings, within limits. Anything else is dropped. */
  function clean(raw) {
    const out = { version: 0, sites: {} };
    if (!raw || typeof raw !== 'object') return out;
    if (Number.isFinite(raw.version)) out.version = Math.floor(raw.version);
    out.tuning = cleanTuning(raw.tuning);
    const sites = raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
    for (const host of Object.keys(sites).slice(0, LIMITS.sites)) {
      if (!(host === '*' || /^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s*]*)?$/i.test(host))) continue;
      const src = sites[host] || {}, dst = {};
      for (const k of LISTS) {
        if (!Array.isArray(src[k])) continue;
        const v = src[k].filter(ok[k]).slice(0, LIMITS.perList).map((s) => s.trim());
        if (v.length) dst[k] = v;
      }
      if (Object.keys(dst).length) out.sites[host.toLowerCase()] = dst;
    }
    return out;
  }
  // Tuning (2026-11-15; locked memory entry 39: Claude tunes the filter's parameters while it is developed, each change
  // logged with Joe's words). Unlike the lists above these are numbers a file may move either way, but only inside
  // these bounds, so no file can turn a check off: frames are always sampled, a threshold never goes above 0.95, at
  // most 6 frames in a row are asked for. Per scope (as for the lists) a file may set the same fields for some sites.
  const TUNE = {
    // video frames (the laptop's web filter; Instagram and Facebook use their own module)
    videoEverySeconds: [1, 30], videoLongEverySeconds: [2, 60], videoLongAfterSeconds: [60, 7200],
    videoConsecutive: [1, 6], videoExplicit: [0.2, 0.95], videoSexy: [0.3, 0.95], videoCombined: [0.4, 0.95], videoRevealing: [0.5, 0.95],
    // a picture the judge could not answer for stays hidden and is asked again this often (never shown unjudged)
    judgeLateRetrySeconds: [30, 600],
  };
  const TUNE_DEFAULT = {
    videoEverySeconds: 3, videoLongEverySeconds: 8, videoLongAfterSeconds: 600,
    videoConsecutive: 3, videoExplicit: 0.5, videoSexy: 0.75, videoCombined: 0.85, videoRevealing: 0.85,
    judgeLateRetrySeconds: 120,
  };
  function cleanTune(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, [lo, hi]] of Object.entries(TUNE)) if (Number.isFinite(raw[k])) out[k] = Math.min(hi, Math.max(lo, raw[k]));
    return out;
  }
  function cleanTuning(raw) {
    const out = { all: cleanTune(raw && raw.all), sites: {} };
    const sites = raw && raw.sites && typeof raw.sites === 'object' ? raw.sites : {};
    for (const scope of Object.keys(sites).slice(0, LIMITS.sites)) {
      if (!/^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s*]*)?$/i.test(scope)) continue;
      const t = cleanTune(sites[scope]);
      if (Object.keys(t).length) out.sites[scope.toLowerCase()] = t;
    }
    return out;
  }
  /** The tuning on a page: the defaults, then the file's own for every site, then its scopes that cover this page. */
  function tuningFor(tuning, host, path) {
    const t = { ...TUNE_DEFAULT, ...((tuning && tuning.all) || {}) };
    for (const [scope, v] of Object.entries((tuning && tuning.sites) || {})) {
      const cut = scope.indexOf('/'), h = cut < 0 ? scope : scope.slice(0, cut), p = cut < 0 ? '' : scope.slice(cut);
      if ((host === h || host.endsWith('.' + h)) && (!p || (path || '/').toLowerCase().startsWith(p.toLowerCase()))) Object.assign(t, v);
    }
    return t;
  }

  /** The bundled rules with the fetched ones added. Only unions: nothing in the floor can be taken out. */
  function merge(floor, extra) {
    const ex = clean(extra);
    const out = { version: floor.version, extraVersion: (extra && extra.version) || 0, sites: {}, tuning: ex.tuning && (Object.keys(ex.tuning.all).length || Object.keys(ex.tuning.sites).length) ? ex.tuning : floor.tuning };
    const add = (rules) => {
      for (const [host, lists] of Object.entries((rules && rules.sites) || {})) {
        const d = (out.sites[host] = out.sites[host] || {});
        for (const k of LISTS) if (lists[k]) d[k] = [...new Set([...(d[k] || []), ...lists[k]])];
      }
    };
    add(floor); add(ex);
    return out;
  }
  /** The lists that apply on a page: "*", its host and parent domains, and any of those with a path prefix it is under. */
  function forHost(rules, host, path) {
    const d = {};
    path = path || '/';
    for (const [scope, lists] of Object.entries(rules.sites || {})) {
      const cut = scope.indexOf('/'), h = cut < 0 ? scope : scope.slice(0, cut), p = cut < 0 ? '' : scope.slice(cut);
      if (!(h === '*' || host === h || host.endsWith('.' + h))) continue;
      if (p && !path.toLowerCase().startsWith(p.toLowerCase())) continue;
      for (const k of LISTS) if (lists[k]) d[k] = [...(d[k] || []), ...lists[k]];
    }
    return d;
  }

  const bundled = clean({
    version: 1,
    sites: {
      // Joe, 2026-11-15, of Instagram's desktop suggestions: "Can we remove this sidebar from instagram". ig-tidy.js
      // does the same in code; this is the same rule as data, so it holds even if that code changes.
      'instagram.com': {
        headings: ['Suggested for you', 'Suggestions for you', 'Suggested accounts', 'Similar accounts', 'Discover people', 'People you may know'],
        buttons: ['Similar accounts', 'Discover people'],
        selectors: ['a[href^="/explore/people"]'],
        blockPaths: ['/explore/people'],
      },
    },
  });

  globalThis.FilterHideRules = { bundled, clean, merge, forHost, LISTS, tuningFor, TUNE, TUNE_DEFAULT };
})();
