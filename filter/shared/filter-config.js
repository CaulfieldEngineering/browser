// The Instagram filter's settings, in one place. Read by rules.js and ig-filter.js on every device (the iPhone Browser,
// the Instagram app, the laptop extension) and by the Devices dashboard on the mini PC (read-only), so what the
// dashboard shows is what runs. The object after "= " is JSON. Raising a line or removing anything is
// loosening (locked memory entry 21); the dashboard cannot change it.
globalThis.IGFilterConfig = {
  "version": 3,
  "suggestive": { "explicit": 0.3, "sexy": 0.45, "combined": 0.6 },
  "revealing": 0.6,
  "smallPx": 120,
  "searchAvatarPx": 44,
  "retrySeconds": [5, 20, 60],
  "lateRetrySeconds": 120,
  "frameEverySeconds": 2,
  "judgeLanes": 2,
  "judgeInFlight": 4,
  "calm": { "_what": "How held pictures look and judged ones come in (Joe, 2026-11-15: 'Its infuriatingly glitchy and is gonna give me epilepsy'). None of these can show anything: a held picture is invisible whatever they say. On the laptop the signed rules data's tuning overrides them.", "holdShade": 0.12, "revealFadeMs": 140, "revealFadesPerSecond": 4, "motionOff": 0 },
  "work": {
    "_what": "Joe's work tools (Joe, 2026-11-16: 'Yeah we need to make sure that our filters do not interfere with work'). Checked first, by address, on every device. On a work surface the filter takes off nothing but a picture or video it judged suggestive, and only that picture (never the card, panel or post around it); no ad, suggestion, rail, feed or page rule and no redirect runs there. Pictures are judged by the same judges at the same lines as everywhere, and one not yet judged stays hidden. A post by one of 'pages' (his own Page) is never taken as an ad or a suggestion anywhere, so his ad and its comments show; its pictures are still judged. A scope is a host suffix, or a host suffix with a path prefix (a whole path segment), or '*' with a path. The personal feeds can never be one: facebook.com, instagram.com and messenger.com need a path, and no feed, Reels, Explore, Stories, search, messages or home path is taken (rules.js). Adding a scope here or by the signed rules data is tuning (locked memory entry 39); it never changes a line.",
    "surfaces": [
      "adsmanager.facebook.com", "business.facebook.com", "developers.facebook.com",
      "facebook.com/adsmanager", "facebook.com/ads/manager", "facebook.com/ad_center", "facebook.com/latest",
      "facebook.com/professional_dashboard", "facebook.com/billing_hub", "facebook.com/business", "facebook.com/business-support-home",
      "facebook.com/events_manager", "facebook.com/events_manager2", "facebook.com/commerce_manager", "facebook.com/accountquality",
      "facebook.com/pages/creation", "facebook.com/wonderlandaudiofx",
      "instagram.com/wonderlandaudio", "instagram.com/accounts/insights", "instagram.com/accounts/professional_dashboard", "instagram.com/professional_dashboard",
      "studio.youtube.com", "ads.google.com", "analytics.google.com", "tagmanager.google.com", "business.google.com", "search.google.com/search-console",
      "wordpress.com/home", "wordpress.com/sites", "wordpress.com/posts", "wordpress.com/pages", "wordpress.com/media", "wordpress.com/stats", "wordpress.com/plugins", "wordpress.com/settings", "wordpress.com/domains",
      "*/wp-admin"
    ],
    "pages": ["Wonderland Audio"]
  },
  "secondOpinion": {"_what": "The second opinion on the iPhone apps (docs/second-opinion.md; the laptop reads the signed config's block). OFF until tested on the device.", "on": false, "sites": ["instagram.com", "youtube.com"], "endpoint": "http://100.92.203.47:4500/api/filter-review", "timeoutMs": 3000, "batch": 16, "text": {"youtube": true, "instagram": true, "comments": true, "maxComments": 8}, "band": {"below": {"explicit": 0.1, "sexy": 0.1, "combined": 0.1, "revealing": 0.15}, "above": {"explicit": 0.4, "sexy": 0.25, "combined": 0.2, "revealing": 0.15}, "quiet": {"explicit": 0.2, "sexy": 0.2, "revealing": 0.3}}, "removeMin": 0.6, "rescueMin": 0.85, "rescue": false, "holdNear": true, "audit": 0.05},
  "labels": "none",
  "explore": "removed",
  "search": "the search field and a plain list of accounts and hashtags, with small avatars (judged)",
  "suggestions": "removed everywhere: the desktop sidebar, the See all page (goes to the Following feed), carousels in the feed, on profiles and on the activity page, Similar accounts (2026-11-15)",
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
    "kept": ["profiles", "Messages", "Notifications", "Groups", "Pages", "Events", "Marketplace listings", "search", "posting"],
    "videoTabsGoTo": "/notifications/",
    "tightened 2026-11-13": ["the Video and Reels tabs (/watch, /reels, /reel with no reel named) go to Notifications; a reel or video someone shared still opens", "a post whose author's name carries an adult term goes; a profile, Page or group whose name or intro does keeps only its name", "a picture from outside Facebook's own picture hosts cannot be judged on the phone, so it is not shown", "what the page's scripts did (home sent to Notifications) goes to the mini PC as js: lines, like Instagram's"]
  },
  "reddit": {
    "_what": "The Reddit app (target Reddit; Joe, 2026-11-12: 'start building a version of Facebook and one of Reddit that have similar filtering features', then 'For Reddit, no images allowed. And text-context filtering.'). BUILT, NOT OPEN: Reddit stays blocked everywhere (locked memory entry 4) and this app opens nothing until a Sunday review says so. 'open' here and RedditRules.builtOpen in the app must both be true; setting either is loosening (locked memory entry 1).",
    "open": false,
    "front": "old.reddit.com",
    "media": "none: no images, video, GIFs, thumbnails, avatars or link previews; refused on the network inside the app and taken out of the page",
    "mediaHosts": ["i.redd.it", "preview.redd.it", "external-preview.redd.it", "thumbs.redditmedia.com", "v.redd.it", "packaged-media.redd.it", "imgur.com", "gfycat.com", "tenor.com", "streamable.com", "redgifs.com", "redd.it", "redditmedia.com", "giphy.com", "imgflip.com", "gyazo.com", "ibb.co", "postimg.cc", "imgchest.com", "catbox.moe", "erome.com", "youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com", "twitch.tv", "tiktok.com", "redditstatic.com/avatars", "styles.redditmedia.com", "emoji.redditmedia.com", "reddit-uploaded-media.s3-accelerate.amazonaws.com"],
    "feedsOff": ["all", "popular", "random", "randnsfw", "friends", "mod", "best", "home"],
    "pagesOff": ["over18", "quarantine", "gallery", "media", "poll", "premium", "coins", "avatar", "chat", "rpan", "notifications/nsfw"],
    "allowList": { "on": true, "subreddits": [] },
    "removed": ["posts and comments marked NSFW (18+)", "quarantined subreddits and posts", "promoted posts", "subreddits whose name or description carries an adult or suggestive term", "posts and comments whose text does (title, body, flair, subreddit, author)", "everything outside the allow-list", "r/all, r/popular, random, the logged-out front page", "every picture, video, GIF, thumbnail, avatar and link preview"],
    "subredditPatterns": ["nsfw", "gonewild", "gone_?wild", "porn", "p0rn", "pr0n", "hentai", "rule_?34", "nude", "naked", "^sex", "sex$", "sexy", "sexual", "sexting", "xxx", "boob", "tits", "titty", "busty", "cleavage", "booty", "butts?$", "^ass$", "asses$", "(big|nice|fat|hot|phat)_?ass", "pawg", "thicc", "curvy", "milf", "legalteens", "barelylegal", "jailbait", "slut", "whore", "hotwife", "cuck", "r4r", "hookup", "kink", "fetish", "bdsm", "bondage", "onlyfans", "fansly", "camgirl", "camwhore", "lingerie", "bikini", "yogapants", "leggings", "upskirt", "voyeur", "creepshot", "celebnsfw", "celebs$", "celebfakes", "^fap", "jerk_?off", "^cum", "cum(sluts?|shots?)", "horny", "lewd", "ecchi", "waifu", "cosplay(girls|babes|butts)", "girls", "babes", "hotties", "wives", "thirst", "erotic", "smut", "futa", "yiff", "rate_?me", "amiugly", "amihot"],
    "terms": {
      "_what": "Text-context rules for Reddit, beside the shared suggestive, revealing-clothing and account words (rules.js). Whole words, any case. Shown on the dashboard as counts, never the words.",
      "sexual": ["sex", "sexual", "sexually", "sext", "sexting", "nudes", "nude", "naked", "porn", "porno", "pornography", "nsfw", "nsfl", "horny", "aroused", "arousal", "orgasm", "orgasms", "masturbate", "masturbating", "masturbation", "jerk off", "jerking off", "jerked off", "fap", "fapping", "blowjob", "bj", "handjob", "anal", "cum", "cumming", "cumshot", "creampie", "boobs", "boob", "tits", "titties", "nipples", "pussy", "cock", "dick pic", "dick pics", "penis", "vagina", "clit", "erection", "boner", "threesome", "foursome", "orgy", "gangbang", "milf", "dilf", "fetish", "kink", "kinky", "bdsm", "bondage", "dominatrix", "femdom", "findom", "escorts", "hooker", "prostitute", "camgirl", "cam girl", "strip club", "lap dance", "hentai", "rule34", "rule 34", "gonewild", "r4r", "hookup", "hook up", "hookups", "fwb", "friends with benefits", "one night stand", "sugar daddy", "sugar baby", "onlyfans", "fansly", "upskirt", "downblouse", "voyeur", "creepshot", "thirst trap", "slut", "slutty", "whore", "hotwife", "cuckold", "swingers"],
      "come-ons": ["pics in profile", "link in profile", "pm me for pics", "kik me", "snap me", "add my snap", "my snapchat", "telegram me", "selling content", "selling pics", "f4m", "m4f", "f4f", "m4m", "f4a", "m4a", "t4m"]
    }
  },
  "judges": [
    { "name": "Suggestive and explicit", "how": "nsfwjs (MobileNetV2) on the device", "line": "suggestive" },
    { "name": "Revealing clothing", "how": "TinyCLIP-ViT-40M-32 zero-shot, on the device, any person", "line": "revealing" },
    { "name": "Captions and hashtags", "how": "word lists (suggestive, revealing clothing)", "line": null }
  ]
};
