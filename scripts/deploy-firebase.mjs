#!/usr/bin/env node
// 本番デプロイの入口（npm run deploy:firebase -- --project <ID> --only <対象>）。
// 守ること（BACKEND_FIREBASE.md §16.1 / BACKEND_PLAN.md「Plan Review の反映」）:
// - --project は必須。scripts/firebase-projects.mjs の許可リストと完全一致する ID だけ通す（'TBD' は常に拒否）
// - --only は必須。hosting / firestore:rules / firestore:indexes の組み合わせだけ通す
// - gcloud・ADC・.firebaserc の既定には頼らない（firebase CLI へ --project を必ず渡す）
// - --dry-run は実行するコマンドを表示するだけ（何も送らない。下の事前確認は --dry-run でも行う）
// - hosting: dist-live が同じ --project 向けにビルドされていること（ビルドに焼き込まれた projectId を見る。security M3）
// - firestore:rules: 送る前に rules:check（質問の定義と Rules の一致）と test:rules（エミュレータ。1 件以上・失敗 0）を通す
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_PROJECT_IDS, DEPLOY_TARGETS } from './firebase-projects.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseDeployArgs(argv) {
  const out = { project: null, only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') out.project = argv[++i] ?? '';
    else if (a.startsWith('--project=')) out.project = a.slice('--project='.length);
    else if (a === '--only') out.only = argv[++i] ?? '';
    else if (a.startsWith('--only=')) out.only = a.slice('--only='.length);
    else if (a === '--dry-run') out.dryRun = true;
    else throw new Error(`不明な引数: ${a}`);
  }
  return out;
}

/** 通してよいときは { project, targets } を返し、それ以外は理由つきで throw する */
export function checkDeploy({ project, only }, allowlist = PRODUCTION_PROJECT_IDS) {
  if (!project) throw new Error('--project <本番ID> が必要です（既定のプロジェクトは使いません）');
  if (project === 'TBD' || !allowlist.includes(project)) {
    throw new Error(`--project ${project} は許可リスト（scripts/firebase-projects.mjs）にありません`);
  }
  if (project.startsWith('demo-')) throw new Error('demo- の ID はエミュレータ専用です');
  if (!only) throw new Error(`--only が必要です（${DEPLOY_TARGETS.join(',')} から選ぶ）`);
  const targets = only.split(',').map((s) => s.trim()).filter(Boolean);
  if (targets.length === 0) throw new Error('--only が空です');
  for (const t of targets) {
    if (!DEPLOY_TARGETS.includes(t)) throw new Error(`--only ${t} はデプロイ対象外です（${DEPLOY_TARGETS.join(',')}）`);
  }
  return { project, targets };
}

/** dist-live の JS に、このプロジェクトの ID が文字列として入っているか（別のプロジェクト向けのビルドを送らない） */
export function checkHostingBuild(project, dir = join(root, 'dist-live'), allowlist = PRODUCTION_PROJECT_IDS) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error('dist-live/index.html がありません（npm run build:live を先に実行する）');
  const assets = join(dir, 'assets');
  const js = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')) : [];
  const quoted = (id) => [`"${id}"`, `'${id}'`, `\`${id}\``];
  const has = (id) => js.some((src) => quoted(id).some((q) => src.includes(q)));
  if (js.some((src) => src.includes('127.0.0.1:8080') || src.includes('127.0.0.1:9099'))) {
    throw new Error('dist-live にエミュレータの接続先が入っています（--mode live でビルドし直す）');
  }
  if (!has(project)) throw new Error(`dist-live は --project ${project} 向けのビルドではありません（.env.live.local の VITE_FIREBASE_PROJECT_ID を確かめてビルドし直す）`);
  const others = allowlist.filter((id) => id !== project && id !== 'TBD' && has(id));
  if (others.length) throw new Error(`dist-live に別のプロジェクトの ID（${others.join(', ')}）が入っています`);
}

/** test:rules の出力（node --test の spec）から件数を読む */
export function parseTestCounts(out) {
  const num = (k) => {
    const m = new RegExp(`(?:ℹ|#)\\s*${k}\\s+(\\d+)`).exec(out);
    return m ? Number(m[1]) : null;
  };
  return { tests: num('tests'), pass: num('pass'), fail: num('fail') };
}

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

/** Rules を送る前の確認（どれか 1 つでも通らなければ送らない） */
function checkRulesBeforeDeploy() {
  const check = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(root, 'scripts', 'gen-rules-questions.mjs'), '--check'], { cwd: root, stdio: 'inherit' });
  if (check.status !== 0) throw new Error('rules:check が通りません（npm run rules:gen で Rules を作り直す）');
  const t = runNode('test-rules.mjs');
  const c = parseTestCounts(t.out);
  console.log(`[deploy] test:rules tests=${c.tests} pass=${c.pass} fail=${c.fail}`);
  if (t.status !== 0 || !c.tests || c.fail !== 0 || c.pass !== c.tests) throw new Error('test:rules が通りません（件数 0 件・失敗あり・終了コード 0 以外）');
}

function main() {
  const args = parseDeployArgs(process.argv.slice(2));
  const { project, targets } = checkDeploy(args);
  if (targets.includes('hosting')) checkHostingBuild(project);
  if (targets.includes('firestore:rules')) checkRulesBeforeDeploy();
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
  const cmd = [cli, 'deploy', '--project', project, '--only', targets.join(','), '--non-interactive'];
  console.log(`firebase ${cmd.slice(1).join(' ')}`);
  if (args.dryRun) return;
  const r = spawnSync(process.execPath, cmd, { cwd: root, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`deploy を中止しました: ${e.message}`);
    process.exit(1);
  }
}
