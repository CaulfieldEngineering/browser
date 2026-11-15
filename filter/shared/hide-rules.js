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
  /** The bundled rules with the fetched ones added. Only unions: nothing in the floor can be taken out. */
  function merge(floor, extra) {
    const out = { version: floor.version, extraVersion: (extra && extra.version) || 0, sites: {} };
    const add = (rules) => {
      for (const [host, lists] of Object.entries((rules && rules.sites) || {})) {
        const d = (out.sites[host] = out.sites[host] || {});
        for (const k of LISTS) if (lists[k]) d[k] = [...new Set([...(d[k] || []), ...lists[k]])];
      }
    };
    add(floor); add(clean(extra));
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

  globalThis.FilterHideRules = { bundled, clean, merge, forHost, LISTS };
})();
