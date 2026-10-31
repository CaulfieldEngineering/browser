#!/usr/bin/env node
// Publish only blur.json. No app binaries, signing, releases, or workflows are touched.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const endpoint = 'https://api.github.com/repos/CaulfieldEngineering/browser-install/contents/blur.json';
export const liveURL = 'https://caulfieldengineering.github.io/browser-install/blur.json';

export function instant(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Use an ISO date with an explicit timezone, for example 2026-10-31T07:00:00-04:00.');
  }
  return new Date(value);
}

export function addWindow(previous, from, until, now = new Date()) {
  const start = instant(from), end = instant(until);
  if (end <= start || end <= now) throw new Error('The window must end after its start and after now.');
  if (!previous || !Array.isArray(previous.windows)) throw new Error('Existing blur.json is invalid; it was not changed.');
  const windows = previous.windows.map(w => {
    if (!w || instant(w.until) <= instant(w.from)) throw new Error('Existing blur.json is invalid; it was not changed.');
    return { from: instant(w.from).toISOString(), until: instant(w.until).toISOString() };
  }).filter(w => instant(w.until) > now);
  windows.push({ from: start.toISOString(), until: end.toISOString() });
  windows.sort((a, b) => instant(a.from) - instant(b.from));
  const merged = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && instant(w.from) <= instant(last.until)) {
      if (instant(w.until) > instant(last.until)) last.until = w.until;
    } else merged.push({ ...w });
  }
  if (merged.length > 128) throw new Error('Too many windows.');
  return { windows: merged };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node scripts/blur-window.mjs --until 2026-10-31T07:00:00-04:00 [--from now|ISO] [--dry-run]');
    return;
  }
  const allowed = new Set(['--from', '--until', '--dry-run']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error('Unknown argument. Use --help.');
    if (args[i] !== '--dry-run') { if (!args[++i] || args[i].startsWith('--')) throw new Error('Missing argument.'); }
  }
  const now = new Date();
  const fromArg = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'now';
  const from = fromArg === 'now' ? now.toISOString() : fromArg;
  const until = args[args.indexOf('--until') + 1];
  if (!args.includes('--until')) throw new Error('--until is required. Use an explicit timezone.');
  // Validate before accessing credentials or the network.
  const preview = addWindow({ windows: [] }, from, until, now);
  if (args.includes('--dry-run')) { console.log(JSON.stringify(preview, null, 2)); return; }
  let credential;
  try {
    credential = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch { throw new Error('GitHub git credential is unavailable. No schedule was changed.'); }
  const token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!token) throw new Error('GitHub git credential is unavailable. No schedule was changed.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20_000) });
    if (!current.ok && current.status !== 404) throw new Error(`Cannot read schedule (HTTP ${current.status}).`);
    const file = current.ok ? await current.json() : null;
    const previous = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : { windows: [] };
    const next = addWindow(previous, from, until, now);
    const response = await fetch(endpoint, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        message: `Schedule browser blur until ${until}\n\nCo-Authored-By: OpenAI Codex <noreply@openai.com>`,
        content: Buffer.from(JSON.stringify(next, null, 2) + '\n').toString('base64'),
        branch: 'main', ...(file ? { sha: file.sha } : {})
      })
    });
    if (response.status === 409 || response.status === 422) continue;
    if (!response.ok) throw new Error(`Schedule was not saved (HTTP ${response.status}).`);
    const saved = await response.json();
    console.log(`Saved blur window: ${from} to ${until}\nCommit: ${saved.commit.sha}\nVerify after Pages deploys: ${liveURL}`);
    return;
  }
  throw new Error('The install repo changed during publishing. Retry; no existing windows were removed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
