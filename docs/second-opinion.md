# The second opinion (2026-11-19)

Joe, in HQ chat, 2026-11-19: "perhaps we can send perpetual browsing data to a local llm on the minipc that reviews content as well for real-time adjustments" (after the filter hid fine posts, Fender and NASA reels scored as explicit), and then: "we can most likely catch most of what i'm looking at in the text, title, comments, channel, captions". Agent decision, the same day: a local second opinion and a nightly tuner on the mini PC.

This note is the interface for whoever wires it into the page scripts (the Instagram and YouTube redesign for Filter 1.6.5 and the next iPhone build). The mini PC side is live; the client is built and **off** (`secondOpinion.on: false`) until it is tested on the device.

## What it is

- **Text first.** Every YouTube tile and every Instagram post sends its text (title, channel or account, caption or description, bio, hashtags, the visible comments) to a local model on the mini PC, judged by Joe's rules: Instagram, suggestive content and revealing clothing (locked memory entries 21 to 28); YouTube, his spec of 2026-11-19, "sexual content only - so, this can be things like latex models, asmr-type content, explicitly bikini models, things that obviously do not provide any other value", and not true crime, violence or adult topics (2026-11-17).
- **A picture only near a line.** The picture goes too only when the on-device judges scored it near their lines (below), so the model's vision side sees the cases the device is least sure of.
- **The on-device rules stay the first, instant pass.** The word lists (captions, names, bios) and the two picture judges decide alone whenever they are sure.
- The model: Qwen3-VL-2B-Instruct (Q4_K_M), llama.cpp with Vulkan on the mini PC's Radeon 780M, on 127.0.0.1 only; one model does text and pictures. The Devices server's route is the only way in, from the mini PC and the tailnet. Nothing leaves the network.

## The rules (filter/shared/second-opinion.js, one copy for every device and the server)

`SecondOpinion.zone(scores)` places a picture's scores (lines from `rules.js`/`filter-config.js`, never changed here):

| zone | when | the device | the model may |
|---|---|---|---|
| `confident` | flagged by both judges (nsfwjs and the revealing judge), or one judge with the other not quiet, or a flagging score past its cap | removes | nothing (an audit share is asked, never applied) |
| `rescuable` | flagged by one judge alone, every flagging score under its cap (line + `band.above`, never above the hard ceiling), the other judge quiet (`band.quiet`) | removes | **show** it, on a vision verdict "fine" at `rescueMin` (0.85) or more |
| `near` | not flagged, a score within `band.below` of its line | shows | **remove** it, at `removeMin` (0.6) or more |
| `clear` / `none` | not flagged and not near / no scores | shows | remove it on its text, at `removeMin` or more |

`SecondOpinion.decide({onDevice, textRule, scores, verdict})` gives `{final: 'remove'|'show', why, zone}`:

1. An on-device text rule's removal and a `confident` picture are never overridden.
2. The model may remove anything it is asked about (text or vision).
3. The model may show only a `rescuable` picture, and only on a vision "fine". Text alone never rescues a picture.
4. No answer within `timeoutMs` (3 s), an error, an "unsure", or the flag off: the device's own call stands.

Hard limits in the code that no config, the panel or the tuner can pass: caps never above explicit 0.8, sexy 0.8, combined 0.9, revealing 0.85; `removeMin` never under 0.5; `rescueMin` never under 0.8.

## How a page uses it

Load `second-opinion.js` after `rules.js` (manifest content scripts; the iPhone apps' script list). Then, per page batch:

```js
const SO = globalThis.SecondOpinion;
if (SO && SO.on()) {
  // units: what the page is about to decide. scores = the picture judges' scores (or null); image = a data: URL of
  // the picture as the judge saw it (only sent when SO.worth(unit).image), or imageUrl for a YouTube thumbnail.
  const verdicts = await SO.ask(units.map((u) => ({ id: u.key, site: location.hostname, surface: 'tile', url: u.href,
    onDevice: u.removed ? 'remove' : 'show', textRule: u.byText, scores: u.scores, image: u.dataUrl,
    text: { title, channel, account, caption, description, bio, hashtags, comments } })));
  for (const u of units) {
    const d = SO.decide({ onDevice: u.removed ? 'remove' : 'show', textRule: u.byText, scores: u.scores, verdict: verdicts && verdicts[u.key] });
    if (d.final === 'remove') blank(u); else if (u.removed && d.final === 'show') unblank(u);
  }
}
```

- `SO.ask` resolves to `{[id]: verdict}` or `null`; it never throws and never waits past `timeoutMs`.
- A `near` picture is held (as unjudged) while the answer comes when `holdNear` is true; a `clear` unit is shown at once and taken off if the answer says remove (text verdicts come back in well under a second).
- `SO.worth(unit)` says whether a unit is worth sending and whether its picture goes; `SO.ask` strips the picture of a unit that does not need it.
- Comments: send what the page already shows (YouTube's comments section, Instagram's post comments), up to `text.maxComments`.

## The transport (the page never reaches the network)

- **Laptop**: `IGFilterBridge.secondOpinion(req)` in `bridge-chrome.js` sends `{wf: 'second', req}` to the service worker; `second-opinion-bg.js` (held laptop-filter `src/`, already written) posts to the mini PC and answers. Three lines for 1.6.5:
  - `background.js`, after the filter log section: `importScripts('second-opinion-bg.js');`
  - `bridge-chrome.js`, in `IGFilterBridge`: `secondOpinion: (req) => new Promise((resolve) => { try { chrome.runtime.sendMessage({ wf: 'second', req }, (r) => { void chrome.runtime.lastError; resolve(r || null); }); } catch { resolve(null); } }),`
  - `manifest.json` content scripts: `second-opinion.js` after `rules.js`; `build.mjs` copies it from `filter/shared`.
- **iPhone**: `bridge-ios.js` (`op: 'second'`), `ios/Browser/Filter/SecondOpinion.swift`, and the `case "second"` in `InstagramFilter.Bridge` (all on this branch). To check on the device: that URLSession reaches `http://100.92.203.47:4500` (an IP literal on the tailnet; App Transport Security does not apply to a numeric address, but confirm), and add `second-opinion.js` to the scripts the apps inject.

## The endpoint (devices repo, `src/secondopinion.mjs`)

`POST http://100.92.203.47:4500/api/filter-review` (the mini PC and the tailnet only; the devices' log key `X-Filter-Log-Key` is optional and marks the request as keyed in the log)

```json
{ "device": "Laptop", "app": "laptop-extension", "version": "1.6.5", "timeoutMs": 3000,
  "items": [ { "id": "t1", "site": "youtube.com", "surface": "tile", "url": "https://www.youtube.com/watch?v=...",
               "onDevice": "show", "textRule": false, "scores": { "Porn": 0.1, "Sexy": 0.0, "Revealing": 0.02 },
               "image": "data:image/jpeg;base64,...", "imageUrl": "https://i.ytimg.com/vi/.../hqdefault.jpg",
               "text": { "title": "...", "channel": "...", "description": "...", "comments": ["..."] } } ] }
```

Answer: `{ ok, model, ms, verdicts: [ { id, verdict: "remove"|"fine"|"unsure"|"timeout"|"error", confidence, reason, by: "text"|"vision"|"none", ms, advice: { final, why, zone } } ] }`. `advice` is the server's own `decide()` with the signed config's settings; the device applies its own. Up to 40 items; a picture up to 400 KB; `imageUrl` only from i.ytimg.com, cdninstagram.com and fbcdn.net. `GET /api/filter-review/health` says whether the model is up.

Privacy: pictures are held in memory for the one request and never written. The filter log gets one line per unit (action `judge`, `second: {verdict, by, conf, onDevice, final, zone, ms}`, the scores, the site and path), kept 28 days like the rest of the log; never the text, the model's reason or the picture. The tuner's word counts are sums per day, with no address or sentence beside them.

## The nightly tuner (devices repo, `src/tuner.mjs`, task "Filter Second Opinion Tuner", 3:40 AM)

Reads the day's verdicts. Publishes a signed config change only when it lets less through and passes the test: every known-bad picture (the measured set, with the model's own verdicts) and text still removed, every fine one (Fender and NASA among them) still shown. That is new words for the hand-curated text rules (`textRules`, id `second-opinion-terms`) and `removeMin` down a step. A change that would let more through (a line or a rescue cap raised) is never published by the tuner, even when it passes: it is written in the night's note with its numbers, because the admin panel takes such a change only with Joe's words (locked memory entry 39). Each run is a line in the panel's history.

## Turning it on

1. The page scripts call it as above (1.6.5 and the next iPhone build).
2. On the device, with the flag on for one site: the fine set shows, the known-bad set stays removed, a page with the mini PC off behaves as before.
3. Then `secondOpinion.on: true` in the signed config (the admin panel, Laptop filter config, then Publish config; no store review). For the iPhone, `filter-config.js` with the next build.
