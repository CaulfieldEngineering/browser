// The Instagram filter's settings, in one place. Read by rules.js and ig-filter.js on every device (the iPhone Browser,
// the Instagram app, the laptop extension) and by the Devices dashboard on the mini PC (read-only), so what the
// dashboard shows is what runs. The object after "= " is JSON. Raising a line or removing anything is
// loosening (locked memory entry 21); the dashboard cannot change it.
globalThis.IGFilterConfig = {
  "version": 2,
  "suggestive": { "explicit": 0.3, "sexy": 0.45, "combined": 0.6 },
  "revealing": 0.6,
  "smallPx": 120,
  "searchAvatarPx": 44,
  "retrySeconds": [5, 20, 60],
  "frameEverySeconds": 2,
  "labels": "none",
  "explore": "removed",
  "search": "the search field and a plain list of accounts and hashtags, with small avatars (judged)",
  "surfaces": ["feed", "post pages", "profile grids (posts, reels, tagged)", "Explore and search (grids removed)", "the reel viewer", "stories", "messages"],
  "judges": [
    { "name": "Suggestive and explicit", "how": "nsfwjs (MobileNetV2) on the device", "line": "suggestive" },
    { "name": "Revealing clothing", "how": "TinyCLIP-ViT-40M-32 zero-shot, on the device, any person", "line": "revealing" },
    { "name": "Captions and hashtags", "how": "word lists (suggestive, revealing clothing)", "line": null }
  ]
};
