# The Instagram filter, by design (2026-11-19)

Joe, 2026-11-19: "our instagram filter is absolutlely effed, btw. I'm finding incredibly difficult to do anything on instagram between the phone app and the chrome extension on desktop", "Except suggested accounts aren't even being hidden.", "our filter is blocking fine posts", "its all destroying instagram", "did you remove the Follow button?".

This note is the design the Instagram filter is held to on the laptop extension and in the iPhone Instagram app. The code is `filter/shared` (`ig-core.js`, `ig-tidy.js`, `ig-filter.js`, `hide-engine.js`, `rules.js`); the tests are `filter/test/ig-surfaces.test.mjs` over `filter/test/fixtures/instagram/`.

## What was fundamentally wrong

1. **The filter rearranged Instagram's own layout.** A hidden post was collapsed to a pixel and a hidden tile was taken out of the grid with the remaining tiles placed by hand in rows of three. Instagram's lists are virtual: it measures every row and post, pads for the ones out of the page and puts them back as new elements. Every collapse made its measurements false, and three more mechanisms were then needed to hide the damage (scroll holding, deferred collapse, hand-placed grid tiles). On the laptop, where the grid is now 3:4 tiles and not always three across, the hand-placed tiles landed on top of each other.
2. **Things were found by words and a climb.** "The smallest box around the words X that holds a Follow button" is a guess about a page whose markup we do not control. A profile's own Follow and Message row holds a chevron whose SVG title is "Similar accounts", so the row was taken as one suggested account. The suggested list itself was missed, because its real rows did not match the guessed shape.
3. **No test ever saw Instagram's real markup.** Every fixture was written by hand from memory (`<article>`, old class names, tiles three across), so the tests proved the code against our idea of the page.
4. **Nothing on the page said when a rule was wrong.** A rule that matched nothing (suggestions) and a rule that matched far too much (the Follow row, a whole grid) looked the same from the mini PC: a count.
5. **Agent-added extras ran on the main paths** (posts seen before skipped, repeated posts skipped, the grid closed up), each one more way to take a fine post off the page.

## Principles

1. **Never change Instagram's layout.** Hiding is *blanking in place*: the element keeps its box, size and position; its content is made invisible (`visibility:hidden`, no pointer events, `aria-hidden`) over one neutral shade. No `display:none`, no height, margin, transform or position written to anything Instagram lays out. No word, icon or reason on the blank (Joe, 2026-11-05: "i'd prefer not to label the pictures. Keep it more discrete"). The exceptions are written down and nowhere else: the Reels tab's slot and the Explore link in the navigation (static boxes whose neighbours share the room), the Explore page's grid (the page is replaced by a plain search list, so there is no layout of Instagram's left to keep), Instagram's own "open the app" banners, and whole pages that are redirected. A blank is drawn by the box itself (it stays visible as one plain shade, its children invisible, inert and out of the accessibility tree; focus inside it is let go), with nothing put into or taken out of Instagram's tree.
2. **One way to hide.** Every part of the filter hides through `IGCore.blank(el, rule)`. It checks the guard (below), counts the rule for the self-test, and applies the one style. A part that writes `display:none` by itself is a test failure (`ig-surfaces.test.mjs` scans the page for it).
3. **A guard no rule can pass.** Before anything is blanked, `IGCore.allowed(el, rule, kind)` decides, by the kind of rule:
   - *structure* rules (the page's furniture: suggestions, hide rules) are refused for: anything in or around a post; a profile's header (all of it, but the Similar accounts button itself); the navigation; a dialog and everything in one; a box that holds a field he types in; the creation dialog; the page's main area or root; a rule not listed for the surface; and anything over the surface's budget of the screen (below).
   - *content* rules (a post, tile or slide taken for what it shows or says: the picture judges, the caption and account terms) may blank the whole unit, its action bar with it, since the post is what is removed. They are refused for the page, the navigation, a dialog as a whole, the creation dialog, and in a profile's header for any box that holds the name or one of the profile's own controls (Follow, Following, Requested, Message, Edit profile, "..."). Budgets do not apply to them: nothing unjudged is shown, whatever share of the screen that is; the self-test reports the share.
   - *media* (one picture or video by itself) is refused only in the creation dialog.
   - A unit the guard refuses is never left showing a flagged picture: its pictures are blanked one by one instead.
4. **Stable anchors only**, in this order: the route (the URL), ARIA roles and labels, element semantics (`main`, `header`, `nav`, `article`, `dialog`, `a[href]` by route shape), and repeated structure (a list of siblings of the same shape). Text is used only as an anchor *inside a scope already found by structure* and only as an exact match on a leaf (`"Follow"` as the whole text of a control). Never a class name. Never "any element containing the word". An SVG `<title>` is a label, never a heading.
5. **Scoped by surface.** The route names the surface; each surface has a policy: what is allowed, what is hidden, which controls must be present, and how much of it a rule may blank. A rule that is not listed for a surface does not run there.
6. **Fail closed on content, fail open on chrome.** A picture not yet judged stays held (locked: nothing unjudged is shown). A structural rule that cannot find its anchor does nothing and reports it; it never falls back to a wider guess.
7. **The page reports on itself.** The self-test runs in the live page on every device (below).

## The surface map

`IGCore.surface(pathname, search)` returns one of these. "Judged" means both picture judges and the caption rules (the locked rules: suggestive and revealing pictures and captions removed with no label; account name, bio and caption terms).

| Surface | Routes | Allowed | Hidden | Must be present | Budget |
|---|---|---|---|---|---|
| `feed` | `/` (always the Following feed: `/?variant=following`; `variant=home` and none are sent there) | posts from followed accounts, stories tray, composer entry | flagged posts (blank in place); "Suggested for you" units and suggested-account rows; nothing else | navigation, each shown post's action bar | 60% |
| `profile` | `/<user>/`, `/<user>/reels/`, `/<user>/tagged/`, `/<user>/reposts/` | header (avatar judged), bio, Follow / Following / Message / "...", highlights, tabs, grid | flagged tiles (blank tile, same size, not tappable); on a profile flagged by name or bio: avatar, bio and tiles blank, the name stays; "Similar accounts" button and its tray | header action row, tab list, the grid's row and column count unchanged | 85% (a flagged account blanks its grid) |
| `post` | `/p/<id>/`, `/<user>/p/<id>/`, `/reel/<id>/`, `/<user>/reel/<id>/`, `/reels/<id>/` (a reel opened by its link), `/tv/<id>/` | the post, caption, comments, comment field | flagged media (blank in place); flagged comment avatars; "More posts from" tiles judged like a grid | action bar, comment field | 70% |
| `stories` | `/stories/...` | followed accounts' stories | a flagged slide is covered (black, same box) and skipped | close, next, previous, reply field | 100% (one slide is the page) |
| `reels` | `/reels/` | the tab is gone from the navigation (Joe, 2026-11-05: "Also the reels button can go away"); the address itself is judged like any viewer | the tab's slot; flagged slides covered | navigation | 100% |
| `explore` | `/explore/`, `/explore/tags/...`, `/explore/locations/...`, `/explore/search/...` | the search field and a plain list of accounts and hashtags, small avatars judged | every grid tile, video and large picture (Joe: "let's get rid of the explore page") | search field, navigation | 100% (the grid is the page) |
| `suggestions` | `/explore/people/...` | nothing | redirected to the Following feed | - | - |
| `people` | `/<user>/followers/`, `/<user>/following/`, `/p/<id>/liked_by/` (full pages on a phone; dialogs on a laptop) | every row and its Follow button | flagged avatars by themselves; no suggestion rule runs | the list | 30% |
| `direct` | `/direct/...` | everything: inbox, threads, requests, composer, send, calls | only a flagged picture or video, by itself (never a message row or a thread) | thread list, composer, send | 30% |
| `notifications` | `/notifications/`, `/accounts/activity/` | everything, "started following you" rows and their Follow buttons included | suggested-account rows under their heading; flagged pictures of 120 px or more by themselves (smaller thumbnails are not judged anywhere but the search page) | navigation | 40% |
| `create` | `/create/...`, and the creation dialog on any route (`[role="dialog"]` holding a file input or labelled "Create new post") | everything | nothing. No rule runs inside the creation dialog; pictures he is posting are his own and are not held | the whole dialog | 0% |
| `account` | `/accounts/...`, `/your_activity/...`, `/archive/...`, `/<user>/saved/...` | everything | flagged pictures by themselves | forms | 30% |
| `work` | `instagram.com/<his pages>`, `/accounts/insights`, `/professional_dashboard`, `/ads/...`, `/accounts/manage_access`, links out to Business Suite and Ads Manager (business.facebook.com, adsmanager.facebook.com: `filter-config.js` `work`) | everything | a flagged picture, by itself; suggested-account rows (they go everywhere) (2026-11-16: "make sure that our filters do not interfere with work") | everything | 20% |
| `other` | anything else on instagram.com | everything | flagged pictures by themselves | - | 30% |

Everywhere: the navigation keeps Home, Search, Messages, Notifications, Create and Profile; the Reels tab's slot and (on a wide screen) the Explore link are the only navigation changes.

## Finding things

- **A people row** is *structure*: a box holding exactly one account (links to one `/<user>/`) and exactly one control whose whole text is `Follow`, outside any `article`, `header`, `dialog` and the navigation. That alone is any list of people (search results, likes, "started following you" in notifications), so it is not enough.
- **A suggested account** is a people row *with evidence that it is a suggestion*: the row's own line says so (`12 mutuals`, `Followed by ...`, `Suggested for you`, `New to Instagram`, each the whole text of a leaf or a small box inside the row), or the list sits directly under a leaf heading that says so (`Suggested for you`, `Suggested`, `Discover people`...; an SVG title never counts). And only in a list: two or more such rows that are siblings (or one each in sibling wrappers), or any rows under a heading. Each row is blanked by itself, and the heading with them. With no evidence the list is left alone and nothing wider is tried. Never on a `people` surface or in a dialog. So a profile's own Follow row (in a `header`), a post author's Follow (in an `article`), a Followers dialog and a notification's "started following you [Follow]" cannot match.
- **A suggested unit in the feed** (a carousel of cards under "Suggested for you") is the same thing: its cards are the rows, under its heading.
- **A post** is `article`, or on a post page the `main` media region; **a tile** is `a[href]` whose route is a post or reel and which is not in an `article`; **the profile header** is `main header`; **the tab bar** is the `nav`/navigation holding the `/direct/` link.
- **The profile action row** is found from the header's buttons whose whole text is one of the control words, for the guard only (it is never hidden, so a miss costs nothing but protection, and the self-test reports the miss).

## The self-test

`IGCore.selftest()` runs in the page two seconds after a route settles and at most every 30 seconds, and after every blank. It never changes the page.

- **Per rule, per surface**: how many elements it blanked and what share of the screen that is; and every refusal of the guard, by rule and reason (a rule that reached for a protected part of the page is a rule that matched too much, even though it was stopped).
- **Matched too much**: a rule (or all rules together) over the surface's budget; a blank that covers a protected control; any element the filter set to `display:none` outside the written exceptions; a grid whose rows changed their tile count or whose tiles overlap.
- **Matched nothing**: on a surface where a rule must have something to find and the page shows its anchor (leaf controls reading `Follow` in three or more sibling rows still visible; an Explore grid tile still visible; a Reels tab still visible).
- **Controls**: for the surface, each "must be present" control is in the page, visible and not covered by a blank.
- **Where it goes**: `document.documentElement` gets `data-igx-selftest` (JSON; the tests read it) and each failure is one counted line to the device's filter log (`selftest:<surface>:<check>:<rule>`; numbers and rule names only, no address, no account, no text). The nightly systems pass reads them; a failure on a real page is a fixture to add.
- **A skeleton for fixtures**: `IGCore.skeleton()` returns the page as structure only (tag, role, ARIA label, route shape of each link with names replaced, box, and the layout styles that matter; text replaced by its length except the control words). It is how a real signed-in page becomes a test fixture without a picture, a name or a word leaving the device. It runs only when a test or Claude's panel asks for it.

## Tests

`filter/test/ig-surfaces.test.mjs`, in Chromium and WebKit, at a phone and a laptop width:

- **Fixtures** (`filter/test/fixtures/instagram/`): one per surface. `real-*` are skeletons taken from Instagram's live pages on the date in their header (signed out, by Claude's own browser; nobody signs in as Joe). `shape-*` are built for surfaces that need a sign-in, from the same components, and are replaced by skeletons from his own devices as the self-test sends them.
- **Layout intact**: every box Instagram laid out is where it was before the filter ran, to the pixel (positions and sizes of all tiles, posts, rows, header and navigation before and after).
- **Controls present**: Follow, Message and "..." on a profile; the post's action bar and comment field; the composer; DM composer and send; the navigation.
- **Hidden**: the suggested list (no row visible, at a phone, a narrow laptop and a wide laptop width); Explore tiles; the Reels tab.
- **Still removed**: the known-bad set (`filter/test/fixtures/bad/`, scores and captions, no pictures in the repo) is hidden on every surface that shows content. Recall never goes down: the set only grows, and every example is asserted.
- **Shown**: the false-positive set (`filter/test/fixtures/fine/`): posts that were hidden and should not have been.
- No waived failures.

## What was removed (agent-added, never asked for as built)

- The grid closing up after a hidden tile and the hand-placed tiles (`layoutRows`, `skipTile`).
- A hidden post collapsing to a pixel, the deferred collapse, and the scroll holding that existed to hide it (`hold`, `keepPlace`, `nudge`, `overflow-anchor: none`). The browser's own scroll anchoring is left on.
- Repeated posts and posts seen before skipped by the filter (`ig-seen.js`): no longer loaded in the apps, and its switch is gone (Joe, 2026-11-19: "Can we just pull back the filtering? Especially the \"don't show repeated posts\" one").
- Suggestions found by heading words and a climb (`suggPanel`), and the account-row pattern in config 2.

## What did not change

The locked rules: both picture judges and their lines, the caption, name and bio terms, nothing unjudged shown, no label, no reveal, no switch; no Explore; no Reels tab; the Following feed as home; no "Suggested for you".

## YouTube, by the same rule

Joe, 2026-11-19: "also our youtube filter still needs to remove \"sexual\" content"; "For youtube: sexual content only - so, this can be things like latex models, asmr-type content, explicitly bikini models, things that obviously do not provide any other value". `filter/shared/youtube-filter.js`: a tile whose title, channel or thumbnail is in scope is blanked in place; YouTube's layout is never changed; the player and the video he chose are never touched; thumbnails are not held while judged. In scope and out of scope, as tested, are the two lists at the top of `filter/test/youtube-scope.test.mjs`.

## Where the first version of this design stops

- The signed-in surfaces (feed, direct, notifications, stories, creation, the signed-in profile and post) are tested on built shapes, not on his own pages. `IGCore.skeleton()` exists to replace them; nothing sends a skeleton yet.
- A hidden feed post is a blank the height of the post. That is the price of never lying to Instagram's list about a height; a shorter blank needs a proven way to do it inside that list.
- Eight fine pictures of the measured set are still hidden (`fixtures/pictures/still-hidden.json`): the first judge calls them explicit on its own, and only a better judge fixes that.
- Facebook keeps its old hiding (collapsing, Marketplace tiles closing up): this design is Instagram's and YouTube's so far.
