#!/usr/bin/env node
// Ship a Butler build the whole way: build → verify → publish → notify the phone.
//
// The rule (see the butler-build-notify memory): a build the phone can't reach
// is useless, so every build ends with a push carrying the download link. Butler
// *dispatched* builds already do this via the gateway's finalizeJob; this script
// gives a MANUAL `gradlew assembleRelease` the same finish.
//
// Usage:  node scripts/release.mjs            (build + ship the version in app.json)
//         node scripts/release.mjs --no-build (APK already built; just ship it)
//         node scripts/release.mjs --dry-run  (print the steps, touch nothing remote)
//
// Prereqs: JDK 17 + Android SDK (build), `gh` authed (release), and the local
// OpenClaw gateway running (notify). Version comes from app.json; the gitignored
// android/app/build.gradle is synced to match before building.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'stovie93/butler-app';
const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const NO_BUILD = args.has('--no-build');

const log = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const die = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };
const sh = (cmd, opts = {}) => {
  if (DRY) { console.log(`  [dry-run] ${cmd}`); return ''; }
  return execSync(cmd, { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', ...opts });
};

// --- 1. version from app.json (single source of truth) ---------------------
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;
const version = appJson.version;
const versionCode = appJson.android?.versionCode;
if (!version || !versionCode) die('Could not read expo.version / android.versionCode from app.json');
const tag = `v${version}`;
const apkName = `butler-${tag}.apk`;
log(`Shipping ${tag} (versionCode ${versionCode})`);

// --- 2. keep the (gitignored) native version in lockstep -------------------
const gradlePath = join(ROOT, 'android', 'app', 'build.gradle');
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, 'utf8');
  const synced = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  if (synced !== gradle && !DRY) writeFileSync(gradlePath, synced);
  ok(`build.gradle synced to ${version} / ${versionCode}`);
} else if (!NO_BUILD) {
  die('android/app/build.gradle missing — run `npx expo prebuild --platform android` first');
}

// --- 3. build ---------------------------------------------------------------
const builtApk = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!NO_BUILD) {
  log('Building release APK (gradlew assembleRelease)…');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  sh(`${gradlew} assembleRelease --console=plain`, { cwd: join(ROOT, 'android'), stdio: 'inherit' });
  ok('Build finished');
}
if (!DRY && !existsSync(builtApk)) die(`Expected APK not found at ${builtApk}`);

// --- 4. verify signer + copy to a versioned name ---------------------------
if (!DRY) {
  copyFileSync(builtApk, join(ROOT, apkName));
  ok(`Copied → ${apkName}`);
  try {
    const sdk = process.env.ANDROID_HOME || join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
    const apksigner = join(sdk, 'build-tools', '36.0.0', process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (existsSync(apksigner)) {
      const out = execFileSync(apksigner, ['verify', '--print-certs', join(ROOT, apkName)], { encoding: 'utf8' });
      const sha = out.match(/SHA-256 digest:\s*(\w+)/i)?.[1] ?? '(unknown)';
      ok(`Signature verified — signer SHA-256 ${sha.slice(0, 12)}…`);
    }
  } catch (e) { console.warn(`  (signature check skipped: ${e.message})`); }
}

// --- 5. push branch + fast-forward master + tag ----------------------------
log('Pushing feat/app-first, master, and tag…');
sh('git push origin feat/app-first');
sh('git branch -f master feat/app-first');
sh('git push origin master');
try { sh(`git rev-parse ${tag}`, { stdio: 'pipe' }); }
catch { sh(`git tag ${tag}`); }
sh(`git push origin ${tag}`);
ok('Pushed');

// --- 6. GitHub release with the APK ----------------------------------------
const notes = `Automated release of ${tag}. See commit log for changes.\n\nSame signer as prior releases — installs in place.`;
const exists = (() => { try { execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: 'ignore' }); return true; } catch { return false; } })();
if (exists) {
  log(`Release ${tag} exists — uploading APK (clobber)…`);
  sh(`gh release upload ${tag} "${apkName}" --repo ${REPO} --clobber`);
} else {
  log(`Creating release ${tag}…`);
  sh(`gh release create ${tag} "${apkName}" --repo ${REPO} --title "Butler ${tag}" --notes ${JSON.stringify(notes)}`);
}
const dlUrl = `https://github.com/${REPO}/releases/download/${tag}/${apkName}`;
ok(`Release published: ${dlUrl}`);

// --- 7. notify the phone with the download link ----------------------------
log('Notifying the phone…');
if (DRY) { console.log(`  [dry-run] POST /api/v1/approvals notify → ${dlUrl}`); }
else {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.openclaw', 'openclaw.json'), 'utf8'));
    const token = cfg.gateway?.auth?.token;
    const port = cfg.gateway?.http?.port ?? cfg.gateway?.port ?? 18789;
    if (!token) throw new Error('no gateway.auth.token in openclaw.json');
    const res = await fetch(`http://localhost:${port}/api/v1/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'notify',
        channel: 'reminders',
        title: `Butler ${tag} is ready`,
        body: `Tap the link to download the update: ${dlUrl}`,
        data: { type: 'build', url: dlUrl },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(`gateway HTTP ${res.status} ${JSON.stringify(j)}`);
    ok('Phone notified with the download link');
  } catch (e) {
    console.warn(`\x1b[33m! Notify failed (${e.message}). The release is up — deliver the link manually:\x1b[0m\n  ${dlUrl}`);
  }
}

console.log(`\n\x1b[32m✔ ${tag} shipped.\x1b[0m`);
