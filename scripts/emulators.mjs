#!/usr/bin/env node
// npm run emulators: 画面の確認用に Auth / Firestore のエミュレータを起動する（demo-afro-cms 固定。§16.1）。
// - gcloud の既定・ADC・.firebaserc は使わない（--project を必ず渡す）。JAVA_HOME の扱いは test-rules.mjs と同じ
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMULATOR_PROJECT_ID } from './firebase-projects.mjs';
import { pathWithJavaHome } from './test-rules.mjs';

if (!EMULATOR_PROJECT_ID.startsWith('demo-')) throw new Error(`EMULATOR_PROJECT_ID=${EMULATOR_PROJECT_ID} は demo- ではありません`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(dirname(createRequire(import.meta.url).resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
const { pathKey, value } = pathWithJavaHome();
const r = spawnSync(process.execPath, [cli, 'emulators:start', '--project', EMULATOR_PROJECT_ID, '--only', 'firestore,auth'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, [pathKey]: value },
});
process.exit(r.status ?? 1);
