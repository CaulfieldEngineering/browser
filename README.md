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

`ios/Browser/Policy.swift`. `Policy.decide(request:isMainFrame:)` sees every request before it is made, and `Policy.decide(response:isMainFrame:canShow:)` every answer before it is shown; both return `allow`, `openOutside` (tel, mailto, sms, FaceTime go to the system) or `block(title, reason)`, which shows a calm page over the web view with Go back. The rules from the mini PC will plug in there. For now it blocks only:
- configuration and provisioning profiles, apps and installers, by file extension or MIME type (`.mobileconfig`, `application/x-apple-aspen-config`, `.ipa`, `.mobileprovision` and the like);
- every scheme that is not the web or the four above (`itms-services` app installs, `itms-apps`, other apps' own links), with one exception: an `itms-services://?action=download-manifest` link whose `url` is exactly `https://caulfieldengineering.github.io/<browser|hq|blocks>-install/manifest.plist`, our own install pages (`Policy.isOwnInstall`);
- downloads in general (anything the web view cannot show), since the prototype keeps no files.

## Building and installing

The same route as the HQ and Blocks iPhone apps. `.github/workflows/ios-build.yml` runs on a push to `main` touching `ios/` or the workflow (or Run workflow): XcodeGen makes the project from `ios/project.yml` on a macOS runner, then archive, ad-hoc export, and `app.ipa`, `manifest.plist`, `version.json` and the install page go to the public repo `CaulfieldEngineering/browser-install`, served at **https://caulfieldengineering.github.io/browser-install/**. Versions are `0.1.<run number>`.

Signing: Blocks' Apple team (`D56QY8C7WL`), App Store Connect API key and Apple Distribution certificate, with the browser's own App ID `com.caulfieldengineering.browser` and ad-hoc profile `Browser AdHoc`. `node scripts/apple-provision.mjs` makes the App ID and the profile (into `C:\Users\Joe\.apple\browser`, never a new certificate); `npm i --no-save libsodium-wrappers && node scripts/apple-secrets.mjs` puts the certificate, its password, the profile, the team and the install repo's deploy key (`C:\Users\Joe\.apple\browser\install_key`) in this repo's Actions secrets. Every year, after Blocks' certificate is renewed, run both again, then the workflow, then reinstall.

Joe installs it: Safari on the iPhone, https://caulfieldengineering.github.io/browser-install/, Install.

## TestFlight (for the default browser permission)

Apple assesses the default browser permission only for an app on the App Store or on TestFlight (2026-10-29), so the browser also goes to TestFlight with a public link. Nothing is submitted for App Store review. The app record is **CaulfieldBrowser** (SKU `browser-001`), made by Joe in App Store Connect.

- `node scripts/apple-testflight.mjs profile` makes the App Store profile `Browser AppStore` (same certificate), then `node scripts/apple-secrets.mjs IOS_APPSTORE_PROFILE_BASE64 ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8_BASE64` puts it and the API key in the secrets.
- `.github/workflows/ios-testflight.yml`, run by hand only: archive with the `APPSTORE` flag (no install page updater and no install links in that build), export for App Store Connect, upload. Version `1.0`, build number = that workflow's run number.
- `node scripts/apple-testflight.mjs builds` until the build is `VALID`, then `beta` (the external group `Public` with a public link for 10 testers, the test notes, the review notes, beta review), and `status`.

## Not built yet

The rules from the mini PC, bookmarks and history lists, find in page, reader mode, downloads.
