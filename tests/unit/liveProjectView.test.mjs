// live のプロジェクト詳細が読む state（liveProjectView）の単体テスト（review 2026-11-26 Minor）。
// 承認依頼は「draft 以外で analyzedAt あり」のときだけ立つこと、承認記録の projectId を補うこと。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveProjectView } from '@/live/projectView';

const work = { sitemap: { pages: [] }, design: { selected: null }, qualityChecks: {}, pages: [], diagnoses: [], signage: {} };
const p = { id: 'p1', name: '架空の案件' };
const req = (o = {}) => ({ projectId: 'p1', answers: {}, competitors: [], status: 'draft', ...o });
const log = (o = {}) => ({ id: 'l1', at: '2026-11-26T00:00:00.000Z', actor: '架空', side: 'afro', action: '承認依頼', target: '要件定義', ...o });

test('draft は analyzedAt が残っていても承認依頼を立てない（取り下げで draft へ戻った場合）', () => {
  const s = liveProjectView(p, req({ status: 'draft', analyzedAt: '2026-11-25T00:00:00.000Z' }), [], work);
  assert.deepEqual(s.approvalRequests, {});
});

test('analyzed で analyzedAt があれば、依頼の日時は analyzedAt', () => {
  const s = liveProjectView(p, req({ status: 'analyzed', analyzedAt: '2026-11-25T00:00:00.000Z' }), [], work);
  assert.deepEqual(s.approvalRequests, { requirements: '2026-11-25T00:00:00.000Z' });
});

test('analyzed でも analyzedAt が無ければ承認依頼を立てない', () => {
  const s = liveProjectView(p, req({ status: 'analyzed' }), [], work);
  assert.deepEqual(s.approvalRequests, {});
});

test('承認記録の projectId が無ければ案件の id を補い、あれば変えない', () => {
  const s = liveProjectView(p, req({ status: 'approved', analyzedAt: '2026-11-25T00:00:00.000Z' }), [log(), log({ id: 'l2', projectId: 'p9' })], work);
  assert.deepEqual(s.approvalLogs.map((l) => l.projectId), ['p1', 'p9']);
  assert.equal(s.currentProjectId, 'p1');
  assert.deepEqual(s.projects, [p]);
});
