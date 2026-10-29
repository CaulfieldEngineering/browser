// Puts the browser's signing files in this repo's Actions secrets, on the mini PC, after apple-provision.mjs:
//   npm i --no-save libsodium-wrappers && node scripts/apple-secrets.mjs
// The certificate is Blocks' (C:\Users\Joe\.apple\blocks\dist.p12 and its password), the profile is the browser's own
// (C:\Users\Joe\.apple\browser\Browser_AdHoc.mobileprovision), and INSTALL_DEPLOY_KEY lets the build push to the public
// install page repo (CaulfieldEngineering/browser-install). Nothing is printed but the secret names.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import sodium from 'libsodium-wrappers';

const REPO = 'CaulfieldEngineering/browser';
const BLOCKS = 'C:/Users/Joe/.apple/blocks';
const OWN = 'C:/Users/Joe/.apple/browser';
const token = execSync('printf "protocol=https\\nhost=github.com\\n" | git credential fill', { shell: 'C:/Program Files/Git/bin/bash.exe' })
  .toString().match(/^password=(.+)$/m)[1].trim();
const gh = async (method, p, body) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${p}`, {
    method,
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204 || r.status === 201) return null;
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${j.message}`);
  return j;
};

await sodium.ready;
const pub = await gh('GET', 'actions/secrets/public-key');
const seal = (value) =>
  sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(pub.key, sodium.base64_variants.ORIGINAL)), sodium.base64_variants.ORIGINAL);

const b64file = (f) => fs.readFileSync(f).toString('base64');
const secrets = {
  IOS_DIST_CERT_P12_BASE64: () => b64file(`${BLOCKS}/dist.p12`),
  IOS_DIST_CERT_PASSWORD: () => fs.readFileSync(`${BLOCKS}/p12-password.txt`, 'utf8').trim(),
  IOS_ADHOC_PROFILE_BASE64: () => b64file(`${OWN}/Browser_AdHoc.mobileprovision`),
  IOS_KEYCHAIN_PASSWORD: () => crypto.randomBytes(16).toString('hex'),
  IOS_TEAM_ID: () => 'D56QY8C7WL',
  INSTALL_DEPLOY_KEY: () => fs.readFileSync(`${OWN}/install_key`, 'utf8'),
};
for (const [name, value] of Object.entries(secrets)) {
  let v;
  try {
    v = value();
  } catch {
    console.log('skipped', name, '(its file is not there yet)');
    continue;
  }
  await gh('PUT', `actions/secrets/${name}`, { encrypted_value: seal(v), key_id: pub.key_id });
  console.log('set', name);
}
const list = await gh('GET', 'actions/secrets');
console.log('repo now has', list.secrets.map((s) => s.name).join(', '));
