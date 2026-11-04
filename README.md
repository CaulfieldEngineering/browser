# Browser

Joe's own iPhone browser, a prototype. Joe, 2026-10-29: "Go ahead and build a prototype. For now just a basic, clean sleek browser." Where it is going (HQ/aspirations.md, "our own iPhone browser"): TechLockdown blocks the Safari and Chrome apps so this is the only way onto the web, and its rules come from the mini PC and change with conditions (time of day, the Morning Check-In, focus sessions). None of that is built yet. This app loosens nothing; it is only a browser.

## What it does

- Laid out like Chrome on the iPhone (Joe, 2026-10-29: "I'd actually like chromes layout please"), dark, in the house style (HQ/agent/app-design.md): a top bar with back, the address pill (the site centred at rest, the whole address while typing, share inside it on the right) and a ••• menu (Forward, Reload or Stop, New Tab, Close Tab, Share, the version and Update when there is one, with a green dot on •••); the page in a card with rounded bottom corners; a bottom toolbar of three labelled buttons: **Ask HQ** (opens the HQ app, `hq://chat`), **New Tab**, **All Tabs** (the count in a rounded square).
- Text that is not an address searches DuckDuckGo with SafeSearch strict (`kp=1`).
- Tabs (`Tabs.swift`): All Tabs shows every tab as a card with its snapshot and title, two across; tap to open, x or a sideways swipe to close, + for a new tab, Done or the open tab's card to go back. A long press on All Tabs: New Tab, Close This Tab. Links and scripts that open a window open a new tab. Tabs, their addresses and snapshots persist across launches; a tab's web view is made only when it is opened, background tabs give theirs up when memory runs low, and at 30 the least recently used closes. No private tabs.
- A thin green progress line under the top bar, swipe from the edge for back and forward, pull down to reload.
- Picture in picture and sound in the background: `allowsPictureInPictureMediaPlayback`, the audio session in `.playback`, `UIBackgroundModes` audio. A site that pauses itself when the page is hidden still does.
- An updater: on opening it reads the install page's `version.json`; a newer build shows a green Update capsule (and a line in the menu) that installs from the install page.
- Links that would hand off to another app stay in the browser (universal links are not followed out). No private mode, no downloads, no setting for DNS or proxies.

## The policy: one place every navigation passes through

`ios/Browser/Policy.swift`. `Policy.decide(request:isMainFrame:)` sees every request before it is made, and `Policy.decide(response:isMainFrame:canShow:)` every answer before it is shown; both return `allow`, `openOutside` (tel, mailto, sms, FaceTime go to the system) or `block(title, reason)`, which shows a calm page over the web view with Go back. The rules from the mini PC will plug in there. For now it blocks:
- configuration and provisioning profiles, apps and installers, by file extension or MIME type (`.mobileconfig`, `application/x-apple-aspen-config`, `.ipa`, `.mobileprovision` and the like);
- `itms-services` app installs (sideloading from a web page), with one exception: an `itms-services://?action=download-manifest` link whose `url` is exactly `https://caulfieldengineering.github.io/<browser|hq|blocks>-install/manifest.plist`, our own install pages (`Policy.isOwnInstall`). Every other scheme that is not the web (`itms-appss://` for the App Store, an app's own link) opens that app, the way Safari does (Joe, 2026-11-03, after the Canon R50's QR code was stopped on its way to the App Store: "The refusal to redirect was never a spec of mine");
- downloads in general (anything the web view cannot show), since the prototype keeps no files.
- image and video search, always, with no switch (Joe, 2026-11-04: "all that stuff I looked at I want to stop"): the image and video tabs of Google (`tbm=isch`, `tbm=vid`, `udm=2`, `udm=7`, `images.google.*`, `/imghp`, Lens, search by image), DuckDuckGo (`ia`/`iax` = images or videos, `i.js`, `v.js`), Bing (`/images`, `/videos`), Yahoo, Yandex, Ecosia, Brave, Startpage, Qwant, Mojeek, AOL and Baidu, Pinterest search, and reverse image and face search sites (TinEye, PimEyes, FaceCheck and the like). The page says "Image search is off here". `ios/Browser/SearchBlock.swift` has the list; a page that switches to its image tab without navigating (DuckDuckGo) is stopped when its address changes, and content rules refuse the requests for image results. Normal web search is unchanged. Tests: `ios/BrowserTests/SearchBlockTests.swift`.

## The blur filter (removed 2026-11-04)

A scheduled on-device filter that masked people in images and video during windows Claude published to `blur.json` existed from 2026-10-30 to 2026-11-04 (last used the night of 2026-11-03, until 6:00 AM). Joe, 2026-11-04: "Get rid of the blur altogether." It is gone from the app: no Vision processing, no schedule fetch, no media gate. The install page keeps `blur.json` as `{"windows":[]}` so an older build that still reads it stays off. The last code is in git history (the parent of the removal commit) and on the unmerged branch `codex/scheduled-blur`, which also holds an unshipped thumbnail fix and an erase-the-body look.

Do not call the WebKit Swift overlay's `Result` APIs (such as `evaluateJavaScript(_:in:in:completionHandler:)` with a `Result`): with the 17.0 deployment target they link `/usr/lib/swift/libswiftWebKit.dylib`, which iOS 18 does not have, and the app aborts at launch (2026-11-03). Use the Objective-C entry points (`__evaluateJavaScript(_:inFrame:in:completionHandler:)`).

## History and the feed to the mini PC

Joe, 2026-11-03: "Are you able to log my browser history from our app?", and what for: "Both mainly adaptive accountability". `ios/Browser/History/`.

- **History** (••• menu, History): every main-frame page a tab opens (time, address, title), newest first under a heading per day, with a search field; tap to open in this tab, long press to open in a new tab or copy the link. Pages that did not open are listed, muted. Kept on the phone in Application Support, one JSON line per visit and one file per month (`HistoryStore`), written only by appending. There is no switch to turn it off and nothing in the app that deletes it.
- **What counts as a visit** (`HistoryRecorder`, attached to every tab's web view): each new main-frame address, full loads and single-page sites changing their own address. It is written once the title comes (1.5 s more for it to settle), after 5 s without one, or when the tab moves on; a redirect hop (gone within a second, still loading, no title) is not one. A failed load or a page the policy does not open is a visit marked as not opened.
- **The feed** (`Feed`): each visit, and a **heartbeat** (on coming to the front, every five minutes while in front, on leaving), goes into a queue kept in a file and is sent in batches of up to 200 to the HQ service on the mini PC (`hq-widget` `server/browser-feed.js`, `POST /api/browser/feed`), by its Tailscale name over HTTPS through the service's CONNECT tunnel on `100.92.203.47:4400`, the way the HQ app reaches it. Offline, it waits; after a failure it tries again after 5 s, 15 s, 1 min, 2 min, then every 5 min, and at once when the network comes back or the app comes to the front. Sending never blocks browsing. The key for the feed is asked for and kept in the Keychain by itself (`POST /api/browser/pair`; the key is good for the feed only, and a revoked one is replaced). Every event has a sequence number kept in the Keychain with the install's id, so a reinstall continues the numbers and the mini PC sees a gap if a queue was lost. The heartbeat lets the mini PC tell "not browsing" from "the feed stopped".
- On the mini PC the events are kept append-only in `C:\Users\Joe\.held\browser` (outside Dropbox and git), and the laptop watch reads them too.

Tests: `ios/BrowserTests/HistoryFeedTests.swift` (the store, the queue's numbers across a reinstall, batching, retry and backoff, a replaced key, the heartbeat, what counts as a visit) run on the iPhone simulator in `ios-build`.

## Building and installing

The same route as the HQ and Blocks iPhone apps. `.github/workflows/ios-build.yml` runs on a push to `main` touching `ios/`, tests or the workflow (or Run workflow): the iPhone simulator tests must pass, XcodeGen makes the project from `ios/project.yml` on a macOS runner, then archive, ad-hoc export, and `app.ipa`, `manifest.plist`, `version.json` and the install page go to the public repo `CaulfieldEngineering/browser-install`, served at **https://caulfieldengineering.github.io/browser-install/**. Versions are `0.1.<run number>`. The repo is public, so these Actions builds are free. Manual runs from any other branch (Run workflow) build and test but cannot sign or publish; validate a candidate there before advancing `main`, and never use TestFlight as a compiler.

Signing: Blocks' Apple team (`D56QY8C7WL`), App Store Connect API key and Apple Distribution certificate, with the browser's own App ID `com.caulfieldengineering.browser` and ad-hoc profile `Browser AdHoc`. `node scripts/apple-provision.mjs` makes the App ID and the profile (into `C:\Users\Joe\.apple\browser`, never a new certificate); `npm i --no-save libsodium-wrappers && node scripts/apple-secrets.mjs` puts the certificate, its password, the profile, the team and the install repo's deploy key (`C:\Users\Joe\.apple\browser\install_key`) in this repo's Actions secrets. Every year, after Blocks' certificate is renewed, run both again, then the workflow, then reinstall.

Joe installs it: Safari on the iPhone, https://caulfieldengineering.github.io/browser-install/, Install.

## TestFlight (for the default browser permission)

Apple assesses the default browser permission only for an app on the App Store or on TestFlight (2026-10-29), so the browser also goes to TestFlight with a public link. Nothing is submitted for App Store review. The app record is **CaulfieldBrowser** (SKU `browser-001`), made by Joe in App Store Connect.

- `node scripts/apple-testflight.mjs profile` makes the App Store profile `Browser AppStore` (same certificate), then `node scripts/apple-secrets.mjs IOS_APPSTORE_PROFILE_BASE64 ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8_BASE64` puts it and the API key in the secrets.
- `.github/workflows/ios-testflight.yml`, run by hand only: archive with the `APPSTORE` flag (no install page updater and no install links in that build), export for App Store Connect, upload. Version `1.0`, build number = that workflow's run number.
- `node scripts/apple-testflight.mjs builds` until the build is `VALID`, then `beta` (the external group `Public` with a public link for 10 testers, the test notes, the review notes, beta review), and `status`.

## Not built yet

The rules from the mini PC, bookmarks, find in page, reader mode, downloads.
