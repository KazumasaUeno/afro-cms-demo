#!/usr/bin/env node
// npm run test:rules の入口。
// - firebase-tools 15 のエミュレータは Java 21 以上が要る。PATH の先頭の java が古い PC でも動くよう、
//   JAVA_HOME があれば「この子プロセスの PATH だけ」先頭に JAVA_HOME/bin を足す（ユーザーの PATH・システム設定は変えない）
// - プロジェクトは demo-afro-cms 固定（BACKEND_FIREBASE.md §16.1。このPCの gcloud の既定は別のお客様の本番）
// - 必ず emulators:exec を通す（テスト側の guard.mjs もエミュレータの環境変数が無ければ throw する）
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMULATOR_PROJECT_ID } from './firebase-projects.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** JAVA_HOME/bin に java があれば、それを先頭にした PATH を返す（無ければ元の PATH） */
export function pathWithJavaHome(env = process.env, exists = existsSync) {
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const current = env[pathKey] ?? '';
  const home = env.JAVA_HOME;
  if (!home) return { pathKey, value: current, javaBin: null };
  const bin = join(home, 'bin');
  const javaExe = join(bin, process.platform === 'win32' ? 'java.exe' : 'java');
  if (!exists(javaExe)) return { pathKey, value: current, javaBin: null };
  return { pathKey, value: [bin, current].filter(Boolean).join(delimiter), javaBin: bin };
}

function main() {
  if (!EMULATOR_PROJECT_ID.startsWith('demo-')) throw new Error(`EMULATOR_PROJECT_ID=${EMULATOR_PROJECT_ID} は demo- ではありません`);
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
  const { pathKey, value, javaBin } = pathWithJavaHome();
  const env = { ...process.env, [pathKey]: value };
  const java = spawnSync('java', ['-version'], { env, encoding: 'utf8', shell: false });
  const ver = (java.stderr || java.stdout || '').split(/\r?\n/)[0] || '(java が見つかりません)';
  console.log(`[test:rules] java: ${ver}${javaBin ? `（JAVA_HOME: ${javaBin}）` : '（PATH の java）'}`);

  // テストファイルの一覧は Node 側で展開する（Windows のシェルは glob を展開しない）。
  // 全ファイルが同じ demo- プロジェクトを使い、probe は Rules を差し替えるので、ファイルは 1 つずつ順に実行する
  // 引数でファイルを絞れる（例: node scripts/test-rules.mjs tests/rules/accounts.test.mjs）
  const files = process.argv.slice(2).filter((a) => /^tests\/rules\/[\w.-]+\.test\.mjs$/.test(a));
  const inner = `node --test --test-concurrency=1 --test-reporter=spec ${files.length ? files.join(' ') : 'tests/rules/*.test.mjs'}`;
  const args = [cli, 'emulators:exec', '--project', EMULATOR_PROJECT_ID, '--only', 'firestore,auth', inner];
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`test:rules を中止しました: ${e.message}`);
    process.exit(1);
  }
}
