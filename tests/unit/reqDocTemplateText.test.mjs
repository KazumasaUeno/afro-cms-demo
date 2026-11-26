// Word のひな型 v0.1 の文章をそのまま出す（docs/design/REQDOC_U4_UI.md 最終節・2026-11-26 夕のユーザー決定）。
// 空の doc を描いた全行（画面・PDF と同じ buildReqDocView の行）を、抜き出した本文（docs/reference/requirements-template-v0.1.extracted.txt）と照合する。
// 許す違いは空白だけ。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = await import('@/features/requirements/aiDraft/reqDocView');
const C = await import('@/shared/ai/reqDocCatalog');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ws = (s) => s.replace(/\s+/g, ' ').trim();

/** 抜き出した本文の行（行頭の「aa| 」「1| 」「| 」は抜き出しの印なので外す） */
const TEMPLATE = readFileSync(join(root, 'docs', 'reference', 'requirements-template-v0.1.extracted.txt'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => ws(l.replace(/^[^|]*\| ?/, '')));

const cat = C.REQ_DOC_CATALOG['0.1'];
const emptyDoc = () => ({ items: {}, added: [], notes: {}, cover: { client: '', vendor: '', author: '', approver: '' } });
/** サーバーが作る未記入の doc（固定は std_pending、ほかは open・文は空。特記欄は空） */
function serverEmptyDoc() {
  const items = Object.fromEntries(cat.items.map((i) => [i.id, { status: i.kubun === 'fixed' ? 'std_pending' : 'open', text: '', evidence: [], by: 'server' }]));
  return { items, added: [], notes: Object.fromEntries(cat.chapters.filter((c) => c.hasNotes).map((c) => [c.id, ''])), cover: { client: '', vendor: '', author: '', approver: '' } };
}

test('本文の行数: 330 行（表紙 8・本書の目的 3・01〜22 章・23 章 5）', () => {
  assert.equal(TEMPLATE.length, 330);
});

for (const [name, mk] of [['空の doc', emptyDoc], ['サーバーが作る未記入の doc', serverEmptyDoc]]) {
  test(`${name}: 描いた全行がひな型の本文と一致する（順番・文・欠番・16 章の特記欄なしまで）`, () => {
    const lines = V.reqDocTemplateLines(V.buildReqDocView(mk(), '0.1', { status: 'draft' })).map(ws);
    for (let i = 0; i < Math.max(lines.length, TEMPLATE.length); i++) {
      assert.equal(lines[i], TEMPLATE[i], `${i + 1} 行目`);
    }
    assert.equal(lines.length, TEMPLATE.length);
  });

  test(`${name}: PDF の本文にひな型の全行がその順で入る（タグを外して照合）`, () => {
    const p = { hostname: 'ex.jp', issue: '', purposes: [], improves: [], competitors: [], siteCheck: null, origin: { kind: 'ai', promptVersion: 'p', model: 'm' }, version: 3, template: { id: 'TPL-WEB-REQ', version: '0.1' }, summary: '', points: [], doc: mk() };
    const html = V.reqDocChaptersHtml(p, { status: 'draft' });
    const text = ws(html.replace(/<br>|<\/(?:h3|p|tr|th|td)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&'));
    let at = 0;
    for (const l of TEMPLATE) {
      const i = text.indexOf(l, at);
      assert.ok(i >= 0, `PDF に無い・順番が違う: ${l}`);
      at = i + l.length;
    }
  });
}

test('入力があれば［記入］の位置に入る（文末の「。」は重ねない）・固定は確認中のまま', () => {
  const d = serverEmptyDoc();
  d.items['t01-01'] = { status: 'proposed', text: 'コーポレートサイト刷新。', evidence: ['project:siteName'], by: 'server' };
  d.items['t07-01'] = { status: 'na', text: '電話で受ける', evidence: ['q-cv'], by: 'ai' };
  d.notes.c01 = '追加費用なし';
  d.cover = { client: '株式会社A 部長', vendor: '', author: '', approver: '株式会社A 社長' };
  const view = V.buildReqDocView(d, '0.1', { status: 'approved', approvedAt: '2026-11-26T03:00:00.000Z', approvedAtText: '2026/11/26 12:00' });
  const lines = V.reqDocTemplateLines(view);
  assert.ok(lines.includes('案件名について、正式名称を確認のうえ、案件固有の条件を定める。確定内容：コーポレートサイト刷新。'));
  assert.ok(lines.includes('問い合わせの提供有無および適用条件を双方で決定する。確認対象：項目・宛先・自動返信・迷惑対策。採否・仕様：電話で受ける。'));
  assert.ok(lines.includes('ホスティング方式については受注者の標準仕様を適用する予定とする。確認対象：提供事業者・プラン。標準仕様：［確認中・確定後記載］。'));
  assert.ok(lines.includes('特記事項・対象外・追加費用・承認状況：追加費用なし'));
  assert.deepEqual(view.cover.lines, [
    '案件名：コーポレートサイト刷新。', '発注者：株式会社A 部長', '受注者：［記入］', '作成者・承認者：［記入］／株式会社A 社長',
    `承認日：${(() => { const t = new Date('2026-11-26T03:00:00.000Z'); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}`; })()}`,
    '改訂履歴：［版・日付・変更内容・担当者］',
  ]);
  assert.match(view.closing.status, /承認済み/);
  // 状態のチップは文の横（文の代わりにしない）
  const na = view.chapters.find((c) => c.id === 'c07').rows[0];
  assert.deepEqual(na.chips.map((c) => c.label), ['不採用']);
  assert.match(na.text, /^問い合わせの提供有無/);
});

test('ひな型の文は shared のカタログ 1 か所だけ（画面・PDF の部品に文を直書きしない）', () => {
  const files = ['src/features/requirements/aiDraft/ReqDocChapters.tsx', 'src/features/requirements/aiDraft/reqDocView.ts', 'src/features/requirements/requirementsDoc.ts', 'src/features/requirements/ProposalView.tsx', 'src/features/requirements/aiDraft/AiDraftReviewV3.tsx'];
  const probes = ['を確認のうえ、案件固有の条件を定める', '受注者の標準仕様を適用する予定とする', '提供有無および適用条件を双方で決定する', '本章では、', '本書はWEBサイトの構築', '区分：固定＝', '特記事項・対象外・追加費用・承認状況', '発注者承認：'];
  for (const f of files) {
    const s = readFileSync(join(root, f), 'utf8');
    for (const p of probes) assert.equal(s.includes(p), false, `${f} に「${p}」`);
  }
});
