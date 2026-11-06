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
  "accounts": {
    "_what": "Names, bios and captions that mark an adult or suggestive account (Joe, 2026-11-05: 'let's also do like a textual search. In like profile names or bios', 'And captions'). Names and bios also check the suggestive words and the revealing-clothing tags. The Devices dashboard shows the kinds as counts, never the words.",
    "kinds": {
      "adult platforms": ["onlyfans", "only fans", "fansly", "fanvue", "manyvids", "loyalfans", "fancentro", "justforfans", "fansone", "unlockd"],
      "18+ markers": ["18+", "🔞", "nsfw", "xxx", "adults only", "not for minors", "no minors"],
      "come-ons": ["exclusive content", "spicy content", "spicy link", "my spicy", "uncensored", "custom content", "selling content", "content in bio", "link in bio for my content", "link for my content", "dm for prices", "dm for customs", "menu in bio", "🌶️ link", "🍑 link", "sugar daddy", "sugar baby", "sugarbaby", "cam girl", "camgirl", "webcam model"],
      "names and bios only": ["spicy", "🌶️", "naughty", "thirst", "lewd"]
    },
    "patterns": {
      "OF with a link": "\\bOF\\b.{0,24}(link|below|bio|🔗|👇|⬇)",
      "DM for collab, as a model": "(dm|message) (me )?(for|4) (collab|collabs|promo).{0,40}model|model.{0,40}(dm|message) (me )?(for|4) (collab|collabs|promo)"
    }
  },
  "facebook": {
    "homeGoesTo": "/notifications/",
    "hidden": ["the News Feed (home goes to Notifications)", "sponsored posts, Reels, listings and right-rail ads", "Suggested for you, Suggested groups and pages, People you may know", "the Stories and Reels rails", "prompts to open the app"],
    "kept": ["profiles", "Messages", "Notifications", "Groups", "Pages", "Events", "Marketplace listings", "search", "posting"]
  },
  "judges": [
    { "name": "Suggestive and explicit", "how": "nsfwjs (MobileNetV2) on the device", "line": "suggestive" },
    { "name": "Revealing clothing", "how": "TinyCLIP-ViT-40M-32 zero-shot, on the device, any person", "line": "revealing" },
    { "name": "Captions and hashtags", "how": "word lists (suggestive, revealing clothing)", "line": null }
  ]
};
