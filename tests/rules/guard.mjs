// Rules テストの自己防衛（BACKEND_FIREBASE.md §16.1）。
// このPCの gcloud の既定は別のお客様の本番。エミュレータ以外へ繋がる可能性があれば、何かをする前に throw する。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { EMULATOR_PROJECT_ID } from '../../scripts/firebase-projects.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `demo-` で始まらない ID は即 throw */
export function assertDemoProject(projectId) {
  if (typeof projectId !== 'string' || !projectId.startsWith('demo-')) {
    throw new Error(`Rules テストは demo- のプロジェクトでしか動かしません（受け取った ID: ${String(projectId)}）`);
  }
  return projectId;
}

/** host:port を返す。エミュレータの環境変数が無ければ throw（emulators:exec を通さない実行を止める） */
export function emulatorHostFromEnv(name, env = process.env) {
  const v = env[name];
  if (!v) throw new Error(`${name} がありません。npm run test:rules（firebase emulators:exec）から実行してください`);
  const m = /^(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/.exec(v);
  if (!m) throw new Error(`${name}=${v} はローカルのエミュレータではありません`);
  return { host: m[1], port: Number(m[2]) };
}

export async function createRulesEnv() {
  // emulators:exec は --project の値を GCLOUD_PROJECT に入れる。固定の ID と一致しなければ止める
  const projectId = assertDemoProject(process.env.GCLOUD_PROJECT);
  if (projectId !== EMULATOR_PROJECT_ID) {
    throw new Error(`GCLOUD_PROJECT=${projectId} は ${EMULATOR_PROJECT_ID} ではありません`);
  }
  const { host, port } = emulatorHostFromEnv('FIRESTORE_EMULATOR_HOST');
  return initializeTestEnvironment({
    projectId,
    firestore: { host, port, rules: readFileSync(join(root, 'firestore.rules'), 'utf8') },
  });
}
