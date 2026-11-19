# What the laptop filter can be changed to do without a new extension (2026-11-19)

Joe, 2026-11-19: "If a single more update requires a google chrome extension then we need to kill this filter this very instant. The entire premise was that you can provide INSTANTANEOUS updates to the filter."

The laptop runs **Filter 1.6.3** from the Chrome Web Store. Its behaviour is one signed file, `filter/config/filter-config.json` (signed copy beside it), which every Chrome profile fetches every five minutes from the mini PC and from GitHub. This page says exactly what that file can and cannot change on 1.6.3, read from the installed package's own code (`.held/laptop-filter/dist/store/extension-1.6.3`). Judge every ask against it before promising anything.

## Reaches the laptop within five minutes (data)

| What | Where in the config | Limits |
|---|---|---|
| Turn any named feature on or off, per site or per path | `features.<name>` with `on`, `sites`, `except` | Only the 37 names in `filter-features.js`. The two picture judges are locked: off or narrowed only with a written `decisions.<name>`. A scope is a host or a host and a literal path prefix; no wildcards inside a path, so "every profile page" cannot be named. |
| YouTube: which titles, channels and thumbnails go | `youtube` (terms, patterns, the thumbnail line, which surfaces, the tile and player selectors) | Everything the module does is here. It can never touch the player: that is code. |
| Word and pattern lists for Instagram captions, account names and bios | `settings.IGFilterConfig.accounts` | Adds or removes terms. A row or post that matches is removed whole (on 1.6.3: collapsed). |
| Hand-curated text rules on any site | `textRules` (words, patterns, the feature that gates each) | Text of a post or unit only. |
| Hide a thing on a page | `hideRules.sites.<host>`: `selectors`, `headings`, `buttons`, `phrases` | On 1.6.3 a hide rule can only set `display:none` on what it finds (an `article` becomes one pixel). It cannot style, move, resize or reveal anything, and it refuses the page's main area, navigation, dialogs, search fields and anything as big as the screen. |
| Send a path somewhere else, or block a path | `hideRules.sites.<host>`: `redirects`, `blockPaths` | Same site only. |
| Replace a whole site with one calm line | `blockSites` | Whole hosts. |
| The picture lines | `settings.IGFilterConfig.suggestive`, `.revealing`; `youtube.thumbnails.line` | Raising a line lets more through: that is loosening, and needs his decision the locked way. Lowering is free. |
| Work surfaces | `settings.IGFilterConfig.work` (surfaces, pages) | Literal hosts and path prefixes; the code refuses any feed, and refuses facebook.com or instagram.com without a path. |
| Sites the open-web filter leaves alone | `settings.WebFilterConfig.skipHosts` | Whole hosts. |
| Looks and timings | `tuning`: the grey of a held picture, the fade, how often a playing video is checked and at what line, how often an unjudged picture is asked again | Every number is clamped in code; none can show an unjudged picture. |
| Small numbers the filter reads | `settings.IGFilterConfig`: `smallPx`, `searchAvatarPx`, `retrySeconds`, `judgeLanes`, `judgeInFlight` | Numbers only. |

## Needs new code (cannot be done by data on 1.6.3)

- **The overlapping Instagram grid.** 1.6.3 closes a grid up after a hidden tile and places the remaining tiles by hand. That step runs for every tile hidden for good and has no switch: no feature gates it, no number reaches it, the config carries no style rules, and a hide rule can only add `display:none`. The only two ways to stop it by data would loosen the filter (both picture judges off on profiles, or all of Instagram named a work surface, which the code refuses) and were not taken. Fixed in the 1.6.5 build.
- **How anything is hidden**: collapsing versus blanking in place, placeholders, the guard that protects a profile's Follow and Message buttons (on 1.6.3 the buttons are protected only because `ig.noSuggestions` is off in the config).
- **How things are found**: suggested accounts by structure, what counts as a post or a tile, which box a picture's verdict takes.
- **The judges**: the models, the crops, the colour check, anything that changes a score. Only the lines are data.
- **Anything the filter sends**: the self-test's lines, the scores of flagged pictures in the log, a second opinion from the mini PC (1.6.3 has no call for it).
- **A new kind of check, a permission, a new address to fetch from, the signing key.**
- **Where the filter runs at all**: the machine policy on the laptop decides that (`ExtensionSettings` `runtime_blocked_hosts`), not the config.

## The three delivery routes, and what each costs him

1. **Data** (the signed config): nothing. Five minutes.
2. **Our own copy of the extension, served by the mini PC** (`.held/laptop-filter/laptop-selfhost`, 1.6.5 built): no store and no review, ever again; a new version is a file on the mini PC and Chrome takes it at its next update check. It needs Chrome enrolled in his Chrome Enterprise Core (one token, one restart) because Windows 11 Home takes an extension from outside the store by policy only then; Edge cannot do this for free and is blocked from starting instead.
3. **The Chrome Web Store**: a review of a day or more for every change. Ruled out by him on 2026-11-19.

## Rule for every future capability

Build it so its behaviour is data: a named feature, lists, selectors, numbers with limits in code, and a self-test line that says when the data matched nothing or too much. Code changes only the engine. Before telling him something will change on the laptop, find its row in the first table; if it is not there, it is code, and it reaches the laptop only by route 2.
