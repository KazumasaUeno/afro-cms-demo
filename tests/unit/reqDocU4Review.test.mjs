// U4 のレビュー指摘の修正（離れるときの判定・AI追加の項目名・「内容を確認した」の上書き防止・送り直しの条件・コピーの全文・import の向き・PDF の注記）。
// 実行: npm run test:unit（tests/unit/register.mjs の resolve hook で src/ の .ts を直接読む）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = await import('@/features/requirements/aiDraft/reqDocView');
const S = await import('@/features/requirements/aiDraft/aiDraftState');
const C = await import('@/shared/ai/reqDocCatalog');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(root, 'src', p), 'utf8');
const cat = C.REQ_DOC_CATALOG['0.1'];

function fullDoc() {
  const items = {};
  for (const i of cat.items) {
    items[i.id] = i.kubun === 'fixed' ? { status: 'std_pending', text: '', evidence: [], by: 'server' } : { status: 'proposed', text: `${i.label}の内容`, evidence: ['q-issue'], by: 'ai' };
  }
  const notes = Object.fromEntries(cat.chapters.filter((c) => c.hasNotes).map((c) => [c.id, '']));
  return {
    items, notes,
    added: [{ id: 'a01', chapterId: 'c07', label: 'チャット', status: 'proposed', text: '問い合わせ 3 件', reason: '要望', evidence: ['q-feature'], source: 'ai_added' }],
    cover: { client: '株式会社A 部長', vendor: '', author: '', approver: '' },
  };
}
const ed = (doc = fullDoc()) => ({ summary: '要約', points: [{ id: 'p1', area: 'UX', priority: 'high', title: '見出し', detail: '内容', impact: '効果', evidence: [] }], doc });

// ---------------- MAJOR 1: 画面を離れるとき ----------------

test('離れるときの判定: 送るもの無し＝go／送れる＝flush／欠け・失敗＝confirm', () => {
  assert.equal(S.leaveDecision({ save: 'idle', hold: 0 }), 'go');
  assert.equal(S.leaveDecision({ save: 'saved', hold: 0 }), 'go');
  assert.equal(S.leaveDecision({ save: 'pending', hold: 0 }), 'flush');
  assert.equal(S.leaveDecision({ save: 'saving', hold: 0 }), 'flush');
  assert.equal(S.leaveDecision({ save: 'pending', hold: 1 }), 'confirm', '理由・項目名の欠けで止めている');
  assert.equal(S.leaveDecision({ save: 'failed', hold: 0 }), 'confirm');
  assert.equal(S.leaveDecision({ save: 'failed', hold: 2 }), 'confirm');
  assert.equal(S.shouldBlockLeave({ save: 'idle', hold: 0 }), false);
  assert.equal(S.shouldBlockLeave({ save: 'pending', hold: 0 }), true);
  assert.equal(S.shouldBlockLeave({ save: 'failed', hold: 0 }), true);
  assert.match(S.LEAVE_COPY.body('理由が未入力'), /破棄されます/);
});

test('LiveRequirementsPage: アプリの中の移動を useBlocker で止め、送れないときは破棄／続けるを確かめる（RouterLink の onClick で先に移らない）', () => {
  const s = src('live/pages/LiveRequirementsPage.tsx');
  assert.match(s, /useBlocker\(/);
  assert.match(s, /shouldBlockLeave\(/);
  assert.match(s, /leaveDecision\(/);
  assert.match(s, /ai\.discardPending\(\)/);
  assert.match(s, /LEAVE_COPY\.stay/);
  assert.match(s, /LEAVE_COPY\.discard/);
  assert.doesNotMatch(s, /const leave = /, '移動前に送るだけで、送れなくても移ってしまう古い leave() を残さない');
  // 同じ画面の中（autoStart の state を消す replace）は止めない
  assert.match(s, /currentLocation\.pathname !== nextLocation\.pathname/);
  // ルーターは data router（useBlocker が使える）
  assert.match(src('live/LiveApp.tsx'), /createBrowserRouter/);
});

// ---------------- MAJOR 2: AI追加の項目名が空 ----------------

test('AI追加の項目名が空（空白だけも）なら保存を止め、提出も止める（サーバーは label 1 文字以上）', () => {
  const e = ed();
  assert.equal(V.missingAddedLabels(e.doc), 0);
  const empty = V.setAdded(e, 'a01', { label: '' });
  assert.equal(V.missingAddedLabels(empty.doc), 1);
  assert.deepEqual(V.saveHoldReasons(empty), { naReason: 0, addedLabel: 1 });
  assert.equal(V.saveHoldCount(empty), 1);
  assert.equal(V.saveHoldCount(V.setAdded(e, 'a01', { label: '  ' })), 1);
  assert.deepEqual(V.reqDocSubmitBlock(empty, '0.1'), { kind: 'added-label', count: 1 });
  assert.equal(V.submitBlockText({ kind: 'added-label', count: 1 }), V.REQ_DOC_COPY.addedLabelHold(1));
  // 理由と項目名の両方が欠けると両方の件数
  const both = V.setAdded(empty, 'a01', { status: 'na', text: '' });
  assert.deepEqual(V.saveHoldReasons(both), { naReason: 1, addedLabel: 1 });
  assert.equal(V.saveHoldCount(both), 2);
  assert.equal(V.saveHoldText(V.saveHoldReasons(both)), `${V.REQ_DOC_COPY.naReasonHold(1)}／${V.REQ_DOC_COPY.addedLabelHold(1)}`);
  assert.equal(V.saveHoldText({ naReason: 0, addedLabel: 0 }), '');
  // v2・null は 0
  assert.deepEqual(V.saveHoldReasons({ summary: '', points: [], draft: {} }), { naReason: 0, addedLabel: 0 });
  assert.deepEqual(V.saveHoldReasons(null), { naReason: 0, addedLabel: 0 });
});

test('AddedEditCell の項目名の欄に誤りを出す', () => {
  const s = src('features/requirements/aiDraft/ReqDocV3Edit.tsx');
  assert.match(s, /label="項目名"[\s\S]{0,400}error=\{!item\.label\.trim\(\) \? REQ_DOC_COPY\.addedLabelRequired : undefined\}/);
});

// ---------------- NIT 11: 形の崩れた値で落ちない ----------------

test('文が文字列でない項目でも落ちない（欠けとして数える）', () => {
  const d = fullDoc();
  d.items['t07-02'] = { status: 'na', text: undefined, evidence: [], by: 'ai' };
  d.items['t01-01'] = { status: 'proposed', text: null, evidence: [], by: 'ai' };
  d.added[0] = { ...d.added[0], status: 'na', text: 3, label: undefined };
  assert.equal(V.missingNaReasons(d), 2);
  assert.equal(V.missingAddedLabels(d), 1);
  assert.ok(V.requiredOpenCount(d, '0.1') >= 1);
});

// ---------------- MINOR 3: 「内容を確認した」で手元の編集を上書きしない ----------------

test('「内容を確認した」は未保存の編集・欠け・生成中は押せない', () => {
  assert.equal(S.canConfirmGenerated({ save: 'idle', hold: 0, running: false }), true);
  assert.equal(S.canConfirmGenerated({ save: 'saved', hold: 0, running: false }), true);
  for (const save of ['pending', 'saving', 'failed']) assert.equal(S.canConfirmGenerated({ save, hold: 0, running: false }), false, save);
  assert.equal(S.canConfirmGenerated({ save: 'idle', hold: 1, running: false }), false);
  assert.equal(S.canConfirmGenerated({ save: 'idle', hold: 0, running: true }), false);
  // ボタンと hook の両方が同じ判定を見る
  assert.match(src('features/requirements/aiDraft/AiDraftReviewV3.tsx'), /disabled=\{!canConfirmGenerated\(/);
  assert.match(src('features/requirements/aiDraft/useAiDraft.ts'), /if \(!canConfirmGenerated\(/);
});

// ---------------- MINOR 4: 送り直しの条件 ----------------

test('承認の依頼の前の送り直し: submitReady が無い・false・別の版なら送り直す', () => {
  assert.equal(V.needsResave(undefined, '0.1'), true);
  assert.equal(V.needsResave({ requiredOk: false, templateVersion: '0.1' }, '0.1'), true);
  assert.equal(V.needsResave({ requiredOk: true, templateVersion: '0.0' }, '0.1'), true);
  assert.equal(V.needsResave({ requiredOk: true, templateVersion: '0.1' }, '0.1'), false);
  assert.match(src('live/pages/LiveRequirementsPage.tsx'), /needsResave\(ai\.doc\?\.submitReady, g\.template\?\.version/);
});

// ---------------- MINOR 5: 「変更をコピー」の全文は 1 か所 ----------------

test('editableTextV3: 要約・改善ポイント・表紙・項目（名前と状態）・AI追加（名前・採否・内容・理由）・特記事項を漏らさない', () => {
  const d = fullDoc();
  d.items['t07-02'] = { status: 'na', text: '不要のため', evidence: [], by: 'ai' };
  d.notes.c01 = '追加費用なし';
  d.cover.vendor = '株式会社アフロ 営業部';
  d.added[0] = { ...d.added[0], label: 'チャット窓口', status: 'na', text: '今回は見送り', reason: '問い合わせの要望' };
  const t = V.editableTextV3(ed(d), '0.1');
  for (const s of ['要約', '■ 見出し', '効果', '発注者: 株式会社A 部長', '受注者: 株式会社アフロ 営業部', '■ 背景・課題（確定案）', '（不採用）', '不要のため',
    '■ チャット窓口（追加項目・不採用）', '今回は見送り', '追加した理由: 問い合わせの要望', `■ プロジェクト概要・体制 ${V.REQ_DOC_COPY.notesLabel}`, '追加費用なし']) {
    assert.ok(t.includes(s), s);
  }
  assert.doesNotMatch(t, /作成者: |承認者: /, '空の表紙の欄は出さない');
});

test('useAiDraft の pendingText は v3 を editableTextV3 に任せる（内側で別の v3 の組み立てを持たない）', () => {
  const s = src('features/requirements/aiDraft/useAiDraft.ts');
  assert.match(s, /return editableTextV3\(e, /);
  assert.doesNotMatch(s, /e\.doc\.added\.flatMap/);
  assert.match(src('features/requirements/aiDraft/AiDraftEditor.tsx') + src('features/requirements/aiDraft/editorParts.tsx'), /ai\.pendingText\(\)/);
});

// ---------------- MINOR 6: import の向き（表示だけの画面に編集を引き込まない・循環なし） ----------------

const SRC = join(root, 'src');
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c)) return c;
  return null;
}
/** 値として読む import だけ（import type・export type は実行時に読まない） */
function runtimeImports(file) {
  const s = readFileSync(file, 'utf8');
  const out = [];
  for (const m of s.matchAll(/^(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    const r = resolveImport(file, m[1]);
    if (r) out.push(r);
  }
  return out;
}
function reachable(entry) {
  const seen = new Set();
  const stack = [join(SRC, entry)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...runtimeImports(f));
  }
  return [...seen].map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'));
}
const EDITOR = ['features/requirements/aiDraft/AiDraftEditor.tsx', 'features/requirements/aiDraft/AiDraftReviewV3.tsx', 'features/requirements/aiDraft/ReqDocV3Edit.tsx', 'features/requirements/aiDraft/editorParts.tsx', 'features/requirements/aiDraft/useAiDraft.ts'];

test('表示だけの ProposalView・ReqDocChapters（demo の要件定義書・お客様の承認画面）は編集の部品を読まない', () => {
  for (const entry of ['features/requirements/ProposalView.tsx', 'features/requirements/aiDraft/ReqDocChapters.tsx', 'features/requirements/RequirementsDocPage.tsx', 'live/pages/PortalApprovalPage.tsx']) {
    const r = reachable(entry);
    for (const e of EDITOR) assert.equal(r.includes(e), false, `${entry} → ${e}`);
  }
});

test('編集の部品の葉（editorParts）は編集の画面を読まない・AiDraftEditor ↔ AiDraftReviewV3／ReqDocV3Edit の循環が無い', () => {
  const leaf = reachable('features/requirements/aiDraft/editorParts.tsx');
  for (const e of ['features/requirements/aiDraft/AiDraftEditor.tsx', 'features/requirements/aiDraft/AiDraftReviewV3.tsx', 'features/requirements/aiDraft/ReqDocV3Edit.tsx']) {
    assert.equal(leaf.includes(e), false, e);
  }
  for (const e of ['features/requirements/aiDraft/AiDraftReviewV3.tsx', 'features/requirements/aiDraft/ReqDocV3Edit.tsx']) {
    assert.equal(reachable(e).includes('features/requirements/aiDraft/AiDraftEditor.tsx'), false, `${e} → AiDraftEditor`);
  }
});

test('ReqDocChapters の表示の描き方: 編集が無ければ行は表示のまま（demo・お客様の画面の経路）', () => {
  const s = src('features/requirements/aiDraft/ReqDocChapters.tsx');
  assert.match(s, /const cell = \(r: ReqDocRow\) => \(editing \? editing\.cell\(r\) \?\? value\(r\) : value\(r\)\);/);
  assert.match(s, /\{!editing && ch\.notesLine && /);
  assert.doesNotMatch(s, /from ['"][^'"]*(ReqDocV3Edit|AiDraftEditor|editorParts)['"]/);
});

// ---------------- NIT 9: PDF の 4. 非機能要件との重なりの注記は 1 回 ----------------

test('PDF: 重なりの注記は 23 章に 1 回だけ（4. 非機能要件の前置きに重ねない）', () => {
  const p = { hostname: 'ex.jp', issue: '', purposes: [], improves: [], competitors: [], siteCheck: null, origin: { kind: 'ai', promptVersion: 'p', model: 'm' },
    version: 3, template: { id: 'TPL-WEB-REQ', version: '0.1' }, summary: '', points: [], doc: fullDoc() };
  const html = V.reqDocChaptersHtml(p, { status: 'analyzed' });
  assert.equal(html.split(V.REQ_DOC_COPY.ch23.overlap).length - 1, 1);
  assert.doesNotMatch(src('features/requirements/requirementsDoc.ts'), /ch23\.overlap/);
});

// ---------------- 2026-11-26 ユーザー決定: 開いたときは「表示」・主操作の行に説明を置かない ----------------

test('「表示／編集」の既定は表示（REQ_DOC_DEFAULT_MODE）。切り替えは mode の state だけで、編集中の値は ai.local に残る', () => {
  assert.equal(V.REQ_DOC_DEFAULT_MODE, 'view');
  const s = src('features/requirements/aiDraft/AiDraftReviewV3.tsx');
  assert.match(s, /useState<'view' \| 'edit'>\(REQ_DOC_DEFAULT_MODE\)/);
  // 表示でも編集でも同じ local（ai.local）から描く（切り替えで編集を捨てない）
  assert.match(s, /const local: AiEditableV3 = ai\.local && isEditableV3\(ai\.local\)/);
});

test('PageHeader の主操作の行にボタンの下の説明・保存の状態を置かない（状態の行の Note へ）', () => {
  const s = src('features/requirements/aiDraft/AiDraftReviewV3.tsx');
  const actions = s.slice(s.indexOf('const actions = ('), s.indexOf('const showSaveStatus'));
  assert.doesNotMatch(actions, /Typography|SaveStatus/);
  assert.match(s, /<Note tone="danger" role="alert" id=\{reasonId\}/);
});

test('根拠キーの表示名: v3 の site_text・project:*・schedule:* も日本語で出す', () => {
  assert.equal(S.evidenceLabel('site_text'), '現行サイトの本文');
  assert.equal(S.evidenceLabel('project:siteName'), '案件名');
  assert.equal(S.evidenceLabel('q-issue'), '現在の課題');
});
