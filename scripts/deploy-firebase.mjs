#!/usr/bin/env node
// 本番デプロイの入口（npm run deploy:firebase -- --project <ID> --only <対象>）。
// 守ること（BACKEND_FIREBASE.md §16.1 / BACKEND_PLAN.md「Plan Review の反映」）:
// - --project は必須。scripts/firebase-projects.mjs の許可リストと完全一致する ID だけ通す（'TBD' は常に拒否）
// - --only は必須。hosting / firestore:rules / firestore:indexes の組み合わせだけ通す
// - gcloud・ADC・.firebaserc の既定には頼らない（firebase CLI へ --project を必ず渡す）
// - --dry-run は実行するコマンドを表示するだけ（何も送らない）
import { existsSync } from 'node:fs';
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

function main() {
  const args = parseDeployArgs(process.argv.slice(2));
  const { project, targets } = checkDeploy(args);
  if (targets.includes('hosting') && !existsSync(join(root, 'dist-live', 'index.html'))) {
    throw new Error('dist-live/index.html がありません（live ビルドを先に作る）');
  }
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
