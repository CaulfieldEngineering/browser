// Scores a folder of pictures with the filter's real judges (classifier.html: nsfwjs and TinyCLIP), as the devices do.
//   node filter/test/tools/score-pictures.mjs <folder> [label]  >  scores.json
// Prints [{ file, label, scores: { Drawing, Hentai, Neutral, Porn, Sexy, Revealing } }]. The pictures stay where they
// are: only the numbers are kept (filter/test/fixtures/pictures/*.json), so no picture is ever in the repo.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const pw = require('playwright');
const [dir, label = ''] = process.argv.slice(2);
if (!dir) { console.error('usage: node score-pictures.mjs <folder> [label]'); process.exit(2); }
const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', wasm: 'application/wasm', onnx: 'application/octet-stream', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.route('https://classifier.test/**', (r) => {
  const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, '');
  const f = rel.startsWith('eval/') ? path.join(dir, path.basename(rel)) : path.join(shared, rel);
  if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ contentType: types[f.split('.').pop().toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await page.goto('https://classifier.test/classifier.html');
const out = [];
for (const file of files) {
  const scores = await page.evaluate(async (name) => {
    const blob = await (await fetch('/eval/' + encodeURIComponent(name))).blob();
    const bmp = await createImageBitmap(blob);
    // as the devices send it: made small first (the longer side 448)
    const k = Math.min(1, 448 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    try { return await IGClassifier.classify(c.toDataURL('image/jpeg', 0.85)); } catch (e) { return { _error: String(e) }; }
  }, file);
  out.push({ file, label, scores });
  process.stderr.write('.');
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
