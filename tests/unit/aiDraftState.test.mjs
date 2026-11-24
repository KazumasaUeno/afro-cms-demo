// AI 下書きの画面の純粋関数（docs/design/AI_REQUIREMENTS_UI.md §2・§3・§4・§6、計画 AI_REQUIREMENTS_PLAN.md §U4「先に書くテスト」）。
// 実行: npm run test:unit（tests/unit/register.mjs の resolve hook で src/ の .ts を直接読む）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = await import('@/features/requirements/aiDraft/aiDraftState');
const F = await import('@/features/requirements/aiDraft/proposalV2Format');
const M = await import('@/live/model');
const T = await import('@/types/aiDraft');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = Date.parse('2026-11-24T10:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const GENERATED = {
  version: 2,
  hostname: 'example.co.jp',
  issue: 'スマホで見づらい',
  purposes: ['問い合わせを増やしたい'],
  improves: ['スマホ表示'],
  competitors: ['competitor.example.jp'],
  siteCheck: { status: 'ok', fetchedAt: '2026-11-24T00:05:00.000Z', passed: 1, total: 2, items: [
    { key: 'https', ok: true, value: true },
    { key: 'page-size', ok: false, value: 3_145_728 },
  ] },
  origin: { kind: 'ai', promptVersion: 'PRM-REQ-001@1.0.0', model: 'm' },
  summary: '問い合わせを 18 件に増やす',
  points: [{ id: 'ai1', area: 'スマホ表示', priority: 'high', title: '見出し', detail: '本文', impact: '定性', evidence: ['viewport', 'q-issue'] }],
  draft: { goal: '目的', target: '', contents: 'c', features: 'f', nonFunctional: 'n', operation: 'o', schedule: 's', openQuestions: ['公開日'] },
  flags: { unsupportedNumbers: ['18'] },
};
const EDITED = { summary: GENERATED.summary, points: GENERATED.points, draft: GENERATED.draft };

const doc = (over = {}) => ({
  schemaVersion: 1, state: 'ready', job: { state: 'idle', requestId: 'r1' }, answersHash: 'h1', configHash: 'c1',
  generated: GENERATED, updatedAt: iso(NOW), updatedBy: 'server', ...over,
});
const dev = (over = {}) => ({
  doc: doc(), now: NOW, answersHashNow: 'h1', role: 'developer', isAssignedDeveloper: true, flagMode: 'on', reqStatus: 'draft', uid: 'u-dev', ...over,
});
const key = (over) => S.deriveAiDraftState(dev(over)).key;

// ---------- 状態判定（§2。8） ----------

test('状態 hidden: フラグ off・お客様・アサイン外の開発者', () => {
  assert.equal(key({ flagMode: 'off' }), 'hidden');
  assert.equal(key({ role: 'client' }), 'hidden');
  assert.equal(key({ isAssignedDeveloper: false }), 'hidden');
  assert.equal(S.parseAiFlagMode(undefined), 'off');
  assert.equal(S.parseAiFlagMode('ON'), 'off');
  assert.equal(S.parseAiFlagMode('internal'), 'internal');
});

test('状態 notDraft: 承認を依頼した後はパネルを出さない', () => {
  assert.equal(key({ reqStatus: 'analyzed' }), 'notDraft');
  assert.equal(key({ reqStatus: 'approved', role: 'admin' }), 'notDraft');
});

test('状態 none: 文書なし。internal の開発者は生成ボタンなし（DEC lead F5）', () => {
  const v = S.deriveAiDraftState(dev({ doc: null }));
  assert.equal(v.key, 'none');
  assert.equal(v.canGenerate, true);
  const internalDev = S.deriveAiDraftState(dev({ doc: null, flagMode: 'internal' }));
  assert.equal(internalDev.key, 'none');
  assert.equal(internalDev.canGenerate, false);
  const internalAdmin = S.deriveAiDraftState(dev({ doc: null, flagMode: 'internal', role: 'admin', isAssignedDeveloper: false }));
  assert.equal(internalAdmin.canGenerate, true);
});

test('状態 running: lease 内。他の人が始めたか・下書きの有無', () => {
  const v = S.deriveAiDraftState(dev({ doc: doc({ job: { state: 'running', by: 'u-other', leaseUntil: iso(NOW + 60_000) } }) }));
  assert.equal(v.key, 'running');
  assert.equal(v.startedByOther, true);
  assert.equal(v.hasGenerated, true);
  assert.equal(v.canGenerate, false);
  assert.equal(v.canEdit, false);
  const mine = S.deriveAiDraftState(dev({ doc: doc({ generated: undefined, state: 'failed', job: { state: 'running', by: 'u-dev', leaseUntil: iso(NOW + 1) } }) }));
  assert.equal(mine.key, 'running');
  assert.equal(mine.startedByOther, false);
});

test('状態 failed: 下書きなしの失敗', () => {
  const v = S.deriveAiDraftState(dev({ doc: doc({ state: 'failed', generated: undefined, lastError: { code: 'ai-schema', at: iso(NOW), requestId: 'r1' } }) }));
  assert.equal(v.key, 'failed');
  assert.equal(v.canGenerate, true);
});

test('状態 stalled: running のまま lease 切れ（leaseUntil == now も切れ）', () => {
  assert.equal(key({ doc: doc({ job: { state: 'running', leaseUntil: iso(NOW) } }) }), 'stalled');
  assert.equal(key({ doc: doc({ job: { state: 'running' } }) }), 'stalled');
});

test('状態 ready: 下書きあり・未確認。前回の作り直しの失敗は注記', () => {
  const v = S.deriveAiDraftState(dev());
  assert.equal(v.key, 'ready');
  assert.equal(v.canEdit, true);
  assert.equal(v.lastErrorNote, null);
  const n = S.deriveAiDraftState(dev({ doc: doc({ lastError: { code: 'ai-timeout', at: iso(NOW), requestId: 'r1' } }) }));
  assert.equal(n.key, 'ready');
  assert.equal(n.lastErrorNote, '前回の作り直しは失敗しました（AI の応答が時間内に返らなかったため中止しました）。表示中の下書きはそのまま使えます。');
});

test('状態 confirmed＋重ねる注記: answersChanged・configChanged は常に false（Q-U1）・管理者は閲覧のみ', () => {
  const v = S.deriveAiDraftState(dev({ doc: doc({ edited: EDITED }), answersHashNow: 'h2', configHashNow: 'c2' }));
  assert.equal(v.key, 'confirmed');
  assert.equal(v.answersChanged, true);
  assert.equal(v.configChanged, false);
  assert.equal(S.deriveAiDraftState(dev({ answersHashNow: null })).answersChanged, false);
  const admin = S.deriveAiDraftState(dev({ role: 'admin', isAssignedDeveloper: false, doc: doc({ edited: EDITED }) }));
  assert.equal(admin.readOnly, true);
  assert.equal(admin.canEdit, false);
  assert.equal(admin.canGenerate, true);
});

// ---------- 承認を依頼する（§3.4） ----------

test('承認を依頼するは edited ありだけ（保存中・失敗・生成中・役割で止める）', () => {
  const ok = { hasEdited: true, save: 'saved', running: false, reqStatus: 'draft', role: 'developer', isAssignedDeveloper: true };
  assert.equal(S.canRequestApproval(ok), true);
  assert.equal(S.canRequestApproval({ ...ok, save: 'idle' }), true);
  assert.equal(S.approvalBlock({ ...ok, hasEdited: false }), 'no-edited');
  assert.equal(S.approvalBlock({ ...ok, save: 'pending' }), 'saving');
  assert.equal(S.approvalBlock({ ...ok, save: 'saving' }), 'saving');
  assert.equal(S.approvalBlock({ ...ok, save: 'failed' }), 'save-failed');
  assert.equal(S.approvalBlock({ ...ok, running: true }), 'running');
  assert.equal(S.approvalBlock({ ...ok, reqStatus: 'analyzed' }), 'not-draft');
  assert.equal(S.approvalBlock({ ...ok, role: 'admin' }), 'not-allowed');
  assert.equal(S.approvalBlock({ ...ok, isAssignedDeveloper: false }), 'not-allowed');
});

// ---------- v1 / v2 の描画（§6） ----------

test('v1 の描画: demo はデモ用のスコア、live は出さない（従来どおり）', () => {
  const v1 = { hostname: 'a.jp', issue: '課題', purposes: [], improves: [], competitors: [], currentScore: 40, projectedScore: 80,
    points: [{ id: 'p1', title: 't', detail: 'd', priority: 'low', impact: 'i', area: 'SEO' }] };
  assert.match(F.proposalV1Html(v1, true), /サイトスコア（デモ用の値）：現状 40 → 改善後の見込み 80/);
  assert.doesNotMatch(F.proposalV1Html(v1, false), /サイトスコア/);
  assert.match(F.proposalV1Html(v1, false), /\[優先度 低\] SEO: t/);
});

test('v2 の描画: スコアなし・根拠の名前・基本チェック（単位換算）・下書き 7 欄・空欄は（記載なし）', () => {
  const h = F.proposalV2Html(GENERATED);
  assert.doesNotMatch(h, /スコア/);
  assert.match(h, /根拠：スマホ表示の設定・現在の課題/);
  assert.match(h, /1 \/ 2 項目が基準内/);
  assert.match(h, /ページの容量<\/th><td>要改善・3072\.0KB/);
  assert.match(h, /HTTPS<\/th><td>基準内・あり/);
  assert.match(h, /<th>ターゲット<\/th><td><span class="muted">（記載なし）<\/span>/);
  assert.match(h, /未確定事項<\/h3><ul><li>公開日<\/li>/);
  assert.match(h, /要約<\/b>：問い合わせを 18 件に増やす/);
  assert.doesNotMatch(h, /<mark|unsupported|要確認/);
  const blocked = F.proposalV2Html({ ...GENERATED, siteCheck: { status: 'blocked', passed: 0, total: 0, items: [] }, draft: { ...GENERATED.draft, openQuestions: [] } });
  assert.match(blocked, /サイト側の設定で取得できなかったため、基本チェックは行っていません。提案はヒアリングの回答をもとに作成しています。/);
  assert.doesNotMatch(blocked, /未確定事項/);
  assert.doesNotMatch(F.proposalV2Html({ ...GENERATED, siteCheck: null }), /基本チェック/);
});

test('プレーンテキスト: v2 の HTML は esc() を通し、印の分割は文字列だけを返す', () => {
  const evil = { ...GENERATED, summary: '<script>alert(1)</script>', points: [{ ...GENERATED.points[0], title: '<img src=x onerror=1>', evidence: ['<b>'] }] };
  const h = F.proposalV2Html(evil);
  assert.doesNotMatch(h, /<script|<img|根拠：<b>/);
  assert.match(h, /根拠：&lt;b&gt;/);
  assert.match(h, /&lt;script&gt;/);
  const parts = S.splitFlagged('<b>18</b> と １８ と 180', ['18']);
  assert.deepEqual(parts, [
    { text: '<b>', flagged: false }, { text: '18', flagged: true }, { text: '</b> と ', flagged: false }, { text: '１８', flagged: true }, { text: ' と 180', flagged: false },
  ]);
  const src = readFileSync(join(root, 'src/features/requirements/aiDraft/ProposalV2Body.tsx'), 'utf8');
  assert.doesNotMatch(src, /dangerouslySetInnerHTML\s*=/);
});

// ---------- proposalForSave・reqDoc の版（§U4 src/live/model.ts） ----------

test('proposalForSave が v2 を落とさない（11 キーをそのまま・flags は写さない）。v1 は従来の形', () => {
  const v2 = M.proposalForSave(GENERATED);
  assert.equal(v2.version, 2);
  assert.deepEqual(Object.keys(v2).sort(), ['competitors', 'draft', 'hostname', 'improves', 'issue', 'origin', 'points', 'purposes', 'siteCheck', 'summary', 'version']);
  assert.equal('flags' in v2, false);
  assert.equal(v2.siteCheck, GENERATED.siteCheck);
  const fromDraft = M.proposalV2FromDraft(GENERATED, { ...EDITED, summary: '直した' });
  assert.equal(fromDraft.summary, '直した');
  assert.equal(fromDraft.hostname, GENERATED.hostname);
  const v1 = M.proposalForSave({ hostname: '', issue: 'x', purposes: ['a', 'a'], improves: [], competitors: [], currentScore: 150, projectedScore: -3, points: [] });
  assert.equal('version' in v1, false);
  assert.equal(v1.hostname, 'your-site.example.jp');
  assert.deepEqual([v1.currentScore, v1.projectedScore, v1.purposes], [100, 0, ['a']]);
  assert.equal(M.storedProposalOf(GENERATED).version, 2);
  assert.equal(M.storedProposalOf({ ...GENERATED, version: 3 }), undefined);
  assert.equal(M.storedProposalOf({ hostname: 'a' }).hostname, 'a');
  assert.equal(M.storedProposalOf(null), undefined);
});

// ---------- 自動保存（§3.3） ----------

test('debounce は 1 秒以上（計画の下限）', () => {
  assert.ok(S.AUTOSAVE_DEBOUNCE_MS >= 1000);
  assert.equal(S.AUTOSAVE_DEBOUNCE_MS, 1500);
});

// ---------- requestId・エラーの文言（§4） ----------

test('requestId: 応答なしの直後の再試行だけ同じ ID、それ以外は新しい ID', () => {
  let n = 0;
  const gen = () => `id-${++n}`;
  assert.equal(S.nextRequestId(null, false, gen), 'id-1');
  assert.equal(S.nextRequestId({ requestId: 'a', outcome: 'no-response' }, true, gen), 'a');
  assert.equal(S.nextRequestId({ requestId: 'a', outcome: 'no-response' }, false, gen), 'id-2');
  assert.equal(S.nextRequestId({ requestId: 'a', outcome: 'responded' }, true, gen), 'id-3');
  assert.deepEqual(S.outcomeOfResponse('a'), { requestId: 'a', outcome: 'responded' });
  assert.equal(S.isNoResponseError({ code: 'functions/internal' }), true);
  assert.equal(S.isNoResponseError({ code: 'functions/deadline-exceeded' }), true);
  assert.equal(S.isNoResponseError(new TypeError('Failed to fetch')), true);
  assert.equal(S.isNoResponseError({ code: 'functions/unavailable' }), false);
  assert.match(S.nextRequestId(null, false), /^[0-9a-f-]{36}$/);
});

test('開始の例外（§4.1）: code:message ごとの文言と再試行の扱い', () => {
  const e = (code, message) => ({ code: `functions/${code}`, message });
  assert.deepEqual(S.startErrorMessage(e('failed-precondition', 'feature-disabled')).retry, 'none');
  assert.equal(S.startErrorMessage(e('failed-precondition', 'answers-missing')).retry, 'answers');
  assert.equal(S.startErrorMessage(e('failed-precondition', 'edits-exist')).retry, 'dialog');
  assert.equal(S.startErrorMessage(e('aborted', 'already-running')).toRunning, true);
  assert.match(S.startErrorMessage(e('resource-exhausted', 'quota-user-day')).message, /^あなたが今日使える回数に達しました/);
  assert.equal(S.startErrorMessage(e('unavailable', 'could not start')).retry, 'new');
  assert.equal(S.startErrorMessage(e('internal', 'could not start')).retry, 'same');
  assert.equal(S.startErrorMessage(e('permission-denied', 'not allowed')).message, 'この案件の下書きを作る権限がありません。');
  assert.equal(S.startErrorMessage(e('failed-precondition', 'project-archived')).retry, 'new');
});

test('結果の code（§4.2）: 返金済みだけ「回数は消費していません」。未知の code は受け皿', () => {
  for (const c of ['ai-config', 'ai-config-missing', 'ai-feature-disabled', 'ai-precondition-changed']) assert.match(S.errorMessage(c), /回数は消費していません/);
  for (const c of ['ai-schema', 'ai-refusal', 'ai-max_tokens', 'ai-rate_limited', 'ai-upstream', 'ai-timeout', 'ai-internal']) assert.doesNotMatch(S.errorMessage(c), /回数は消費していません/);
  assert.equal(S.errorMessage('ai-not-wired'), '下書きを作れませんでした。管理者に連絡してください。');
  assert.equal(S.errorMessage('constructor'), '下書きを作れませんでした。管理者に連絡してください。');
  assert.equal(S.errorMessage(undefined), '下書きを作れませんでした。管理者に連絡してください。');
  assert.equal(S.shortErrorMessage('ai-upstream'), 'AI サービス側の問題で作れませんでした');
});

test('保存の例外（§3.3）: generation-running だけ「変更をコピー」', () => {
  const r = S.saveErrorMessage({ code: 'functions/failed-precondition', message: 'generation-running' });
  assert.equal(r.offerCopy, true);
  assert.match(r.message, /^作り直しが始まったため/);
  assert.equal(S.saveErrorMessage({ code: 'functions/invalid-argument', message: 'edited is invalid: summary' }).message, '入力が上限を超えているか、形式が正しくないため保存できませんでした。文字数を確認してください。');
  assert.equal(S.saveErrorMessage({ code: 'functions/permission-denied', message: 'not allowed' }).offerCopy, false);
  assert.match(S.saveErrorMessage(new Error('offline')).message, /^保存できませんでした。通信状態/);
});

// ---------- 要確認の数字（§3.2）・根拠の名前（§6.2） ----------

test('要確認の数字: 今の文に残っているものだけ（全角・桁区切りを同じに数える）', () => {
  assert.deepEqual(S.findFlaggedNumbers('約 3,000 件と１８件', ['18', '3000', '99']), ['18', '3000']);
  assert.deepEqual(S.findFlaggedNumbers('180 件', ['18']), []);
  assert.deepEqual(S.findFlaggedNumbers('18', undefined), []);
  assert.deepEqual(S.remainingFlaggedNumbers(EDITED, ['18']), ['18']);
  assert.deepEqual(S.remainingFlaggedNumbers({ ...EDITED, summary: '問い合わせを増やす' }, ['18']), []);
});

test('根拠キーの表示名は許可リストの全キーにある', () => {
  for (const k of T.AI_EVIDENCE_KEYS) assert.ok(S.EVIDENCE_LABELS[k], k);
  assert.equal(S.evidenceLabel('unknown-key'), 'unknown-key');
});

test('aiDraftState.ts・proposalV2Format.ts は React・Firebase・mode.ts を import しない（DEC lead F8）', () => {
  for (const f of ['aiDraftState.ts', 'proposalV2Format.ts']) {
    const src = readFileSync(join(root, 'src/features/requirements/aiDraft', f), 'utf8');
    assert.doesNotMatch(src, /from '(react|firebase[^']*|@mui[^']*|@\/repositories[^']*|@\/live[^']*)'/, f);
  }
});
