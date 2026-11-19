// Every behaviour of the filter that the signed filter config can switch, by name (2026-11-17; Joe: "I already asked you
// if we could set up the extension so that any change to the filter is just a change to the back-end which lives on a
// dashboard on minipc", "I wanted a blank filter in place that I could add hand-curated requests to", and "I do not want
// to push a request to google every time. that's an absolute show stopper."). Read by the laptop extension's config gate,
// by sign-config.mjs (it refuses a config that leaves a feature out), by the admin panel and by the tests.
//
// A feature in a config: { "on": true|false, "sites": ["*" | "host" | "host/path" | "*/path"], "except": [...] }.
// `sites` says where it runs (default "*"); `except` takes pages out. Numbers, word lists, selectors and redirects are
// the config's other blocks (settings, tuning, hideRules, textRules, blockSites, youtube).
//
// LOCKED: the suggestive-picture and revealing-clothing removal (locked memory entries 23 to 28 and 46). A config that
// turns either off, or narrows where it runs, is taken only with a recorded decision for it (the config's
// "decisions": { "<feature>": "<date, who decided, Joe's words>" }); without one the floor's setting stays.
(function () {
  const g = globalThis;
  if (g.FilterFeatures) return;
  const list = {
    // ---- pictures, on every site the filter runs on ----
    pictures: { what: 'Suggestive and explicit pictures removed (nsfwjs, the suggestive line)', asked: '2026-11-05: "tantalizing adult content that\'s not caught by your typical filters"', locked: true },
    revealing: { what: 'The revealing-clothing judge (TinyCLIP): bikinis, crop tops, gymwear', asked: '2026-11-05: "shorter tank-tops, bikinis, gymwear etc."', locked: true },
    'pictures.hold': { what: 'A picture is held invisible until it is judged (off: shown while it is judged, taken off if flagged)', asked: null },
    'pictures.unjudgedHidden': { what: 'A picture the judge could not answer for stays hidden (off: it is shown)', asked: null },
    'pictures.takeTile': { what: 'A flagged picture takes the link, tile or list item around it (off: the picture alone)', asked: null },
    'pictures.strictPages': { what: 'A lower line on pages whose address or title has fashion, swim or costume words', asked: null },
    'pictures.altText': { what: 'A picture whose alt text, title or link words are suggestive is removed (open web)', asked: null },
    'video.poster': { what: 'A video\'s poster (its thumbnail) is judged; a flagged one takes the video', asked: '2026-11-05: "video thumbnails" removed outright' },
    'video.holdFirstFrame': { what: 'A video is muted and held invisible until its poster and first frame are judged', asked: null },
    'video.frames': { what: 'Frames of a playing video are judged; enough flagged frames take it off the page', asked: '2026-11-05: Reels removed (Instagram)' },
    // ---- data the config carries ----
    hideRules: { what: 'The hide rules engine (the config\'s hideRules: headings, buttons, phrases, selectors, blockPaths, redirects)', asked: '2026-11-15: "modify any parameters we need to continue work"' },
    textRules: { what: 'Hand-curated text rules (the config\'s textRules: words and patterns)', asked: '2026-11-17: "a blank filter in place that I could add hand-curated requests to"' },
    blockSites: { what: 'Whole sites replaced by one calm line (the config\'s blockSites)', asked: '2026-11-05: "start adding some filtering/restrictions"' },
    work: { what: 'Work tools first: on a work surface only a flagged picture goes, by itself', asked: '2026-11-16: "make sure that our filters do not interfere with work"' },
    // ---- Instagram ----
    captions: { what: 'Captions, hashtags and alt text with suggestive or revealing-clothing words or adult-account terms take the post', asked: '2026-11-05: "And captions"' },
    'ig.accounts': { what: 'Instagram accounts whose name or bio carries adult terms: the picture goes, the line stays', asked: '2026-11-05: "In like profile names or bios"' },
    'ig.noExplore': { what: 'No Explore grid', asked: '2026-11-05: "let\'s get rid of the explore page"' },
    'ig.plainSearch': { what: 'The search page is the field and a plain list of accounts and hashtags', asked: '2026-11-05: "get rid of all of the junk and images that come along with the Instagram search page"' },
    'ig.searchTabs': { what: 'The search page\'s Top, Reels and Places tabs taken out', asked: null },
    'ig.noReelsTab': { what: 'No Reels tab in Instagram\'s bar', asked: '2026-11-05: "Also the reels button can go away"' },
    'ig.followingFeed': { what: 'Home is the Following feed', asked: '2026-11-05: "every time I open it I see the same exact post"' },
    'ig.noSuggestions': { what: 'No "Suggested for you" (desktop sidebar, See all page, carousels, Similar accounts)', asked: '2026-11-15: "Can we remove this sidebar from instagram"' },
    'ig.suggestedRows': { what: 'No suggested accounts, by the fixed code (1.6.4 and later; the iPhone): each suggested row (N mutuals, Follow) and suggestion panel goes, never the Follow and Message buttons of a profile', asked: '2026-11-18: "still waiting on you to block this element in instagram via our extension"; 2026-11-19: "did you remove the Follow button?"' },
    'ig.appPrompts': { what: 'Instagram\'s "Open the app" prompts hidden', asked: null },
    'ig.pageTop': { what: 'A newly opened page starts at its top', asked: '2026-11-05: "opening certain pages scrolls way down instead of starting at the top"' },
    'ig.calm': { what: 'The calm feed: held posts keep their place over a plain grey, one short fade', asked: '2026-11-15: "Its infuriatingly glitchy and is gonna give me epilepsy"' },
    // ---- Facebook ----
    'fb.noFeed': { what: 'No News Feed: home goes to Notifications', asked: '2026-11-05: "Let\'s start by hiding the default feed"' },
    'fb.ads': { what: 'Sponsored posts and right-rail ads removed', asked: '2026-11-05: "any ads etc."' },
    'fb.suggested': { what: 'Suggested posts, groups and pages, People you may know', asked: 'locked memory entry 27: "all ads and suggestions removed"' },
    'fb.noReels': { what: 'No Reels anywhere on Facebook', asked: '2026-11-14: "No Reels please."' },
    'fb.storiesRail': { what: 'No Stories rail', asked: null },
    'fb.videoTab': { what: 'The Video tab goes to Notifications', asked: null },
    'fb.authorNames': { what: 'A post whose author\'s name carries an adult term goes', asked: null },
    'fb.adultProfiles': { what: 'A profile, Page or group whose name or intro carries an adult term keeps only its name', asked: null },
    'fb.appPrompts': { what: 'Facebook\'s "Open the app" prompts hidden', asked: null },
    'fb.foreignPictures': { what: 'Pictures from outside Facebook\'s own picture hosts are not shown', asked: null },
    'fb.blankRescue': { what: 'A page left blank for six seconds opens Notifications instead', asked: null },
    // ---- YouTube ----
    youtube: { what: 'YouTube: sexual content only, from titles, channel names, descriptions, captions, transcripts and thumbnails; never the video being played (the config\'s youtube block)', asked: '2026-11-17: "*sexual* adult content, but not things like true-crime, violence, adult topics"' },
  };
  const LOCKED = Object.keys(list).filter((k) => list[k].locked);

  const host = (s) => { const c = s.indexOf('/'); return c < 0 ? s : s.slice(0, c); };
  /** Does a scope ("*", "host", "host/path", "*\/path") cover this host and path? */
  function covers(scope, h, p) {
    if (typeof scope !== 'string' || !scope.trim()) return false;
    const s = scope.trim().toLowerCase(), cut = s.indexOf('/'), sh = cut < 0 ? s : s.slice(0, cut), sp = cut < 0 ? '' : s.slice(cut).replace(/\/+$/, '');
    if (!(sh === '*' || h === sh || h.endsWith('.' + sh))) return false;
    if (!sp) return true;
    const path = (p || '/').toLowerCase();
    return path === sp || path.startsWith(sp + '/');
  }
  /** Whether a feature entry is on for a page. */
  function onFor(entry, h, p) {
    if (!entry || entry.on !== true) return false;
    const sites = Array.isArray(entry.sites) && entry.sites.length ? entry.sites : ['*'];
    if (!sites.some((s) => covers(s, h, p))) return false;
    return !(Array.isArray(entry.except) && entry.except.some((s) => covers(s, h, p)));
  }
  /** A locked feature counts as turned off or narrowed when it is not on for every site. */
  const narrowed = (e) => !e || e.on !== true || (Array.isArray(e.sites) && e.sites.length && !e.sites.includes('*')) || (Array.isArray(e.except) && e.except.length > 0);
  const decided = (cfg, name) => !!(cfg && cfg.decisions && typeof cfg.decisions[name] === 'string' && cfg.decisions[name].trim().length >= 10);
  /** The features a config really runs with: every known one (a missing one takes the floor's), the locked ones held
   *  at the floor unless the config records a decision for them. */
  function effective(cfg, floor) {
    const out = {}, f = (cfg && cfg.features) || {}, fl = (floor && floor.features) || {};
    for (const name of Object.keys(list)) {
      let e = f[name] && typeof f[name] === 'object' ? f[name] : fl[name];
      if (list[name].locked && narrowed(e) && !decided(cfg, name)) e = fl[name];
      out[name] = e || { on: false };
    }
    return out;
  }
  /** What is wrong with a config (for the signer and the panel); empty when it may be signed. */
  function problems(cfg) {
    const out = [];
    if (!cfg || typeof cfg !== 'object') return ['not an object'];
    if (cfg.kind !== 'filter-config') out.push('kind must be "filter-config"');
    if (cfg.schema !== 1) out.push('schema must be 1');
    const f = cfg.features || {};
    for (const name of Object.keys(list)) if (!f[name] || typeof f[name].on !== 'boolean') out.push(`feature ${name}: give it "on": true or false`);
    for (const name of Object.keys(f)) if (!list[name]) out.push(`feature ${name}: not a feature of the filter (see filter-features.js)`);
    for (const name of LOCKED) if (narrowed(f[name]) && !decided(cfg, name)) out.push(`feature ${name} is locked (locked memory entries 23 to 28, 46): turning it off or narrowing it needs decisions.${name} with the date, who decided and Joe's words`);
    for (const [name, e] of Object.entries(f)) for (const s of [...(e.sites || []), ...(e.except || [])]) if (!/^(\*|[a-z0-9.-]+\.[a-z]{2,})(\/\S*)?$/i.test(s)) out.push(`feature ${name}: "${s}" is not a scope`);
    return out;
  }
  g.FilterFeatures = { list, LOCKED, covers, onFor, effective, problems, host };
})();
