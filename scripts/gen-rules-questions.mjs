#!/usr/bin/env node
// firestore.rules の <GENERATED:requirements> 区間を、画面と同じ定数から作る（BACKEND_FIREBASE.md §9.1）。
//   npm run rules:gen    … 区間を書き換える
//   npm run rules:check  … 差分があれば exit 1（質問を足したのに Rules を直し忘れる事故を止める）
// 出典（正）: src/features/requirements/validation.ts（MAX_*）/ src/data/requirements.ts（質問・選択肢・提案ライブラリ）
//            / src/features/projects/projectForm.ts（PROJECT_LIMITS・ACCENT_PRESETS）
// src/ の .ts は Node 22 の型除去（--experimental-strip-types）でそのまま読む。`@/` の別名だけ下の resolve hook で src/ へ向ける。
// 引数: --check / --rules <path>（テスト用。既定は firestore.rules）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BEGIN = '    // <GENERATED:requirements>';
const END = '    // </GENERATED:requirements>';

// `@/x/y` → src/x/y.ts（無ければ src/x/y/index.ts）。拡張子なしの相対 import にも .ts を補う
const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SRC = ${JSON.stringify(join(root, 'src'))};
function pick(base) {
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts']) if (existsSync(c)) return c;
  return null;
}
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const f = pick(SRC + '/' + spec.slice(2));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.endsWith('.ts') && !/\\.[a-z]+$/.test(spec)) {
    const f = pick(fileURLToPath(new URL(spec, ctx.parentURL)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}`;

async function loadSources() {
  if (!process.features?.typescript && !process.execArgv.some((a) => a.includes('strip-types'))) {
    throw new Error('node --experimental-strip-types で実行してください（npm run rules:gen / rules:check）');
  }
  register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const validation = await imp('src/features/requirements/validation.ts');
  const reqData = await imp('src/data/requirements.ts');
  const projectForm = await imp('src/features/projects/projectForm.ts');
  return { validation, reqData, projectForm };
}

const q = (s) => {
  if (typeof s !== 'string') throw new Error(`文字列ではありません: ${String(s)}`);
  // Rules の文字列リテラル（単一引用符）。\ と ' だけエスケープすればよい
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};
const list = (xs) => `[${xs.map(q).join(', ')}]`;
const int = (n, name) => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} が 0 以上の整数ではありません: ${n}`);
  return String(n);
};

// Rules の validPoint / validProposal の上限（firestore.rules に手で書いた値。ここと揃える）
export const POINT_LIMITS = { id: 40, title: 80, detail: 600, impact: 200, area: 40 };
// JS の String.prototype.trim が落とす空白（WhiteSpace + LineTerminator）を RE2 で表した集合
const WS = String.raw`[\s\p{Z}\x{FEFF}\x{0B}]`;
const NWS = String.raw`[^\s\p{Z}\x{FEFF}\x{0B}]`;
/** 「trim 後の長さが 1〜max」を表す RE2（Rules の matches は全体一致。. は改行も含める） */
export function trimLenRe(max) {
  if (!Number.isInteger(max) || max < 2 || max > 1000) throw new Error(`正規表現で表せない上限: ${max}`);
  return `(?s)${WS}*(${NWS}|${NWS}.{0,${max - 2}}${NWS})${WS}*`;
}
const HOSTNAME_PREFIX_MAX = 253 + ' の現状を踏まえ、'.length; // buildProposal.ts: 先頭の提案だけ detail にホスト名が付く

/** 生成する区間（BEGIN〜END を含む）を返す。src の定数が Rules で表せない形なら throw */
export function buildRegion({ validation, reqData, projectForm }) {
  const { MAX_URL, MAX_TEXT, MAX_LONGTEXT, MAX_COMPETITORS } = validation;
  const { REQUIREMENT_QUESTIONS, PURPOSE_OPTIONS, IMPROVE_OPTIONS, PROPOSAL_LIBRARY } = reqData;
  const { PROJECT_LIMITS, ACCENT_PRESETS } = projectForm;

  const ids = REQUIREMENT_QUESTIONS.map((x) => x.id);
  if (new Set(ids).size !== ids.length) throw new Error('質問 ID が重複しています');
  for (const id of ids) if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`質問 ID に使えない文字: ${id}`);

  // 提案ライブラリが Rules の上限内か（超えると「分析完了」が保存で落ちる）
  for (const p of PROPOSAL_LIBRARY) {
    for (const k of ['id', 'title', 'impact', 'area']) {
      if (p[k].length < 1 || p[k].length > POINT_LIMITS[k]) throw new Error(`PROPOSAL_LIBRARY ${p.id}.${k} が Rules の上限 ${POINT_LIMITS[k]} を超えます`);
    }
    if (p.detail.length + HOSTNAME_PREFIX_MAX > POINT_LIMITS.detail) throw new Error(`PROPOSAL_LIBRARY ${p.id}.detail がホスト名を付けると上限 ${POINT_LIMITS.detail} を超えます`);
    if (!['high', 'medium', 'low'].includes(p.priority)) throw new Error(`PROPOSAL_LIBRARY ${p.id}.priority が想定外`);
  }

  const clause = (x) => {
    const v = `a[${q(x.id)}]`;
    if (x.id === 'q-competitor') return `ansUrlList(${v}, ${int(MAX_COMPETITORS, 'MAX_COMPETITORS')}, ${int(MAX_URL, 'MAX_URL')})`; // csv.ts と同じ特例
    switch (x.kind) {
      case 'url': return `ansUrl(${v}, reMaxUrl())`;
      case 'text': return `ansText(${v}, reMaxText())`;
      case 'longtext': return `ansText(${v}, reMaxLongtext())`; // 下限 4 は入れない（§9 [DECISION]: 下書きを許す）
      case 'single':
      case 'multi': {
        const opts = x.options ?? [];
        if (opts.length === 0) throw new Error(`${x.id} に選択肢がありません`);
        const ref = opts === PURPOSE_OPTIONS ? 'purposeOptions()' : opts === IMPROVE_OPTIONS ? 'improveOptions()' : list(opts);
        return x.kind === 'single' ? `ansSingle(${v}, ${ref})` : `ansMulti(${v}, ${ref})`;
      }
      default:
        throw new Error(`${x.id}: Rules で検査できない種類 ${x.kind}（gen-rules-questions.mjs に追加する）`);
    }
  };

  const lines = [
    BEGIN + ' scripts/gen-rules-questions.mjs が生成。手で編集しない',
    '    // 出典: src/features/requirements/validation.ts / src/data/requirements.ts / src/features/projects/projectForm.ts',
    `    function purposeOptions() { return ${list(PURPOSE_OPTIONS)}; }`,
    `    function improveOptions() { return ${list(IMPROVE_OPTIONS)}; }`,
    `    function accentOptions() { return ${list(ACCENT_PRESETS.map((a) => a.value))}; }`,
    `    function maxUrl() { return ${int(MAX_URL, 'MAX_URL')}; }`,
    `    function maxCompetitors() { return ${int(MAX_COMPETITORS, 'MAX_COMPETITORS')}; }`,
    `    // trim 後 1〜N 文字（N: MAX_TEXT=${MAX_TEXT} / MAX_LONGTEXT=${MAX_LONGTEXT} / MAX_URL=${MAX_URL} / PROJECT_LIMITS）`,
    `    function reMaxText() { return ${q(trimLenRe(MAX_TEXT))}; }`,
    `    function reMaxLongtext() { return ${q(trimLenRe(MAX_LONGTEXT))}; }`,
    `    function reMaxUrl() { return ${q(trimLenRe(MAX_URL))}; }`,
    `    function reClientName() { return ${q(trimLenRe(PROJECT_LIMITS.clientName))}; }`,
    `    function reSiteName() { return ${q(trimLenRe(PROJECT_LIMITS.siteName))}; }`,
    `    function reIndustry() { return ${q(trimLenRe(PROJECT_LIMITS.industry))}; }`,
    '    function validAnswers(a) {',
    '      return a is map',
    `        && a.keys().hasOnly(${list(ids)})`,
    ...REQUIREMENT_QUESTIONS.map((x, i) =>
      `        && (!(${q(x.id)} in a) || ${clause(x)})${i === REQUIREMENT_QUESTIONS.length - 1 ? ';' : ''}`),
    '    }',
    END,
  ];
  return lines.join('\n');
}

/** rules の本文に区間を差し込んだ結果を返す（マーカーが無い・重複なら throw） */
export function applyRegion(rulesText, region) {
  const eol = rulesText.includes('\r\n') ? '\r\n' : '\n';
  const text = rulesText.replace(/\r\n/g, '\n');
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1 || e < b) throw new Error('firestore.rules に <GENERATED:requirements> の区間がありません');
  if (text.indexOf(BEGIN, b + 1) !== -1) throw new Error('<GENERATED:requirements> が 2 つあります');
  const out = text.slice(0, b) + region + text.slice(e + END.length);
  return out.replace(/\n/g, eol);
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const ri = argv.indexOf('--rules');
  const rulesPath = ri !== -1 ? resolve(argv[ri + 1]) : join(root, 'firestore.rules');
  if (!existsSync(rulesPath)) throw new Error(`${rulesPath} がありません`);
  const current = readFileSync(rulesPath, 'utf8');
  const next = applyRegion(current, buildRegion(await loadSources()));
  if (check) {
    if (next !== current) {
      console.error('rules:check 失敗: firestore.rules の GENERATED 区間が src/ の定数と一致しません。npm run rules:gen を実行してコミットしてください');
      process.exit(1);
    }
    console.log('rules:check OK（GENERATED 区間は src/ の定数と一致）');
    return;
  }
  if (next === current) console.log('firestore.rules は最新です');
  else { writeFileSync(rulesPath, next); console.log('firestore.rules の GENERATED 区間を更新しました'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`gen-rules-questions: ${e.message}`);
    process.exit(1);
  });
}
