// The browser's signing, through the App Store Connect API, on the mini PC: node scripts/apple-provision.mjs
// The same Apple team, API key and Apple Distribution certificate as the Blocks and HQ iPhone apps; this only adds the
// browser's own App ID (com.caulfieldengineering.browser) and an ad-hoc profile named exactly "Browser AdHoc" for every
// iPhone registered to the team. It never makes a certificate and never touches another app's profile. The profile
// lands in C:\Users\Joe\.apple\browser; scripts/apple-secrets.mjs then puts it in the repo's Actions secrets. Every
// year, after Blocks' certificate is renewed: run this, then apple-secrets.mjs, then the workflow, then reinstall.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_ID = 'KFXSM9CH9R';
const ISSUER = 'db8a43da-8566-4d1a-93ee-8b09463088b6';
const P8 = 'C:/Users/Joe/.apple/AuthKey_KFXSM9CH9R.p8';
const BLOCKS = 'C:/Users/Joe/.apple/blocks'; // the shared certificate (dist.p12) and its id
const APPS = [{ bundle: 'com.caulfieldengineering.browser', name: 'Browser', profileName: 'Browser AdHoc', file: 'Browser_AdHoc.mobileprovision' }];
const OUT = 'C:/Users/Joe/.apple/browser';

fs.mkdirSync(OUT, { recursive: true });
const key = fs.readFileSync(P8, 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}
async function api(method, p, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = r.status === 204 ? {} : await r.json();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${j.errors?.map((e) => `${e.code}: ${e.detail}`).join('; ')}`);
  return j.data;
}

// 1. Blocks' distribution certificate, still valid.
const { certificateId, team } = JSON.parse(fs.readFileSync(path.join(BLOCKS, 'ids.json'), 'utf8'));
const cert = await api('GET', `certificates/${certificateId}`);
console.log('certificate', cert.id, cert.attributes.name, 'expires', cert.attributes.expirationDate);

const devices = (await api('GET', 'devices?filter[platform]=IOS&filter[status]=ENABLED&limit=200')).map((d) => ({ type: 'devices', id: d.id }));
const ids = { certificateId: cert.id, team };
for (const { bundle: BUNDLE, name, profileName: PROFILE_NAME, file } of APPS) {
// 2. The App ID (reused if it is there).
let bundle = (await api('GET', `bundleIds?filter[identifier]=${BUNDLE}`)).find((b) => b.attributes.identifier === BUNDLE);
if (!bundle) bundle = await api('POST', 'bundleIds', { data: { type: 'bundleIds', attributes: { identifier: BUNDLE, name, platform: 'IOS' } } });
console.log('bundle id', bundle.id, bundle.attributes.identifier);

// 3. Its ad-hoc profile for every registered iPhone, made fresh.
const old = (await api('GET', `profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}`)).filter((p) => p.attributes.name === PROFILE_NAME);
for (const p of old) await api('DELETE', `profiles/${p.id}`);
const profile = await api('POST', 'profiles', {
  data: {
    type: 'profiles',
    attributes: { name: PROFILE_NAME, profileType: 'IOS_APP_ADHOC' },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: bundle.id } },
      certificates: { data: [{ type: 'certificates', id: cert.id }] },
      devices: { data: devices },
    },
  },
});
fs.writeFileSync(path.join(OUT, file), Buffer.from(profile.attributes.profileContent, 'base64'));
console.log('profile', profile.id, profile.attributes.name, profile.attributes.profileState, 'expires', profile.attributes.expirationDate, 'devices', devices.length);
ids[BUNDLE] = { bundleId: bundle.id, profileId: profile.id };
}
fs.writeFileSync(path.join(OUT, 'ids.json'), JSON.stringify(ids, null, 2));
console.log('files in', OUT, fs.readdirSync(OUT).join(', '));
