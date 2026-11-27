// 評価の道具の Provider アダプタのテスト（通信しない。fetch は Stub）。
//   npm run build:functions && node --test prototypes/ai-requirements-eval/
// テスト用のキーは実行時に組み立てる（キーの形の文字列をファイルに書かない。CLAUDE.md 9章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { HEARINGS } from './hearings.mjs';
import { loadCore, providerOf, keyShapeProblem, scrubSecrets, createFetchDraftClient, generateWith, OPENAI_URL, geminiUrl, LIB_DIR } from './providers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = loadCore();
const { OUTPUT_SCHEMA } = require(join(LIB_DIR, 'schema.js'));
const { SYSTEM_PROMPT, PROMPT_VERSION } = require(join(LIB_DIR, 'prompts', 'PRM-REQ-001.js'));

const fakeKey = (parts, ch, n) => parts.join('-') + ch.repeat(n);
const OPENAI_KEY = fakeKey(['sk', 'proj', ''], 'T', 40);
const GEMINI_KEY = 'AI' + 'za' + 'G'.repeat(35);
const ANTHROPIC_KEY = fakeKey(['sk', 'ant', 'api03', ''], 'a', 30);
const h = HEARINGS[0];
const inputOf = (model) => ({ answers: h.answers, siteFacts: h.siteFacts, siteText: h.siteText, competitorHosts: core.competitorHostsOf(h.answers), config: { model, effort: 'low', maxTokens: 12_000 } });

const good = (over = {}) => ({
  summary: 'スマホでの見やすさと予約の導線を整えます。',
  points: [{ area: 'スマホ表示', priority: 'high', title: 'スマホで読みやすく', detail: '文字と余白を整えます。', impact: '予約が増えやすくなります。', evidence: ['q-issue', 'not-sent-key'] }],
  draft: { goal: '予約を増やす', target: '近隣の方', contents: 'メニュー', features: '来店予約', nonFunctional: 'スマホ対応', operation: '社内で更新', schedule: '相談', openQuestions: ['写真はありますか'] },
  ...over,
});

/** 呼ばれた内容を残す Stub の fetch */
function stubFetch(reply) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = typeof reply === 'function' ? reply() : reply;
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, headers: new Map(Object.entries(r.headers ?? {})), text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  f.calls = calls;
  return f;
}
const openaiOk = (obj, usage = { input_tokens: 5000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 3000 }) => ({ status: 200, headers: { 'x-request-id': 'req_test' }, body: {
  id: 'resp_1', status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(obj) }] }], usage } });
const geminiOk = (obj, finishReason = 'STOP') => ({ status: 200, body: {
  responseId: 'gem_1', candidates: [{ finishReason, content: { parts: [{ text: '考え中', thought: true }, { text: JSON.stringify(obj) }] } }],
  usageMetadata: { promptTokenCount: 5000, cachedContentTokenCount: 0, candidatesTokenCount: 2000, thoughtsTokenCount: 1000 } } });
const oa = (fetchImpl) => createFetchDraftClient('openai', { apiKey: OPENAI_KEY, fetchImpl });
const gm = (fetchImpl) => createFetchDraftClient('gemini', { apiKey: GEMINI_KEY, fetchImpl });

test('Provider はモデル名の先頭で決まり、--provider で上書きできる', () => {
  assert.equal(providerOf('claude-haiku-5-5'), 'anthropic');
  assert.equal(providerOf('gpt-6-luna'), 'openai');
  assert.equal(providerOf('gemini-3.5-flash-lite'), 'gemini');
  assert.equal(providerOf('my-model', 'gemini'), 'gemini');
  assert.throws(() => providerOf('llama-9'));
  assert.throws(() => providerOf('gpt-6-luna', 'azure'));
});

test('キーは形だけを見て、値を理由の文に出さない', () => {
  assert.equal(keyShapeProblem('openai', OPENAI_KEY), null);
  assert.equal(keyShapeProblem('gemini', GEMINI_KEY), null);
  assert.equal(keyShapeProblem('anthropic', ANTHROPIC_KEY), null);
  const antInOpenai = fakeKey(['sk', 'ant', 'api03', ''], 'b', 30);
  const p = keyShapeProblem('openai', antInOpenai);
  assert.match(p, /OPENAI_API_KEY/);
  assert.ok(!p.includes(antInOpenai) && !p.includes('bbbb'));
  assert.match(keyShapeProblem('gemini', ' ' + GEMINI_KEY), /空白/);
  assert.match(keyShapeProblem('gemini', undefined), /GEMINI_API_KEY/);
  assert.match(keyShapeProblem('openai', 'sk-proj-ａｂｃ' + 'x'.repeat(25)), /非 ASCII/);
});

test('scrubSecrets はキーとキーの形を伏せる', () => {
  const s = scrubSecrets(`bad key ${OPENAI_KEY} and ${GEMINI_KEY} url?key=${GEMINI_KEY}&x=1 Bearer abcdefghijkl`, [OPENAI_KEY, GEMINI_KEY]);
  assert.ok(!s.includes('TTTTTTTT') && !s.includes('GGGGGGGG'));
  assert.ok(!s.includes('abcdefghijkl'));
});

test('Gemini の新形式キー AQ.… も受け、伏せる（2026-11-27 発行分）', () => {
  const aq = 'AQ' + '.Ab' + 'Q'.repeat(50);
  assert.equal(keyShapeProblem('gemini', aq), null);
  assert.match(keyShapeProblem('gemini', 'AQ.short'), /GEMINI_API_KEY/);
  assert.match(keyShapeProblem('gemini', 'XX' + 'Q'.repeat(50)), /先頭が AIza か AQ\. でない/);
  const s = scrubSecrets(`error ${aq} done`);
  assert.ok(!s.includes('QQQQQQQQ'));
});

test('OpenAI: Responses API へ strict json_schema・同じプロンプト・同じ Schema で送り、応答を本番の後検証に通す', async () => {
  const f = stubFetch(openaiOk(good()));
  const r = await generateWith(core, inputOf('gpt-6-luna'), oa(f));
  assert.equal(f.calls.length, 1);
  const { url, init, body } = f.calls[0];
  assert.equal(url, OPENAI_URL);
  assert.ok(!url.includes('TTTT'));
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, `Bearer ${OPENAI_KEY}`);
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(body.model, 'gpt-6-luna');
  assert.equal(body.instructions, SYSTEM_PROMPT);
  assert.equal(body.input.length, 1);
  assert.equal(body.input[0].role, 'user');
  assert.match(body.input[0].content, /<answers>/);
  assert.deepEqual(body.text.format, { type: 'json_schema', name: 'requirements_draft', strict: true, schema: OUTPUT_SCHEMA });
  assert.equal(body.max_output_tokens, 12_000);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.store, false);
  assert.ok(!init.body.includes('q-infra'), '送らない項目が本文に無い');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.proposal.origin.model, 'gpt-6-luna');
  assert.equal(r.proposal.origin.promptVersion, PROMPT_VERSION);
  assert.deepEqual(r.proposal.points[0].evidence, ['q-issue'], 'evidence は送ったキーに絞られる（本番の postprocess）');
  assert.equal(r.anthropicRequestId, 'req_test');
  // (5000-1000)*0.10 + 1000*0.01 + 3000*0.50 = 1910 マイクロドル
  assert.deepEqual(r.usage, { input: 4000, output: 3000, cacheRead: 1000, costMicroUsd: 1910 });
});

test('Gemini: generateContent へ responseJsonSchema・同じプロンプトで送り、キーは URL でなくヘッダ。思考の部分は本文に入れない', async () => {
  const f = stubFetch(geminiOk(good()));
  const r = await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(f));
  const { url, init, body } = f.calls[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(url, geminiUrl('gemini-3.5-flash-lite'));
  assert.ok(!url.includes('key=') && !url.includes('GGGG'));
  assert.equal(init.headers['x-goog-api-key'], GEMINI_KEY);
  assert.ok(!('authorization' in init.headers));
  assert.deepEqual(body.systemInstruction, { parts: [{ text: SYSTEM_PROMPT }] });
  assert.equal(body.contents[0].role, 'user');
  assert.match(body.contents[0].parts[0].text, /<answers>/);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema, OUTPUT_SCHEMA);
  assert.equal(body.generationConfig.maxOutputTokens, 12_000);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.proposal.origin.model, 'gemini-3.5-flash-lite');
  assert.ok(!JSON.stringify(r.proposal).includes('考え中'));
  assert.equal(r.anthropicRequestId, 'gem_1');
  // 5000*0.30 + (2000+1000)*2.50 = 9000（思考トークンは出力として数える）
  assert.deepEqual(r.usage, { input: 5000, output: 3000, cacheRead: 0, costMicroUsd: 9000 });
});

test('Gemini は maxLength を守らない前提: 長すぎる値は本番の validateOutput が切り詰め、形の違いは schema 失敗', async () => {
  const long = good();
  long.points[0].title = 'あ'.repeat(500);
  long.summary = 'い'.repeat(2000);
  const ok = await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(stubFetch(geminiOk(long))));
  assert.equal(ok.ok, true);
  assert.ok([...ok.proposal.points[0].title].length < 500);
  assert.equal([...ok.proposal.summary].length, 400);
  const bad = good();
  delete bad.draft;
  const r = await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(stubFetch(geminiOk(bad))));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'schema');
  assert.ok(r.usage.costMicroUsd > 0, '失敗でも費用は数える');
  const r2 = await generateWith(core, inputOf('gpt-6-luna'), oa(stubFetch(openaiOk({ ...good(), note: 'x' }))));
  assert.equal(r2.code, 'schema');
});

test('出力の URL・メール・電話は本番の postprocess が除く（他社でも同じ）', async () => {
  const o = good();
  o.points[0].detail = '詳しくは https://evil.example/ か hanako.sato@mail.example、090-0000-1111 へ';
  const r = await generateWith(core, inputOf('gpt-6-luna'), oa(stubFetch(openaiOk(o))));
  assert.equal(r.ok, true);
  assert.equal(core.redactText(r.proposal.points[0].detail), r.proposal.points[0].detail);
  assert.ok(!/https?:\/\//.test(r.proposal.points[0].detail));
});

test('拒否・出力上限・その他の終了を本番と同じ種別へ写す', async () => {
  const cases = [
    ['openai', { status: 200, body: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'できません' }] }], usage: {} } }, 'refusal'],
    ['openai', { status: 200, body: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: {} } }, 'max_tokens'],
    ['openai', { status: 200, body: { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [], usage: {} } }, 'refusal'],
    ['openai', { status: 200, body: { status: 'failed', output: [] } }, 'schema'],
    ['gemini', { status: 200, body: { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } } }, 'refusal'],
    ['gemini', geminiOk(good(), 'SAFETY'), 'refusal'],
    ['gemini', geminiOk(good(), 'MAX_TOKENS'), 'max_tokens'],
    ['gemini', geminiOk(good(), 'OTHER'), 'schema'],
    ['gemini', { status: 200, body: 'not json' }, 'upstream'],
  ];
  for (const [p, reply, code] of cases) {
    const r = p === 'openai' ? await generateWith(core, inputOf('gpt-6-luna'), oa(stubFetch(reply))) : await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(stubFetch(reply)));
    assert.equal(r.ok, false, `${p} ${code}`);
    assert.equal(r.code, code, `${p} ${JSON.stringify(reply.body).slice(0, 80)}`);
  }
});

test('HTTP の失敗は種別と HTTP 状態を返し、本文のキーは伏せる。タイムアウトは timeout', async () => {
  const echo = { status: 401, body: { error: { type: 'invalid_request_error', code: 'invalid_api_key', message: `Incorrect API key provided: ${OPENAI_KEY}` } } };
  const c1 = oa(stubFetch(echo));
  const r1 = await generateWith(core, inputOf('gpt-6-luna'), c1);
  assert.deepEqual([r1.ok, r1.code, r1.httpStatus], [false, 'upstream', 401]);
  assert.match(c1.lastError.detail, /invalid_api_key/);
  assert.ok(!c1.lastError.detail.includes('TTTTTTTT'));
  assert.ok(!JSON.stringify(r1).includes('TTTTTTTT'));
  const r2 = await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(stubFetch({ status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } } })));
  assert.deepEqual([r2.code, r2.httpStatus], ['rate_limited', 429]);
  const r3 = await generateWith(core, inputOf('gemini-3.5-flash-lite'), gm(stubFetch({ status: 504, body: '' })));
  assert.deepEqual([r3.code, r3.httpStatus], ['timeout', 504]);
  const r4 = await generateWith(core, inputOf('gpt-6-luna'), oa(stubFetch(() => new DOMException('timed out', 'TimeoutError'))));
  assert.equal(r4.code, 'timeout');
  const r5 = await generateWith(core, inputOf('gpt-6-luna'), oa(stubFetch(() => new TypeError('fetch failed'))));
  assert.equal(r5.code, 'upstream');
  assert.equal(r5.httpStatus, undefined);
});

test('単価表にないモデルは送る前に config エラー（通信しない）', async () => {
  const f = stubFetch(openaiOk(good()));
  const r = await generateWith(core, inputOf('gpt-unknown'), oa(f));
  assert.equal(r.code, 'config');
  assert.equal(f.calls.length, 0);
});

// ---- CLI（子プロセス。fetch を「呼ばれたら失敗」に差し替えて、dry-run が通信しないことを確かめる）----
const runCli = (args, env = {}) => spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=()=>{process.stderr.write("NETWORK-CALLED");process.exit(99)}', join(here, 'run-eval.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', ...env } });
const outDirOf = (stdout) => stdout.match(/送信本文（キーは含まない）を (.+?) に書いた/)?.[1];

test('dry-run（--go なしが既定）: 予定と推定費用を出し、通信 0・各社の本文を書く', () => {
  const r = runCli(['--models', 'gpt-6-luna,gemini-3.5-flash-lite,claude-haiku-5-5']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stderr.includes('NETWORK-CALLED'));
  assert.match(r.stdout, /予定 180 回/);
  assert.match(r.stdout, /gpt-6-luna/);
  const dir = outDirOf(r.stdout);
  assert.ok(dir, r.stdout);
  try {
    assert.equal(readdirSync(dir).length, 60);
    const g = JSON.parse(readFileSync(join(dir, `gemini-3.5-flash-lite.${HEARINGS[0].id}.request.json`), 'utf8'));
    assert.ok(g.url.endsWith(':generateContent') && g.body.generationConfig.responseJsonSchema);
    const o = JSON.parse(readFileSync(join(dir, `gpt-6-luna.${HEARINGS[0].id}.request.json`), 'utf8'));
    assert.equal(o.body.text.format.strict, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--go: キーが無い・形が違うときは送る前に止め、値を出さない', () => {
  const r1 = runCli(['--go', '--models', 'gpt-6-luna']);
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /OPENAI_API_KEY/);
  const wrong = fakeKey(['sk', 'ant', 'api03', ''], 'Q', 30);
  const r2 = runCli(['--go', '--models', 'claude-haiku-5-5,gemini-3.5-flash-lite'], { ANTHROPIC_API_KEY: ANTHROPIC_KEY, GEMINI_API_KEY: wrong });
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /GEMINI_API_KEY/);
  assert.ok(!r2.stderr.includes('QQQQ') && !r2.stdout.includes('QQQQ'));
  assert.ok(!r2.stderr.includes('NETWORK-CALLED'));
  const r3 = runCli(['--models', 'llama-9']);
  assert.equal(r3.status, 2);
});
