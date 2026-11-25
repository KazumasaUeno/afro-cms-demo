// 要件定義書ひな型の項目カタログ（docs/design/REQUIREMENTS_DOC_TEMPLATE.md §1・§2・§7 U1）。
// 抜き出した本文（docs/reference/requirements-template-v0.1.extracted.txt）をこのテストで読み直し、カタログ 0.1 と照合する。
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = await import('@/shared/ai/reqDocCatalog');
const T = await import('@/types/aiDraft');
const R = await import('@/data/requirements');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KUBUN = { 固定: 'fixed', 個別: 'individual', 選択: 'optional' };

/** 抜き出した本文 → 章（項目のある章だけ）と項目 */
function parseTemplate() {
  const lines = readFileSync(join(root, 'docs', 'reference', 'requirements-template-v0.1.extracted.txt'), 'utf8').split(/\r?\n/);
  const chapters = [];
  const items = [];
  let ch = null;
  for (let i = 0; i < lines.length; i++) {
    const head = /^1\| (\d\d)  (.+)$/.exec(lines[i]);
    if (head) {
      ch = { no: head[1], title: head[2], hasNotes: false, items: [] };
      chapters.push(ch);
      continue;
    }
    if (!ch) continue;
    const it = /^\| (.+?)  ｜ (固定|個別|選択)$/.exec(lines[i]);
    if (it) {
      const body = lines[i + 1] ?? '';
      const target = (/について、(.+?)を確認のうえ/.exec(body) ?? /確認対象：(.+?)。/.exec(body))?.[1];
      assert.ok(target, `確認対象が読めない: ${lines[i]}`);
      const row = { chapterNo: ch.no, label: it[1], kubun: KUBUN[it[2]], target };
      ch.items.push(row);
      items.push(row);
      continue;
    }
    if (/^\| 特記事項・対象外・追加費用・承認状況/.test(lines[i])) ch.hasNotes = true;
  }
  return { chapters: chapters.filter((c) => c.items.length > 0), items };
}

const TPL = parseTemplate();
const CAT = C.REQ_DOC_CATALOG['0.1'];
const count = (xs, f) => xs.filter(f).length;

test('版: TPL-WEB-REQ 0.1 があり、reqDocCatalogOf で引ける（無い版は undefined）', () => {
  assert.equal(C.REQ_DOC_TEMPLATE.id, 'TPL-WEB-REQ');
  assert.equal(C.REQ_DOC_TEMPLATE.version, '0.1');
  assert.equal(C.reqDocCatalogOf('0.1'), CAT);
  assert.equal(C.reqDocCatalogOf('9.9'), undefined);
  assert.equal(C.reqDocCatalogOf('toString'), undefined);
});

test('本文の件数: 章 19・項目 129・固定 32／個別 74／選択 23（設計 §1.1 の数え方と一致）', () => {
  assert.equal(TPL.chapters.length, 19);
  assert.equal(TPL.items.length, 129);
  assert.equal(count(TPL.items, (x) => x.kubun === 'fixed'), 32);
  assert.equal(count(TPL.items, (x) => x.kubun === 'individual'), 74);
  assert.equal(count(TPL.items, (x) => x.kubun === 'optional'), 23);
});

test('カタログの件数: 章 19・項目 129・固定 32／個別 74／選択 23', () => {
  assert.equal(CAT.chapters.length, 19);
  assert.equal(CAT.items.length, 129);
  assert.equal(count(CAT.items, (x) => x.kubun === 'fixed'), 32);
  assert.equal(count(CAT.items, (x) => x.kubun === 'individual'), 74);
  assert.equal(count(CAT.items, (x) => x.kubun === 'optional'), 23);
});

test('章: 番号・名前・特記欄の有無が本文と一致。09・13・20 は欠番のまま、16 だけ特記欄なし', () => {
  assert.deepEqual(
    CAT.chapters.map((c) => ({ id: c.id, no: c.no, title: c.title, hasNotes: c.hasNotes })),
    TPL.chapters.map((c) => ({ id: `c${c.no}`, no: c.no, title: c.title, hasNotes: c.hasNotes })),
  );
  const nos = CAT.chapters.map((c) => c.no);
  for (const missing of ['09', '13', '20', '23']) assert.ok(!nos.includes(missing), `${missing} 章がある`);
  assert.deepEqual(CAT.chapters.filter((c) => !c.hasNotes).map((c) => c.no), ['16']);
});

test('章ごとの件数（固定/個別/選択）が本文と一致', () => {
  for (const ch of TPL.chapters) {
    const mine = CAT.items.filter((x) => x.chapterId === `c${ch.no}`);
    for (const k of ['fixed', 'individual', 'optional']) {
      assert.equal(count(mine, (x) => x.kubun === k), count(ch.items, (x) => x.kubun === k), `${ch.no} 章 ${k}`);
    }
    assert.equal(mine.length, ch.items.length, `${ch.no} 章`);
  }
});

test('項目: 並び・章・名前・区分・確認対象が本文と一致し、id は t{章}-{章内の連番}（版 0.1 の id を固定）', () => {
  const seq = {};
  const expected = TPL.items.map((x) => {
    seq[x.chapterNo] = (seq[x.chapterNo] ?? 0) + 1;
    return { id: `t${x.chapterNo}-${String(seq[x.chapterNo]).padStart(2, '0')}`, chapterId: `c${x.chapterNo}`, label: x.label, kubun: x.kubun, target: x.target };
  });
  assert.deepEqual(CAT.items.map(({ id, chapterId, label, kubun, target }) => ({ id, chapterId, label, kubun, target })), expected);
});

test('id: 項目・章とも重複なし、項目の章 id はすべてカタログの章', () => {
  const ids = CAT.items.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const chIds = CAT.chapters.map((c) => c.id);
  assert.equal(new Set(chIds).size, chIds.length);
  for (const x of CAT.items) assert.ok(chIds.includes(x.chapterId), x.id);
});

test('fill: ai 41・server 8・human 48・standard 32（設計 §2）。値は REQ_DOC_FILLS の中だけ', () => {
  for (const x of CAT.items) assert.ok(T.REQ_DOC_FILLS.includes(x.fill), x.id);
  assert.equal(count(CAT.items, (x) => x.fill === 'ai'), 41);
  assert.equal(count(CAT.items, (x) => x.fill === 'server'), 8);
  assert.equal(count(CAT.items, (x) => x.fill === 'human'), 48);
  assert.equal(count(CAT.items, (x) => x.fill === 'standard'), 32);
});

test('固定: すべて fill=standard で材料なし（AI に書かせない）。固定以外は standard にしない', () => {
  for (const x of CAT.items) {
    if (x.kubun === 'fixed') {
      assert.equal(x.fill, 'standard', x.id);
      assert.notEqual(x.fill, 'ai', x.id);
      assert.deepEqual(x.feeds, [], x.id);
    } else {
      assert.notEqual(x.fill, 'standard', x.id);
    }
  }
});

test('feeds: 質問 ID はすべて src/data/requirements.ts に実在し、その他のキーは決めた集合の中だけ', () => {
  const qids = new Set(R.REQUIREMENT_QUESTIONS.map((q) => q.id));
  const other = new Set([
    ...T.AI_SITE_CHECK_KEYS, 'site_text', 'project:siteName', 'project:clientName',
    'schedule:releaseDate', 'schedule:deliveryDate', 'schedule:buildDue', 'derived:openItems',
  ]);
  let mapped = 0;
  for (const x of CAT.items) {
    assert.equal(new Set(x.feeds).size, x.feeds.length, `${x.id} の feeds が重複`);
    for (const k of x.feeds) {
      if (k.startsWith('q-')) {
        assert.ok(qids.has(k), `${x.id}: 質問 ${k} が無い`);
        mapped++;
      } else {
        assert.ok(other.has(k), `${x.id}: 未知の材料 ${k}`);
      }
    }
  }
  assert.ok(mapped > 0);
});

test('feeds: ai の項目は AI へ送る質問だけを材料にし、材料を 1 つ以上持つ。human は材料なし', () => {
  const sent = new Set(T.AI_SENT_QUESTION_IDS);
  for (const x of CAT.items) {
    if (x.fill === 'ai') {
      assert.ok(x.feeds.length > 0, x.id);
      for (const k of x.feeds) if (k.startsWith('q-')) assert.ok(sent.has(k), `${x.id}: ${k} は AI へ送らない質問`);
      for (const k of x.feeds) assert.ok(!k.startsWith('project:') && k !== 'derived:openItems', `${x.id}: ${k} は AI の材料にしない`);
    }
    if (x.fill === 'human') assert.deepEqual(x.feeds, [], x.id);
  }
});

test('feeds: server が転記する質問は選択式だけ（自由記述は転記しない）', () => {
  const kind = new Map(R.REQUIREMENT_QUESTIONS.map((q) => [q.id, q.kind]));
  for (const x of CAT.items.filter((i) => i.fill === 'server')) {
    assert.ok(x.feeds.length > 0, x.id);
    for (const k of x.feeds) if (k.startsWith('q-')) assert.ok(['single', 'multi'].includes(kind.get(k)), `${x.id}: ${k} は ${kind.get(k)}`);
  }
});

test('feeds: 設計 §2 の主な対応（案件名・顧客名・DNS・日程・未決事項）', () => {
  const by = Object.fromEntries(CAT.items.map((x) => [x.id, x]));
  assert.deepEqual([by['t01-01'].fill, by['t01-01'].feeds], ['server', ['project:siteName']]);
  assert.deepEqual([by['t01-02'].fill, by['t01-02'].feeds], ['server', ['project:clientName']]);
  assert.deepEqual([by['t18-02'].fill, by['t18-02'].feeds], ['server', ['q-dns-switch']]);
  assert.deepEqual([by['t19-05'].fill, by['t19-05'].feeds], ['server', ['schedule:deliveryDate']]);
  assert.deepEqual([by['t19-03'].fill, by['t19-03'].feeds], ['server', ['schedule:buildDue']]);
  assert.equal(by['t19-06'].fill, 'ai');
  assert.ok(by['t19-06'].feeds.includes('schedule:releaseDate'));
  assert.deepEqual([by['t22-01'].fill, by['t22-01'].feeds], ['server', ['derived:openItems']]);
  // 12 章のドメイン・DNS は q-infra・q-dns-note（自由記述）を転記しない
  for (const id of ['t12-01', 't12-02']) for (const k of ['q-infra', 'q-dns-note']) assert.ok(!by[id].feeds.includes(k), id);
});

test('v3 の型の定数: 状態・書いた者・区分・上限（v1/v2 の AI_DRAFT_LIMITS は変えない）', () => {
  assert.deepEqual([...T.REQ_DOC_ITEM_STATUSES], ['proposed', 'open', 'na', 'std_pending']);
  assert.deepEqual([...T.REQ_DOC_ITEM_AUTHORS], ['ai', 'server', 'human']);
  assert.deepEqual([...T.REQ_DOC_KUBUN], ['fixed', 'individual', 'optional']);
  assert.equal(T.REQ_DOC_LIMITS.itemText, 400);
  assert.equal(T.REQ_DOC_LIMITS.added, 10);
  assert.equal(T.REQ_DOC_LIMITS.notes, 400);
  assert.equal(T.REQ_DOC_LIMITS.openQuestions, 20);
  assert.equal(T.REQ_DOC_LIMITS.openQuestion, 200);
  assert.ok(!('itemText' in T.AI_DRAFT_LIMITS));
});

test('isProposalV3: version 3 だけ真（v1・v2・null は偽）', () => {
  assert.equal(T.isProposalV3({ version: 3 }), true);
  assert.equal(T.isProposalV3({ version: 2 }), false);
  assert.equal(T.isProposalV3({ hostname: 'x' }), false);
  assert.equal(T.isProposalV3(null), false);
  assert.equal(T.isProposalV3(undefined), false);
  assert.equal(T.isProposalV2({ version: 3 }), false);
});
