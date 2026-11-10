import type { AnswerValue, RequirementQuestion, RequirementSession } from '@/types';
import { REQUIREMENT_CATEGORIES, REQUIREMENT_QUESTIONS } from '@/data/requirements';
import { MAX_COMPETITORS, isAnswered, validateAnswer, validateUrl } from './validation';

/**
 * ヒアリングの回答の CSV（テンプレートの出力と一括入力）。
 * 列は「質問ID, カテゴリ, 質問, 回答」。取り込みで使うのは質問ID と回答だけ（カテゴリ・質問は読むための列）。
 * 値の検査は画面と同じ validateAnswer を使う。反映は setAnswer（承認後は reducer が受け付けない）。
 */

export const CSV_HEADERS = ['質問ID', 'カテゴリ', '質問', '回答'] as const;
/** 取り込めるファイルの大きさ（収録した質問の数なら 100KB もいかない） */
export const MAX_CSV_BYTES = 1024 * 1024;
/** 複数選択・競合サイトの区切り（選択肢に「・」を含むものがあるので「・」では区切らない） */
const LIST_SEP = /[、,，\n]/;

/** 質問の列に添える、入力できる値の説明 */
export function answerGuide(q: RequirementQuestion): string {
  if (q.id === 'q-competitor') return `［URL。複数は「、」か改行で区切る・最大${MAX_COMPETITORS}つ］`;
  switch (q.kind) {
    case 'single': return `［選択: ${(q.options ?? []).join(' / ')} のどれか1つ］`;
    case 'multi': return `［複数選択: ${(q.options ?? []).join(' / ')}。複数は「、」で区切る］`;
    case 'url': return '［URL。https:// から］';
    default: return '';
  }
}

/** Excel で開いたときに数式として動かないよう、= + - @ タブ CR で始まる値の前に ' を付ける（取り込みで外す） */
const guardFormula = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const unguardFormula = (v: string) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function answerToCell(v: AnswerValue | undefined): string {
  if (!isAnswered(v)) return '';
  return Array.isArray(v) ? v.join('、') : (v ?? '');
}

/** テンプレート（いまの回答を入れた状態）。Excel で文字化けしないよう先頭に BOM を付け、改行は CRLF */
export function buildTemplateCsv(req: RequirementSession): string {
  const rows: string[][] = [[...CSV_HEADERS]];
  for (const c of REQUIREMENT_CATEGORIES) {
    for (const q of REQUIREMENT_QUESTIONS.filter((x) => x.categoryId === c.id)) {
      const guide = answerGuide(q);
      rows.push([q.id, `${c.no}. ${c.title}`, guide ? `${q.text} ${guide}` : q.text, guardFormula(answerToCell(req.answers[q.id]))]);
    }
  }
  return `﻿${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/**
 * CSV を行の配列にする（RFC 4180: "..." で囲んだ値の中のカンマ・改行・"" を扱う）。
 * 先頭の BOM を外し、改行は CRLF / LF / CR のどれでもよい。中身が空の行は捨てる
 */
/** unclosed: 閉じていない引用符があった（残りを 1 つの値として黙って取り込まないよう、取り込み側で止める） */
export type ParsedCsv = string[][] & { unclosed?: boolean };

export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
    field = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) endRow();
  const out: ParsedCsv = rows;
  if (quoted) out.unclosed = true;
  return out;
}

/**
 * ファイルの中身を文字列にする。Excel の「CSV（コンマ区切り）」は Shift_JIS で保存されるため、
 * UTF-8 として読めなければ Shift_JIS として読み直す
 */
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export interface CsvApply { questionId: string; value: AnswerValue }
export interface CsvSkip { line: number; questionId: string; reason: string }
export interface CsvPlan {
  /** 反映する回答 */
  apply: CsvApply[];
  /** いまの回答と同じで、反映しなくてよい行の数 */
  unchanged: number;
  /** 回答が空欄の行の数（いまの回答は変えない） */
  blank: number;
  skipped: CsvSkip[];
  /** ファイル全体の誤り（見出し行が無いなど）。あれば何も反映しない */
  error?: string;
}

const same = (a: AnswerValue | undefined, b: AnswerValue) =>
  JSON.stringify(Array.isArray(a) ? a : a ?? '') === JSON.stringify(b);

/** 1 つの回答欄の値を、質問の種類に合わせた値にする。誤りがあれば理由を返す */
function toValue(q: RequirementQuestion, raw: string): { value: AnswerValue } | { reason: string } {
  const text = unguardFormula(raw.trim());
  if (q.id === 'q-competitor') {
    const urls = text.split(LIST_SEP).map((x) => x.trim()).filter(Boolean);
    if (urls.length > MAX_COMPETITORS) return { reason: `競合サイトは${MAX_COMPETITORS}つまでです（${urls.length}つ）` };
    const bad = urls.map((u) => validateUrl(u, false)).find(Boolean);
    return bad ? { reason: bad } : { value: urls };
  }
  if (q.kind === 'single') {
    const opts = q.options ?? [];
    if (!opts.includes(text)) return { reason: `選択肢にない値です（${opts.join(' / ')} から1つ）` };
    return { value: text };
  }
  if (q.kind === 'multi') {
    const opts = q.options ?? [];
    const picked = text.split(LIST_SEP).map((x) => x.trim()).filter(Boolean);
    const unknown = picked.filter((x) => !opts.includes(x));
    if (unknown.length) return { reason: `選択肢にない値があります（${unknown.join('、')}）` };
    // 並びは選択肢の順にそろえ、重複を除く
    return { value: opts.filter((o) => picked.includes(o)) };
  }
  const err = validateAnswer(q, text, false);
  return err ? { reason: err } : { value: text };
}

/** 取り込む内容を決める（store は変えない）。行番号は見出し行を 1 とした CSV 上の行 */
export function planCsvImport(rows: ParsedCsv, req: RequirementSession): CsvPlan {
  const plan: CsvPlan = { apply: [], unchanged: 0, blank: 0, skipped: [] };
  if (rows.unclosed) return { ...plan, error: '閉じていない引用符（"）があります。CSV の形式を確認してください。' };
  const header = (rows[0] ?? []).map((h) => h.trim());
  const idCol = header.indexOf(CSV_HEADERS[0]);
  const answerCol = header.indexOf(CSV_HEADERS[3]);
  if (idCol === -1 || answerCol === -1) {
    return { ...plan, error: '1 行目に見出し（質問ID・回答）がありません。ダウンロードしたテンプレートを使ってください。' };
  }
  if (rows.length < 2) return { ...plan, error: '回答の行がありません。' };
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = (r[idCol] ?? '').trim();
    const raw = r[answerCol] ?? '';
    const q = REQUIREMENT_QUESTIONS.find((x) => x.id === id);
    if (!q) { plan.skipped.push({ line, questionId: id || '（空欄）', reason: '質問IDが見つかりません' }); return; }
    if (seen.has(id)) { plan.skipped.push({ line, questionId: id, reason: '同じ質問IDの行が前にあります（最初の行だけ使います）' }); return; }
    seen.add(id);
    if (!raw.trim()) { plan.blank++; return; }
    const r2 = toValue(q, raw);
    if ('reason' in r2) { plan.skipped.push({ line, questionId: id, reason: r2.reason }); return; }
    if (same(req.answers[id], r2.value)) { plan.unchanged++; return; }
    plan.apply.push({ questionId: id, value: r2.value });
  });
  return plan;
}
