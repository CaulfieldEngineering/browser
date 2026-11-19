// The words Joe named on 2026-11-19, in the shared rule code every place runs (the iPhone apps and the laptop):
// "let's completely block the word latex, perhaps ignoring anything as LaTeX"; "anything "goddess" "joi" "femdom"
// "domme" "mistress""; and, for YouTube, "or just do better at filtering. it's close though" over two results that
// still showed (a rubber doll photoshoot by a channel named Latexographer, a gas mask and latex gear review).
//   node filter/test/named-words.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const shared = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared');
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n} ${ok ? '' : x}`); if (!ok) failed++; };
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['filter-config.js', 'rules.js', 'youtube-filter.js']) vm.runInContext(fs.readFileSync(path.join(shared, f), 'utf8'), ctx, { filename: f });
const R = ctx.IGFilterRules, Y = ctx.YouTubeRules, T = Y.compile(Y.DEFAULTS.terms);
const post = (s) => R.first('text', s), name = (s) => R.namedWord(String(s).replace(/[._]+/g, ' ')), yt = (s) => Y.sexualText(s, T);

const GONE = ['latex model', '#LATEX', '#latexmodel', 'latexfashion', 'my Latex outfit', 'LATEX tutorial', 'laTeX', 'goddess', 'goddessxyz', '#goddess', 'Greek goddess Athena: a mythology lecture',
  'JOI', '#joi', 'joi_anna', 'femdom', 'femdomqueen', 'Domme life', 'mistress', 'mistress.anna', 'the headmistress'];
const SHOWN = ['LaTeX tutorial', 'learn LaTeX in 30 minutes', 'LaTeX vs Word for your thesis', 'Joie de vivre', 'Joint venture explained', 'enjoin the parties', 'new fuzz pedal on the bench', 'dome tweeter', 'mister softee'];
for (const s of GONE) { check(`a post or caption is removed: ${s}`, !!post(s)); check(`an account name or bio is flagged: ${s}`, name(s)); check(`YouTube removes: ${s}`, !!yt(s)); }
for (const s of SHOWN) { check(`a post or caption is shown: ${s}`, !post(s), String(post(s))); check(`an account name or bio is not flagged: ${s}`, !name(s)); check(`YouTube shows: ${s}`, !yt(s), String(yt(s))); }

// YouTube: the two results of his screenshot (title, channel, snippet as a tile's text), the wider vocabulary, and what stays.
const YT_GONE = ['Bee The Rubber Doll Photoshoot Behind The Scenes 3 Latexographer 12K views', 'Bee The Rubber Doll Photoshoot Behind The Scenes 3', 'Some shoot behind the scenes Latexographer 3 weeks ago',
  'GAS MASK and LATEX concise gear review of SafeGuardian respirator #gasmask #cyberpunk #cyber Unbound Bruja', 'Gear talk Unbound Bruja SHINY WORLD SESSIONS Looking to support this shiny channel?',
  'How to make a latex dress: SFX tutorial', 'Latex gloves review', 'rubberist meetup', 'rubberdoll transformation', 'PVC catsuit try on', 'gimp suit unboxing', 'total rubber enclosure', 'dominatrix explains', 'fetishwear haul'];
const YT_SHOWN = ['3M 6200 respirator review: fit test and filters', 'Rubber band gun build', 'Restoring a vintage doll', 'Doll house toys for kids', 'Glossy car paint correction: shiny finish in one step',
  'GIMP tutorial: remove a background', 'Full enclosure for the Ender 3', 'Shiny Charizard hunt', 'PVC pipe shelf', 'Overleaf and LaTeX: tables', 'Joist hangers', 'ASMR tapping and scratching for sleep'];
for (const s of YT_GONE) check(`YouTube removes: ${s}`, !!yt(s));
for (const s of YT_SHOWN) check(`YouTube shows: ${s}`, !yt(s), String(yt(s)));
check('the kinds the dashboard counts include the named words', R.accountKinds().includes('words he named'));
console.log(failed ? `${failed} FAILED` : 'all passed'); process.exit(failed ? 1 : 0);
