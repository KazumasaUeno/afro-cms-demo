#!/usr/bin/env node
// 起動中のエミュレータ（npm run emulators）に、要件定義書 v3（TPL-WEB-REQ）の AI 下書きを持つ架空の案件を 2 件入れる（画面の確認用）。
// 安全装置は scripts/seed-emulator.mjs と同じ: demo- のプロジェクトだけ・127.0.0.1 だけ・REST に `Authorization: Bearer owner`（Rules を通らない Console 相当）。
// firebase-admin・gcloud・ADC は使わない。データはすべて架空（「架空テスト株式会社」。実在の人・会社・URL を使わない）。
//
// 手順（エミュレータを起動した別の端末で）:
//   node scripts/seed-emulator.mjs                      … 管理者 admin@example.com の招待と Auth のアカウント（先に必要）
//   node scripts/seed-emulator.mjs --set-password <PW>  … パスワードを設定
//   node scripts/seed-emulator-reqdoc.mjs [admin のメール] [--with-dev]
//   --with-dev … 架空の社内開発者 dev@example.com（開発 花子）を作り、2 件の案件の memberUids に入れる（編集モードの確認用）。
//                パスワードは環境変数 SEED_DEV_PASSWORD（8 文字以上。表示しない）。Auth は確認済み・accounts は active・招待は claimed で直接置く
//                （初回ログインの受け取りを Console 相当で済ませた状態。何度実行してもよい）
// 入れるもの（同じ ID に上書き。何度実行してもよい）:
//   projects/reqdoc-v3-draft     … 要件 draft。aiDrafts/requirements は ready＋generated v3＋edited v3＋submitReady
//   projects/reqdoc-v3-analyzed  … 要件 analyzed（提案 v3 を提出済み。requirements/current.proposal と approvals の写し）
//   --with-schedule … projects/reqdoc-v3-approved も入れる（要件 approved・スケジュール第 1 版をお客様へ承認依頼中。LIVE_SCHEDULE_PLAN U4 の画面確認用）。
//                     schedule の要約・schedule/current・schedule/internal・approvals の requirements-r1-*／schedule-r1-submit。予定日は今日から 20・30・40 日後
//   --with-client   … 架空のお客様 client@example.com（架空 顧客）を reqdoc-v3-approved のお客様として置く（--with-schedule と一緒に。
//                     パスワードは環境変数 SEED_CLIENT_PASSWORD。8 文字以上・表示しない）
//
// カタログ・必須章の判定・回答のハッシュは本物（src/shared/ai/*.ts）を使うため、Node の型除去（--experimental-strip-types）で自分を起動し直す。
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, [
    '--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(root, 'tests', 'unit', 'register.mjs')).href,
    fileURLToPath(import.meta.url), ...process.argv.slice(2),
  ], { cwd: root, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { EMULATOR_PROJECT_ID } = await import('./firebase-projects.mjs');
const PROJECT = EMULATOR_PROJECT_ID;
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
if (!PROJECT.startsWith('demo-')) throw new Error(`demo- 以外のプロジェクト（${PROJECT}）には書かない`);
for (const u of [FIRESTORE, AUTH]) if (new URL(u).hostname !== '127.0.0.1') throw new Error(`エミュレータ以外（${u}）には書かない`);

const { REQ_DOC_TEMPLATE, reqDocCatalogOf, reqDocRequiredOk } = await import('../src/shared/ai/reqDocCatalog.ts');
const { answersHash, configHash } = await import('../src/shared/ai/answersHash.ts');
// 文書の形は Rules テストの fixtures を正にする（サーバーが書く形と同じ）
const { GENERATED, aiDraftDoc } = await import('../tests/rules/aiFixtures.mjs');
const { GENERATED_V3, editedV3Of, proposalV3 } = await import('../tests/rules/aiFixturesV3.mjs');

const VERSION = REQ_DOC_TEMPLATE.version;
const CATALOG = reqDocCatalogOf(VERSION);
if (!CATALOG) throw new Error(`ひな型 ${VERSION} のカタログがありません`);

// ---------------- Firestore REST の型付きの値 ----------------
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v.toDate === 'function') return { timestampValue: v.toDate().toISOString() }; // firebase の Timestamp（fixtures の T0）
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new Error(`REST に変換できない値（${proto?.constructor?.name}）。serverTimestamp() は使わず Date を渡す`);
  return { mapValue: { fields: toFields(v) } };
}
const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toValue(x)]));

async function call(url, init) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner', ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
const docUrl = (path) => `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
/** 文書を丸ごと置く（PATCH・updateMask なし＝作成または全置換） */
const put = (path, data) => call(docUrl(path), { method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) });

async function adminUid(email) {
  const { users = [] } = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', body: JSON.stringify({ email: [email] }) });
  if (!users[0]?.localId) throw new Error(`Auth に ${email} がありません（先に node scripts/seed-emulator.mjs）`);
  return users[0].localId;
}

// ---------------- 架空の案件 ----------------
const NOW = new Date();
const CLIENT = '架空テスト株式会社';
const SITES = {
  draft: { pid: 'reqdoc-v3-draft', siteName: '架空テスト株式会社 コーポレートサイト', host: 'kakuu-test.example.com', industry: '製造業', accent: '#0D9488' },
  approved: { pid: 'reqdoc-v3-approved', siteName: '架空テスト株式会社 製品サイト', host: 'products.kakuu-test.example.com', industry: '製造業', accent: '#7C3AED' },
  analyzed: { pid: 'reqdoc-v3-analyzed', siteName: '架空テスト株式会社 採用サイト', host: 'recruit.kakuu-test.example.com', industry: '製造業', accent: '#1D4ED8' },
};

const answersOf = (s) => ({
  'q-url': `https://${s.host}`,
  'q-purpose': ['問い合わせを増やしたい', 'スマホ対応したい', '更新を楽にしたい'],
  'q-issue': 'スマホで見づらく、製品の問い合わせがほとんど来ない。更新は外部に頼んでいて、お知らせが半年止まっている',
  'q-competitor': ['https://competitor-a.example.net'],
  'q-improve': ['スマホ表示', '問い合わせ導線', '更新のしやすさ'],
  'q-keep': '工場の写真は評判が良いので残したい',
  'q-target': '県内の中小メーカーの購買担当（30〜50 代）',
  'q-strength': '創業 40 年の精密加工。小ロット・短納期に対応できる',
  'q-content': '製品紹介・加工事例・会社概要・お問い合わせ',
  'q-feature': '問い合わせフォーム、お知らせの更新、加工事例の一覧',
  'q-cv': '問い合わせ',
  'q-ops': '社内担当者',
  'q-schedule': '2027 年 3 月末',
  'q-dns-owner': '制作会社・他社',
  'q-dns-switch': '未定',
});

const EVIDENCE = ['q-issue', 'q-purpose', 'q-feature', 'q-improve', 'viewport', 'site_text'];
const evidenceOf = (it, i) => (it.feeds?.length ? it.feeds.slice(0, 3) : [EVIDENCE[i % EVIDENCE.length]]);

/**
 * 全 129 項目（カタログから）。generated＝AI の下書き、edited＝担当者が直した版。
 * - 固定: std_pending・空文（固定はこれ以外にできない）
 * - human の項目: generated は open（AI は書かない）、edited は担当者が書いた proposed
 * - 個別・選択: proposed（文あり）。選択の一部は na（理由の文つき）、必須章以外の一部は open のまま
 */
function itemsOf(kind) {
  const required = new Set(['c01', 'c02', 'c19', 'c21']);
  return Object.fromEntries(CATALOG.items.map((it, i) => {
    if (it.kubun === 'fixed') return [it.id, { status: 'std_pending', text: '', evidence: [], by: 'server' }];
    if (it.fill === 'human') {
      return [it.id, kind === 'generated'
        ? { status: 'open', text: '', evidence: [], by: 'ai' }
        : { status: 'proposed', text: `${it.label}：${it.target}について、${CLIENT}のご担当者と打ち合わせで確認した内容を記載（架空）`, evidence: evidenceOf(it, i), by: 'human' }];
    }
    if (it.kubun === 'optional' && i % 3 === 0) {
      return [it.id, { status: 'na', text: `今回は対象外とします。理由：ヒアリングで「${it.label}」の希望がなく、公開後に必要になれば追加見積で対応します`, evidence: evidenceOf(it, i), by: 'ai' }];
    }
    if (!required.has(it.chapterId) && i % 11 === 5) return [it.id, { status: 'open', text: '', evidence: [], by: 'ai' }];
    const text = it.fill === 'server' && it.feeds.includes('project:clientName') ? CLIENT
      : it.fill === 'server' && it.feeds.includes('project:siteName') ? SITES.draft.siteName
      : `${it.label}（${it.target}）：回答「スマホで見づらく、問い合わせが少ない」を踏まえ、スマートフォンを主に想定した構成とします`;
    return [it.id, { status: 'proposed', text, evidence: evidenceOf(it, i), by: it.fill === 'server' ? 'server' : 'ai' }];
  }));
}

function docOf(kind) {
  const notes = Object.fromEntries(CATALOG.chapters.filter((c) => c.hasNotes).map((c) => [c.id, '']));
  notes.c07 = '予約機能は将来の追加候補（今回は対象外。追加費用の見積は別途）';
  notes.c11 = 'サーバーの移管はお客様の情報システム担当と日程を調整する';
  if (kind === 'edited') notes.c02 = '写真撮影は対象外（お客様支給）';
  const items = itemsOf(kind);
  if (kind === 'edited') {
    // 担当者が AI の文を直した例（1 件）
    const first = CATALOG.items.find((it) => it.kubun !== 'fixed' && it.fill === 'ai' && items[it.id].status === 'proposed');
    if (first) items[first.id] = { ...items[first.id], text: `${items[first.id].text}（担当者が追記: 打ち合わせで優先度を確認済み）`, by: 'human' };
  }
  return {
    items,
    added: [
      { id: 'a01', chapterId: 'c07', label: '加工事例の絞り込み検索', status: 'proposed', text: '加工方法・素材で事例を絞り込める一覧を設けます',
        reason: '回答に「加工事例の一覧」の希望がある', evidence: ['q-feature'], source: 'ai_added' },
      { id: 'a02', chapterId: 'c06', label: '英語ページ', status: 'na', text: '今回は対象外。海外からの問い合わせは現状ないため',
        reason: '現行サイトに英語の導線がある', evidence: ['site_text'], source: 'ai_added' },
    ],
    notes,
    cover: { client: CLIENT, vendor: '株式会社アフロ', author: kind === 'edited' ? '制作部 ディレクター' : '', approver: kind === 'edited' ? '制作部 部長' : '' },
  };
}

function generatedOf(s) {
  return {
    ...GENERATED_V3,
    hostname: s.host,
    issue: answersOf(s)['q-issue'],
    purposes: answersOf(s)['q-purpose'],
    improves: answersOf(s)['q-improve'],
    competitors: ['competitor-a.example.net'],
    siteCheck: { ...GENERATED.siteCheck, fetchedAt: NOW },
    template: { id: 'TPL-WEB-REQ', version: VERSION },
    summary: 'スマホでの見やすさと問い合わせ導線を優先し、社内で更新できる構成に改めます。',
    points: [
      { id: 'ai1', area: 'スマホ表示', priority: 'high', title: 'スマホを主役にした設計', detail: 'viewport は設定済みだが本文の文字が小さく、表が横にはみ出す。', impact: '問い合わせの増加を狙う', evidence: ['viewport', 'q-issue'] },
      { id: 'ai2', area: '問い合わせ導線', priority: 'high', title: '各ページから問い合わせへ', detail: '製品ページの末尾に問い合わせの導線が無い。', impact: '問い合わせまでの手間を減らす', evidence: ['q-issue', 'site_text'] },
      { id: 'ai3', area: '更新のしやすさ', priority: 'medium', title: 'お知らせを社内で更新', detail: '更新を外部に頼んでいるため止まっている。', impact: '情報の鮮度を保つ', evidence: ['q-issue', 'q-purpose'] },
    ],
    doc: docOf('generated'),
    flags: { unsupportedNumbers: [] },
  };
}

/** 架空の社内開発者（--with-dev）。Auth のアカウント・invites（claimed）・accounts（active）を置いて uid を返す */
async function seedDev(adminUidValue) {
  const email = 'dev@example.com';
  const name = '開発 花子';
  const password = process.env.SEED_DEV_PASSWORD ?? '';
  if (password.length < 8) throw new Error('--with-dev には環境変数 SEED_DEV_PASSWORD（8 文字以上）が要る');
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const body = await res.json();
  if (!res.ok && body?.error?.message !== 'EMAIL_EXISTS') throw new Error(`signUp → ${res.status} ${body?.error?.message ?? ''}`);
  const uid = await adminUid(email);
  // 既にある場合もパスワード・確認済み・表示名を揃える（エミュレータの管理 API。Bearer owner）
  await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', body: JSON.stringify({ localId: uid, password, emailVerified: true, displayName: name }),
  });
  await put(`invites/${email}`, {
    schemaVersion: 1, role: 'developer', status: 'claimed', name, affiliation: 'internal', devRole: 'ディレクター',
    createdAt: NOW, createdBy: adminUidValue, provisionedUid: uid, claimedBy: uid, claimedAt: NOW,
  });
  await put(`accounts/${uid}`, {
    schemaVersion: 1, role: 'developer', status: 'active', email, name, affiliation: 'internal', devRole: 'ディレクター',
    activatedAt: NOW, updatedAt: NOW, updatedBy: uid,
  });
  console.log(`開発者 ${email}（${name}・社内）: Auth・invites（claimed）・accounts（active）を置きました`);
  return uid;
}

/** 架空のお客様（--with-client）。Auth（確認済み）・invites（claimed）・accounts（active・projectId）を置いて uid を返す */
async function seedClient(adminUidValue, projectId) {
  const email = 'client@example.com';
  const name = '架空 顧客';
  const password = process.env.SEED_CLIENT_PASSWORD ?? '';
  if (password.length < 8) throw new Error('--with-client には環境変数 SEED_CLIENT_PASSWORD（8 文字以上）が要る');
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const body = await res.json();
  if (!res.ok && body?.error?.message !== 'EMAIL_EXISTS') throw new Error(`signUp → ${res.status} ${body?.error?.message ?? ''}`);
  const uid = await adminUid(email);
  await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', body: JSON.stringify({ localId: uid, password, emailVerified: true, displayName: name }),
  });
  await put(`invites/${email}`, {
    schemaVersion: 1, role: 'client', status: 'claimed', name, company: CLIENT, projectId,
    createdAt: NOW, createdBy: adminUidValue, provisionedUid: uid, claimedBy: uid, claimedAt: NOW,
  });
  await put(`accounts/${uid}`, { schemaVersion: 1, role: 'client', status: 'active', email, name, company: CLIENT, projectId, activatedAt: NOW, updatedAt: NOW, updatedBy: uid });
  console.log(`お客様 ${email}（${name}・${projectId}）: Auth・invites（claimed）・accounts（active）を置きました`);
  return { uid, name, email };
}

const ymdAfter = (days) => new Date(NOW.getTime() + days * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);

/** 要件 approved の案件にスケジュール第 1 版（承認依頼中）を置く（形は tests/rules/fixtures.mjs の scheduleSeed と同じ） */
async function seedSchedule(s, { uid, client }) {
  const dates = { buildDue: ymdAfter(20), deliveryDate: ymdAfter(30), releaseDate: ymdAfter(40) };
  const wbs = {
    sitemap: { start: ymdAfter(-3), end: ymdAfter(1), doneAt: NOW },
    design: { start: ymdAfter(2), end: ymdAfter(8) },
    build: { start: ymdAfter(9), end: ymdAfter(20) },
    buildApproval: { start: ymdAfter(21), end: ymdAfter(23) },
    quality: { start: ymdAfter(24), end: ymdAfter(30) },
    release: { start: ymdAfter(31), end: ymdAfter(40) },
  };
  const actor = { actorUid: uid, actorName: '管理者 太郎', actorEmail: 'admin@example.com', actorRole: 'admin' };
  await put(`projects/${s.pid}/schedule/current`, { schemaVersion: 1, revision: 1, editSeq: 2, ...dates, wbs, updatedAt: NOW, updatedBy: uid });
  await put(`projects/${s.pid}/schedule/internal`, {
    schemaVersion: 1, draft: dates, note: '架空のメモ（社内のみ。お客様には出ない）', assignees: { sitemap: '開発 花子', design: '開発 花子' },
    marks: { sitemap: { state: 'done', at: NOW, by: uid } }, savedByName: '管理者 太郎', editSeq: 2, updatedAt: NOW, updatedBy: uid,
  });
  await put(`projects/${s.pid}/approvals/schedule-r1-submit`, { schemaVersion: 1, kind: 'schedule', action: 'submit', revision: 1, side: 'afro', ...actor, at: NOW, ...dates, wbs });
  // 要件定義書の承認（お客様がいればお客様、いなければ代理）
  const approver = client
    ? { side: 'client', actorUid: client.uid, actorName: client.name, actorEmail: client.email }
    : { side: 'afro', ...actor, proxy: true, note: '架空の代理承認（シードのため）' };
  await put(`projects/${s.pid}/approvals/requirements-r1-approve`, { schemaVersion: 1, kind: 'requirements', action: 'approve', revision: 1, ...approver, at: NOW });
  console.log(`projects/${s.pid}: スケジュール第 1 版（承認依頼中。公開予定 ${dates.releaseDate}）`);
  return { status: 'requested', revision: 1, requestedAt: NOW, releaseDate: dates.releaseDate };
}

async function seedProject(s, { uid, state, devUid }) {
  const answers = answersOf(s);
  const answerMeta = Object.fromEntries(Object.keys(answers).map((k) => [k, { by: 'afro', at: NOW }]));
  const g = generatedOf(s);
  const e = { ...editedV3Of(g), doc: docOf('edited') };
  const submitReady = { requiredOk: reqDocRequiredOk(e.doc, VERSION), templateVersion: VERSION };
  const ai = {
    ...aiDraftDoc({ generated: g, edited: e, state: 'ready' }),
    answersHash: await answersHash(answers),
    configHash: await configHash({ model: g.origin.model, promptVersion: g.origin.promptVersion, effort: 'low', template: `TPL-WEB-REQ@${VERSION}` }),
    quota: { day: NOW.toISOString().slice(0, 10), dayCount: 1, month: NOW.toISOString().slice(0, 7), monthCount: 1 },
    submitReady, editedAt: NOW, editedBy: uid, updatedAt: NOW, updatedBy: 'server',
  };
  const analyzed = state === 'analyzed' || state === 'approved';
  await put(`projects/${s.pid}`, {
    schemaVersion: 1, clientName: CLIENT, siteName: s.siteName, siteUrl: `https://${s.host}`, siteUrlKey: s.host, industry: s.industry, accent: s.accent,
    ownerUid: uid, memberUids: devUid ? [devUid] : [], requirements: state === 'approved'
      ? { status: 'approved', revision: 1, analyzedAt: NOW, approvedAt: NOW, approvedBy: uid, approvalId: 'requirements-r1-approve', ...(s.client ? {} : { approvedVia: 'proxy' }) }
      : analyzed ? { status: 'analyzed', revision: 1, analyzedAt: NOW } : { status: 'draft', revision: 0 },
    ...(s.schedule ? { schedule: s.schedule } : {}),
    archived: false, createdAt: NOW, createdBy: uid, updatedAt: NOW, updatedBy: uid,
  });
  await put(`siteKeys/${s.host}`, { projectId: s.pid, createdAt: NOW });
  const req = { schemaVersion: 1, mode: 'afro', answers, answerMeta, updatedAt: NOW, updatedBy: uid };
  if (analyzed) {
    const proposal = proposalV3(g, e);
    Object.assign(req, { proposal, proposalRevision: 1 });
    await put(`projects/${s.pid}/approvals/requirements-r1-submit`, {
      schemaVersion: 1, kind: 'requirements', action: 'submit', revision: 1, side: 'afro',
      actorUid: uid, actorName: '管理者 太郎', actorEmail: 'admin@example.com', at: NOW, answers, proposal,
    });
  }
  await put(`projects/${s.pid}/requirements/current`, req);
  await put(`projects/${s.pid}/aiDrafts/requirements`, ai);
  const n = Object.keys(e.doc.items).length;
  const count = (st) => Object.values(e.doc.items).filter((x) => x.status === st).length;
  console.log(`projects/${s.pid}（${state}）: 項目 ${n}（proposed ${count('proposed')} / na ${count('na')} / open ${count('open')} / std_pending ${count('std_pending')}）・AI追加 ${e.doc.added.length}・requiredOk=${submitReady.requiredOk}`);
  return n;
}

async function verify(pids) {
  for (const pid of pids) {
    for (const p of [`projects/${pid}`, `projects/${pid}/requirements/current`, `projects/${pid}/aiDrafts/requirements`]) await call(docUrl(p));
  }
  console.log(`確認: ${pids.length * 3} 文書を読み戻しました`);
}

try {
  const args = process.argv.slice(2);
  const withDev = args.includes('--with-dev');
  const email = (args.find((a) => !a.startsWith('--')) ?? 'admin@example.com').trim().toLowerCase();
  const uid = await adminUid(email);
  const devUid = withDev ? await seedDev(uid) : undefined;
  const withSchedule = args.includes('--with-schedule');
  if (args.includes('--with-client') && !withSchedule) throw new Error('--with-client は --with-schedule と一緒に使う');
  const n = await seedProject(SITES.draft, { uid, state: 'draft', devUid });
  if (n !== CATALOG.items.length) throw new Error(`項目数 ${n} がカタログ ${CATALOG.items.length} と一致しません`);
  await seedProject(SITES.analyzed, { uid, state: 'analyzed', devUid });
  const pids = [SITES.draft.pid, SITES.analyzed.pid];
  if (withSchedule) {
    const client = args.includes('--with-client') ? await seedClient(uid, SITES.approved.pid) : null;
    const s = { ...SITES.approved, client };
    // 承認の記録とスケジュールの文書を先に置き、要約（schedule）を持つ案件文書を最後に置く
    const schedule = await seedSchedule(s, { uid, client });
    await seedProject({ ...s, schedule }, { uid, state: 'approved', devUid });
    pids.push(s.pid);
  }
  await verify(pids);
} catch (e) {
  console.error(`seed-emulator-reqdoc を中止しました: ${e.message}（npm run emulators を起動しているか確認）`);
  process.exit(1);
}
