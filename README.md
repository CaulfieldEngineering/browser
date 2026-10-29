# Browser

Joe's own iPhone browser, a prototype. Joe, 2026-10-29: "Go ahead and build a prototype. For now just a basic, clean sleek browser." Where it is going (HQ/aspirations.md, "our own iPhone browser"): TechLockdown blocks the Safari and Chrome apps so this is the only way onto the web, and its rules come from the mini PC and change with conditions (time of day, the Morning Check-In, focus sessions). None of that is built yet. This app loosens nothing; it is only a browser.

## What it does

- One page at a time in a WKWebView, dark, in the house style (HQ/agent/app-design.md).
- A bar at the bottom within thumb reach, like Safari's: the address field shows the site at rest ("nytimes.com", or the words of a search) and the whole address while editing; text that is not an address searches DuckDuckGo with SafeSearch strict (`kp=1`). Under it: back, forward, share, reload (stop while loading). A thin green progress line on the bar's top edge. The bar rides on the keyboard.
- Swipe from the edge for back and forward; pull down to reload. The last page opens again at launch.
- Links and scripts that open a new window open in the same view. Links that would hand off to another app stay in the browser (universal links are not followed out).
- No private mode (the web view always uses the persistent store), no downloads, no setting for DNS or proxies.

## The policy: one place every navigation passes through

`ios/Browser/Policy.swift`. `Policy.decide(request:isMainFrame:)` sees every request before it is made, and `Policy.decide(response:isMainFrame:canShow:)` every answer before it is shown; both return `allow`, `openOutside` (tel, mailto, sms, FaceTime go to the system) or `block(title, reason)`, which shows a calm page over the web view with Go back. The rules from the mini PC will plug in there. For now it blocks only:
- configuration and provisioning profiles, apps and installers, by file extension or MIME type (`.mobileconfig`, `application/x-apple-aspen-config`, `.ipa`, `.mobileprovision` and the like);
- every scheme that is not the web or the four above (`itms-services` app installs, `itms-apps`, other apps' own links);
- downloads in general (anything the web view cannot show), since the prototype keeps no files.

## Building and installing

The same route as the HQ and Blocks iPhone apps. `.github/workflows/ios-build.yml` runs on a push to `main` touching `ios/` or the workflow (or Run workflow): XcodeGen makes the project from `ios/project.yml` on a macOS runner, then archive, ad-hoc export, and `app.ipa`, `manifest.plist`, `version.json` and the install page go to the public repo `CaulfieldEngineering/browser-install`, served at **https://caulfieldengineering.github.io/browser-install/**. Versions are `0.1.<run number>`.

Signing: Blocks' Apple team (`D56QY8C7WL`), App Store Connect API key and Apple Distribution certificate, with the browser's own App ID `com.caulfieldengineering.browser` and ad-hoc profile `Browser AdHoc`. `node scripts/apple-provision.mjs` makes the App ID and the profile (into `C:\Users\Joe\.apple\browser`, never a new certificate); `npm i --no-save libsodium-wrappers && node scripts/apple-secrets.mjs` puts the certificate, its password, the profile, the team and the install repo's deploy key (`C:\Users\Joe\.apple\browser\install_key`) in this repo's Actions secrets. Every year, after Blocks' certificate is renewed, run both again, then the workflow, then reinstall.

Joe installs it: Safari on the iPhone, https://caulfieldengineering.github.io/browser-install/, Install.

## Not built yet

Tabs, the rules from the mini PC, bookmarks and history lists, find in page, reader mode, downloads.
