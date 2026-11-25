// 要件定義書ひな型 U2: 提案 v3 の生成（PRM-REQ-001@2.0.0）・Schema・後処理・組み立て・編集の検査（docs/design/REQUIREMENTS_DOC_TEMPLATE.md §4・§7 U2）。
// Anthropic は Stub（実 API に出ない）。test:functions が functions をビルドしてから走る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

if (process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY が環境にあります。テストでは本物のキーを使わない（unset してから実行）');
const require = createRequire(import.meta.url);
const lib = (p) => require(`../../functions/lib/ai/${p}.js`);
const { generateDraft, buildRequest, DEFAULT_AI_CONFIG, aiConfigFor } = lib('generateDraft');
const { OUTPUT_SCHEMA_V3 } = lib('reqDocSchema');
const { DNS_OWNER_OPTIONS, DNS_SWITCH_OPTIONS } = lib('reqDocPostprocess');
const { validateEditableV3 } = lib('reqDocEditable');
const { configKeyOf, configKeyForVersion, CURRENT_CONFIG_KEY } = lib('generatePort');
const { parseProposalVersion, PROPOSAL_VERSION_DEFAULT } = lib('flags');
const { AI_MAX_TOKENS } = lib('limits');
const { configHash } = lib('shared/answersHash');
const { competitorHostsOf } = lib('shared/redact');
const { REQ_DOC_CATALOG } = lib('shared/reqDocCatalog');
const { REQ_DOC_LIMITS } = lib('shared/aiDraft');

const CAT = REQ_DOC_CATALOG['0.1'];
const byFill = (f) => CAT.items.filter((i) => i.fill === f).map((i) => i.id);
const FIXED = CAT.items.filter((i) => i.kubun === 'fixed').map((i) => i.id);
const ANSWERS = {
  'q-url': 'https://www.cafe-example.jp/', 'q-purpose': ['問い合わせを増やしたい'], 'q-issue': 'スマホで見づらい',
  'q-improve': ['スマホ表示'], 'q-cv': '来店予約', 'q-ops': '社内担当者', 'q-target': '30代の会社員',
  'q-infra': 'INFRA-SECRET-77', 'q-dns-owner': 'お客様', 'q-dns-switch': '未定', 'q-dns-note': 'DNSNOTE-SECRET-88',
};
const FACTS = { siteName: 'カフェ公式サイト SITENAME-X', clientName: '株式会社カフェ CLIENT-X', dnsOwner: 'お客様', dnsSwitch: '未定', releaseDate: '2027-03-31' };
const SITE = { status: 'ok', passed: 1, total: 2, items: [{ key: 'https', ok: true, value: true }, { key: 'viewport', ok: false, value: null }] };
const it = (id, status, text, evidence) => ({ id, status, text, evidence });
const V3_OUT = {
  summary: 'スマホで見やすくします。',
  points: [{ area: 'スマホ表示', priority: 'high', title: 'スマホ前提', detail: '文字を大きくします。', impact: '問い合わせの増加を狙う', evidence: ['q-issue'] }],
  doc: {
    items: [
      it('t01-03', 'proposed', 'スマホで見づらいことが課題です。', ['q-issue']),
      it('t01-03', 'proposed', '重複（捨てる）', ['q-issue']),
      it('t11-01', 'proposed', '固定に書こうとした文', ['q-issue']),
      it('t01-01', 'proposed', 'AI が案件名を書こうとした', ['q-issue']),
      it('zz-99', 'proposed', '未知の id', ['q-issue']),
      it('t01-04', 'proposed', '根拠のない KPI', []),
      it('t03-02', 'na', '個別の na', ['q-target']),
      it('t07-05', 'proposed', '来店予約の予約機能を採用案とします。月 300 件を想定', ['q-cv']),
      it('t07-06', 'na', '購入の回答が無いため決済は不採用案です。', ['q-cv']),
      it('t07-02', 'na', '', ['q-feature']),
      it('t05-05', 'proposed', 'スマホ表示を改善します（viewport 未設定）。連絡は a@b.co へ', ['viewport', 'q-infra']),
    ],
    added: [
      { chapterId: 'c07', label: '予約リマインド', text: '予約の前日に通知します。', reason: '来店予約が成果のため', evidence: ['q-cv'] },
      { chapterId: 'c07', label: '問い合わせ', text: 'ひな型と同名', reason: 'x', evidence: ['q-cv'] },
      { chapterId: 'c07', label: '根拠なし', text: 't', reason: 'r', evidence: [] },
      { chapterId: 'c11', label: '固定の章', text: 't', reason: 'r', evidence: ['q-cv'] },
      ...Array.from({ length: 12 }, (_, i) => ({ chapterId: i < 6 ? 'c04' : 'c06', label: `追加${i}`, text: 't', reason: 'r', evidence: ['q-content', 'q-issue'] })),
    ],
    questions: ['公開の希望時期を確認したい', '予約の枠を確認したい'],
  },
};
const msg = (out = V3_OUT, over = {}) => ({ id: 'm', type: 'message', role: 'assistant', model: DEFAULT_AI_CONFIG.model, stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 25000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 12000 }, ...over });
const stub = (out) => { const calls = []; return { calls, create: async (p) => { calls.push(p); return { message: msg(out), requestId: 'req_v3' }; } }; };
const V3 = aiConfigFor(3);
const input = (over = {}) => ({ answers: ANSWERS, siteFacts: SITE, siteText: 'メニューと店舗情報', competitorHosts: competitorHostsOf(ANSWERS), serverFacts: FACTS, config: V3, ...over });
const deps = (client) => ({ client, now: () => 0 });
const gen = async (out, over) => { const c = stub(out); const r = await generateDraft(input(over), deps(c)); return { r, c }; };

test('切り替え: 既定は v2（DEFAULT_AI_CONFIG は不変・max_tokens 12000）、3 だけが v3（max_tokens 24000）', () => {
  assert.equal(PROPOSAL_VERSION_DEFAULT, 2);
  for (const v of [undefined, '', '4', 'v3', 2, '2']) assert.equal(parseProposalVersion(v), 2);
  assert.equal(parseProposalVersion(' 3 '), 3);
  assert.deepEqual(DEFAULT_AI_CONFIG, { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 12_000 });
  assert.equal(aiConfigFor(2), DEFAULT_AI_CONFIG);
  assert.deepEqual(aiConfigFor(3), { ...DEFAULT_AI_CONFIG, maxTokens: AI_MAX_TOKENS.v3, proposalVersion: 3 });
  assert.equal(AI_MAX_TOKENS.v3, 24_000);
});
test('configHash: v2 は今と同じ値、v3 は promptVersion 2.0.0 とひな型の版で変わる', async () => {
  assert.deepEqual(configKeyForVersion(2), CURRENT_CONFIG_KEY);
  assert.equal(await configHash(CURRENT_CONFIG_KEY), await configHash({ model: 'claude-sonnet-5-5', promptVersion: 'PRM-REQ-001@1.0.0', effort: 'low' }));
  const k3 = configKeyOf(V3);
  assert.deepEqual(k3, { model: DEFAULT_AI_CONFIG.model, promptVersion: 'PRM-REQ-001@2.0.0', effort: 'low', template: 'TPL-WEB-REQ@0.1' });
  assert.notEqual(await configHash(k3), await configHash(CURRENT_CONFIG_KEY));
  assert.notEqual(await configHash({ ...k3, template: 'TPL-WEB-REQ@0.2' }), await configHash(k3));
});
test('Schema: 項目 id の enum は fill:ai の 41 件だけ（固定・server・human は出力できない）', () => {
  const enumIds = OUTPUT_SCHEMA_V3.properties.doc.properties.items.items.properties.id.enum;
  assert.deepEqual([...enumIds].sort(), byFill('ai').sort());
  assert.equal(enumIds.length, 41);
  for (const id of [...FIXED, ...byFill('server'), ...byFill('human')]) assert.equal(enumIds.includes(id), false, id);
  const ch = OUTPUT_SCHEMA_V3.properties.doc.properties.added.items.properties.chapterId.enum;
  for (const c of ['c11', 'c14', 'c15', 'c22']) assert.equal(ch.includes(c), false, c);
});
test('送信: v3 のユーザーメッセージは v2 と同じ・転記の材料と q-infra/q-dns-* は request に無い・system に固定の項目が無い', () => {
  const p3 = buildRequest(input());
  const p2 = buildRequest(input({ config: DEFAULT_AI_CONFIG }));
  assert.deepEqual(p3.messages, p2.messages);
  assert.equal(p3.max_tokens, 24_000); assert.equal(p3.model, p2.model);
  const all = JSON.stringify(p3);
  for (const leak of ['SITENAME-X', 'CLIENT-X', 'INFRA-SECRET', 'DNSNOTE-SECRET', 'q-dns-owner', '2027-03-31']) assert.equal(all.includes(leak), false, leak);
  const sys = p3.system[0].text;
  for (const id of byFill('ai')) assert.ok(sys.includes(`- ${id}｜`), id);
  for (const id of [...FIXED, ...byFill('server'), ...byFill('human')]) assert.equal(sys.includes(`- ${id}｜`), false, id);
});
test('組み立て: 全 129 項目・固定 32 は std_pending（AI の文は入らない）・proposed/na は evidence あり', async () => {
  const { r } = await gen();
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = r.proposal;
  assert.deepEqual([p.version, p.origin.promptVersion, p.template.version], [3, 'PRM-REQ-001@2.0.0', '0.1']);
  assert.deepEqual(Object.keys(p.doc.items).sort(), CAT.items.map((i) => i.id).sort());
  for (const id of FIXED) assert.deepEqual(p.doc.items[id], { status: 'std_pending', text: '', evidence: [], by: 'server' }, id);
  for (const [id, v] of Object.entries(p.doc.items)) if (v.status === 'proposed' || v.status === 'na') assert.ok(v.evidence.length > 0, id);
  for (const id of byFill('human')) assert.deepEqual(p.doc.items[id], { status: 'open', text: '', evidence: [], by: 'human' }, id);
  assert.equal(JSON.stringify(p).includes('固定に書こうとした'), false);
  assert.equal('zz-99' in p.doc.items, false);
});
test('後処理: 重複は先勝ち・evidence 空は open・個別の na は open・選択の na は理由つきで残す・na の文が空は open', async () => {
  const { r } = await gen();
  const d = r.proposal.doc.items;
  assert.equal(d['t01-03'].text, 'スマホで見づらいことが課題です。');
  assert.deepEqual(d['t01-04'], { status: 'open', text: '', evidence: [], by: 'ai' });
  assert.deepEqual([d['t03-02'].status, d['t03-02'].text], ['open', '']);
  assert.deepEqual([d['t07-06'].status, d['t07-06'].by], ['na', 'ai']);
  assert.equal(d['t07-02'].status, 'open');
  assert.equal(d['t07-05'].status, 'proposed');
});
test('後処理: evidence は送ったキーだけ（q-infra を落とす）・メールを除く・入力に無い数字は「項目 id:数字」で印', async () => {
  const { r } = await gen();
  const d = r.proposal.doc.items['t05-05'];
  assert.deepEqual(d.evidence, ['viewport']);
  assert.match(d.text, /\[メール\]/);
  assert.ok(r.flags.unsupportedNumbers.includes('t07-05:300'), JSON.stringify(r.flags));
});
test('転記（server 8 項目）: 案件名・顧客名・DNS の選択肢・日程。自由記述（q-infra・q-dns-note）は入らない', async () => {
  const { r } = await gen();
  const d = r.proposal.doc.items;
  assert.equal(byFill('server').length, 8);
  assert.deepEqual(d['t01-01'], { status: 'proposed', text: FACTS.siteName, evidence: ['project:siteName'], by: 'server' });
  assert.equal(d['t01-02'].text, FACTS.clientName);
  assert.deepEqual([d['t12-01'].status, d['t12-01'].text], ['proposed', 'ドメインの管理: お客様']);
  assert.deepEqual([d['t18-02'].status, d['t18-02'].text], ['open', '公開時の切り替え: 未定']);
  assert.equal(d['t12-02'].status, 'open');
  assert.deepEqual(d['t19-06'], { status: 'proposed', text: '公開予定日: 2027-03-31', evidence: ['schedule:releaseDate'], by: 'server' });
  assert.deepEqual([d['t19-03'].status, d['t19-05'].status], ['open', 'open']);
  const all = JSON.stringify(r.proposal);
  for (const leak of ['INFRA-SECRET', 'DNSNOTE-SECRET']) assert.equal(all.includes(leak), false, leak);
  const free = await gen(V3_OUT, { serverFacts: { dnsOwner: '自由記述 FREE-TEXT', dnsSwitch: '<b>x</b>' } });
  assert.equal(JSON.stringify(free.r.proposal).includes('FREE-TEXT'), false);
  assert.deepEqual(free.r.proposal.doc.items['t12-01'], { status: 'open', text: '', evidence: [], by: 'server' });
  assert.equal(r.proposal.doc.cover.client, FACTS.clientName);
});
test('22 章 未決事項: open の項目名と AI の確認事項を集める（上限内）', async () => {
  const { r } = await gen();
  const t = r.proposal.doc.items['t22-01'];
  assert.deepEqual([t.status, t.by, t.evidence], ['open', 'server', ['derived:openItems']]);
  assert.match(t.text, /^未確定の項目（生成時点）: 01 /);
  assert.match(t.text, /・公開の希望時期を確認したい/);
  assert.ok([...t.text].length <= REQ_DOC_LIMITS.openItemsText);
});
test('AI追加: ひな型と同名・evidence 0・固定の章・1 章 5 件超・合計 10 件超を捨てる', async () => {
  const { r } = await gen();
  const a = r.proposal.doc.added;
  assert.ok(a.length <= 10);
  assert.deepEqual(a.map((x) => x.id), a.map((_, i) => `a${String(i + 1).padStart(2, '0')}`));
  assert.equal(a[0].label, '予約リマインド');
  for (const bad of ['問い合わせ', '根拠なし', '固定の章']) assert.equal(a.some((x) => x.label === bad), false, bad);
  assert.equal(a.filter((x) => x.chapterId === 'c04').length, 5);
  for (const x of a) assert.ok(x.evidence.length >= 1 && x.reason && x.source === 'ai_added' && x.status === 'proposed');
});
test('形式エラー: v3 の欄が無い・状態が列挙外は schema', async () => {
  assert.equal((await gen({ ...V3_OUT, doc: undefined })).r.code, 'schema');
  const bad = structuredClone(V3_OUT); bad.doc.items[0].status = 'std_pending';
  assert.equal((await gen(bad)).r.code, 'schema');
  // v2 の出力を v3 で受けると schema（v3 の Schema に draft は無い）
  assert.equal((await gen({ summary: 's', points: V3_OUT.points, draft: {} })).r.code, 'schema');
});
test('v2 の経路は今のまま（既定の設定で version 2・PRM-REQ-001@1.0.0）', async () => {
  const out = { summary: 's', points: V3_OUT.points, draft: { goal: '', target: '', contents: '', features: '', nonFunctional: '', operation: '', schedule: '', openQuestions: [] } };
  const { r } = await gen(out, { config: DEFAULT_AI_CONFIG });
  assert.deepEqual([r.ok, r.proposal.version, r.proposal.origin.promptVersion, 'doc' in r.proposal], [true, 2, 'PRM-REQ-001@1.0.0', false]);
});

// 編集の検査（saveAiDraftEdits と worker の再検証）
const generatedV3 = async () => (await gen()).r.proposal;
const editedOf = (g) => structuredClone({ summary: g.summary, points: g.points, doc: g.doc });
test('編集 v3: generated の写しは通る・人が書く項目と特記・表紙は書ける', async () => {
  const g = await generatedV3();
  const e = editedOf(g);
  e.doc.items['t01-05'] = { ...e.doc.items['t01-05'], status: 'proposed', text: '発注者: 広報部長／受注者: ディレクター' };
  e.doc.notes.c01 = '特記なし'; e.doc.cover.vendor = '株式会社アフロ';
  e.doc.added = e.doc.added.slice(1); // 削除はできる
  assert.equal(validateEditableV3(e, g).doc.items['t01-05'].status, 'proposed');
});
const reject = [
  ['固定を確認中以外にする', (e) => { e.doc.items['t11-01'].status = 'proposed'; }],
  ['固定に文を書く', (e) => { e.doc.items['t14-01'].text = 'x'; }],
  ['固定以外を std_pending', (e) => { e.doc.items['t01-03'].status = 'std_pending'; }],
  ['by を変える', (e) => { e.doc.items['t01-03'].by = 'human'; }],
  ['evidence を変える', (e) => { e.doc.items['t01-03'].evidence = ['q-url']; }],
  ['文の上限超え', (e) => { e.doc.items['t01-03'].text = 'あ'.repeat(REQ_DOC_LIMITS.itemText + 1); }],
  ['na で理由が空', (e) => { e.doc.items['t07-06'].text = ' '; }],
  ['項目が欠ける', (e) => { delete e.doc.items['t02-02']; }],
  ['未知の項目', (e) => { e.doc.items['t99-01'] = { status: 'open', text: '', evidence: [], by: 'human' }; }],
  ['AI追加を足す', (e) => { e.doc.added.push({ ...e.doc.added[0], id: 'a99' }); }],
  ['AI追加の章を変える', (e) => { e.doc.added[0].chapterId = 'c05'; }],
  ['特記の章が足りない', (e) => { delete e.doc.notes.c01; }],
  ['16 章に特記', (e) => { e.doc.notes.c16 = 'x'; }],
  ['表紙の上限超え', (e) => { e.doc.cover.client = 'あ'.repeat(101); }],
  ['余分なキー', (e) => { e.draft = {}; }],
];
for (const [name, mutate] of reject) {
  test(`編集 v3: ${name} → 拒否（理由は欄の名前だけ）`, async () => {
    const g = await generatedV3();
    const e = editedOf(g); mutate(e);
    assert.throws(() => validateEditableV3(e, g), (err) => err.name === 'EditableError' && !/あ{2}|t99|a99/.test(err.field));
  });
}

test('選択肢: DNS の転記の許可リストはヒアリングの選択肢と同じ（src/data/requirements.ts）', () => {
  const src = readFileSync(new URL('../../src/data/requirements.ts', import.meta.url), 'utf8');
  const opts = (id) => JSON.parse(src.match(new RegExp(`id: '${id}'.*?options: (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  assert.deepEqual(opts('q-dns-owner'), [...DNS_OWNER_OPTIONS]);
  assert.deepEqual(opts('q-dns-switch'), [...DNS_SWITCH_OPTIONS]);
});
