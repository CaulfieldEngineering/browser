// Scores only: exercise the shared rules without a browser or a second copy of their thresholds.
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ URL });
for (const file of ['filter-config.js', 'rules.js']) {
  vm.runInContext(fs.readFileSync(new URL(`../shared/${file}`, import.meta.url), 'utf8'), context, { filename: file });
}
const rules = context.IGFilterRules;
const load = (name) => JSON.parse(fs.readFileSync(new URL(`fixtures/pictures/${name}.json`, import.meta.url), 'utf8')).pictures;
const imageRule = (scores) => rules.first('image', scores);
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
}
const bad = load('bad'), fine = load('fine');
check('image rules available', ['suggestive-image', 'revealing-image'].every((id) => rules.rules.some((r) => r.id === id && r.kind === 'image')));
check('bad fixtures present', bad.length > 0);
check('fine fixtures present', fine.length > 0);
let flagged = 0, shown = 0, beforeFlagged = 0;
for (const picture of bad) {
  const rule = imageRule(picture.scores), ok = ['suggestive-image', 'revealing-image'].includes(rule);
  if (ok) flagged++;
  check(`bad ${picture.id}`, ok, rule || 'no image rule');
}
for (const picture of fine) {
  const rule = imageRule(picture.scores);
  if (!rule) shown++;
  check(`fine ${picture.id}`, !rule, rule || 'shown');
  if (picture.before) {
    const before = imageRule(picture.before), ok = ['suggestive-image', 'revealing-image'].includes(before);
    if (ok) beforeFlagged++;
    check(`before ${picture.id}`, ok, before || 'no image rule');
  }
}
console.log(`bad: ${flagged} of ${bad.length} flagged`);
console.log(`fine: ${shown} of ${fine.length} shown`);
console.log(`before: ${beforeFlagged} of ${fine.filter((p) => p.before).length} flagged`);
console.log(`${failed} failed`);
process.exitCode = failed ? 1 : 0;
