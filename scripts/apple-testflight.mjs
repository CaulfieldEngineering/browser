// TestFlight for the browser, through the App Store Connect API, on the mini PC. Joe, 2026-10-29: Apple assesses the
// default browser permission only for an app that is on the App Store or on TestFlight, so the browser goes on
// TestFlight with a public link. Nothing here submits anything for App Store (production) review.
//
//   node scripts/apple-testflight.mjs profile   the App Store profile "Browser AppStore" (same certificate as Blocks'),
//                                               into C:\Users\Joe\.apple\browser; then apple-secrets.mjs puts it in
//                                               the repo's secrets with the API key the upload uses
//   node scripts/apple-testflight.mjs builds    the app's uploaded builds and their processing state
//   node scripts/apple-testflight.mjs beta [build number]
//                                               the external group "Public" with its public link, the build in it,
//                                               the test notes, the review details, and the build sent to beta review
//   node scripts/apple-testflight.mjs status    the group, its public link and the beta review state
//
// The app record (CaulfieldBrowser, SKU browser-001) was made by Joe in App Store Connect; the API cannot make one.
// Upload: .github/workflows/ios-testflight.yml.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_ID = 'KFXSM9CH9R';
const ISSUER = 'db8a43da-8566-4d1a-93ee-8b09463088b6';
const P8 = 'C:/Users/Joe/.apple/AuthKey_KFXSM9CH9R.p8';
const BLOCKS = 'C:/Users/Joe/.apple/blocks';
const OUT = 'C:/Users/Joe/.apple/browser';
const BUNDLE = 'com.caulfieldengineering.browser';
const PROFILE_NAME = 'Browser AppStore';
const PROFILE_FILE = 'Browser_AppStore.mobileprovision';
const GROUP = 'Public';
const PUBLIC_LIMIT = 10;
const WHAT_TO_TEST =
  'Browser is a WebKit web browser. Open it, type an address or a search in the address field, browse with tabs, back and forward, share. Some sites are intentionally blocked for its owner with a plain notice.';
const DESCRIPTION =
  "A clean, minimal WebKit web browser: an address field that also searches, tabs, back and forward, sharing, picture in picture. It blocks configuration profiles and app installers, and shows a plain notice for sites its owner has chosen to block.";
const NOTES =
  'Browser is a plain WebKit browser (WKWebView); no sign-in and no account are needed. Type an address or a search in the address field at the top. Tabs are under All Tabs at the bottom right. Configuration profiles, app installers and some sites are blocked on purpose, with a plain notice and a Go back button.';

const key = fs.readFileSync(P8, 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}
async function api(method, p, body, full = false) {
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = r.status === 204 ? {} : await r.json();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${j.errors?.map((e) => `${e.code}: ${e.detail}`).join('; ')}`);
  return full ? j : j.data;
}

async function app() {
  const a = (await api('GET', `apps?filter[bundleId]=${BUNDLE}`)).find((x) => x.attributes.bundleId === BUNDLE);
  if (!a) throw new Error(`no App Store Connect app for ${BUNDLE}`);
  return a;
}
async function builds(appId) {
  return api('GET', `builds?filter[app]=${appId}&sort=-uploadedDate&limit=20&fields[builds]=version,processingState,uploadedDate,expired`);
}

const cmd = process.argv[2];

if (cmd === 'profile') {
  const { certificateId } = JSON.parse(fs.readFileSync(path.join(BLOCKS, 'ids.json'), 'utf8'));
  const cert = await api('GET', `certificates/${certificateId}`);
  console.log('certificate', cert.id, cert.attributes.name, 'expires', cert.attributes.expirationDate);
  const bundle = (await api('GET', `bundleIds?filter[identifier]=${BUNDLE}`)).find((b) => b.attributes.identifier === BUNDLE);
  if (!bundle) throw new Error('no App ID; run apple-provision.mjs first');
  const old = (await api('GET', `profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}`)).filter((p) => p.attributes.name === PROFILE_NAME);
  for (const p of old) await api('DELETE', `profiles/${p.id}`);
  const profile = await api('POST', 'profiles', {
    data: {
      type: 'profiles',
      attributes: { name: PROFILE_NAME, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundle.id } },
        certificates: { data: [{ type: 'certificates', id: cert.id }] },
      },
    },
  });
  fs.writeFileSync(path.join(OUT, PROFILE_FILE), Buffer.from(profile.attributes.profileContent, 'base64'));
  console.log('profile', profile.id, profile.attributes.name, profile.attributes.profileState, 'expires', profile.attributes.expirationDate);
} else if (cmd === 'builds') {
  const a = await app();
  console.log('app', a.id, a.attributes.name);
  for (const b of await builds(a.id)) console.log(b.id, 'build', b.attributes.version, b.attributes.processingState, b.attributes.uploadedDate);
} else if (cmd === 'beta') {
  const a = await app();
  const want = process.argv[3];
  const all = await builds(a.id);
  const build = want ? all.find((b) => b.attributes.version === want) : all[0];
  if (!build) throw new Error('no build yet');
  if (build.attributes.processingState !== 'VALID') throw new Error(`build ${build.attributes.version} is ${build.attributes.processingState}, not VALID yet`);
  console.log('build', build.attributes.version, build.id);

  // Encryption: Info.plist says ITSAppUsesNonExemptEncryption false; if the build still asks, answer it.
  const b = await api('GET', `builds/${build.id}?fields[builds]=usesNonExemptEncryption`);
  if (b.attributes.usesNonExemptEncryption == null)
    await api('PATCH', `builds/${build.id}`, { data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } } });

  // The test notes, app level (en-US) and on the build.
  const locs = await api('GET', `apps/${a.id}/betaAppLocalizations`);
  const loc = locs.find((l) => l.attributes.locale === 'en-US');
  const locAttrs = { description: DESCRIPTION };
  if (loc) await api('PATCH', `betaAppLocalizations/${loc.id}`, { data: { type: 'betaAppLocalizations', id: loc.id, attributes: locAttrs } });
  else await api('POST', 'betaAppLocalizations', { data: { type: 'betaAppLocalizations', attributes: { locale: 'en-US', ...locAttrs }, relationships: { app: { data: { type: 'apps', id: a.id } } } } });
  const blocs = await api('GET', `builds/${build.id}/betaBuildLocalizations`);
  const bloc = blocs.find((l) => l.attributes.locale === 'en-US');
  if (bloc) await api('PATCH', `betaBuildLocalizations/${bloc.id}`, { data: { type: 'betaBuildLocalizations', id: bloc.id, attributes: { whatsNew: WHAT_TO_TEST } } });
  else await api('POST', 'betaBuildLocalizations', { data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew: WHAT_TO_TEST }, relationships: { build: { data: { type: 'builds', id: build.id } } } } });
  console.log('test notes set');

  // The review details: the contact is whatever App Store Connect already holds; nothing personal is made up here.
  const rd = await api('GET', `apps/${a.id}/betaAppReviewDetail`);
  const r = rd.attributes;
  console.log('review contact on file:', ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone'].map((k) => `${k}=${r[k] ? 'set' : 'MISSING'}`).join(' '));
  await api('PATCH', `betaAppReviewDetails/${rd.id}`, { data: { type: 'betaAppReviewDetails', id: rd.id, attributes: { demoAccountRequired: false, notes: NOTES } } });
  const missing = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone'].filter((k) => !r[k]);
  if (missing.length) {
    console.log(`STOP: the beta review contact is missing ${missing.join(', ')}. Joe fills it in App Store Connect: Apps, CaulfieldBrowser, TestFlight, Test Information, Beta App Review Information. Then run this again.`);
    process.exit(2);
  }

  // The external group with its public link, and the build in it.
  let group = (await api('GET', `apps/${a.id}/betaGroups`)).find((g) => g.attributes.name === GROUP);
  if (!group)
    group = await api('POST', 'betaGroups', {
      data: {
        type: 'betaGroups',
        attributes: { name: GROUP, publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: PUBLIC_LIMIT, feedbackEnabled: true },
        relationships: { app: { data: { type: 'apps', id: a.id } } },
      },
    });
  else if (!group.attributes.publicLinkEnabled)
    group = await api('PATCH', `betaGroups/${group.id}`, { data: { type: 'betaGroups', id: group.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: PUBLIC_LIMIT } } });
  await api('POST', `betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] });
  console.log('group', group.id, group.attributes.name, 'public link', group.attributes.publicLink);

  // Beta app review.
  const subs = await api('GET', `betaAppReviewSubmissions?filter[build]=${build.id}`);
  if (subs.length) console.log('already submitted:', subs[0].attributes.betaReviewState);
  else {
    const s = await api('POST', 'betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } });
    console.log('submitted for beta review:', s.attributes.betaReviewState);
  }
} else if (cmd === 'status') {
  const a = await app();
  const group = (await api('GET', `apps/${a.id}/betaGroups`)).find((g) => g.attributes.name === GROUP);
  if (group) console.log('group', group.attributes.name, 'public link', group.attributes.publicLink, 'enabled', group.attributes.publicLinkEnabled, 'limit', group.attributes.publicLinkLimit);
  for (const b of await builds(a.id)) {
    const subs = await api('GET', `betaAppReviewSubmissions?filter[build]=${b.id}`);
    const d = await api('GET', `builds/${b.id}/buildBetaDetail`);
    console.log('build', b.attributes.version, b.attributes.processingState, 'beta review', subs[0]?.attributes.betaReviewState ?? 'not submitted', 'external', d.attributes.externalBuildState);
  }
} else {
  console.log('usage: node scripts/apple-testflight.mjs profile | builds | beta [build number] | status');
}
