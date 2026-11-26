// 提案 v3（会社標準ひな型）の表示・編集・提出の判定（docs/design/REQDOC_U4_UI.md §2・§3・§4）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = await import('@/features/requirements/aiDraft/reqDocView');
const C = await import('@/shared/ai/reqDocCatalog');
const M = await import('@/live/model');
const F = await import('@/features/requirements/aiDraft/proposalV2Format');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cat = C.REQ_DOC_CATALOG['0.1'];

/** 全項目が埋まった v3 の doc（固定は std_pending、それ以外は proposed） */
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
const base = { hostname: 'ex.jp', issue: '課題', purposes: [], improves: [], competitors: [], siteCheck: null, origin: { kind: 'ai', promptVersion: 'p', model: 'm' } };
const v3 = (doc = fullDoc()) => ({ ...base, version: 3, template: { id: 'TPL-WEB-REQ', version: '0.1' }, summary: '要約', points: [], doc });

test('版の判定は v3 → v2 → v1', () => {
  assert.equal(V.proposalVersionOf(v3()), 3);
  assert.equal(V.proposalVersionOf({ ...base, version: 2, summary: '', points: [], draft: {} }), 2);
  assert.equal(V.proposalVersionOf({ ...base, points: [], currentScore: 1, projectedScore: 2 }), 1);
  assert.equal(V.proposalVersionOf(undefined), 1);
});

test('保存値の読み出しは v3 を落とさない（storedProposalOf・proposalForSave）', () => {
  const p = v3();
  assert.equal(M.storedProposalOf(p)?.version, 3);
  const saved = M.proposalForSave(p);
  assert.deepEqual(Object.keys(saved).sort(), ['competitors', 'doc', 'hostname', 'improves', 'issue', 'origin', 'points', 'purposes', 'siteCheck', 'summary', 'template', 'version'].sort());
  assert.equal(M.storedProposalOf({ version: 9 }), undefined);
});

test('表示の行: 全章・ひな型の見出しと文・状態のチップ・固定は確認中', () => {
  const view = V.buildReqDocView(fullDoc(), '0.1');
  assert.equal(view.catalogMissing, false);
  assert.equal(view.chapters.length, cat.chapters.length);
  assert.equal(view.chapters[0].heading, '01  プロジェクト概要・体制');
  assert.equal(view.chapters[0].intro, '本章では、プロジェクト概要・体制に関する適用範囲および具体的な仕様を定める。以下の内容を確認し、合意した事項を記載する。');
  const ind = view.chapters[0].rows.find((r) => r.id === 't01-03');
  assert.equal(ind.label, '背景・課題  ｜ 個別');
  assert.equal(ind.text, '背景・課題について、現状の課題を確認のうえ、案件固有の条件を定める。確定内容：背景・課題の内容。');
  assert.deepEqual(ind.chips, []);
  const fixed = view.chapters.find((c) => c.id === 'c11').rows[0];
  assert.deepEqual(fixed.chips.map((c) => c.label), ['確認中']);
  assert.equal(fixed.text, 'ホスティング方式については受注者の標準仕様を適用する予定とする。確認対象：提供事業者・プラン。標準仕様：［確認中・確定後記載］。');
  assert.deepEqual(fixed.captions, []);
  const opt = view.chapters.find((c) => c.id === 'c07').rows[0];
  assert.deepEqual(opt.chips.map((c) => c.label), ['採用案']);
  assert.equal(opt.text, '問い合わせの提供有無および適用条件を双方で決定する。確認対象：項目・宛先・自動返信・迷惑対策。採否・仕様：問い合わせの内容。');
  // 表紙: 案件名は 01 章の案件名の項目、作成者・承認者は 2 欄を 1 行に
  assert.deepEqual(view.cover.lines.slice(0, 4), ['案件名：案件名の内容', '発注者：株式会社A 部長', '受注者：［記入］', '作成者・承認者：［記入］']);
  assert.equal(view.counts.pending, cat.items.filter((i) => i.kubun === 'fixed').length);
  assert.equal(view.counts.open, 0);
});

test('お客様に出さない欄: 行に根拠・書いた元・「AI追加」が無い（追加項目と出す）', () => {
  const view = V.buildReqDocView(fullDoc(), '0.1');
  const rows = view.chapters.flatMap((c) => c.rows);
  for (const r of rows) {
    assert.equal('evidence' in r, false);
    assert.equal('by' in r, false);
  }
  const json = JSON.stringify(view);
  assert.doesNotMatch(json, /AI追加/);
  assert.doesNotMatch(json, /q-issue|q-feature/);
  const added = rows.find((r) => r.kind === 'added');
  assert.deepEqual(added.chips.map((c) => c.label), ['追加項目', '採用案']);
  assert.equal(added.captions[0], '追加した理由: 要望');
});

test('未確定・対象外・特記事項・旧版の項目・カタログ無し', () => {
  const d = fullDoc();
  d.items['t01-03'] = { status: 'proposed', text: '  ', evidence: [], by: 'ai' };
  d.items['t07-02'] = { status: 'na', text: '不要', evidence: ['q-feature'], by: 'ai' };
  d.notes.c01 = '追加費用なし';
  d.items['t99-01'] = { status: 'proposed', text: '旧', evidence: [], by: 'ai' };
  const view = V.buildReqDocView(d, '0.1');
  const c01 = view.chapters[0];
  const r = c01.rows.find((x) => x.id === 't01-03');
  assert.deepEqual(r.chips.map((c) => c.label), ['未確定']);
  assert.match(r.text, /確定内容：［記入］。$/);
  assert.equal(c01.notesLine, '特記事項・対象外・追加費用・承認状況：追加費用なし');
  assert.equal(c01.confirmed, c01.total - 1);
  const na = view.chapters.find((c) => c.id === 'c07').rows[1];
  assert.deepEqual(na.chips.map((c) => c.label), ['不採用']);
  assert.match(na.text, /採否・仕様：不要。$/);
  assert.equal(view.legacy.length, 1);
  assert.equal(view.legacy[0].chips[0].label, '旧版の項目');
  assert.equal(view.chapters.find((c) => c.id === 'c16').notesLine, null);
  assert.equal(V.buildReqDocView(d, '9.9').catalogMissing, true);
  assert.deepEqual(V.countChips({ confirmed: 2, open: 0, pending: 1, na: 0 }).map((c) => c.label), ['確定 2', '確認中 1']);
});

test('編集できるのは区分で決まる（固定は入力・状態の操作なし）', () => {
  assert.equal(V.isKubunEditable('fixed'), false);
  assert.deepEqual(V.statusOptions('fixed'), []);
  assert.deepEqual(V.statusOptions('individual').map((o) => o.label), ['確定案', '未確定', '対象外']);
  assert.deepEqual(V.statusOptions('optional').map((o) => o.label), ['採用案', '未確定', '不採用']);
  const e = { summary: '', points: [], doc: fullDoc() };
  assert.equal(V.setItem(e, 't11-01', { status: 'proposed', text: 'x' }, cat), e, '固定は変えない');
  assert.equal(V.setItem(e, 't01-03', { status: 'std_pending' }, cat), e, '固定以外を確認中にしない');
  const e2 = V.setItem(e, 't01-03', { text: 'a'.repeat(500) }, cat);
  assert.equal(e2.doc.items['t01-03'].text.length, 400);
  assert.equal(e2.doc.items['t01-03'].by, 'ai', 'by は変えない');
  assert.equal(V.setItem(e, 't22-01', { text: 'a'.repeat(5000) }, cat).doc.items['t22-01'].text.length, 400 + 20 * 202);
  assert.equal(V.setNote(e, 'c16', 'x'), e, '16 章に特記欄を足さない');
  assert.equal(V.removeAdded(e, 'a01').doc.added.length, 0);
  assert.equal(V.setAdded(e, 'a01', { label: 'x'.repeat(50) }).doc.added[0].label.length, 40);
  assert.equal(V.setCover(e, 'client', 'y'.repeat(200)).doc.cover.client.length, 100);
});

test('提出前に必須の章（01・02・19・21）の未確定・対象外の理由の欠けで止める', () => {
  const e = { summary: '', points: [], doc: fullDoc() };
  assert.equal(V.reqDocSubmitBlock(e, '0.1'), null);
  let x = V.setItem(e, 't19-01', { status: 'open', text: '' }, cat);
  x = V.setItem(x, 't21-02', { status: 'proposed', text: '' }, cat);
  x = V.setItem(x, 't03-01', { status: 'open' }, cat); // 必須でない章は数えない
  assert.equal(V.requiredOpenCount(x.doc, '0.1'), 2);
  assert.deepEqual(V.reqDocSubmitBlock(x, '0.1'), { kind: 'required-open', count: 2 });
  assert.equal(V.submitBlockText({ kind: 'required-open', count: 2 }), '01・02・19・21 章に未確定の項目が 2 件あります。埋めると承認を依頼できます。');
  const na = V.setItem(e, 't07-02', { status: 'na', text: '' }, cat);
  assert.equal(V.missingNaReasons(na.doc), 1);
  assert.equal(V.reqDocSubmitBlock(na, '0.1').kind, 'na-reason');
  assert.equal(V.reqDocSubmitBlock(e, '9.9').kind, 'catalog-missing');
});

test('要確認の数字: 「id:数字」と「数字」を分けて読む（開発者だけ）', () => {
  const flags = ['18', 't01-03:5', 'a01:3', 't01-030:7'];
  assert.deepEqual(V.flagsFor(flags), ['18']);
  assert.deepEqual(V.flagsFor(flags, 't01-03'), ['5']);
  assert.deepEqual(V.flagsFor(flags, 'a01'), ['3']);
  const d = fullDoc();
  d.items['t01-03'].text = '5 年で';
  const rem = V.remainingFlaggedV3({ summary: '18 件', points: [], doc: d }, flags, '0.1');
  assert.deepEqual(rem, ['18', '背景・課題: 5', 'チャット: 3']);
});

test('PDF: v3 の表紙・章・ひな型の文と状態・追加項目・23 章（esc 済み）。v2 の HTML は変えない', () => {
  const d = fullDoc();
  d.items['t01-03'] = { status: 'open', text: '', evidence: [], by: 'ai' };
  d.items['t07-02'] = { status: 'na', text: '<b>不要</b>', evidence: ['q-feature'], by: 'ai' };
  const html = V.reqDocChaptersHtml(v3(d), { status: 'analyzed' });
  assert.match(html, /<h3>WEBサイト構築・ホスティング要件定義書<\/h3>/);
  assert.match(html, /発注者：株式会社A 部長/);
  assert.match(html, /<h3>01  プロジェクト概要・体制<\/h3>/);
  assert.match(html, /確定内容：［記入］。<br><span class="muted">未確定<\/span>/);
  assert.match(html, /採否・仕様：&lt;b&gt;不要&lt;\/b&gt;。<br><span class="muted">不採用<\/span>/);
  assert.match(html, /標準仕様：［確認中・確定後記載］/);
  assert.match(html, /チャット（追加項目）/);
  assert.match(html, /23  標準仕様の管理・最終承認/);
  assert.match(html, /お客様の承認待ち/);
  assert.doesNotMatch(html, /AI追加|q-feature/);
  assert.doesNotMatch(F.proposalV2Html(v3(d)), /要件定義書（下書き）/);
  const v2 = { ...base, version: 2, summary: '', points: [], draft: { goal: '', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] } };
  assert.match(F.proposalV2Html(v2), /要件定義書（下書き）/);
});

test('v3 の画面: 版の判定を v3 から・HTML を作らない・Firebase を import しない', () => {
  const pv = readFileSync(join(root, 'src/features/requirements/ProposalView.tsx'), 'utf8');
  assert.match(pv, /proposalVersionOf\(proposal\)/);
  assert.doesNotMatch(pv, /isProposalV2\(proposal\) \? null : proposal/);
  const ed = readFileSync(join(root, 'src/features/requirements/aiDraft/AiDraftEditor.tsx'), 'utf8');
  assert.match(ed, /if \(isProposalV3\(g\)\) return <AiDraftReviewV3/);
  for (const p of ['ReqDocChapters.tsx', 'AiDraftReviewV3.tsx', 'reqDocView.ts']) {
    const s = readFileSync(join(root, 'src/features/requirements/aiDraft', p), 'utf8');
    assert.doesNotMatch(s, /dangerouslySetInnerHTML|innerHTML/, p);
    assert.doesNotMatch(s, /from ['"]firebase\//, p);
  }
});

test('live のつくり方のいまここ（§3.1）', () => {
  assert.equal(V.liveHowToStep('draft', false), 1);
  assert.equal(V.liveHowToStep('draft', true), 2);
  assert.equal(V.liveHowToStep('analyzed', true), 3);
  assert.equal(V.liveHowToStep('approved', false), 4);
});

test('自動保存を止める件数（対象外・不採用の理由が空。v2 は 0。§3.2）', () => {
  const e = { summary: '', points: [], doc: fullDoc() };
  assert.equal(V.saveHoldCount(e), 0);
  const id = cat.items.find((i) => i.kubun === 'individual').id;
  const e2 = V.setItem(e, id, { status: 'na', text: '' }, cat);
  assert.equal(V.saveHoldCount(e2), 1);
  const e3 = V.setAdded(e2, 'a01', { status: 'na', text: ' ' });
  assert.equal(V.saveHoldCount(e3), 2);
  assert.equal(V.saveHoldCount(V.setItem(e3, id, { text: '不要' }, cat)), 1);
  assert.equal(V.saveHoldCount({ summary: '', points: [], draft: {} }), 0);
  assert.equal(V.saveHoldCount(null), 0);
});

test('提出の可否は共有の reqDocRequiredOk（サーバーの submitReady）と一致する', () => {
  const e = { summary: '', points: [], doc: fullDoc() };
  const cases = [
    e,
    V.setItem(e, 't01-01', { status: 'open' }, cat), // 文があっても未確定は不可
    V.setItem(e, 't02-01', { status: 'proposed', text: '   ' }, cat),
    V.setItem(e, 't19-01', { status: 'na', text: '不要' }, cat), // 対象外＋理由は可
    V.setItem(e, 't03-01', { status: 'open', text: '' }, cat), // 必須でない章
  ];
  for (const x of cases) {
    const b = V.reqDocSubmitBlock(x, '0.1');
    assert.equal(b === null || b.kind === 'na-reason', C.reqDocRequiredOk(x.doc, '0.1'), JSON.stringify(b));
  }
  assert.equal(V.requiredOpenCount(cases[1].doc, '0.1'), 1);
  assert.deepEqual(V.requiredChaptersOf('0.1'), C.REQ_DOC_REQUIRED_CHAPTERS['0.1']);
  assert.deepEqual(V.requiredChaptersOf('9.9'), []);
});
