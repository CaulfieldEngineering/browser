// node filter/test/ig-surfaces.test.mjs [fixture-name-substring]
// ENGINE=webkit selects WebKit. Fixtures and all CDN requests are fulfilled locally.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { shapes } from './fixtures/instagram/shapes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures', 'instagram');
const shared = path.join(here, '..', 'shared');
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Joe/Documents/GitHub/blocks/package.json');
const engine = process.env.ENGINE || 'chromium';
const source = (file) => fs.readFileSync(path.join(shared, file), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fakeBridge = `(() => {
  globalThis.__igFilterRetry = [150, 300, 450];
  globalThis.__igFilterLate = 600;
  const clean = () => ({ Neutral: .97, Sexy: .01, Porn: 0, Hentai: 0, Drawing: .02, Revealing: .02 });
  const tries = new Map();
  const stats = globalThis.__stats = {};
  globalThis.IGFilterBridge = {
    calls: [], stats, diags: [], reports: [],
    stat(name) { stats[name] = (stats[name] || 0) + 1; },
    diag(name, numbers) { this.diags.push([name, numbers]); },
    classifyUrl(url) {
      this.calls.push(url);
      const name = new URL(url, location.href).pathname.split('/').pop();
      const n = (tries.get(name) || 0) + 1; tries.set(name, n);
      return new Promise((resolve) => setTimeout(() => resolve(
        /fail/.test(name) ? { _error: 'unreadable' } :
        /late/.test(name) && n === 1 ? { _error: 'loading' } :
        /flag/.test(name) ? { Sexy: .8, Neutral: .2, Porn: 0, Hentai: 0, Drawing: 0, Revealing: .1 } : clean()
      ), 30));
    },
    classifyData() { return Promise.resolve(clean()); },
    classifyRect() { return Promise.resolve(clean()); },
    warm() {}, width() { return Promise.resolve(2); },
    report(record) { this.reports.push(record); },
    byHand() { return Promise.resolve([]); }, seenOn() { return Promise.resolve(false); }
  };
})();`;
// One init script guarantees ordering; separate addInitScript calls have unspecified order.
const filterScripts = [source('filter-config.js'), source('rules.js'), fakeBridge, ...['ig-core.js', 'ig-filter.js', 'ig-tidy.js', 'hide-rules.js', 'hide-engine.js'].map(source)].join('\n;\n');
const fixtures = {};
for (const file of fs.readdirSync(fixturesDir).filter((f) => /^real-.*\.html$/.test(f)).sort()) {
  let html = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
  const match = html.split('\n')[0].match(/instagram skeleton:\s+(\S+)\s+(\S+)\s+(\d+)x(\d+)/);
  if (!match) throw new Error(`Missing skeleton metadata: ${file}`);
  let route = match[2].replace(/\{user\}/g, 'user1').replace(/\{id\}/g, 'ID1').replace(/\{x\}/g, 'x');
  // This capture predates accurate route metadata for profile tabs.
  if (/profile-reels/.test(file) && !route.includes('/reels/')) route = '/user1/reels/';
  // Two grid tiles are flagged: the last picture and the fourth from last (the first pictures of a page are the avatar
  // and highlight covers, which are under 120 px and so not judged anywhere but the search page).
  const lastPic = Math.max(0, ...[...html.matchAll(/\/plain-(\d+)\.jpg/g)].map((m) => +m[1]));
  html = html.replace(/(\bsrc="[^"]*\/)plain-(\d+)(\.jpg(?:\?[^" ]*)?")/g, (all, a, n, z) => (+n === lastPic || +n === lastPic - 3 ? `${a}flag-${n}${z}` : all));
  fixtures[file.replace(/\.html$/, '')] = { path: route, width: +match[3], height: +match[4], html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">${html}</body></html>` };
}
Object.assign(fixtures, shapes);

let checks = 0, failed = 0, current = '';
const failures = new Map();
function check(name, ok, detail = '') {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} ${current}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) { failed++; if (!failures.has(current)) failures.set(current, []); failures.get(current).push(name); }
}

// Read-only DOM helpers: no IDs, attributes, styles, or nodes are added by the harness.
function installInspector() {
  const marker = '[data-igx], [data-igt], [data-fhr], [data-igf-gone]';
  const postLink = 'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]';
  const creation = (el) => el.closest('[role="dialog"]')?.matches('[aria-label="Create new post"]') || !!el.closest('[role="dialog"]')?.querySelector('input[type="file"]');
  const suggestion = (el) => el.closest('[id^="sugg"], [id^="card"], [id^="nsugg"]');
  const pathOf = (el) => {
    const out = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) out.unshift([...e.parentElement.children].indexOf(e));
    return out.join('/');
  };
  const atPath = (key) => key.split('/').reduce((e, i) => e?.children[+i], document.body);
  const rect = (el) => { const r = el.getBoundingClientRect(); return ['x', 'y', 'width', 'height'].map((k) => Math.round(r[k] * 2) / 2); };
  const eye = (el) => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility !== 'visible' || +s.opacity === 0) return false;
    }
    // The existing avatar rule keeps the circle but moves the image far outside it.
    if (el.tagName === 'IMG' && getComputedStyle(el).objectPosition.split(/\s+/).some((x) => /px$/.test(x) && Math.abs(parseFloat(x)) > 10000)) return false;
    return true;
  };
  const hidden = (el) => !!el && (!eye(el) || !!el.closest(marker));
  const contentHidden = (el) => !!el && (!eye(el) || (el.querySelector('img') && [...el.querySelectorAll('img')].every((p) => !eye(p))));
  const control = (el) => {
    if (!el) return { ok: false, reason: 'missing' };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const ok = eye(el) && getComputedStyle(el).visibility === 'visible' && !el.closest(marker) && !!hit && (hit === el || el.contains(hit));
    return { ok, reason: ok ? '' : `${el.id}: visibility=${getComputedStyle(el).visibility}, blank=${el.closest(marker)?.tagName || 'none'}, hit=${hit?.id || hit?.tagName || 'none'}` };
  };
  const exceptLayout = (el) => {
    if (/^\/explore(?:\/|$)/.test(location.pathname)) return true;
    // The navigation is the one written exception (docs/instagram-filter-design.md): the Reels tab's slot goes and, on a
    // wide screen, the Explore link, and the other tabs share the room. Nothing outside it may move.
    return !!el.closest('nav, [role="navigation"], [data-igt-nav]');
  };
  function snapshot() {
    const imageCounts = new Map();
    return {
      height: document.scrollingElement.scrollHeight,
      nodes: [...document.body.querySelectorAll('*')].map((el) => {
        const cs = getComputedStyle(el);
        const record = { path: pathOf(el), tag: el.tagName, id: el.id, rect: rect(el), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, eye: eye(el), exception: exceptLayout(el), create: !!creation(el) };
        if (el.tagName === 'IMG') {
          record.src = el.getAttribute('src'); record.occurrence = imageCounts.get(record.src) || 0;
          imageCounts.set(record.src, record.occurrence + 1);
          record.name = record.src.split('/').pop().split('?')[0];
          record.suggestion = !!suggestion(el);
          const unit = el.closest('article') || el.closest(postLink);
          record.mixed = !!unit && [...unit.querySelectorAll('img')].some((p) => /\/(?:flag|fail)-[^/]+$/.test(p.src));
          record.caption = !!el.closest('article')?.textContent.includes('#bikini');
        }
        return record;
      })
    };
  }
  function inspect(baseline, name) {
    const results = [], emit = (label, ok, detail = '') => results.push([label, !!ok, detail]);
    const now = snapshot(), byPath = new Map(now.nodes.map((n) => [n.path, n]));
    const differences = [], collapsed = [];
    for (const before of baseline.nodes.filter((n) => !n.exception)) {
      const after = byPath.get(before.path), label = `${before.path} ${before.tag}${before.id ? '#' + before.id : ''}`;
      if (!after || before.tag !== after.tag || before.id !== after.id || before.src !== after.src || before.rect.some((v, i) => Math.abs(v - after.rect[i]) > 1)) differences.push(`${label}: ${JSON.stringify(before.rect)} -> ${after ? after.tag + (after.id ? '#' + after.id : '') + ' ' + JSON.stringify(after.rect) : 'missing'}`);
      if (before.display !== 'none' && (!after || after.display === 'none')) collapsed.push(label);
    }
    emit('layout intact', differences.length === 0, differences.slice(0, 5).join('; '));
    emit('nothing collapsed', collapsed.length === 0, collapsed.slice(0, 5).join('; '));
    const explore = /^\/explore(?:\/|$)/.test(location.pathname);
    if (!explore) emit('scrollHeight unchanged', Math.abs(baseline.height - now.height) <= 2, `${baseline.height} -> ${now.height}`);

    for (const before of baseline.nodes.filter((n) => /^(ctl-|nav-)/.test(n.id))) {
      if (before.id === 'nav-reels' || before.id === 'nav-explore' && innerWidth >= 768) continue;
      const el = document.getElementById(before.id), article = el?.closest('article');
      // A post removed for what it shows or says is removed whole, its own bar of actions with it (the design's content
      // rule): only posts 4 (a flagged picture) and 5 (a caption tag), and only while their pictures are in fact hidden.
      if (article && ['post4', 'post5'].includes(article.id) && contentHidden(article)) {
        emit('control ' + before.id, true, 'content-hidden post exception'); continue;
      }
      const result = control(el); emit(`control ${before.id}`, result.ok, result.reason);
    }
    for (const before of baseline.nodes.filter((n) => /^(sugg|card|nsugg)/.test(n.id) || ['feed-sugg-head', 'notif-sugg-head', 'similar-btn'].includes(n.id))) {
      const el = document.getElementById(before.id);
      emit(`suggestions hidden ${before.id}`, !!el && (getComputedStyle(el).visibility === 'hidden' || !!el.closest('[data-igx]')));
    }
    for (const before of baseline.nodes.filter((n) => /^(follower|newfollower)/.test(n.id))) {
      const el = document.getElementById(before.id); emit(`legit row ${before.id}`, eye(el) && !el.closest(marker));
    }
    const images = [...document.querySelectorAll('img')];
    for (const before of baseline.nodes.filter((n) => n.tag === 'IMG')) {
      const img = images.filter((el) => el.getAttribute('src') === before.src)[before.occurrence];
      const label = before.name + (before.occurrence ? `#${before.occurrence}` : '');
      emit(`picture exists ${label}`, !!img);
      if (!img) continue;
      // Surface rules outrank general image checks: creation previews stay visible;
      // suggestion pictures disappear with their row; a hidden post covers its bad image.
      if (before.create) { emit(`creation picture visible ${label}`, eye(img)); continue; }
      if (before.suggestion) { emit(`suggestion picture hidden ${label}`, !eye(img)); continue; }
      // A picture shown smaller than 120 px (an avatar, a notification's thumbnail) is not judged, except on the search
      // page (filter-config.js smallPx; README "Surfaces"): asserted only where the filter claims it.
      const br = img.getBoundingClientRect();
      const small = Math.max(br.width, br.height) < 120 && !explore;
      if (/^(flag|fail)-/.test(before.name) && small) {
        emit(`small picture left alone ${label}`, true);
      } else if (/^(flag|fail)-/.test(before.name)) {
        emit(`flagged picture hidden ${label}`, !eye(img));
      } else if (/^(plain|late)-/.test(before.name) && !explore && !before.mixed && !before.caption && !name.startsWith('profile-flagged@')) {
        emit(`clean picture visible ${label}`, eye(img));
      }
    }
    for (const article of document.querySelectorAll('article')) {
      if (article.textContent.includes('#bikini')) {
        const media = [...article.querySelectorAll('img')].filter((p) => !p.closest('header'));
        emit(`caption post blank ${article.id}`, media.length > 0 && media.every((p) => !eye(p)));
      }
    }
    if (name.startsWith('profile-flagged@')) {
      for (const el of document.querySelectorAll('[id^="tile"], #profile-bio')) emit(`flagged profile blank ${el.id}`, hidden(el));
      emit('flagged profile name visible', eye(document.querySelector('h2')));
      for (const id of ['ctl-follow', 'ctl-message', 'ctl-options']) emit(`flagged profile control ${id}`, control(document.getElementById(id)).ok);
    }
    if (explore) {
      for (const a of document.querySelectorAll(postLink)) emit(`explore tile hidden ${a.id || a.getAttribute('href')}`, hidden(a));
      emit('explore search visible', control(document.querySelector('input[aria-label="Search input"], input[placeholder="Search"]')).ok);
    }
    if (baseline.nodes.some((n) => n.id === 'nav-reels')) emit('reels tab hidden', hidden(document.getElementById('nav-reels')));
    if (baseline.nodes.some((n) => n.id === 'nav-explore') && innerWidth >= 768) emit('wide Explore link hidden', hidden(document.getElementById('nav-explore')));

    const cd = document.querySelector('[role="dialog"][aria-label="Create new post"]');
    if (baseline.nodes.some((n) => n.create)) {
      emit('creation dialog exists', !!cd);
      const touched = cd ? [cd, ...cd.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^data-(igx|igt|fhr|igf)/.test(a.name))) : [];
      emit('creation dialog untouched', !!cd && touched.length === 0, touched.map((el) => el.id || el.tagName).join(', '));
      for (const before of baseline.nodes.filter((n) => n.create)) {
        const el = atPath(before.path), cs = el && getComputedStyle(el);
        emit(`creation visibility ${before.id || before.path}`, !!el && el.tagName === before.tag && cs.display === before.display && cs.visibility === before.visibility && cs.opacity === before.opacity && eye(el) === before.eye);
      }
    }
    if (name.startsWith('direct@')) {
      for (const id of ['ctl-composer', 'ctl-send']) emit(`direct control ${id}`, control(document.getElementById(id)).ok);
      for (const before of baseline.nodes.filter((n) => /^message\d+$/.test(n.id) || /^thread\d+$/.test(n.id))) {
        const el = document.getElementById(before.id);
        if (!el?.querySelector('img[src*="/flag-"]')) emit(`direct row visible ${before.id}`, eye(el) && !el.closest(marker));
      }
    }
    let self;
    try { self = JSON.parse(document.documentElement.getAttribute('data-igx-selftest')); } catch {}
    emit('self-test', !!self && Array.isArray(self.fails) && self.fails.length === 0, self?.fails?.length ? JSON.stringify(self) : !self ? 'missing or invalid JSON' : '');
    return results;
  }
  globalThis.__surfaceHarness = { snapshot, inspect, control };
}


// A broken page script must fail its fixture, not strand the rest of the suite.
async function bounded(operation, label, ms = 30000) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms / 1000 + 's')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
const evaluate = (page, fn, arg) => bounded(page.evaluate(fn, arg), 'Page evaluation');
async function close(resource) {
  try { await bounded(resource.close(), 'Browser cleanup', 10000); }
  catch (error) { check('browser cleanup', false, error.message); }
}

async function open(browser, fixture, scripts = '') {
  const context = await bounded(browser.newContext({ viewport: { width: fixture.width, height: fixture.height }, serviceWorkers: 'block' }), 'New browser context');
  try {
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (/(^|\.)cdninstagram\.com$/.test(url.hostname)) return route.fulfill({ contentType: 'image/png', body: png });
      if (url.hostname === 'www.instagram.com' && route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture.html });
      return route.abort();
    });
    const page = await bounded(context.newPage(), 'New page'), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (scripts) await page.addInitScript({ content: scripts });
    await bounded(page.goto(`https://www.instagram.com${fixture.path}`, { waitUntil: 'load', timeout: 15000 }), 'Page load');
    await evaluate(page, installInspector);
    return { context, page, errors };
  } catch (error) { await close(context); throw error; }
}
async function settle(page) {
  let ready = true, detail = '';
  try { await page.waitForFunction(() => +document.documentElement.getAttribute('data-igf-pass') >= 2 && document.documentElement.hasAttribute('data-igx-selftest'), null, { timeout: 15000 }); }
  catch (error) { ready = false; detail = error.message.split('\n')[0]; }
  check('filter ready', ready, detail);
  await page.waitForTimeout(2500);
  for (const fraction of [.5, 1, .5, 0]) {
    await evaluate(page, (f) => window.scrollTo(0, Math.max(0, document.scrollingElement.scrollHeight - innerHeight) * f), fraction);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2500);
  await evaluate(page, () => window.scrollTo(0, 0));
}
async function runFixture(browser, name, fixture) {
  current = name;
  const startChecks = checks, startFailed = failed;
  let baselinePage, filteredPage;
  try {
    baselinePage = await open(browser, fixture);
    const baseline = await evaluate(baselinePage.page, () => __surfaceHarness.snapshot());
    // Catch unusable fixture controls before attributing failures to the filter.
    const unusable = await evaluate(baselinePage.page, () => [...document.querySelectorAll('[id^="ctl-"], [id^="nav-"]')].map((el) => __surfaceHarness.control(el)).filter((r) => !r.ok));
    check('baseline controls usable', unusable.length === 0, unusable.map((r) => r.reason).join('; '));
    check('baseline page errors', baselinePage.errors.length === 0, baselinePage.errors.join('; '));
    await close(baselinePage.context); baselinePage = null;
    filteredPage = await open(browser, fixture, filterScripts);
    await settle(filteredPage.page);
    const results = await evaluate(filteredPage.page, ({ baseline, name }) => __surfaceHarness.inspect(baseline, name), { baseline, name });
    for (const result of results) check(...result);
    check('filtered page errors', filteredPage.errors.length === 0, filteredPage.errors.join('; '));
  } catch (error) { check('harness completed', false, error.stack || String(error)); }
  finally { if (baselinePage) await close(baselinePage.context); if (filteredPage) await close(filteredPage.context); }
  console.log(`SUMMARY ${name}: ${checks - startChecks} checks, ${failed - startFailed} failed`);
}
async function negative(browser, name) {
  current = `${name} negative`;
  const startChecks = checks, startFailed = failed;
  let opened;
  try {
    opened = await open(browser, shapes[name], source('ig-core.js'));
    if (name.startsWith('feed-')) {
      const result = await evaluate(opened.page, () => IGCore.selftest());
      check('self-test detects visible suggestions', result?.fails.some((f) => f.startsWith('sugg-visible')), JSON.stringify(result));
    } else {
      const result = await evaluate(opened.page, () => {
        const r = document.getElementById('ctl-follow').parentElement;
        r.style.display = 'none'; r.setAttribute('data-fhr', '');
        return IGCore.selftest();
      });
      check('self-test detects hidden control', result?.fails.some((f) => f.startsWith('control-hidden')), JSON.stringify(result));
      check('self-test detects collapsed row', result?.fails.some((f) => f.startsWith('collapsed')), JSON.stringify(result));
    }
    check('negative page errors', opened.errors.length === 0, opened.errors.join('; '));
  } catch (error) { check('negative harness completed', false, error.stack || String(error)); }
  finally { if (opened) await close(opened.context); }
  console.log(`SUMMARY ${current}: ${checks - startChecks} checks, ${failed - startFailed} failed`);
}

const filter = process.argv[2] || '';
const selected = Object.entries(fixtures).filter(([name]) => name.includes(filter));
let browser;
try {
  current = 'runner';
  check('fixtures selected', selected.length > 0, `${selected.length} on ${engine}`);
  // A fresh process per fixture prevents a broken filter page from poisoning later fixtures.
  for (const [name, fixture] of selected) {
    browser = await require('playwright')[engine].launch();
    await runFixture(browser, name, fixture);
    await close(browser); browser = null;
  }
  for (const name of ['feed-suggestions-only@377', 'profile-signedin@1100']) if (name.includes(filter)) {
    browser = await require('playwright')[engine].launch();
    await negative(browser, name);
    await close(browser); browser = null;
  }
} catch (error) { current = 'runner'; check('browser run', false, error.message); }
finally { if (browser) await close(browser); }
for (const [name, names] of failures) console.log(`FAILURES ${name}: ${names.join(', ')}`);
console.log(`${checks} checks, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
