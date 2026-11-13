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
  "frameEverySeconds": 2,
  "judgeLanes": 2,
  "judgeInFlight": 4,
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
