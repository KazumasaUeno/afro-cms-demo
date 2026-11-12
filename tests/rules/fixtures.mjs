// Rules テストの共通データと操作（BACKEND_FIREBASE.md §5 の文書の形）。
// 文書は Rules を通さずに置く（withSecurityRulesDisabled）。書き込みの検査はテスト本体で、本人の権限で行う。
import { Timestamp, deleteField, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

export const T0 = Timestamp.fromDate(new Date('2026-11-01T00:00:00Z'));
export const PAST = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));

/** 利用者（uid → accounts の中身）。email は小文字 */
export const USERS = {
  admin1: { role: 'admin', name: '管理 一郎', email: 'admin1@afro.example' },
  admin2: { role: 'admin', name: '管理 二郎', email: 'admin2@afro.example' },
  devA: { role: 'developer', name: '社内 開発A', email: 'deva@afro.example', affiliation: 'internal', devRole: 'フロントエンド' },
  devB: { role: 'developer', name: '協力 開発B', email: 'devb@partner.example', affiliation: 'partner', partnerCompany: '協力会社X' },
  devC: { role: 'developer', name: '社内 開発C', email: 'devc@afro.example', affiliation: 'internal' },
  devP2: { role: 'developer', name: '協力 開発P2', email: 'devp2@partner2.example', affiliation: 'partner', partnerCompany: '協力会社Y' },
  devNoAff: { role: 'developer', name: '所属なし 開発', email: 'devnoaff@afro.example' },
  devOff: { role: 'developer', name: '無効 開発', email: 'devoff@afro.example', affiliation: 'internal', status: 'disabled' },
  client1: { role: 'client', name: '顧客 一子', email: 'client1@customer.example', company: '株式会社テスト', projectId: 'p1' },
  client2: { role: 'client', name: '顧客 二子', email: 'client2@other.example', company: '他社株式会社', projectId: 'p2' },
  clientOff: { role: 'client', name: '無効 顧客', email: 'clientoff@customer.example', company: '株式会社テスト', projectId: 'p1', status: 'disabled' },
};

export function accountDoc(uid) {
  const { status = 'active', ...u } = USERS[uid];
  return { schemaVersion: 1, status, activatedAt: T0, updatedAt: T0, updatedBy: uid, ...u };
}

export const ANSWERS = {
  'q-url': 'https://www.example.co.jp',
  'q-purpose': ['問い合わせを増やしたい', 'スマホ対応したい'],
  'q-issue': 'スマホで見づらく、問い合わせがほとんど来ない',
  'q-competitor': ['https://competitor.example.jp'],
};
export const answerMetaFor = (answers) =>
  Object.fromEntries(Object.keys(answers).map((k) => [k, { by: 'afro', at: T0 }]));

export const PROPOSAL = {
  hostname: 'example.co.jp',
  issue: 'スマホで見づらく、問い合わせがほとんど来ない',
  purposes: ['問い合わせを増やしたい', 'スマホ対応したい'],
  improves: ['スマホ表示'],
  competitors: ['competitor.example.jp'],
  currentScore: 52,
  projectedScore: 78,
  points: [
    { id: 'pp3', area: 'スマホ表示', priority: 'high', title: 'スマートフォンを主役にした設計', detail: 'example.co.jp の現状を踏まえ、親指で届く位置にナビを置きます。', impact: 'スマホCVR +0.8pt 見込み' },
    { id: 'pp2', area: '問い合わせ導線', priority: 'high', title: '問い合わせまでを最短2クリックに', detail: 'フォーム項目を11→5に削減します。', impact: '問い合わせ +35% 見込み' },
  ],
};

export function projectDoc({ memberUids, status = 'draft', revision = 0, siteUrlKey, extraReq = {} } = {}) {
  return {
    schemaVersion: 1, clientName: '株式会社テスト', siteName: 'テストサイト',
    siteUrl: `https://${siteUrlKey}`, siteUrlKey, industry: '製造業', accent: '#1D4ED8',
    ownerUid: memberUids[0], memberUids, requirements: { status, revision, ...extraReq },
    archived: false, createdAt: T0, createdBy: memberUids[0], updatedAt: T0, updatedBy: memberUids[0],
  };
}

/**
 * 既定の世界: p1（devA・devB・devOff がアサイン、お客様 client1）、p2（devC、お客様 client2）
 * reqState: p1 の要件の状態 'draft' | 'analyzed' | 'approved'（analyzed 以降は revision 1・proposal あり）
 */
export async function seed(env, { reqState = 'draft' } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const batch = writeBatch(db); // 1 回の書き込みで置く（テストごとに seed するので速さが効く）
    const setDoc = (ref, data) => batch.set(ref, data);
    for (const uid of Object.keys(USERS)) setDoc(doc(db, `accounts/${uid}`), accountDoc(uid));
    const rev = reqState === 'draft' ? 0 : 1;
    const extraReq = reqState === 'draft' ? {} : reqState === 'analyzed'
      ? { analyzedAt: T0 }
      : { analyzedAt: T0, approvedAt: T0, approvedBy: 'client1', approvalId: 'requirements-r1-approve' };
    setDoc(doc(db, 'projects/p1'), projectDoc({ memberUids: ['devA', 'devB', 'devOff'], status: reqState, revision: rev, siteUrlKey: 'example.co.jp', extraReq }));
    setDoc(doc(db, 'projects/p2'), projectDoc({ memberUids: ['devC'], siteUrlKey: 'other.example.jp' }));
    setDoc(doc(db, 'siteKeys/example.co.jp'), { projectId: 'p1', createdAt: T0 });
    setDoc(doc(db, 'siteKeys/other.example.jp'), { projectId: 'p2', createdAt: T0 });
    const req1 = { schemaVersion: 1, mode: 'afro', answers: ANSWERS, answerMeta: answerMetaFor(ANSWERS), updatedAt: T0, updatedBy: 'devA' };
    if (reqState !== 'draft') Object.assign(req1, { proposal: PROPOSAL, proposalRevision: 1 });
    setDoc(doc(db, 'projects/p1/requirements/current'), req1);
    setDoc(doc(db, 'projects/p2/requirements/current'), { schemaVersion: 1, answers: {}, answerMeta: {}, updatedAt: T0, updatedBy: 'devC' });
    if (reqState !== 'draft') {
      setDoc(doc(db, 'projects/p1/approvals/requirements-r1-submit'), approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL, at: T0 }));
    }
    if (reqState === 'approved') {
      setDoc(doc(db, 'projects/p1/approvals/requirements-r1-approve'), approvalDoc('client1', 'approve', 1, { answers: ANSWERS, proposal: PROPOSAL, at: T0 }));
    }
    setDoc(doc(db, 'invites/newdev@afro.example'), inviteDoc({ role: 'developer', name: '新人 開発', affiliation: 'partner', partnerCompany: '協力会社Z', devRole: 'QA' }));
    setDoc(doc(db, 'invites/newclient@customer.example'), inviteDoc({ role: 'client', name: '新規 顧客', company: '株式会社テスト', projectId: 'p1' }));
    setDoc(doc(db, 'invites/revoked@customer.example'), { ...inviteDoc({ role: 'client', name: '取消 顧客', company: '株式会社テスト', projectId: 'p1' }), status: 'revoked', revokedAt: T0 });
    setDoc(doc(db, 'invites/newadmin@afro.example'), { ...inviteDoc({ role: 'admin', name: '新任 管理' }), createdBy: 'console' });
    await batch.commit();
  });
}

export function inviteDoc(fields) {
  return { schemaVersion: 1, status: 'invited', createdAt: T0, createdBy: 'admin1', ...fields };
}

export function approvalDoc(uid, action, revision, extra = {}) {
  const u = USERS[uid];
  return {
    schemaVersion: 1, kind: 'requirements', action, revision,
    side: u.role === 'client' ? 'client' : 'afro',
    actorUid: uid, actorName: u.name, actorEmail: u.email, at: serverTimestamp(), ...extra,
  };
}

/** 本人のトークン（email_verified 既定 true）で Firestore を返す */
export function dbAs(env, uid, token = {}) {
  const u = USERS[uid];
  return env.authenticatedContext(uid, { email: u?.email ?? `${uid}@example.com`, email_verified: true, ...token }).firestore();
}

export const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

// ---------------- 画面が実際に行う書き込み（正しい形）。テストは 1 か所だけ崩して拒否を確かめる ----------------

/** 確認依頼（draft → analyzed）。projects・requirements/current・approvals を 1 バッチ */
export function submitBatch(db, { uid = 'devA', pid = 'p1', fromRev = 0, answers = ANSWERS, proposal = PROPOSAL, mutate = {} } = {}) {
  const rev = fromRev + 1;
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), mutate.project ?? { requirements: { status: 'analyzed', revision: rev, analyzedAt: serverTimestamp() }, ...stamp(uid) });
  if (!mutate.skipReq) b.update(doc(db, `projects/${pid}/requirements/current`), mutate.req ?? { proposal, proposalRevision: rev, ...stamp(uid) });
  if (!mutate.skipLog) {
    b.set(doc(db, `projects/${pid}/approvals/${mutate.aid ?? `requirements-r${rev}-submit`}`),
      mutate.log ?? approvalDoc(uid, 'submit', rev, { answers, proposal }));
  }
  return b.commit();
}

/** 差し戻し（analyzed → draft） */
export function withdrawBatch(db, { uid = 'devA', pid = 'p1', rev = 1, note = 'お客様と電話で確認し、回答を修正します', mutate = {} } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), mutate.project ?? { 'requirements.status': 'draft', ...stamp(uid) });
  if (!mutate.skipLog) {
    b.set(doc(db, `projects/${pid}/approvals/${mutate.aid ?? `requirements-r${rev}-withdraw`}`),
      mutate.log ?? approvalDoc(uid, 'withdraw', rev, note === undefined ? {} : { note }));
  }
  if (mutate.req) b.update(doc(db, `projects/${pid}/requirements/current`), mutate.req);
  return b.commit();
}

/** お客様の承認（analyzed → approved） */
export function approveBatch(db, { uid = 'client1', pid = 'p1', rev = 1, answers = ANSWERS, proposal = PROPOSAL, mutate = {} } = {}) {
  const aid = mutate.aid ?? `requirements-r${rev}-approve`;
  const b = writeBatch(db);
  if (!mutate.skipProject) {
    b.update(doc(db, `projects/${pid}`), mutate.project ?? {
      'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(),
      'requirements.approvedBy': uid, 'requirements.approvalId': `requirements-r${rev}-approve`, ...stamp(uid),
    });
  }
  if (!mutate.skipLog) b.set(doc(db, `projects/${pid}/approvals/${aid}`), mutate.log ?? approvalDoc(uid, 'approve', rev, { answers, proposal }));
  if (mutate.req) b.update(doc(db, `projects/${pid}/requirements/current`), mutate.req);
  return b.commit();
}

/** 招待の受け取り（accounts の作成＋invites を claimed に） */
export function claimBatch(db, { uid, email, account, invite } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `accounts/${uid}`), account);
  if (invite !== null) b.update(doc(db, `invites/${email}`), invite ?? { status: 'claimed', claimedBy: uid, claimedAt: serverTimestamp() });
  return b.commit();
}

export function claimAccount(uid, inv, email, over = {}) {
  const { status: _s, createdAt: _c, createdBy: _b, ...copy } = inv;
  const out = { ...copy, schemaVersion: 1, status: 'active', email, activatedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid, ...over };
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k]; // undefined = その項目を落とす
  return out;
}

/** 案件作成（projects・siteKeys・requirements/current を 1 バッチ） */
export function createProjectBatch(db, { uid = 'devA', pid = 'p9', key = 'new-site.example.jp', mutate = {} } = {}) {
  const b = writeBatch(db);
  const p = {
    schemaVersion: 1, clientName: '新規株式会社', siteName: '新サイト', siteUrl: `https://${key}`, siteUrlKey: key,
    industry: '医療', accent: '#0D9488', ownerUid: uid, memberUids: [uid], requirements: { status: 'draft', revision: 0 },
    archived: false, createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid), ...(mutate.project ?? {}),
  };
  for (const [k, v] of Object.entries(p)) if (v === undefined) delete p[k];
  b.set(doc(db, `projects/${pid}`), p);
  if (!mutate.skipKey) b.set(doc(db, `siteKeys/${mutate.keyId ?? key}`), mutate.key ?? { projectId: pid, createdAt: serverTimestamp() });
  if (!mutate.skipReq) b.set(doc(db, `projects/${pid}/requirements/current`), mutate.req ?? { schemaVersion: 1, answers: {}, answerMeta: {}, ...stamp(uid) });
  return b.commit();
}

export { deleteField, doc, serverTimestamp, setDoc, updateDoc, writeBatch };

/** 全 20 問を上限ちょうどで埋めた回答（Rules の式数の上限に当たらないことの確認にも使う） */
export const FULL_ANSWERS = {
  'q-url': 'https://' + 'a'.repeat(200 - 'https://'.length - '.jp'.length) + '.jp',
  'q-purpose': ['問い合わせを増やしたい', '採用を強化したい', 'ブランドを刷新したい', 'EC売上を伸ばしたい', '更新を楽にしたい', 'スマホ対応したい'],
  'q-issue': 'あ'.repeat(600),
  'q-competitor': ['https://a.example.jp', 'https://b.example.jp', 'https://' + 'c'.repeat(189) + '.jp'],
  'q-improve': ['ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ'],
  'q-keep': 'い'.repeat(600), 'q-target': 'う'.repeat(120), 'q-strength': 'え'.repeat(600), 'q-market': 'お'.repeat(120),
  'q-content': 'か'.repeat(120), 'q-feature': 'き'.repeat(120), 'q-cv': '採用応募', 'q-seo': 'く'.repeat(120),
  // デザインの 3 問（q-design-dislike・q-image・q-brand）は 0.28.0 でヒアリングから外した（デザイン要件定義は demo だけ）
  'q-ops': '両方',
  'q-infra': 'し'.repeat(120), 'q-schedule': 'す'.repeat(120), 'q-other': 'せ'.repeat(600),
  'q-dns-owner': '不明', 'q-dns-switch': '未定', 'q-dns-note': 'そ'.repeat(600),
};
