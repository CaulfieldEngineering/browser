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

The scheduled blur filter is a separate media gate, applied to every tab and frame while a requested window is active. It does not change any navigation restriction above. There is no in-app switch, exemption list, or strength control. It is **off by default**, and turns on only for windows Claude publishes at Joe's request. An active, cached window cannot be shortened by an unavailable, invalid, or stale schedule response. The window ends at its specified time, even offline.

## The blur filter

`ios/Browser/Blur/` integrates the filter with WebKit; `ios/BlurCore/` is the reusable native Swift package. Processing stays on the phone with Apple Vision and Core Image. No media, frames, browsing URLs, or results are uploaded for analysis. To process a network image, the phone fetches that image from its original source, without forwarding the page URL, cookies, or credentials. The only control request is for the public schedule below.

- **People:** still images use `VNGeneratePersonInstanceMaskRequest` and its scaled masks, falling back to accurate person segmentation. Video uses balanced person segmentation. Human rectangles catch empty masks on detected people. All detected bodies are blurred; this implementation does not infer sex or gender and has no male exemption or bundled gender classifier. Unknown people get the same protection. This is broader than Joe's original female-only request.
- **Appearance:** the entire person mask is covered, including skin and clothing. Confident face rectangles, expanded by 3.5%, are preserved. The mask is expanded slightly and smoothed at its edge; heavy pixelation plus Gaussian blur obscures the body, with a solid dark outline. No skin/clothing classifier reduces the coverage. Detection failures cover the entire image. Missed people remain a limitation of Vision, particularly very small, stylized, occluded, or cropped subjects.
- **Images:** a native content rule blocks original HTTP(S) image loads. A document-start script in an isolated content world hides images until native processing succeeds, then fades in the processed pixels. It handles `img`, `picture`/`srcset`, source changes, and accessible CSS backgrounds. Results are cached in memory by source URL and processing size. Decode, network, CSP, or processing failures leave media hidden. Animated images become a processed still. Unsupported SVG, canvas, object/embed and pseudo-element imagery stay hidden during a window.
- **Video:** original video pixels stay hidden. Readable frames are downscaled, processed natively and displayed in a moving overlay with the video's size, object fit and clipping. Capture is scheduled every 100 ms with one outstanding request per video. A stale result (over 300 ms), DRM, unreadable cross-origin frame or processing failure leaves a solid outlined cover. Audio can continue; an inline play/pause control remains. No claim of sustained 10 fps on the iPhone 13 Pro has been verified on hardware. PiP, AirPlay and element fullscreen are disabled during an active window because those surfaces cannot carry the overlay.
- **Responsiveness:** native work runs on a serial worker queue, detection is downscaled, still output is limited to 1536 pixels, downloads and caches are bounded, and visible images are prioritized. Tab snapshots are suppressed during a window. A schedule change covers and recreates the web views, closes media presentations and clears old snapshots before reloading.

The schedule is [blur.json on the install page](https://caulfieldengineering.github.io/browser-install/blur.json):

```json
{"windows":[{"from":"2026-10-31T00:00:00-04:00","until":"2026-10-31T07:00:00-04:00"}]}
```

The app fetches it at launch, on foreground, and every five minutes. It caches the last valid copy and uses absolute ISO dates with explicit offsets; a local boundary timer starts/stops the filter without waiting for a poll. With no known window it stays off. While a known window is active, fetch errors retain protection until its scheduled end. Reopening the app picks up a newly published window immediately after the fetch; a running app picks it up within five minutes.

When Joe requests a window, Claude runs this on the mini PC from this repo (Node 22 or later and the existing GitHub git credential). It changes **only** `blur.json` in `CaulfieldEngineering/browser-install`, preserves active/future windows, merges overlapping intervals, and never prints the credential:

```powershell
node scripts/blur-window.mjs --until 2026-10-31T07:00:00-04:00
# Optional future start; dates must include an offset or Z:
node scripts/blur-window.mjs --from 2026-11-01T00:00:00-04:00 --until 2026-11-01T07:00:00-05:00
# Preview without credentials or network access:
node scripts/blur-window.mjs --until 2026-10-31T07:00:00-04:00 --dry-run
```

After publishing, check the Pages deployment and read the live `blur.json` back with a cache-busting query. Never create a recurring window or a nightly job unless Joe requests it. The existing TechLockdown nightly job is independent and unchanged.

Tests: `node --test tests/*.test.mjs` runs on Windows; `swift test --package-path ios/BlurCore` and the hosted iPhone simulator tests run in `ios-build`. Native tests check body coverage, exact face/background preservation, unknown/detector failure, dark outline, decoding, time boundaries, and measured rendering time. A public-domain, fully clothed NASA portrait tests real Vision segmentation. Its source and licence are in `ios/BlurCore/Tests/BlurCoreTests/Fixtures/LICENSE.txt`; the geometric fixtures are CC0. Apple supplies the Vision models as OS frameworks; there is no separately bundled model. Simulator tests exercise the actual isolated content script, pending/failed image hiding, source replacement and protected video/canvas behavior. CI timing is not an iPhone benchmark.

## Building and installing

The same route as the HQ and Blocks iPhone apps. `.github/workflows/ios-build.yml` runs on a push to `main` touching `ios/`, tests, the blur-window script or the workflow (or Run workflow): native and simulator tests must pass, XcodeGen makes the project from `ios/project.yml` on a macOS runner, then archive, ad-hoc export, and `app.ipa`, `manifest.plist`, `version.json` and the install page go to the public repo `CaulfieldEngineering/browser-install`, served at **https://caulfieldengineering.github.io/browser-install/**. Versions are `0.1.<run number>`. The repo is public, so these Actions builds are free. The `codex/scheduled-blur` branch also builds and tests, but cannot sign or publish. Manual runs from any non-main branch cannot publish either. Validate a candidate there before advancing `main`; never use TestFlight as a compiler or change signing for this feature. Deploying the app preserves `blur.json`.

Signing: Blocks' Apple team (`D56QY8C7WL`), App Store Connect API key and Apple Distribution certificate, with the browser's own App ID `com.caulfieldengineering.browser` and ad-hoc profile `Browser AdHoc`. `node scripts/apple-provision.mjs` makes the App ID and the profile (into `C:\Users\Joe\.apple\browser`, never a new certificate); `npm i --no-save libsodium-wrappers && node scripts/apple-secrets.mjs` puts the certificate, its password, the profile, the team and the install repo's deploy key (`C:\Users\Joe\.apple\browser\install_key`) in this repo's Actions secrets. Every year, after Blocks' certificate is renewed, run both again, then the workflow, then reinstall.

Joe installs it: Safari on the iPhone, https://caulfieldengineering.github.io/browser-install/, Install.

## TestFlight (for the default browser permission)

Apple assesses the default browser permission only for an app on the App Store or on TestFlight (2026-10-29), so the browser also goes to TestFlight with a public link. Nothing is submitted for App Store review. The app record is **CaulfieldBrowser** (SKU `browser-001`), made by Joe in App Store Connect.

- `node scripts/apple-testflight.mjs profile` makes the App Store profile `Browser AppStore` (same certificate), then `node scripts/apple-secrets.mjs IOS_APPSTORE_PROFILE_BASE64 ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8_BASE64` puts it and the API key in the secrets.
- `.github/workflows/ios-testflight.yml`, run by hand only: archive with the `APPSTORE` flag (no install page updater and no install links in that build), export for App Store Connect, upload. Version `1.0`, build number = that workflow's run number.
- `node scripts/apple-testflight.mjs builds` until the build is `VALID`, then `beta` (the external group `Public` with a public link for 10 testers, the test notes, the review notes, beta review), and `status`.

## Not built yet

The rules from the mini PC, bookmarks and history lists, find in page, reader mode, downloads.
