// v3 の編集で 1 文字ごとに全項目の欄を描き直さない（2026-11-28 の入力の固まり。docs/reviews/2026-11-28-reqdoc-edit-freeze.md）。実行: npm run test:unit
// - 欄は React.memo で包み、自分の値と apply（最新の文書に当てる）だけを受け取る
// - memo で描き直さなかった欄の onChange が古い文書で他の欄の入力を消さない（latestApply）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = await import('@/features/requirements/aiDraft/reqDocView');
const C = await import('@/shared/ai/reqDocCatalog');
const L = await import('@/features/requirements/aiDraft/latestApply');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cat = C.REQ_DOC_CATALOG['0.1'];
const editable = cat.items.filter((i) => V.isKubunEditable(i.kubun));

function editableV3() {
  const items = {};
  for (const i of cat.items) {
    items[i.id] = i.kubun === 'fixed' ? { status: 'std_pending', text: '', evidence: [], by: 'server' } : { status: 'proposed', text: `${i.label}の内容`, evidence: [], by: 'ai' };
  }
  const notes = Object.fromEntries(cat.chapters.filter((c) => c.hasNotes).map((c) => [c.id, '']));
  return {
    summary: '要約', points: [],
    doc: { items, notes, added: [{ id: 'a01', chapterId: 'c07', label: 'チャット', status: 'proposed', text: '', reason: '', evidence: [], source: 'ai_added' }], cover: { client: '', vendor: '', author: '', approver: '' } },
  };
}

test('memo の前提: 1 項目の変更で他の項目・AI追加・特記事項の参照は変わらない（setItem・setAdded・setNote）', () => {
  const e = editableV3();
  const [a, b] = editable;
  const n = V.setItem(e, a.id, { text: 'x' }, cat);
  assert.notEqual(n.doc.items[a.id], e.doc.items[a.id]);
  for (const i of cat.items) if (i.id !== a.id) assert.equal(n.doc.items[i.id], e.doc.items[i.id], i.id);
  assert.equal(n.doc.added[0], e.doc.added[0]);
  assert.equal(n.doc.notes, e.doc.notes);
  const m = V.setAdded(n, 'a01', { text: 'y' });
  assert.equal(m.doc.items, n.doc.items);
  assert.equal(m.doc.items[b.id], e.doc.items[b.id]);
  const chapter = cat.chapters.find((c) => c.hasNotes).id;
  const k = V.setNote(m, chapter, 'z');
  assert.equal(k.doc.items, m.doc.items);
  assert.equal(k.doc.added[0], m.doc.added[0]);
});

test('makeLatestApply: 古い描画で作った onChange でも、他の欄の入力を消さない', () => {
  const [a, b] = editable;
  const latest = { current: editableV3() };
  const saved = [];
  const commit = { current: (next) => saved.push(next) };
  const apply = L.makeLatestApply(latest, commit);
  // 欄 A と欄 B の onChange はどちらも最初の描画で作られたまま（memo で描き直されていない）
  const onA = (v) => apply((cur) => V.setItem(cur, a.id, { text: v }, cat));
  const onB = (v) => apply((cur) => V.setItem(cur, b.id, { text: v }, cat));
  onA('A1');
  onB('B1'); // 次の描画の前でも A1 を消さない
  onA('A2');
  const last = saved.at(-1);
  assert.equal(saved.length, 3);
  assert.equal(last.doc.items[a.id].text, 'A2');
  assert.equal(last.doc.items[b.id].text, 'B1');
  assert.equal(latest.current, last);
});

test('makeLatestApply: commit は最新の関数を呼ぶ（ref の差し替え）', () => {
  const latest = { current: 1 };
  const calls = [];
  const commit = { current: (n) => calls.push(['old', n]) };
  const apply = L.makeLatestApply(latest, commit);
  commit.current = (n) => calls.push(['new', n]);
  apply((x) => x + 1);
  assert.deepEqual(calls, [['new', 2]]);
});

test('ReqDocV3Edit: 行の欄（項目・AI追加・特記事項）は memo で、文書全体（edit / edit.local）を受け取らない', () => {
  const src = readFileSync(join(root, 'src/features/requirements/aiDraft/ReqDocV3Edit.tsx'), 'utf8');
  for (const name of ['ItemEditCell', 'AddedEditCell', 'NotesEditCell']) {
    assert.match(src, new RegExp(`export const ${name} = memo\\(function ${name}\\(`), `${name} が memo で包まれていない`);
    assert.doesNotMatch(src, new RegExp(`<${name}[^>]*\\bedit=\\{`), `${name} に edit（文書全体）を渡している`);
  }
  // 欄の中で描画時点の文書を基に作り直さない（最新の文書に当てる apply を使う）
  assert.doesNotMatch(src, /edit\.onChange\((setItem|setAdded|setNote|removeAdded)\(edit\.local/);
  assert.match(src, /makeLatestApply\(latest, commit\)/);
});
