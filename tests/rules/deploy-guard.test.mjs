// デプロイスクリプトの拒否条件（何も実行しない。checkDeploy は判定だけ）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAiLegalClearance, checkDeploy, parseDeployArgs } from '../../scripts/deploy-firebase.mjs';
import { PRODUCTION_PROJECT_IDS } from '../../scripts/firebase-projects.mjs';

test('--project が無ければ拒否', () => {
  assert.throws(() => checkDeploy({ project: null, only: 'hosting' }), /--project/);
});
test('許可リストは本案件の本番 ID だけ（2026-11-12 ユーザー作成。他案件の ID・demo- を入れない）', () => {
  assert.deepEqual([...PRODUCTION_PROJECT_IDS], ['afro-cms-4a6ff']);
  assert.doesNotThrow(() => checkDeploy({ project: 'afro-cms-4a6ff', only: 'hosting' }));
  assert.throws(() => checkDeploy({ project: 'some-other-prod', only: 'hosting' }), /許可リスト/);
});
test('TBD は許可リストに入っていても拒否', () => {
  assert.throws(() => checkDeploy({ project: 'TBD', only: 'hosting' }, ['TBD']), /許可リスト/);
});
test('許可リストに無い ID・demo- の ID は拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'castfile-prod', only: 'hosting' }, list), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'demo-afro-cms', only: 'hosting' }, ['demo-afro-cms']), /エミュレータ専用/);
});
test('--only が無い・対象外を含むなら拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: null }, list), /--only/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'hosting,storage' }, list), /対象外/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions:other' }, list), /対象外/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'firestore' }, list), /対象外/);
});
test('functions は許可リストの ID でだけ通す（0.46.0。招待のアカウント作成）', () => {
  assert.deepEqual(checkDeploy({ project: 'afro-cms-prod', only: 'functions' }, ['afro-cms-prod']), { project: 'afro-cms-prod', targets: ['functions'] });
  assert.throws(() => checkDeploy({ project: 'castfile-prod', only: 'functions' }, ['afro-cms-prod']), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'demo-afro-cms', only: 'functions' }, ['demo-afro-cms']), /エミュレータ専用/);
});
test('functions と hosting を 1 回で出すのは拒否（functions を先に別で出す）', () => {
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions,hosting' }, ['afro-cms-prod']), /1 回で出せません/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'hosting,firestore:rules,functions' }, ['afro-cms-prod']), /1 回で出せません/);
  assert.doesNotThrow(() => checkDeploy({ project: 'afro-cms-prod', only: 'functions,firestore:rules' }, ['afro-cms-prod']));
});
test('許可リストと完全一致し、対象が許可内なら通す', () => {
  const r = checkDeploy({ project: 'afro-cms-prod', only: 'hosting,firestore:rules,firestore:indexes' }, ['afro-cms-prod']);
  assert.deepEqual(r, { project: 'afro-cms-prod', targets: ['hosting', 'firestore:rules', 'firestore:indexes'] });
});
test('引数の解析と不明な引数の拒否', () => {
  assert.deepEqual(parseDeployArgs(['--project', 'x', '--only=hosting', '--dry-run']), { project: 'x', only: 'hosting', dryRun: true });
  assert.throws(() => parseDeployArgs(['--force']), /不明な引数/);
});

// ---------- AI 下書きの MODE=on は法務の記録が無ければ止める（AI 計画 §5 L-c・T-11・SEC-H1。一時ディレクトリだけを使う） ----------
function aiEnvDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'afro-ai-legal-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
test('AI 法務: MODE が off・internal・未設定なら記録が無くても通す', () => {
  const dir = aiEnvDir({ '.env.p1': 'AI_REQUIREMENTS_MODE=off\n' });
  const legalFile = join(dir, 'missing.md');
  try {
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'off');
    writeFileSync(join(dir, '.env.p1'), 'AI_REQUIREMENTS_MODE=internal\n');
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile }), 'internal');
    assert.equal(checkAiLegalClearance('p2', { functionsDir: dir, legalFile }), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('AI 法務: MODE=on で記録が無ければ拒否（.env.<project> が .env より優先・大文字・引用符・CRLF も on）', () => {
  const dir = aiEnvDir({ '.env': 'AI_REQUIREMENTS_MODE=off\n', '.env.p1': '# c\r\nAI_REQUIREMENTS_MODE=" ON "\r\n' });
  try {
    assert.throws(() => checkAiLegalClearance('p1', { functionsDir: dir, legalFile: join(dir, 'missing.md') }), /LEGAL_CLEARANCE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('AI 法務: MODE=on でも記録があれば通す', () => {
  const dir = aiEnvDir({ '.env.p1': 'AI_REQUIREMENTS_MODE=on\n', 'clearance.md': '# test\n' });
  try {
    assert.equal(checkAiLegalClearance('p1', { functionsDir: dir, legalFile: join(dir, 'clearance.md') }), 'on');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
