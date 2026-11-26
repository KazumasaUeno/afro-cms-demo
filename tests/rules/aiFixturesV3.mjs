// 提案 v3（要件定義書のひな型 TPL-WEB-REQ。docs/design/REQUIREMENTS_DOC_TEMPLATE.md §3）の Rules テスト用データ。
// - カタログ（章・項目 id・区分）は正 src/shared/ai/reqDocCatalog.ts の本文から読む（Node 22.14 は .ts を直接 import できないため。
//   tests/unit/reqDocCatalog.test.mjs がカタログ自体を検査する）
// - 上限は REQ_DOC_LIMITS（src/types/aiDraft.ts。functions/src/ai/shared/aiDraft.ts へ写される）の値を本文から読む。
//   最大の payload は Functions（functions/src/ai/reqDocEditable.ts validateEditableV3）が通す上限ちょうど。文字数はコードポイントで数えるので
//   4 バイト文字（𠮷）で埋めて、文書の大きさも最悪にする
import { readFileSync } from 'node:fs';
import { T0 } from './fixtures.mjs';
import { GENERATED, MAX_EDITED, MAX_GENERATED, aiDraftDoc } from './aiFixtures.mjs';

const CATALOG_TS = readFileSync(new URL('../../src/shared/ai/reqDocCatalog.ts', import.meta.url), 'utf8');
const AI_TS = readFileSync(new URL('../../src/types/aiDraft.ts', import.meta.url), 'utf8');

export const CHAPTERS = [...CATALOG_TS.matchAll(/\{ id: '(c\d\d)', no: '\d\d', title: '[^']*', hasNotes: (true|false) \}/g)]
  .map((m) => ({ id: m[1], hasNotes: m[2] === 'true' }));
export const ITEMS = [...CATALOG_TS.matchAll(/\{ id: '(t\d\d-\d\d)', chapterId: '(c\d\d)', label: '[^']*', kubun: '(\w+)'/g)]
  .map((m) => ({ id: m[1], chapterId: m[2], kubun: m[3] }));
/** お客様へ出す前に必ず埋める章（REQ_DOC_REQUIRED_CHAPTERS の現行版） */
export const REQUIRED_CHAPTERS = (() => {
  const m = /export const REQ_DOC_REQUIRED_CHAPTERS[\s\S]*?'0\.1': \[([^\]]*)\]/.exec(CATALOG_TS);
  if (!m) throw new Error('reqDocCatalog.ts に REQ_DOC_REQUIRED_CHAPTERS がありません');
  return [...m[1].matchAll(/'(c\d\d)'/g)].map((x) => x[1]);
})();
export const TEMPLATE_VERSION = /export const REQ_DOC_TEMPLATE = \{ id: 'TPL-WEB-REQ', version: '([^']+)'/.exec(CATALOG_TS)?.[1];

function limits() {
  const m = /export const REQ_DOC_LIMITS = \{([\s\S]*?)\} as const;/.exec(AI_TS);
  if (!m) throw new Error('aiDraft.ts に REQ_DOC_LIMITS がありません');
  const out = Object.fromEntries([...m[1].matchAll(/^\s+(\w+): (\d+),/gm)].map((x) => [x[1], Number(x[2])]));
  // openItemsText は式（400 + 20 * (200 + 2)）。同じ式で組み立てて、本文の式と一致することを確かめる
  const oi = /openItemsText: (\d+) \+ (\d+) \* \((\d+) \+ (\d+)\),/.exec(m[1]);
  if (!oi) throw new Error('REQ_DOC_LIMITS.openItemsText の式が読めません');
  out.openItemsText = Number(oi[1]) + Number(oi[2]) * (Number(oi[3]) + Number(oi[4]));
  return out;
}
export const L = limits();

const fill = (n, ch = '𠮷') => ch.repeat(n);
const EVID5 = ['q-issue', 'q-purpose', 'viewport', 'https', 'site_text'];

/** 通常の doc（全 129 項目。固定は std_pending・空文、それ以外は AI の確定案） */
export function docOf({ text = (it) => `${it.id} の確定案`, evidence = ['q-issue'], added = 1 } = {}) {
  const items = Object.fromEntries(ITEMS.map((it) => [it.id, it.kubun === 'fixed'
    ? { status: 'std_pending', text: '', evidence: [], by: 'server' }
    : { status: 'proposed', text: text(it), evidence, by: 'ai' }]));
  return {
    items,
    added: Array.from({ length: added }, (_, i) => ({
      id: `a${String(i + 1).padStart(2, '0')}`, chapterId: 'c07', label: `追加${i + 1}`, status: 'proposed',
      text: '予約機能', reason: '回答に予約の希望がある', evidence: ['q-feature'], source: 'ai_added',
    })),
    notes: Object.fromEntries(CHAPTERS.filter((c) => c.hasNotes).map((c) => [c.id, ''])),
    cover: { client: '株式会社テスト', vendor: '株式会社アフロ', author: '', approver: '' },
  };
}

/** generated（v3。Functions の task.ts が書く形: サーバー欄＋template＋editable＋flags） */
export const GENERATED_V3 = {
  version: 3,
  hostname: GENERATED.hostname, issue: GENERATED.issue, purposes: GENERATED.purposes, improves: GENERATED.improves,
  competitors: GENERATED.competitors, siteCheck: GENERATED.siteCheck,
  origin: { kind: 'ai', promptVersion: 'PRM-REQ-001@2.0.0', model: 'claude-haiku-5-5' },
  template: { id: 'TPL-WEB-REQ', version: TEMPLATE_VERSION },
  summary: GENERATED.summary, points: GENERATED.points,
  doc: docOf(),
  flags: { unsupportedNumbers: [] },
};

export const editedV3Of = (g) => ({ summary: g.summary, points: g.points, doc: g.doc });
export const EDITED_V3 = editedV3Of(GENERATED_V3);

/** お客様へ出す提案 v3（flags を除く 12 キー） */
export function proposalV3(g = GENERATED_V3, e = editedV3Of(g)) {
  return {
    version: 3, hostname: g.hostname, issue: g.issue, purposes: g.purposes, improves: g.improves, competitors: g.competitors,
    siteCheck: g.siteCheck, origin: g.origin, template: g.template, summary: e.summary, points: e.points, doc: e.doc,
  };
}

// ---------------- 上限ちょうど（最大の payload。式の数・文書の大きさの計測にも使う） ----------------
export const MAX_DOC = (() => {
  const d = docOf({ text: (it) => fill(it.id === 't22-01' ? L.openItemsText : L.itemText), evidence: EVID5, added: 0 });
  d.added = Array.from({ length: L.added }, (_, i) => ({
    id: `a${String(i + 1).padStart(2, '0')}`, chapterId: 'c07', label: fill(L.addedLabel), status: 'proposed',
    text: fill(L.itemText), reason: fill(L.addedReason), evidence: EVID5, source: 'ai_added',
  }));
  d.notes = Object.fromEntries(Object.keys(d.notes).map((k) => [k, fill(L.notes)]));
  d.cover = { client: fill(L.coverField), vendor: fill(L.coverField), author: fill(L.coverField), approver: fill(L.coverField) };
  return d;
})();
export const MAX_GENERATED_V3 = {
  ...GENERATED_V3,
  hostname: MAX_GENERATED.hostname, issue: MAX_GENERATED.issue, purposes: MAX_GENERATED.purposes, improves: MAX_GENERATED.improves,
  competitors: MAX_GENERATED.competitors, siteCheck: MAX_GENERATED.siteCheck,
  summary: MAX_EDITED.summary, points: MAX_EDITED.points,
  doc: MAX_DOC,
  flags: { unsupportedNumbers: Array.from({ length: 50 }, () => 'n'.repeat(50)) },
};
export const MAX_EDITED_V3 = editedV3Of(MAX_GENERATED_V3);

/**
 * submitReady の判定（functions saveAiDraftEdits が使う reqDocRequiredOk と同じ規則をテスト側で書き直したもの。
 * 必須の章の全項目が proposed か na で、文が空白だけでない）。食い違いは functions のテスト（ai-flow）が本物の判定で検出する
 */
export function requiredOkOf(doc) {
  return ITEMS.filter((i) => REQUIRED_CHAPTERS.includes(i.chapterId)).every((i) => {
    const it = doc?.items?.[i.id];
    return !!it && (it.status === 'proposed' || it.status === 'na') && typeof it.text === 'string' && it.text.trim() !== '';
  });
}
export const submitReadyOf = (edited) => ({ requiredOk: requiredOkOf(edited?.doc), templateVersion: TEMPLATE_VERSION });

/**
 * aiDrafts/requirements（v3）。submitReady は既定で edited から計算（saveAiDraftEdits が書く形）。
 * submitReady: null で置かない、値を渡せばそのまま置く
 */
export function aiDraftDocV3({ submitReady, ...opts } = {}) {
  const d = aiDraftDoc({ generated: GENERATED_V3, edited: EDITED_V3, ...opts });
  const sr = submitReady === undefined ? (d.edited ? submitReadyOf(d.edited) : null) : submitReady;
  if (sr) d.submitReady = sr;
  return d;
}

/** Firestore の文書の大きさ（https://firebase.google.com/docs/firestore/storage-size の数え方。名前 32 バイトは省略） */
export function docBytes(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 8;
  if (typeof v === 'string') return Buffer.byteLength(v, 'utf8') + 1;
  if (v === T0 || (typeof v === 'object' && typeof v.toMillis === 'function')) return 8;
  if (Array.isArray(v)) return v.reduce((s, x) => s + docBytes(x), 0);
  return Object.entries(v).reduce((s, [k, x]) => s + Buffer.byteLength(k, 'utf8') + 1 + docBytes(x), 0);
}
