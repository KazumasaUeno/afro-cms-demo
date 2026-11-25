// デザイン AI 評価の道具のテスト（Stub の client だけ。実 API・ネットワークを使わない）
//   node --test prototypes/ai-design-eval/design-eval.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CASES, mainPageOf, toSitemapState } from './cases.mjs';
import { buildRequest, OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.mjs';
import { bodyContrast, checkPage, contrastRatio, distinctness, forbiddenOf, machinePass, parseColor, parseOutput, summarize } from './checks.mjs';
import { costMicroUsd, createAnthropicClient } from './clients.mjs';
import { evaluateCall } from './evaluate.mjs';
import { openaiBody, geminiBody } from '../ai-requirements-eval/providers.mjs';
import { scoreBlind, readScores } from './score-blind.mjs';
import { parseName } from './gallery.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(here, 'fixtures', n), 'utf8');
const C1 = CASES[0];
const ctx1 = { brandHex: C1.project.accent, inputs: '', ctaWords: ['購入'], page: 'top' };
// テスト用の偽のキー（形だけ。実在しない）。キーの形の文字列をファイルに書かないよう実行時に組み立てる
const FAKE_ANTHROPIC = ['sk', 'ant', 'api03', 'Z'.repeat(28)].join('-');
const FAKE_OPENAI = ['sk', 'proj', 'Q'.repeat(28)].join('-');

test('案件は 6 件・業種が重ならない・入力の欄が製品と同じ・2 画面目が決まる', () => {
  assert.equal(CASES.length, 6);
  assert.equal(new Set(CASES.map((c) => c.project.industry)).size, 6);
  for (const c of CASES) {
    assert.deepEqual(Object.keys(c.hearing).sort(), ['q-content', 'q-cv', 'q-strength', 'q-target']);
    assert.deepEqual(Object.keys(c.design).sort(), ['q-brand', 'q-design-dislike', 'q-design-media', 'q-design-ref', 'q-design-sp', 'q-image']);
    assert.match(c.project.accent, /^#[0-9A-F]{6}$/i);
    assert.match(c.project.siteUrl, /\.example$/);
    assert.ok(mainPageOf(c));
    assert.equal(toSitemapState(c).after.edges.filter((e) => e.source === 'home').length, c.sitemap.length);
  }
});

test('要求の形: モデル・adaptive thinking・構造化出力・プロンプト版・入力の中身', () => {
  const r = buildRequest(C1, { model: 'claude-opus-5-5' });
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(r.max_tokens, 64_000);
  assert.deepEqual(r.thinking, { type: 'adaptive' });
  assert.equal(r.output_config.effort, 'medium');
  assert.equal(r.output_config.format.type, 'json_schema');
  assert.equal(r.output_config.format.schema, OUTPUT_SCHEMA);
  assert.equal(r.system[0].text, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /<script>/);
  assert.match(SYSTEM_PROMPT, /4\.5:1/);
  const user = r.messages[0].content;
  assert.ok(user.includes(C1.project.accent) && user.includes(C1.design['q-image']) && user.includes(mainPageOf(C1).label));
  assert.ok(!user.includes(`"${C1.project.id}"`), '内部の案件 ID は送らない');
  assert.equal(r.temperature, undefined, 'Opus 5.5 は sampling の指定で 400');
  assert.match(PROMPT_VERSION, /^PRM-DES-001@\d+\.\d+\.\d+$/);
});

test('Schema は OpenAI strict でも通る形（全 object が additionalProperties:false・全項目 required）', () => {
  const walk = (s, path = '$') => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, path);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), path);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    if (s.type === 'array') walk(s.items, `${path}[]`);
    for (const bad of ['maxLength', 'minItems', 'maxItems', 'pattern']) assert.equal(s[bad], undefined, `${path}.${bad}`);
  };
  walk(OUTPUT_SCHEMA);
  const params = buildRequest(C1, { model: 'gpt-6.2-sol' });
  const o = openaiBody(params);
  assert.equal(o.text.format.strict, true);
  assert.equal(o.text.format.schema, OUTPUT_SCHEMA);
  assert.equal(o.store, false);
  const g = geminiBody(params);
  assert.equal(g.generationConfig.responseJsonSchema, OUTPUT_SCHEMA);
  assert.equal(g.generationConfig.responseMimeType, 'application/json');
});

const proposal = (html, palette = { background: '#faf7f2', text: '#2b2420', accent: '#7a3e48', sub: '#e5ddd3' }) => ({ name: '案', concept: '説明', palette, pages: { top: html, main: html } });
const outputJson = (ps) => JSON.stringify({ proposals: ps });
const threeDistinct = (g) => [proposal(g), proposal(g, { background: '#14110f', text: '#f5efe6', accent: '#7a3e48', sub: '#3f3a34' }), proposal(g, { background: '#fff7ed', text: '#1e1b4b', accent: '#7a3e48', sub: '#a78bfa' })];

test('出力の読み取り: 3 案でなければ・色が #RRGGBB でなければ・JSON でなければ失敗', () => {
  const g = fx('good.html');
  assert.equal(parseOutput(outputJson([proposal(g), proposal(g), proposal(g)])).ok, true);
  assert.equal(parseOutput('```json\n' + outputJson([proposal(g), proposal(g), proposal(g)]) + '\n```').ok, true);
  assert.equal(parseOutput(outputJson([proposal(g), proposal(g)])).reason, 'proposals=2');
  assert.match(parseOutput(outputJson([proposal(g), proposal(g), proposal(g, { background: 'red', text: '#000000', accent: '#000000', sub: '#000000' })])).reason, /palette\.background/);
  assert.equal(parseOutput('{"proposals":').reason, 'json');
});

test('良い画面はすべての検査に通る', () => {
  const r = checkPage(fx('good.html'), ctx1);
  assert.equal(r.parseOk, true, r.parseProblems.join());
  assert.equal(r.forbidden, 0, JSON.stringify(r.forbiddenSamples));
  assert.equal(r.brandPresent, true);
  assert.equal(r.japaneseOk, true);
  assert.equal(r.mojibake, 0);
  assert.equal(r.contrastOk, true);
  assert.ok(r.contrast >= 4.5);
  assert.equal(r.sizeOk, true);
  assert.equal(r.responsive, true);
  assert.equal(r.ctaPresent, true);
});

test('失敗の見本: <script> と on* ハンドラ', () => {
  const r = checkPage(fx('bad-script.html'), ctx1);
  assert.ok(r.forbidden >= 2);
  assert.ok(r.forbiddenKinds.includes('script') && r.forbiddenKinds.includes('on-handler'), r.forbiddenKinds.join());
});

test('失敗の見本: 外部 URL（https・//・@import・link・外部画像）。SVG の xmlns は数えない', () => {
  const kinds = new Set(forbiddenOf(fx('bad-external.html')).map((h) => h.kind));
  for (const k of ['external-url', 'protocol-relative-url', 'css-import', 'link-tag', 'media-src', 'css-url']) assert.ok(kinds.has(k), `${k} が無い: ${[...kinds]}`);
  assert.equal(forbiddenOf('<svg xmlns="http://www.w3.org/2000/svg"></svg>').length, 0);
  assert.ok(forbiddenOf('<a href="javascript:alert(1)">x</a>').some((h) => h.kind === 'javascript-url'));
  assert.ok(forbiddenOf('<form action="/send"></form>').some((h) => h.kind === 'form-action'));
  assert.ok(forbiddenOf('<a href="/about">x</a>').some((h) => h.kind === 'href-not-anchor'));
  assert.equal(forbiddenOf('<a href="#about">x</a><a href="#">y</a>').length, 0);
});

test('失敗の見本: 本文のコントラスト不足（var() を解いて計算）', () => {
  const r = checkPage(fx('bad-contrast.html'), ctx1);
  assert.equal(r.contrastOk, false);
  assert.ok(r.contrast < 4.5, String(r.contrast));
  assert.equal(r.contrastFg, '#bdb6ad');
});

test('コントラスト: WCAG の式・既定の白黒・gradient は UNKNOWN・テンプレート形（body 直下の div の地）', () => {
  assert.equal(+contrastRatio(parseColor('#000'), parseColor('#fff')).toFixed(1), 21);
  assert.equal(+contrastRatio(parseColor('#777777'), parseColor('#ffffff')).toFixed(2), 4.48);
  assert.equal(bodyContrast('<html><body><p>あ</p></body></html>').ratio, 21);
  assert.equal(bodyContrast('<style>body{background:linear-gradient(#000,#fff);color:#fff}</style><body></body>').ratio, null);
  assert.ok(bodyContrast('<style>body{background:linear-gradient(#000,#fff)}</style>').unknown);
  const dark = bodyContrast('<html><body><div style="background:#14110F;color:#F5EFE6;min-height:100%">本文</div></body></html>');
  assert.equal(dark.bg, '#14110f');
  assert.ok(dark.ratio > 4.5);
  assert.ok(bodyContrast('<style>body{background-color:#fff;color:rgba(0,0,0,.3)}</style>').ratio < 4.5, 'alpha は背景と混ぜる');
  assert.ok(bodyContrast('<style>@media (max-width:600px){body{color:#eee}} body{color:#111}</style>').ratio > 15, '@media の中は数えない');
});

test('失敗の見本: ブランド色が無い（1 違いでも不合格）・文字化け', () => {
  const r = checkPage(fx('bad-brand-mojibake.html'), ctx1);
  assert.equal(r.brandPresent, false);
  assert.ok(r.brandNearest > 0 && r.brandNearest < 2);
  assert.ok(r.mojibake >= 2, String(r.mojibake));
  assert.equal(checkPage(fx('good.html').replace('#7A3E48', 'rgb(122, 62, 72)'), ctx1).brandPresent, true, 'rgb() も同じ色');
});

test('HTML の形: 閉じ忘れ・doctype なし・CTA なし・入力に無い数字・サイズ', () => {
  const g = fx('good.html');
  assert.equal(checkPage(g.replace('</main>', ''), ctx1).parseOk, false);
  assert.equal(checkPage(g.replace('<!doctype html>', ''), ctx1).parseOk, false);
  assert.equal(checkPage(g.replaceAll('購入', '詳細'), ctx1).ctaPresent, false);
  assert.deepEqual(checkPage(g.replace('三代続く', '創業 120 年'), ctx1).unsupportedNumbers, ['120']);
  assert.deepEqual(checkPage(g.replace('三代続く', '創業 120 年'), { ...ctx1, inputs: '創業120年' }).unsupportedNumbers, []);
  assert.equal(checkPage('<!doctype html><html lang="ja"><body>短い</body></html>', ctx1).sizeOk, false);
});

test('3 案の違い: 同じ 3 案は見分けられない・配色が違えば見分けられる', () => {
  const g = fx('good.html');
  assert.equal(distinctness([proposal(g), proposal(g), proposal(g)]).distinct, false);
  assert.equal(distinctness(threeDistinct(g)).distinct, true);
});

const stubClient = (message, { throwWith } = {}) => {
  const calls = [];
  return { provider: 'anthropic', calls, lastError: null, async create(params) { calls.push(params); if (throwWith) { this.lastError = throwWith; throw new Error(throwWith.code); } return { message, requestId: 'req_stub' }; } };
};
const okMessage = (text) => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 6000, output_tokens: 40000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

test('1 回の評価（Stub）: 送信の形・6 画面の検査・費用・3 案の違い・機械の合格', async () => {
  const client = stubClient(okMessage(outputJson(threeDistinct(fx('good.html')))));
  let t = 0;
  const { row, proposals } = await evaluateCall({ c: C1, model: 'claude-opus-5-5', client, now: () => (t += 1000) });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, 'claude-opus-5-5');
  assert.equal(row.code, 'ok');
  assert.equal(row.pageChecks.length, 6);
  assert.equal(row.costMicroUsd, costMicroUsd('claude-opus-5-5', { input: 6000, output: 40000 }));
  assert.equal(row.costMicroUsd, 824_000, 'Opus 5.5: 6k x $4 + 40k x $20 = $0.824');
  assert.equal(row.distinct, true);
  assert.equal(row.ms, 1000);
  assert.equal(proposals.length, 3);
  const s = summarize('claude-opus-5-5', [row]);
  assert.equal(s.forbidden, 0);
  assert.equal(s.machinePass, true, JSON.stringify(s));
  const bad = await evaluateCall({ c: C1, model: 'claude-opus-5-5', client: stubClient(okMessage(outputJson(threeDistinct(fx('bad-script.html'))))) });
  assert.equal(summarize('claude-opus-5-5', [bad.row]).machinePass, false, '禁止が 1 つでもあれば不合格');
});

test('1 回の評価（Stub）: refusal・max_tokens・Schema 違反・通信の失敗は ok にしない', async () => {
  const m = (stop) => ({ ...okMessage('{}'), stop_reason: stop });
  assert.equal((await evaluateCall({ c: C1, model: 'claude-sonnet-5-5', client: stubClient(m('refusal')) })).row.code, 'refusal');
  assert.equal((await evaluateCall({ c: C1, model: 'claude-sonnet-5-5', client: stubClient(m('max_tokens')) })).row.code, 'max_tokens');
  const sch = (await evaluateCall({ c: C1, model: 'claude-sonnet-5-5', client: stubClient(okMessage('{"proposals":[]}')) })).row;
  assert.equal(sch.code, 'schema');
  assert.ok(sch.costMicroUsd > 0, '失敗しても使った分は数える');
  const err = (await evaluateCall({ c: C1, model: 'claude-sonnet-5-5', client: stubClient(null, { throwWith: { code: 'rate_limited', httpStatus: 429 } }) })).row;
  assert.equal(err.code, 'rate_limited');
  assert.equal(err.httpStatus, 429);
  const s = summarize('claude-sonnet-5-5', [sch, err]);
  assert.equal(s.machinePass, false);
  assert.equal(machinePass({ ...s, n: 0 }), false);
});

test('Anthropic client: 本番と同じ設定（maxRetries 0・ログ off）・stream→finalMessage・429 の種別・キーを出さない', async () => {
  const seen = {};
  class FakeSdk {
    constructor(o) { seen.opts = o; this.messages = { stream: (p) => { if (p.fail) throw Object.assign(new Error('x'), { status: 429, error: { error: { type: 'rate_limit_error', message: `slow down ${FAKE_ANTHROPIC}` } } }); return { request_id: 'req_1', finalMessage: async () => okMessage('{}') }; } }; }
  }
  const c = createAnthropicClient({ apiKey: FAKE_ANTHROPIC, Sdk: FakeSdk });
  const r = await c.create({ model: 'claude-opus-5-5' });
  assert.equal(r.requestId, 'req_1');
  assert.equal(seen.opts.maxRetries, 0);
  assert.equal(seen.opts.logLevel, 'off');
  await assert.rejects(c.create({ fail: true }), /rate_limited/);
  assert.equal(c.lastError.httpStatus, 429);
  assert.ok(!c.lastError.detail.includes('ZZZZZZZZ'), c.lastError.detail);
});

test('盲検の集計: 平均 ≥ 3.5 かつテンプレートより上 かつ 2 名とも見分けられる で合格', () => {
  const key = { B001: { source: 'm1' }, B002: { source: 'template' }, B003: { source: 'm2' } };
  const csv = (rows) => readScores(`﻿id,brand,req,jp,cta,sp,distinct,comment\n${rows.join('\n')}\n`);
  const s1 = csv(['B001,4,4,4,4,4,y,', 'B002,3,3,3,3,3,y,', 'B003,5,5,5,5,5,n,']);
  const s2 = csv(['B001,4,4,3,4,4,y,', 'B002,3,3,3,3,3,y,', 'B003,5,5,5,5,5,y,']);
  const r = scoreBlind(key, s1, s2);
  assert.equal(r.ok, true);
  assert.equal(r.templateMean, 3);
  assert.equal(r.rows.find((x) => x.source === 'm1').pass, '合格');
  assert.equal(r.rows.find((x) => x.source === 'm2').pass, '不合格', '1 名が n');
  assert.equal(scoreBlind(key, csv(['B001,4,,4,4,4,y,']), s2).ok, false);
});

test('一覧のファイル名: モデル・テンプレート（端末つき）を読める', () => {
  assert.deepEqual(parseName('claude-opus-5-5__d01-wagashi__r1__B__main.html'), { file: 'claude-opus-5-5__d01-wagashi__r1__B__main.html', source: 'claude-opus-5-5', caseId: 'd01-wagashi', run: 1, letter: 'B', page: 'main', device: null });
  assert.equal(parseName('template__d06-npo__r1__C__top__phone.html').device, 'phone');
  assert.equal(parseName('notes.html'), null);
});

const runCli = (args, env = {}) => {
  // fetch を呼んだら失敗させる（dry-run の通信 0 を確かめる）。SDK が読み込まれたら失敗させる
  const dir = mkdtempSync(join(tmpdir(), 'design-eval-'));
  const preload = join(dir, 'nonet.cjs');
  writeFileSync(preload, "globalThis.fetch = () => { throw new Error('NETWORK_CALLED'); };\nconst M = require('node:module'); const orig = M._load; M._load = function (r, ...a) { if (/@anthropic-ai[\\\\/]sdk/.test(r)) throw new Error('SDK_LOADED'); return orig.call(this, r, ...a); };\n");
  const res = spawnSync(process.execPath, ['--require', preload, join(here, 'run-eval.mjs'), '--out', join(dir, 'out'), ...args], { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '', ...env } });
  return { ...res, dir };
};

test('dry-run（既定）: 通信 0・SDK を読まない・送信本文 12 件・推定費用と上限を出す', () => {
  const r = runCli([]);
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!/NETWORK_CALLED|SDK_LOADED/.test(r.stdout + r.stderr));
    assert.match(r.stdout, /通信はしていない/);
    assert.match(r.stdout, /予定 12 回/);
    assert.match(r.stdout, /上限 --cap \$15/);
    const files = readdirSync(join(r.dir, 'out', 'requests'));
    assert.equal(files.length, 12);
    assert.ok(!readFileSync(join(r.dir, 'out', 'requests', files[0]), 'utf8').includes('sk-'));
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test('--go: キーが無い・形が違うなら呼ばずに止まり、値を表示しない', () => {
  const a = runCli(['--go']);
  try { assert.equal(a.status, 2); assert.match(a.stderr, /ANTHROPIC_API_KEY/); } finally { rmSync(a.dir, { recursive: true, force: true }); }
  const b = runCli(['--go'], { ANTHROPIC_API_KEY: FAKE_OPENAI });
  try { assert.equal(b.status, 2); assert.ok(!(b.stdout + b.stderr).includes('QQQQQQQQ')); assert.ok(!/NETWORK_CALLED|SDK_LOADED/.test(b.stderr)); } finally { rmSync(b.dir, { recursive: true, force: true }); }
});

test('上限: 最悪の額が --cap を超えるなら dry-run で警告する', () => {
  const r = runCli(['--cap', '1']);
  try { assert.equal(r.status, 0); assert.match(r.stdout, /最悪の額が上限を超える/); } finally { rmSync(r.dir, { recursive: true, force: true }); }
});
