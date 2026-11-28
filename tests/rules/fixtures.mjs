// Rules テストの共通データと操作（BACKEND_FIREBASE.md §5 の文書の形）。
// 文書は Rules を通さずに置く（withSecurityRulesDisabled）。書き込みの検査はテスト本体で、本人の権限で行う。
import { Timestamp, deleteField, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

export const T0 = Timestamp.fromDate(new Date('2026-11-01T00:00:00Z'));
export const PAST = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));

/** 利用者（uid → accounts の中身）。email は小文字 */
export const USERS = {
  admin1: { role: 'admin', name: '管理 一郎', email: 'admin1@afro.example' },
  admin2: { role: 'admin', name: '管理 二郎', email: 'admin2@afro.example' },
  adminOff: { role: 'admin', name: '無効 管理', email: 'adminoff@afro.example', status: 'disabled' },
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
    // provisionedUid: 関数 provisionInvitee がこの招待のために作ったアカウントの uid（0.47.0。テストの受け取り役の uid に合わせる）
    setDoc(doc(db, 'invites/newdev@afro.example'), { ...inviteDoc({ role: 'developer', name: '新人 開発', affiliation: 'partner', partnerCompany: '協力会社Z', devRole: 'QA' }), provisionedUid: 'u-dev' });
    setDoc(doc(db, 'invites/newclient@customer.example'), { ...inviteDoc({ role: 'client', name: '新規 顧客', company: '株式会社テスト', projectId: 'p1' }), provisionedUid: 'u-cli' });
    setDoc(doc(db, 'invites/revoked@customer.example'), { ...inviteDoc({ role: 'client', name: '取消 顧客', company: '株式会社テスト', projectId: 'p1' }), status: 'revoked', revokedAt: T0, provisionedUid: 'u-r' });
    // Console で作る admin（BACKEND_FIREBASE §2.5）は、Console で provisionedUid に Auth の uid を手で入れる
    setDoc(doc(db, 'invites/newadmin@afro.example'), { ...inviteDoc({ role: 'admin', name: '新任 管理' }), createdBy: 'console', provisionedUid: 'u-adm' });
    // 0.47.0 より前の招待（provisionedUid なし）。受け取れない
    setDoc(doc(db, 'invites/legacy@customer.example'), inviteDoc({ role: 'client', name: '旧 招待', company: '株式会社テスト', projectId: 'p1' }));
    await batch.commit();
  });
}

export function inviteDoc(fields) {
  return { schemaVersion: 1, status: 'invited', createdAt: T0, createdBy: 'admin1', ...fields };
}

// admin の文書は actorRole: 'admin' が必須（ADMIN_FULL_RIGHTS_PLAN §2・R-5）。画面（live の repositories）も同じ形で書く
export function approvalDoc(uid, action, revision, extra = {}) {
  const u = USERS[uid];
  return {
    schemaVersion: 1, kind: 'requirements', action, revision,
    side: u.role === 'client' ? 'client' : 'afro',
    actorUid: uid, actorName: u.name, actorEmail: u.email, at: serverTimestamp(),
    ...(u.role === 'admin' ? { actorRole: 'admin' } : {}), ...extra,
  };
}

export const PROXY_NOTE = '2026-11-26 にお客様（顧客 一子 様）と電話で内容を確認し、承認の意思を確認しました';

/** admin の代理承認（analyzed → approved。approvedVia: 'proxy'＋承認文書 proxy: true・note・side 'afro'。§2 の契約） */
export function proxyApproveBatch(db, { uid = 'admin1', pid = 'p1', rev = 1, answers = ANSWERS, proposal = PROPOSAL, note = PROXY_NOTE, mutate = {} } = {}) {
  const aid = mutate.aid ?? `requirements-r${rev}-approve`;
  const b = writeBatch(db);
  if (!mutate.skipProject) {
    b.update(doc(db, `projects/${pid}`), mutate.project ?? {
      'requirements.status': 'approved', 'requirements.approvedAt': serverTimestamp(),
      'requirements.approvedBy': uid, 'requirements.approvalId': `requirements-r${rev}-approve`, 'requirements.approvedVia': 'proxy', ...stamp(uid),
    });
  }
  if (!mutate.skipLog) {
    const log = mutate.log ?? approvalDoc(uid, 'approve', rev, { answers, proposal, proxy: true, note });
    for (const [k, v] of Object.entries(log)) if (v === undefined) delete log[k]; // undefined = その項目を落とす
    b.set(doc(db, `projects/${pid}/approvals/${aid}`), log);
  }
  if (mutate.req) b.update(doc(db, `projects/${pid}/requirements/current`), mutate.req);
  return b.commit();
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
  const { status: _s, createdAt: _c, createdBy: _b, provisionedUid: _p, ...copy } = inv;
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

// ================= スケジュール（docs/design/LIVE_SCHEDULE_WBS_DATA.md §2・§7.1、LIVE_SCHEDULE_PLAN.md §2・§5） =================
// 既定は最大の payload（WBS 6 行・完了印 5 行・担当 6 件 30 字・メモ 200 字・buildDue あり）。G1 の計測（adminRights TEST-09）と schedule.test.mjs が使う

export const SCHED_DATES = { buildDue: '2026-12-10', deliveryDate: '2026-12-20', releaseDate: '2026-12-25' };
export const SCHED_WBS = {
  sitemap: { start: '2026-11-28', end: '2026-11-30' },
  design: { start: '2026-12-01', end: '2026-12-04' },
  build: { start: '2026-12-05', end: '2026-12-10' },
  buildApproval: { start: '2026-12-11', end: '2026-12-12' },
  quality: { start: '2026-12-13', end: '2026-12-20' },
  release: { start: '2026-12-21', end: '2026-12-25' },
};
export const SCHED_MARK_IDS = ['sitemap', 'design', 'buildApproval', 'quality', 'release'];
export const SCHED_NOTE = 'メ'.repeat(200);
export const SCHED_ASSIGNEES = Object.fromEntries(Object.keys(SCHED_WBS).map((id) => [id, '担'.repeat(30)]));
/** 完了印つきの WBS（build を除く 5 行に doneAt） */
export const wbsWithDone = (at) => Object.fromEntries(Object.entries(SCHED_WBS).map(([id, r]) => [id, id === 'build' ? r : { ...r, doneAt: at }]));
/** 完了印の記録（5 行とも state done） */
export const marksDone = (at, by) => Object.fromEntries(SCHED_MARK_IDS.map((id) => [id, { state: 'done', at, by }]));

/** スケジュールの承認の記録（kind schedule。admin は actorRole: 'admin'） */
export function schedLogDoc(uid, action, revision, extra = {}) {
  return { ...approvalDoc(uid, action, revision), kind: 'schedule', ...extra };
}

/**
 * p1（要件定義書は承認済み）にスケジュールを置く。state: 'none'（未作成）| 'draft' | 'requested' | 'approved'。
 * rev は既定で draft=0・それ以外 1。done: true で WBS 5 行に完了印（T0）と internal.marks
 */
export async function scheduleSeed(env, { state = 'draft', rev, done = true, approvedVia } = {}) {
  await seed(env, { reqState: 'approved' });
  if (state === 'none') return;
  const r = rev ?? (state === 'draft' ? 0 : 1);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const b = writeBatch(db);
    const wbs = done ? wbsWithDone(T0) : SCHED_WBS;
    const summary = {
      status: state, revision: r,
      ...(r >= 1 ? { requestedAt: T0, releaseDate: SCHED_DATES.releaseDate } : {}),
      ...(state === 'approved' ? { approvedRevision: r, approvedAt: T0, approvedBy: approvedVia ? 'admin1' : 'client1', approvalId: `schedule-r${r}-approve`, ...(approvedVia ? { approvedVia } : {}) } : {}),
    };
    b.update(doc(db, 'projects/p1'), { schedule: summary });
    b.set(doc(db, 'projects/p1/schedule/current'), { schemaVersion: 1, revision: r, editSeq: 0, ...(r >= 1 ? SCHED_DATES : {}), wbs, updatedAt: T0, updatedBy: 'devA' });
    b.set(doc(db, 'projects/p1/schedule/internal'), {
      schemaVersion: 1, draft: SCHED_DATES, note: SCHED_NOTE, assignees: SCHED_ASSIGNEES, ...(done ? { marks: marksDone(T0, 'devA') } : {}),
      savedByName: USERS.devA.name, editSeq: 0, updatedAt: T0, updatedBy: 'devA',
    });
    if (r >= 1) b.set(doc(db, `projects/p1/approvals/schedule-r${r}-submit`), { ...schedLogDoc('devA', 'submit', r, { ...SCHED_DATES, wbs }), at: T0 });
    await b.commit();
  });
}

/** 初回の保存（init）: 案件の schedule・current・internal を 1 バッチ（最大の payload: WBS 6 行・担当 6 件・メモ 200 字。init は完了印・marks なし＝L-23） */
export function schedInitBatch(db, { uid = 'devA', pid = 'p1', wbs, internal = {} } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), { schedule: { status: 'draft', revision: 0 }, ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/schedule/current`), { schemaVersion: 1, revision: 0, editSeq: 0, wbs: wbs ?? SCHED_WBS, ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/schedule/internal`), {
    schemaVersion: 1, draft: SCHED_DATES, note: SCHED_NOTE, assignees: SCHED_ASSIGNEES,
    savedByName: USERS[uid].name, editSeq: 0, ...stamp(uid), ...internal,
  });
  return b.commit();
}

/** WBS と internal の同時保存（完了印を付け直す＝5 行とも今の時刻・marks 5 件・担当・メモ。editSeq +1） */
export function schedSaveBatch(db, { uid = 'devA', pid = 'p1', seq = 0 } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}/schedule/current`), { wbs: wbsWithDone(serverTimestamp()), editSeq: seq + 1, ...stamp(uid) });
  b.update(doc(db, `projects/${pid}/schedule/internal`), {
    marks: marksDone(serverTimestamp(), uid), assignees: SCHED_ASSIGNEES, note: SCHED_NOTE, savedByName: USERS[uid].name, editSeq: seq + 1, ...stamp(uid),
  });
  return b.commit();
}

/** 承認の依頼（draft → requested）: 案件の schedule・current（予定日を draft から写す）・approvals submit */
export function schedSubmitBatch(db, { uid = 'devA', pid = 'p1', fromRev = 0, seq = 0, wbs = wbsWithDone(T0) } = {}) {
  const rev = fromRev + 1;
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), {
    'schedule.status': 'requested', 'schedule.revision': rev, 'schedule.requestedAt': serverTimestamp(), 'schedule.releaseDate': SCHED_DATES.releaseDate, ...stamp(uid),
  });
  b.update(doc(db, `projects/${pid}/schedule/current`), { revision: rev, ...SCHED_DATES, editSeq: seq + 1, ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/approvals/schedule-r${rev}-submit`), schedLogDoc(uid, 'submit', rev, { ...SCHED_DATES, wbs }));
  return b.commit();
}

/** 取り下げ（requested → draft。note 必須） */
export function schedWithdrawBatch(db, { uid = 'devA', pid = 'p1', rev = 1, note = SCHED_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), { 'schedule.status': 'draft', ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/approvals/schedule-r${rev}-withdraw`), schedLogDoc(uid, 'withdraw', rev, { note }));
  return b.commit();
}

/** お客様本人の承認（requested → approved。approvedVia は消す） */
export function schedApproveBatch(db, { uid = 'client1', pid = 'p1', rev = 1, wbs = wbsWithDone(T0) } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), {
    'schedule.status': 'approved', 'schedule.approvedRevision': rev, 'schedule.approvedAt': serverTimestamp(), 'schedule.approvedBy': uid,
    'schedule.approvalId': `schedule-r${rev}-approve`, 'schedule.approvedVia': deleteField(), ...stamp(uid),
  });
  b.set(doc(db, `projects/${pid}/approvals/schedule-r${rev}-approve`), schedLogDoc(uid, 'approve', rev, { ...SCHED_DATES, wbs }));
  return b.commit();
}

/** 管理者の代理承認（requested → approved。approvedVia: 'proxy'＋記録の proxy・note） */
export function schedProxyBatch(db, { uid = 'admin1', pid = 'p1', rev = 1, wbs = wbsWithDone(T0), note = SCHED_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), {
    'schedule.status': 'approved', 'schedule.approvedRevision': rev, 'schedule.approvedAt': serverTimestamp(), 'schedule.approvedBy': uid,
    'schedule.approvalId': `schedule-r${rev}-approve`, 'schedule.approvedVia': 'proxy', ...stamp(uid),
  });
  b.set(doc(db, `projects/${pid}/approvals/schedule-r${rev}-approve`), schedLogDoc(uid, 'approve', rev, { ...SCHED_DATES, wbs, proxy: true, note }));
  return b.commit();
}

/** 再計画（approved → draft）: internal.draft の変更・案件の schedule・approvals reopen（note 必須） */
export function schedReopenBatch(db, { uid = 'devA', pid = 'p1', rev = 1, seq = 0, note = SCHED_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), { 'schedule.status': 'draft', ...stamp(uid) });
  b.update(doc(db, `projects/${pid}/schedule/internal`), {
    draft: { ...SCHED_DATES, releaseDate: '2027-01-15' }, savedByName: USERS[uid].name, editSeq: seq + 1, ...stamp(uid),
  });
  b.set(doc(db, `projects/${pid}/approvals/schedule-r${rev}-reopen`), schedLogDoc(uid, 'reopen', rev, { note }));
  return b.commit();
}

// ================= サイトマップ（docs/design/LIVE_SITEMAP_DATA.md §2・§3.3、LIVE_SITEMAP_IMPL_PLAN.md §4 U1-0・U1・§5 G1） =================
// 中身（internal・版文書・submit の記録）は callable（Admin SDK）だけが書く。ここでは Rules を通さずに置き、
// クライアントが書く 4 つ（取り下げ・本人承認・代理承認・再計画）を本人の権限で流す。既定は最大の payload（note 200 字）

export const SITE_NOTE = 'サ'.repeat(200);
/** 版 N の contentHash（hex 64。版ごとに違う値） */
export const siteHash = (n) => n.toString(16).padStart(2, '0').repeat(32);
const SITE_GRAPH = {
  nodes: [
    { id: 'a-home', position: { x: 0, y: 0 }, data: { label: 'トップ', path: '/', kind: 'home' } },
    { id: 'a-contact', position: { x: 200, y: 120 }, data: { label: 'お問い合わせ', path: '/contact', kind: 'form', reason: '問い合わせ導線を短くする' } },
  ],
  edges: [{ id: 'a-e1', source: 'a-home', target: 'a-contact' }],
};
/** 版文書 sitemapVersions/r{N}（submitSitemap の toSitemapVersion と同じ項目） */
export function siteVersionDoc(n, over = {}) {
  return {
    schemaVersion: 1, revision: n, before: SITE_GRAPH, after: SITE_GRAPH, origin: 'manual', sourceReqRevision: 1,
    devComment: { text: '改善後はお問い合わせを上位に置きました', at: T0, byName: USERS.devA.name },
    contentHash: siteHash(n), submittedAt: T0, submittedBy: 'devA', ...over,
  };
}
/** 作業中の版 sitemap/internal */
export function siteInternalDoc(over = {}) {
  return {
    schemaVersion: 1, before: SITE_GRAPH, after: SITE_GRAPH, origin: 'manual', sourceReqRevision: 1, editSeq: 3,
    updatedAt: T0, updatedBy: 'devA', savedByName: USERS.devA.name, ...over,
  };
}
/** サイトマップの承認の記録（kind sitemap。admin は actorRole: 'admin'） */
export function siteLogDoc(uid, action, revision, extra = {}) {
  return { ...approvalDoc(uid, action, revision), kind: 'sitemap', ...extra };
}
/** 案件の要約 projects/{pid}.sitemap（state: draft | requested | approved。rev は既定で draft=0・それ以外 1） */
export function siteSummary({ state = 'draft', rev, approvedVia } = {}) {
  const r = rev ?? (state === 'draft' ? 0 : 1);
  return {
    status: state, revision: r,
    ...(r >= 1 ? { requestedAt: T0, contentHash: siteHash(r) } : {}),
    ...(state === 'approved' ? { approvedRevision: r, approvedAt: T0, approvedBy: approvedVia ? 'admin1' : 'client1', approvalId: `sitemap-r${r}-approve`, ...(approvedVia ? { approvedVia } : {}) } : {}),
  };
}

/**
 * p1（要件定義書は承認済み・スケジュールは sched の状態）にサイトマップを置く。state: 'none'（未作成）| 'draft' | 'requested' | 'approved'。
 * internal・版文書 r1〜r{rev}・submit の記録（callable が書くもの）も置く
 */
export async function sitemapSeed(env, { state = 'draft', rev, approvedVia, sched = 'approved' } = {}) {
  await scheduleSeed(env, { state: sched });
  if (state === 'none') return;
  const s = siteSummary({ state, rev, approvedVia });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const b = writeBatch(db);
    b.update(doc(db, 'projects/p1'), { sitemap: s });
    b.set(doc(db, 'projects/p1/sitemap/internal'), siteInternalDoc());
    for (let n = 1; n <= s.revision; n += 1) {
      b.set(doc(db, `projects/p1/sitemapVersions/r${n}`), siteVersionDoc(n));
      b.set(doc(db, `projects/p1/approvals/sitemap-r${n}-submit`), { ...siteLogDoc('devA', 'submit', n, { contentHash: siteHash(n), pageCount: { before: 2, after: 2 } }), at: T0 });
    }
    await b.commit();
  });
}

/** 取り下げ（requested → draft。note 必須） */
export function siteWithdrawBatch(db, { uid = 'devA', pid = 'p1', rev = 1, note = SITE_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), { 'sitemap.status': 'draft', ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/approvals/sitemap-r${rev}-withdraw`), siteLogDoc(uid, 'withdraw', rev, { note }));
  return b.commit();
}
/** お客様本人の承認（requested → approved。表示した版の contentHash を送る。approvedVia は消す） */
export function siteApproveBatch(db, { uid = 'client1', pid = 'p1', rev = 1, hash = siteHash(rev) } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), {
    'sitemap.status': 'approved', 'sitemap.approvedRevision': rev, 'sitemap.approvedAt': serverTimestamp(), 'sitemap.approvedBy': uid,
    'sitemap.approvalId': `sitemap-r${rev}-approve`, 'sitemap.approvedVia': deleteField(), ...stamp(uid),
  });
  b.set(doc(db, `projects/${pid}/approvals/sitemap-r${rev}-approve`), siteLogDoc(uid, 'approve', rev, { contentHash: hash }));
  return b.commit();
}
/** 管理者の代理承認（requested → approved。approvedVia: 'proxy'＋記録の proxy・note） */
export function siteProxyBatch(db, { uid = 'admin1', pid = 'p1', rev = 1, hash = siteHash(rev), note = SITE_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), {
    'sitemap.status': 'approved', 'sitemap.approvedRevision': rev, 'sitemap.approvedAt': serverTimestamp(), 'sitemap.approvedBy': uid,
    'sitemap.approvalId': `sitemap-r${rev}-approve`, 'sitemap.approvedVia': 'proxy', ...stamp(uid),
  });
  b.set(doc(db, `projects/${pid}/approvals/sitemap-r${rev}-approve`), siteLogDoc(uid, 'approve', rev, { contentHash: hash, proxy: true, note }));
  return b.commit();
}
/** 再計画（approved → draft。note 必須。internal は callable が書くので触らない） */
export function siteReopenBatch(db, { uid = 'devA', pid = 'p1', rev = 1, note = SITE_NOTE } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, `projects/${pid}`), { 'sitemap.status': 'draft', ...stamp(uid) });
  b.set(doc(db, `projects/${pid}/approvals/sitemap-r${rev}-reopen`), siteLogDoc(uid, 'reopen', rev, { note }));
  return b.commit();
}
