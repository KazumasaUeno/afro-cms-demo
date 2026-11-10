// デプロイスクリプトの拒否条件（何も実行しない。checkDeploy は判定だけ）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeploy, parseDeployArgs } from '../../scripts/deploy-firebase.mjs';
import { PRODUCTION_PROJECT_IDS } from '../../scripts/firebase-projects.mjs';

test('--project が無ければ拒否', () => {
  assert.throws(() => checkDeploy({ project: null, only: 'hosting' }), /--project/);
});
test('許可リストが TBD のままなら、どの ID も拒否', () => {
  assert.deepEqual([...PRODUCTION_PROJECT_IDS], ['TBD']);
  assert.throws(() => checkDeploy({ project: 'TBD', only: 'hosting' }), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'some-other-prod', only: 'hosting' }), /許可リスト/);
});
test('許可リストに無い ID・demo- の ID は拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'castfile-prod', only: 'hosting' }, list), /許可リスト/);
  assert.throws(() => checkDeploy({ project: 'demo-afro-cms', only: 'hosting' }, ['demo-afro-cms']), /エミュレータ専用/);
});
test('--only が無い・対象外を含むなら拒否', () => {
  const list = ['afro-cms-prod'];
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: null }, list), /--only/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'hosting,functions' }, list), /対象外/);
  assert.throws(() => checkDeploy({ project: 'afro-cms-prod', only: 'firestore' }, list), /対象外/);
});
test('許可リストと完全一致し、対象が許可内なら通す', () => {
  const r = checkDeploy({ project: 'afro-cms-prod', only: 'hosting,firestore:rules,firestore:indexes' }, ['afro-cms-prod']);
  assert.deepEqual(r, { project: 'afro-cms-prod', targets: ['hosting', 'firestore:rules', 'firestore:indexes'] });
});
test('引数の解析と不明な引数の拒否', () => {
  assert.deepEqual(parseDeployArgs(['--project', 'x', '--only=hosting', '--dry-run']), { project: 'x', only: 'hosting', dryRun: true });
  assert.throws(() => parseDeployArgs(['--force']), /不明な引数/);
});
