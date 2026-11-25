// 評価の道具の Provider アダプタ（Anthropic / OpenAI / Google Gemini）。prototypes/ 配下。本番 DB・認証・API に接続しない。
// 同じプロンプト（PRM-REQ-001）・同じ Schema（OUTPUT_SCHEMA）・同じ後検証（validateOutput → postprocess）を通すため、
// 本番の generateDraft をそのまま使う。他社のアダプタは generateDraft が組み立てた Anthropic 形の要求を各社の形へ写し、
// 応答を Anthropic 形（content / stop_reason / usage）へ戻すだけ（Schema の再検証・numbersIn・evidence 絞り込みは本番コードが行う）。
// キーは引数で受け取り、表示しない・ファイルとログへ書かない。失敗時の本文はキーの形を伏せてから短く返す。
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const LIB_DIR = join(here, '..', '..', 'functions', 'lib', 'ai');

/** 他社の単価（このプロトタイプだけ。本番の pricing.json は変えない）。単位は pricing.json と同じ USD / 1M tokens */
export const PROVIDER_PRICING = JSON.parse(JSON.stringify(require('./pricing-providers.json')));

/**
 * 本番の functions/lib/ai を読み込む。他社の単価は「メモリ上の」pricing.json へ足す（ディスクは変えない）。
 * generateDraft は PRICED_MODELS に無いモデルを config エラーにするため、読み込みより前に足す必要がある
 */
export function loadCore() {
  const pricingJson = require(join(LIB_DIR, 'pricing.json'));
  for (const [model, rates] of Object.entries(PROVIDER_PRICING.models)) pricingJson.models[model] ??= rates;
  const lib = (p) => require(join(LIB_DIR, p));
  const pricing = lib('pricing.js');
  for (const m of Object.keys(PROVIDER_PRICING.models)) if (!pricing.PRICED_MODELS.includes(m)) throw new Error(`pricing.js が先に読まれている（${m} が PRICED_MODELS に無い）`);
  return { ...lib('generateDraft.js'), ...lib('anthropicClient.js'), ...lib('shared/redact.js'), costMicroUsd: pricing.costMicroUsd, PRICED_MODELS: pricing.PRICED_MODELS };
}

export const PROVIDERS = ['anthropic', 'openai', 'gemini'];
export function providerOf(model, forced) {
  if (forced) { if (!PROVIDERS.includes(forced)) throw new Error(`--provider は ${PROVIDERS.join(' / ')}`); return forced; }
  if (/^claude-/.test(model)) return 'anthropic';
  if (/^(gpt-|o\d)/.test(model)) return 'openai';
  if (/^gemini-/.test(model)) return 'gemini';
  throw new Error(`モデル名から Provider が決まらない: ${model}（--provider で指定）`);
}

export const KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
const KEY_SHAPE = {
  anthropic: { re: /^sk-ant-[A-Za-z0-9_-]{20,}$/, head: 'sk-ant-', ok: (k) => k.startsWith('sk-ant-') },
  // OpenAI のキー: sk-proj- / sk-svcacct- / sk-（旧）。Anthropic のキーを取り違えて入れたら止める
  openai: { re: /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/, head: 'sk-（sk-ant- ではない）', ok: (k) => k.startsWith('sk-') && !k.startsWith('sk-ant-') },
  // Gemini（AI Studio）のキー: AIza で始まる 39 文字が一般的 [INFERENCE: 公式に形の記載を見つけられなかった。少し緩めに見る]
  gemini: { re: /^AIza[0-9A-Za-z_-]{30,}$/, head: 'AIza', ok: (k) => k.startsWith('AIza') },
};
/** キーの形だけを見る（値は返さない・表示しない）。問題なければ null、あれば理由の文 */
export function keyShapeProblem(provider, key) {
  const env = KEY_ENV[provider];
  if (!key) return `${env}（評価専用キー）が環境にありません`;
  const s = KEY_SHAPE[provider];
  if (s.re.test(key)) return null;
  const bad = [/[^\x00-\x7f]/.test(key) && '全角などの非 ASCII', /\s/.test(key) && '空白・改行', /["'<>`]/.test(key) && '引用符か <>', !s.ok(key) && `先頭が ${s.head} でない`].filter(Boolean);
  return `${env} の形が API キーではありません（${bad.join('・') || '長さ・文字種'}）。値は表示しません。キーをそのまま貼り直してください`;
}

/** 文字列からキーとキーの形を伏せる（エラー本文をコンソールへ出す前に必ず通す） */
export function scrubSecrets(text, keys = []) {
  let t = String(text ?? '');
  for (const k of keys) if (k && k.length >= 8) t = t.split(k).join('[REDACTED]');
  return t
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1[REDACTED]')
    .replace(/([?&]key=)[^&\s"]+/gi, '$1[REDACTED]');
}

export const TIMEOUT_MS = 400_000; // 本番の ANTHROPIC_TIMEOUT_MS と同じ
const statusCode = (s) => (s === 429 ? 'rate_limited' : s === 408 || s === 504 ? 'timeout' : 'upstream');

/** Anthropic 形の要求（buildRequest の戻り値）から、各社へ渡す材料を取り出す */
export function partsOf(params) {
  const system = (Array.isArray(params.system) ? params.system.map((b) => b.text) : [params.system]).join('\n');
  const user = params.messages.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((c) => c.text ?? '').join(''))).join('\n');
  return { model: params.model, system, user, schema: params.output_config.format.schema, maxTokens: params.max_tokens, effort: params.output_config.effort };
}

// ---- OpenAI（Responses API・text.format json_schema strict）----
export const OPENAI_URL = 'https://api.openai.com/v1/responses';
export function openaiBody(params) {
  const p = partsOf(params);
  return {
    model: p.model,
    instructions: p.system,
    input: [{ role: 'user', content: p.user }],
    max_output_tokens: p.maxTokens,
    reasoning: { effort: p.effort },
    // store の既定は true（アプリ状態を保持する）。評価の入力を残さない
    store: false,
    text: { format: { type: 'json_schema', name: 'requirements_draft', strict: true, schema: p.schema } },
  };
}
export function openaiToMessage(body) {
  const items = Array.isArray(body?.output) ? body.output : [];
  const parts = items.filter((i) => i?.type === 'message').flatMap((i) => (Array.isArray(i.content) ? i.content : []));
  const text = parts.filter((c) => c?.type === 'output_text').map((c) => c.text ?? '').join('');
  const refused = parts.some((c) => c?.type === 'refusal');
  const reason = body?.incomplete_details?.reason;
  const stop = refused || reason === 'content_filter' ? 'refusal'
    : body?.status === 'incomplete' && reason === 'max_output_tokens' ? 'max_tokens'
      : body?.status === 'completed' ? 'end_turn' : 'other';
  const u = body?.usage ?? {};
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  return {
    content: [{ type: 'text', text }],
    stop_reason: stop,
    // output_tokens は推論トークンを含む（出力として課金）。cached_tokens は input_tokens の内数
    usage: { input_tokens: Math.max(0, (u.input_tokens ?? 0) - cached), cache_creation_input_tokens: 0, cache_read_input_tokens: cached, output_tokens: u.output_tokens ?? 0 },
  };
}

// ---- Google Gemini（generateContent・responseJsonSchema）----
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const geminiUrl = (model) => `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
const GEMINI_LEVEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
export function geminiBody(params) {
  const p = partsOf(params);
  return {
    systemInstruction: { parts: [{ text: p.system }] },
    contents: [{ role: 'user', parts: [{ text: p.user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      // maxLength などは黙って外される（比較資料 §2(1)）。切り詰めと再検証は本番の validateOutput が行う
      responseJsonSchema: p.schema,
      maxOutputTokens: p.maxTokens,
      thinkingConfig: { thinkingLevel: GEMINI_LEVEL[p.effort] ?? 'LOW' },
    },
  };
}
const GEMINI_REFUSAL = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE']);
export function geminiToMessage(body) {
  const c = Array.isArray(body?.candidates) ? body.candidates[0] : undefined;
  const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
  const text = parts.filter((p) => !p?.thought && typeof p?.text === 'string').map((p) => p.text).join('');
  const fr = c?.finishReason;
  const stop = body?.promptFeedback?.blockReason || GEMINI_REFUSAL.has(fr) ? 'refusal' : fr === 'MAX_TOKENS' ? 'max_tokens' : fr === 'STOP' ? 'end_turn' : 'other';
  const u = body?.usageMetadata ?? {};
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    content: [{ type: 'text', text }],
    stop_reason: stop,
    // 思考トークン（thoughtsTokenCount）は出力として課金。cachedContentTokenCount は promptTokenCount の内数
    usage: { input_tokens: Math.max(0, (u.promptTokenCount ?? 0) - cached), cache_creation_input_tokens: 0, cache_read_input_tokens: cached, output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) },
  };
}

/**
 * fetch で呼ぶ DraftClient（generateDraft に注入する）。maxRetries 0 相当（再試行しない）。
 * 失敗の種別・HTTP 状態は lastError に置く（本番の classifyError は Anthropic SDK の例外しか見分けないため）
 */
export function createFetchDraftClient(provider, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (!apiKey) throw new Error('apiKey is required');
  if (provider !== 'openai' && provider !== 'gemini') throw new Error(`fetch クライアントは openai / gemini だけ: ${provider}`);
  const client = {
    provider,
    lastError: null,
    async create(params) {
      client.lastError = null;
      const isOpenai = provider === 'openai';
      const url = isOpenai ? OPENAI_URL : geminiUrl(params.model);
      // キーはヘッダだけ（URL の ?key= に載せない）
      const headers = isOpenai
        ? { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }
        : { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
      const body = JSON.stringify(isOpenai ? openaiBody(params) : geminiBody(params));
      let res;
      try {
        res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        client.lastError = { code: timeout ? 'timeout' : 'upstream', detail: scrubSecrets(e?.name ?? 'fetch failed', [apiKey]) };
        throw new Error(client.lastError.code);
      }
      const requestId = res.headers?.get?.('x-request-id') ?? null;
      const raw = await res.text();
      if (!res.ok) {
        let msg = '';
        try { const j = JSON.parse(raw); msg = [j?.error?.status ?? j?.error?.type, j?.error?.code, j?.error?.message].filter(Boolean).join(' '); } catch { msg = ''; }
        client.lastError = { code: statusCode(res.status), httpStatus: res.status, ...(requestId ? { requestId } : {}), detail: scrubSecrets(msg, [apiKey]).slice(0, 300) };
        throw new Error(client.lastError.code);
      }
      let json;
      try { json = JSON.parse(raw); } catch { client.lastError = { code: 'upstream', httpStatus: res.status, detail: 'non-JSON body' }; throw new Error('upstream'); }
      const message = isOpenai ? openaiToMessage(json) : geminiToMessage(json);
      return { message, requestId: requestId ?? json?.id ?? json?.responseId ?? null };
    },
  };
  return client;
}

/** generateDraft を呼び、他社の失敗の種別・HTTP 状態を結果へ戻す（本番の結果の形は変えない） */
export async function generateWith(core, input, client, now = Date.now) {
  const r = await core.generateDraft(input, { client, now });
  if (r.ok || !client.lastError) return r;
  const { code, httpStatus, requestId } = client.lastError;
  return { ...r, code, ...(httpStatus ? { httpStatus } : {}), ...(requestId && !r.anthropicRequestId ? { anthropicRequestId: requestId } : {}) };
}

/** Provider ごとの送信本文（dry-run で書き出す。キーは含まない） */
export function wireRequest(provider, params) {
  if (provider === 'openai') return { url: OPENAI_URL, body: openaiBody(params) };
  if (provider === 'gemini') return { url: geminiUrl(params.model), body: geminiBody(params) };
  return { url: 'https://api.anthropic.com/v1/messages', body: params };
}
