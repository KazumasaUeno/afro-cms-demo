#!/usr/bin/env node
// npm run test:functions — Cloud Functions（functions/）をビルドして、エミュレータ（demo-afro-cms 固定）で callable を試す。
// - test:rules と同じ: 必ず emulators:exec を通す（テスト側もエミュレータの環境変数が無ければ throw）。gcloud の既定・ADC は使わない
// - functions のビルドは functions/node_modules の tsc で行う（npm を子プロセスで呼ばない＝Windows のシェル差を避ける）
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMULATOR_PROJECT_ID } from './firebase-projects.mjs';
import { pathWithJavaHome } from './test-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = join(root, 'functions');

/** functions/ を lib/ へビルドする。依存が無ければ入れ方を案内して throw */
export function buildFunctions() {
  const tsc = join(functionsDir, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tsc) || !existsSync(join(functionsDir, 'node_modules', 'firebase-functions'))) {
    throw new Error('functions/node_modules がありません（npm --prefix functions ci を先に実行する）');
  }
  const r = spawnSync(process.execPath, [tsc, '-p', join(functionsDir, 'tsconfig.json')], { cwd: functionsDir, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('functions のビルドに失敗しました');
  if (!existsSync(join(functionsDir, 'lib', 'index.js'))) throw new Error('functions/lib/index.js がありません');
  console.log('[functions] build ok (functions/lib/index.js)');
}

/**
 * エミュレータの子プロセス用の環境変数（JAVA_HOME の扱いは test-rules.mjs と同じ。GOOGLE_APPLICATION_CREDENTIALS は渡さない。関数の読み込み待ちを延ばす）。
 * 注: Functions エミュレータはこのPCの gcloud の ADC（%APPDATA%/gcloud）を検出して警告を出す。関数は Auth・Firestore しか使わず、
 * どちらもエミュレータでなければ起動しない（functions/src/index.ts の先頭）。プロジェクトも demo- なので本番には届かない
 */
export function isolatedEmulatorEnv(base = process.env) {
  const { pathKey, value } = pathWithJavaHome(base);
  const env = { ...base, [pathKey]: value };
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  // 関数の読み込み（firebase-admin）は既定 10 秒で打ち切られる。メモリの少ないPCで落ちたため 60 秒にする（2026-11-19 実測）
  env.FUNCTIONS_DISCOVERY_TIMEOUT ??= '60';
  return env;
}

function main() {
  if (!EMULATOR_PROJECT_ID.startsWith('demo-')) throw new Error(`EMULATOR_PROJECT_ID=${EMULATOR_PROJECT_ID} は demo- ではありません`);
  buildFunctions();
  const cli = join(dirname(createRequire(import.meta.url).resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
  const inner = 'node --test --test-concurrency=1 --test-reporter=spec tests/functions/*.test.mjs';
  const args = [cli, 'emulators:exec', '--project', EMULATOR_PROJECT_ID, '--only', 'firestore,auth,functions', inner];
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: isolatedEmulatorEnv() });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`test:functions を中止しました: ${e.message}`);
    process.exit(1);
  }
}
