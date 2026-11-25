// U4b: AI 下書きの port（Timestamp → ISO）・表示フラグの既定・AnswerInput/AiBadge の既定が変わらないこと
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const M = await import('@/live/model');
const S = await import('@/features/requirements/aiDraft/aiDraftState');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

const ts = (iso) => ({ toDate: () => new Date(iso) });

test('deepIso: Timestamp を中まで ISO にする（配列・マップ・null はそのまま）', () => {
  const doc = {
    job: { state: 'running', startedAt: ts('2026-11-24T01:00:00.000Z'), leaseUntil: ts('2026-11-24T01:05:00.000Z') },
    lastError: null,
    generated: { siteCheck: { fetchedAt: ts('2026-11-24T00:59:00.000Z'), items: [{ key: 'https', ok: true }] }, points: [] },
    discardLog: [{ by: 'u', at: ts('2026-11-23T00:00:00.000Z') }],
    n: 3,
  };
  const out = M.deepIso(doc);
  assert.equal(out.job.startedAt, '2026-11-24T01:00:00.000Z');
  assert.equal(out.job.leaseUntil, '2026-11-24T01:05:00.000Z');
  assert.equal(out.generated.siteCheck.fetchedAt, '2026-11-24T00:59:00.000Z');
  assert.deepEqual(out.generated.siteCheck.items, [{ key: 'https', ok: true }]);
  assert.equal(out.discardLog[0].at, '2026-11-23T00:00:00.000Z');
  assert.equal(out.lastError, null);
  assert.equal(out.n, 3);
  // aiDraftState は ISO を前提に lease を判定する
  assert.equal(S.isJobRunning(out, Date.parse('2026-11-24T01:01:00.000Z')), true);
  assert.equal(S.isJobRunning(out, Date.parse('2026-11-24T01:06:00.000Z')), false);
});

test('フラグ: 未設定・未知の値は off（既定で画面は今と同じ）', () => {
  assert.equal(S.parseAiFlagMode(undefined), 'off');
  assert.equal(S.parseAiFlagMode(''), 'off');
  assert.equal(S.parseAiFlagMode('ON'), 'off');
  assert.equal(S.parseAiFlagMode('internal'), 'internal');
});

test('port の登録は live の入口だけ（demo の入口・共有の画面は Firebase を import しない）', () => {
  assert.match(src('src/live/main.tsx'), /registerAiDraftPort\(liveAiDraftPort\)/);
  for (const p of ['src/features/requirements/aiDraft/aiDraftPort.ts', 'src/features/requirements/aiDraft/useAiDraft.ts',
    'src/features/requirements/aiDraft/AiDraftPanel.tsx', 'src/features/requirements/aiDraft/AiDraftEditor.tsx']) {
    assert.doesNotMatch(src(p), /from ['"]firebase\//, p);
    assert.doesNotMatch(src(p), /from ['"]@\/live\/(firebase|aiDraftPort|repositories)/, p);
  }
});

test('AiBadge の既定の説明・HearingEditor の既定の文言は変えない（F4・F9）', () => {
  assert.match(src('src/components/ui/AiBadge.tsx'), /tooltip = DEMO_TOOLTIP/);
  assert.match(src('src/components/ui/AiBadge.tsx'), /実際のAI生成・外部送信は行っていません/);
  assert.match(src('src/features/requirements/HearingEditor.tsx'), /analyzeLabel \?\? 'AI分析を実行'/);
});
