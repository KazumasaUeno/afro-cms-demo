// スケジュール（予定日＋WBS）の Rules（docs/design/LIVE_SCHEDULE_PLAN.md §3 U1、データ設計 LIVE_SCHEDULE_WBS_DATA.md §7.1）。
// 段 0（U1-0）: 案件の schedule キーを許す（作成時は禁止）・apprCreateOk を kind で振り分ける（requirements の本体は reqApprCreateOk へそのまま）。
// 段 1（U1-2/U1-3）: SR-01〜16・ST-01〜23 の許可と拒否（SR-17＝TEST-09 G1 は adminRights.test.mjs、SR-18・ST-24 は mutation.test.mjs）
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createRulesEnv } from './guard.mjs';
import { collection, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import {
  ANSWERS, PROPOSAL, T0, USERS, marksDone, scheduleSeed, schedInitBatch, wbsWithDone, approvalDoc, createProjectBatch, dbAs, doc, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch, writeBatch,
  PAST, SCHED_ASSIGNEES, SCHED_DATES, SCHED_NOTE, SCHED_WBS, approveBatch, deleteField, schedApproveBatch, schedLogDoc, schedProxyBatch, schedReopenBatch, schedSaveBatch, schedSubmitBatch, schedWithdrawBatch,
} from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });

const SUMMARY = { status: 'approved', revision: 1, requestedAt: T0, releaseDate: '2026-12-25', approvedRevision: 1, approvedAt: T0, approvedBy: 'client1', approvalId: 'schedule-r1-approve' };
/** p1 に schedule の要約を置く（Rules を通さない） */
async function withSummary(reqState = 'draft') {
  await seed(env, { reqState });
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'projects/p1'), { schedule: SUMMARY }));
}
const upd = (uid, data) => updateDoc(doc(dbAs(env, uid), 'projects/p1'), { ...data, ...stamp(uid) });

describe('SR-16: schedule を持つ案件でも既存の操作が通る（validProject の hasOnly）', () => {
  for (const uid of ['devA', 'admin1']) {
    test(`${uid}: 基本情報の変更・アーカイブ → 許可`, async () => {
      await withSummary();
      await assertSucceeds(upd(uid, { siteName: '新しいサイト名' }));
      await assertSucceeds(upd(uid, { archived: true }));
    });
    test(`${uid}: 要件定義書の確認依頼・差し戻し → 許可`, async () => {
      await withSummary();
      await assertSucceeds(submitBatch(dbAs(env, uid), { uid }));
      await assertSucceeds(withdrawBatch(dbAs(env, uid), { uid }));
    });
  }
  test('お客様の相談（consult）→ 許可', async () => {
    await withSummary();
    const db = dbAs(env, 'client1');
    const b = writeBatch(db);
    b.set(doc(db, 'projects/p1/messages/000001'), { schemaVersion: 1, seq: 1, text: '確認しました', side: 'client', authorUid: 'client1', authorName: USERS.client1.name, at: serverTimestamp() });
    b.update(doc(db, 'projects/p1'), { consult: { count: 1, lastAt: serverTimestamp(), lastSide: 'client', lastName: USERS.client1.name } });
    await assertSucceeds(b.commit());
  });
  test('既存の分岐からは schedule を書けない（基本情報・アーカイブ・アサインと一緒に変える → 拒否）', async () => {
    await withSummary();
    await assertFails(upd('devA', { siteName: '新しいサイト名', 'schedule.status': 'draft' }));
    await assertFails(upd('admin1', { archived: true, 'schedule.status': 'draft' }));
    await assertFails(upd('admin1', { memberUids: ['devA'], 'schedule.status': 'draft' }));
  });
});

describe('SR-02: 案件の作成で schedule を持たせない', () => {
  test('開発者・admin が schedule 付きで作る → 拒否（無ければ許可）', async () => {
    await seed(env);
    await assertFails(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { schedule: { status: 'approved', revision: 1 } } } }));
    await assertFails(createProjectBatch(dbAs(env, 'admin1'), { uid: 'admin1', pid: 'p8', key: 'admin-site.example.jp', mutate: { project: { memberUids: [], schedule: { status: 'draft', revision: 0 } } } }));
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA')));
  });
});

describe('SR-14: 承認の記録の kind の振り分け（S-6・S-7）', () => {
  test('kind が無い・未知 → 拒否（requirements の正しい形でも）', async () => {
    await seed(env);
    const { kind: _k, ...noKind } = approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL });
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { log: noKind } }));
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { log: { ...noKind, kind: 'other' } } }));
    await assertSucceeds(submitBatch(dbAs(env, 'devA')));
  });
  test("kind 'schedule' で ID requirements-r1-submit（要件定義書の確認依頼のふり）→ 拒否", async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { log: { ...approvalDoc('devA', 'submit', 1, { answers: ANSWERS, proposal: PROPOSAL }), kind: 'schedule' } } }));
  });
  test("kind 'requirements' で ID schedule-r1-submit → 拒否", async () => {
    await seed(env);
    await assertFails(submitBatch(dbAs(env, 'devA'), { mutate: { aid: 'schedule-r1-submit' } }));
  });
  test("kind 'schedule' の記録だけ（案件の schedule の遷移なし）は admin・担当・お客様の誰も作れない", async () => {
    await withSummary('approved');
    for (const uid of ['admin1', 'devA', 'client1']) {
      const action = uid === 'client1' ? 'approve' : 'submit';
      const log = { ...approvalDoc(uid, action, 2), kind: 'schedule', deliveryDate: '2026-12-20', releaseDate: '2026-12-25' };
      await assertFails(setDoc(doc(dbAs(env, uid), `projects/p1/approvals/schedule-r2-${action}`), log));
    }
  });
});

// ================= S-14・L-12: 暦に無い日（2/30）を Rules で拒否できるか（エミュレータで確認した結果を固定する） =================
// 結論（G1 2026-11-27）は LIVE_SCHEDULE_WBS_DATA.md §12。firestore.rules の reYmd() は形式と範囲だけ（暦日は画面の検査）
describe('S-14: 暦日の検査の実験（probe の Rules。firestore.rules は変えない）', () => {
  const RE_BAD = "'20[0-9]{2}-(02-3[01]|(0[469]|11)-31)'";
  const RE_229 = "'20[0-9]{2}-02-29'";
  const RE_LEAP = "'20([02468][048]|[13579][26])-02-29'";
  const CHECKS = {
    // A: timestamp.date(年, 月, 日) に分解した数を渡す（暦に無い日は評価エラー＝拒否、または繰り上がり）
    tsDate: "timestamp.date(int(request.resource.data.d.split('-')[0]), int(request.resource.data.d.split('-')[1]), int(request.resource.data.d.split('-')[2])) != null",
    // A': 繰り上がりを日で見分ける
    tsDay: "timestamp.date(int(request.resource.data.d.split('-')[0]), int(request.resource.data.d.split('-')[1]), int(request.resource.data.d.split('-')[2])).day() == int(request.resource.data.d.split('-')[2])",
    // B: 正規表現だけ（月末の無い日と、うるう年でない 2/29 を拒否。2000〜2099 年は 4 の倍数＝うるう年）
    regex: `!request.resource.data.d.matches(${RE_BAD}) && (!request.resource.data.d.matches(${RE_229}) || request.resource.data.d.matches(${RE_LEAP}))`,
  };
  const DATES = ['2026-02-28', '2026-02-29', '2026-02-30', '2026-04-31', '2028-02-29', '2000-02-29', '2026-12-31'];
  const rulesFor = (expr) => `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{db}/documents {\n    match /probe/{id} { allow create: if ${expr}; }\n  }\n}\n`;
  test('各方式で 2/30 などを書いた結果（許可＝true）', { timeout: 300_000 }, async () => {
    const out = {};
    for (const [name, expr] of Object.entries(CHECKS)) {
      const e = await createRulesEnv({ rules: rulesFor(expr) });
      try {
        out[name] = {};
        for (const d of DATES) out[name][d] = await setDoc(doc(e.unauthenticatedContext().firestore(), `probe/${d}`), { d }).then(() => true, () => false);
      } finally { await e.clearFirestore(); await e.cleanup(); }
    }
    console.log(`[measure] S-14 ${JSON.stringify(out)}`);
    // 正規表現の方式は RE2 で決まる（エミュレータの版に依らない）
    // timestamp.date に暦に無い日を渡すと評価エラー＝拒否（エミュレータ 2026-11-27 で確認。本番の挙動は未確認 [INFERENCE: 同じ評価器]）
    assert.deepEqual(out.tsDate, out.regex);
    assert.deepEqual(out.tsDay, out.regex);
    assert.deepEqual(out.regex, { '2026-02-28': true, '2026-02-29': false, '2026-02-30': false, '2026-04-31': false, '2028-02-29': true, '2000-02-29': true, '2026-12-31': true });
  });
  after(async () => { const e = await createRulesEnv(); await e.cleanup(); });
});

describe('L-23: init は完了印・marks を持てない（G1）', () => {
  test('doneAt 付きの WBS・marks 付きの internal で init → 拒否。無ければ許可', async () => {
    await scheduleSeed(env, { state: 'none' });
    await assertFails(schedInitBatch(dbAs(env, 'devA'), { wbs: wbsWithDone(serverTimestamp()) }));
    await assertFails(schedInitBatch(dbAs(env, 'devA'), { internal: { marks: marksDone(serverTimestamp(), 'devA') } }));
    await assertSucceeds(schedInitBatch(dbAs(env, 'devA')));
  });
});

// ================= 段 1（U1-2/U1-3）: SR-01〜16・ST-01〜23 =================
// 既定の世界（fixtures.scheduleSeed）: p1 は要件定義書が承認済み・devA・devB・devOff が担当（admin1 は担当外）、お客様 client1。
// 書き込みは「画面が行う正しい形」から 1 か所だけ崩す（下の *With は 1 バッチの組み立て。skip で文書を落とし、over で値を差し替える）
const P = 'projects/p1';
const CUR = `${P}/schedule/current`;
const INT = `${P}/schedule/internal`;
const ap = (aid) => `${P}/approvals/${aid}`;
/** undefined の項目を落とす（その項目が無い形） */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const raw = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const archiveRaw = () => raw((db) => updateDoc(doc(db, P), { archived: true }));
const unauth = () => env.unauthenticatedContext().firestore();
const nameOf = (uid) => USERS[uid]?.name ?? uid;
const readAdmin = async (path) => { let out; await raw(async (db) => { out = (await getDoc(doc(db, path))).data(); }); return out; };
const NOTE_BAD = {
  空: '', 空白だけ: ' 　 ', '201 字': 'あ'.repeat(201), 改行: '電話で\n確認', 'C0（U+0001）': '電話で\u0001確認', '向きの制御（U+202E）': '電話で‮確認',
};

function initWith(db, { uid = 'devA', summary = { status: 'draft', revision: 0 }, cur = {}, int = {}, skip = [] } = {}) {
  const b = writeBatch(db);
  if (!skip.includes('project')) b.update(doc(db, P), { schedule: summary, ...stamp(uid) });
  if (!skip.includes('current')) b.set(doc(db, CUR), clean({ schemaVersion: 1, revision: 0, editSeq: 0, wbs: SCHED_WBS, ...stamp(uid), ...cur }));
  if (!skip.includes('internal')) {
    b.set(doc(db, INT), clean({ schemaVersion: 1, draft: SCHED_DATES, note: SCHED_NOTE, assignees: SCHED_ASSIGNEES, savedByName: nameOf(uid), editSeq: 0, ...stamp(uid), ...int }));
  }
  return b.commit();
}
/** current の WBS だけの保存（editSeq +1） */
const saveWbs = (db, uid, wbs, seq = 0) => updateDoc(doc(db, CUR), { wbs, editSeq: seq + 1, ...stamp(uid) });
/** internal の保存（editSeq +1。over で項目を足す・差し替える） */
const saveInt = (db, uid, over = {}, seq = 0) => updateDoc(doc(db, INT), clean({ savedByName: nameOf(uid), editSeq: seq + 1, ...stamp(uid), ...over }));
/** 予定日を変えた WBS（完了印は T0 のまま＝前と同じ） */
const wbsMoved = (done = true) => { const w = done ? wbsWithDone(T0) : { ...SCHED_WBS }; return { ...w, design: { ...w.design, end: '2026-12-05' } }; };

function submitWith(db, { uid = 'devA', fromRev = 0, rev, seq = 0, dates = SCHED_DATES, wbs = wbsWithDone(T0), summary = {}, cur = {}, log = {}, aid, skip = [] } = {}) {
  const r = rev ?? fromRev + 1;
  const b = writeBatch(db);
  if (!skip.includes('project')) {
    b.update(doc(db, P), clean({ 'schedule.status': 'requested', 'schedule.revision': r, 'schedule.requestedAt': serverTimestamp(), 'schedule.releaseDate': dates.releaseDate, ...stamp(uid), ...summary }));
  }
  if (!skip.includes('current')) b.update(doc(db, CUR), clean({ revision: r, ...dates, editSeq: seq + 1, ...stamp(uid), ...cur }));
  if (!skip.includes('log')) b.set(doc(db, ap(aid ?? `schedule-r${r}-submit`)), clean(schedLogDoc(uid, 'submit', r, { ...dates, wbs, ...log })));
  return b.commit();
}
function approveWith(db, { uid = 'client1', rev = 1, proxy = false, note = SCHED_NOTE, dates = SCHED_DATES, wbs = wbsWithDone(T0), summary = {}, log = {}, aid, skip = [] } = {}) {
  const b = writeBatch(db);
  if (!skip.includes('project')) {
    b.update(doc(db, P), clean({
      'schedule.status': 'approved', 'schedule.approvedRevision': rev, 'schedule.approvedAt': serverTimestamp(), 'schedule.approvedBy': uid,
      'schedule.approvalId': `schedule-r${rev}-approve`, 'schedule.approvedVia': proxy ? 'proxy' : deleteField(), ...stamp(uid), ...summary,
    }));
  }
  if (!skip.includes('log')) b.set(doc(db, ap(aid ?? `schedule-r${rev}-approve`)), clean(schedLogDoc(uid, 'approve', rev, { ...dates, wbs, ...(proxy ? { proxy: true, note } : {}), ...log })));
  return b.commit();
}
/** 取り下げ（requested → draft）・再計画（approved → draft。draft を渡すと internal.draft も同じバッチで変える） */
function moveWith(db, action, { uid = 'devA', rev = 1, note = SCHED_NOTE, summary = {}, log = {}, draft, aid, skip = [] } = {}) {
  const b = writeBatch(db);
  if (!skip.includes('project')) b.update(doc(db, P), clean({ 'schedule.status': 'draft', ...stamp(uid), ...summary }));
  if (draft) b.update(doc(db, INT), { draft, savedByName: nameOf(uid), editSeq: 1, ...stamp(uid) });
  if (!skip.includes('log')) b.set(doc(db, ap(aid ?? `schedule-r${rev}-${action}`)), clean(schedLogDoc(uid, action, rev, { note, ...log })));
  return b.commit();
}

describe('SR-01: init の権限・ゲート（ST-01・ST-02・ST-06）', () => {
  for (const uid of ['devA', 'devB', 'admin1']) {
    test(`${uid}（${uid === 'admin1' ? '担当外の admin' : '担当'}）の init → 許可`, async () => {
      await scheduleSeed(env, { state: 'none' });
      await assertSucceeds(schedInitBatch(dbAs(env, uid), { uid }));
    });
  }
  test('担当 0 人の案件の admin の init → 許可', async () => {
    await scheduleSeed(env, { state: 'none' });
    await raw((db) => updateDoc(doc(db, P), { memberUids: [] }));
    await assertSucceeds(schedInitBatch(dbAs(env, 'admin1'), { uid: 'admin1' }));
  });
  const denied = {
    devC: () => dbAs(env, 'devC'), devP2: () => dbAs(env, 'devP2'), client1: () => dbAs(env, 'client1'), client2: () => dbAs(env, 'client2'),
    devOff: () => dbAs(env, 'devOff'), adminOff: () => dbAs(env, 'adminOff'), unauth,
  };
  for (const [uid, db] of Object.entries(denied)) {
    test(`${uid} の init → 拒否`, async () => {
      await scheduleSeed(env, { state: 'none' });
      await assertFails(schedInitBatch(db(), { uid: uid === 'unauth' ? 'devA' : uid }));
    });
  }
  test('メール不一致・email_verified=false（devA・admin1）の init → 拒否', async () => {
    for (const uid of ['devA', 'admin1']) {
      for (const token of [{ email: 'changed@afro.example' }, { email_verified: false }]) {
        await scheduleSeed(env, { state: 'none' });
        await assertFails(schedInitBatch(dbAs(env, uid, token), { uid }));
      }
    }
  });
  for (const reqState of ['draft', 'analyzed']) {
    test(`要件定義書が ${reqState} の案件では devA・admin1 とも init → 拒否（AC-01・ST-06）`, async () => {
      for (const uid of ['devA', 'admin1']) {
        await seed(env, { reqState });
        await assertFails(schedInitBatch(dbAs(env, uid), { uid }));
      }
    });
  }
  test('アーカイブ中は devA・admin1 とも init → 拒否', async () => {
    for (const uid of ['devA', 'admin1']) {
      await scheduleSeed(env, { state: 'none' });
      await archiveRaw();
      await assertFails(schedInitBatch(dbAs(env, uid), { uid }));
    }
  });
});

describe('SR-02: init の形', () => {
  const deny = (name, opts) => test(`${name} → 拒否`, async () => {
    await scheduleSeed(env, { state: 'none' });
    await assertFails(initWith(dbAs(env, 'devA'), opts));
  });
  test('対照: initWith の既定（正しい形）→ 許可', async () => { await scheduleSeed(env, { state: 'none' }); await assertSucceeds(initWith(dbAs(env, 'devA'))); });
  test('2 回目の init（schedule を持つ案件）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'none' });
    await assertSucceeds(initWith(dbAs(env, 'devA')));
    await assertFails(initWith(dbAs(env, 'devA')));
  });
  deny('current だけ（internal なし）', { skip: ['internal'] });
  deny('internal だけ（current なし）', { skip: ['current'] });
  deny('案件の要約なし（current・internal だけ）', { skip: ['project'] });
  deny('要約だけ（current・internal なし。ST-20）', { skip: ['current', 'internal'] });
  deny('要約を {requested, 1} で作る', { summary: { status: 'requested', revision: 1 } });
  deny('要約に余分なキー（approvedBy）', { summary: { status: 'draft', revision: 0, approvedBy: 'client1' } });
  deny('current の revision 1', { cur: { revision: 1 } });
  deny('current の editSeq 1', { cur: { editSeq: 1 } });
  deny('current に予定日（submit 前にお客様に見える値を置く）', { cur: { ...SCHED_DATES } });
  deny('internal の editSeq 1', { int: { editSeq: 1 } });
  deny('current の updatedBy が他人', { cur: { updatedBy: 'devB' } });
});

describe('SR-03・ST-17: 予定日（internal.draft）', () => {
  const D = SCHED_DATES;
  const draftAs = async (draft) => { await scheduleSeed(env, { state: 'draft' }); return saveInt(dbAs(env, 'devA'), 'devA', { draft }); };
  const bad = {
    '納品 > 公開': { ...D, deliveryDate: '2026-12-26' },
    '構築 > 納品': { ...D, buildDue: '2026-12-21' },
    '2026-1-5': { ...D, buildDue: '2026-1-5' },
    '2026/01/05': { ...D, buildDue: '2026/01/05' },
    '1999-12-31': { ...D, buildDue: '1999-12-31' },
    '2100-01-01': { ...D, releaseDate: '2100-01-01' },
    '2026-13-01': { ...D, releaseDate: '2026-13-01' },
    '2026-00-10': { ...D, buildDue: '2026-00-10' },
    '2026-12-32': { ...D, releaseDate: '2026-12-32' },
    'Timestamp 型': { ...D, releaseDate: T0 },
    '数値': { ...D, releaseDate: 20261225 },
    '納品日の欠落': { buildDue: D.buildDue, releaseDate: D.releaseDate },
    '公開日の欠落': { buildDue: D.buildDue, deliveryDate: D.deliveryDate },
    '未知のキー': { ...D, launchDate: '2026-12-25' },
  };
  for (const [name, draft] of Object.entries(bad)) test(`${name} → 拒否`, async () => { await assertFails(draftAs(draft)); });
  test('3 つ同日 → 許可', async () => { await assertSucceeds(draftAs({ buildDue: '2026-12-20', deliveryDate: '2026-12-20', releaseDate: '2026-12-20' })); });
  test('buildDue なし → 許可', async () => { await assertSucceeds(draftAs({ deliveryDate: D.deliveryDate, releaseDate: D.releaseDate })); });
  test('L-12: 暦に無い日 2026-02-30 は Rules では通る（画面の検査 SU-06 で止める。DATA §12.1）', async () => {
    await assertSucceeds(draftAs({ buildDue: '2026-02-10', deliveryDate: '2026-02-30', releaseDate: '2026-03-01' }));
  });
});

describe('SR-04・ST-18: WBS（current.wbs）', () => {
  const wbsAs = async (wbs, { done = true, uid = 'devA' } = {}) => { await scheduleSeed(env, { state: 'draft', done }); return saveWbs(dbAs(env, uid), uid, wbs); };
  const { release: _r, ...five } = wbsWithDone(T0);
  const deny = (name, wbs, o) => test(`${name} → 拒否`, async () => { await assertFails(wbsAs(wbs, o)); });
  const allow = (name, wbs, o) => test(`${name} → 許可`, async () => { await assertSucceeds(wbsAs(wbs, o)); });
  allow('予定日の変更（完了印は前と同じ）', wbsMoved());
  allow('start == end', { ...wbsWithDone(T0), design: { start: '2026-12-01', end: '2026-12-01', doneAt: T0 } });
  deny('5 行', five);
  deny('7 行（未知の行）', { ...wbsWithDone(T0), extra: { start: '2026-12-01', end: '2026-12-02' } });
  deny('行に余分なキー（doneBy。ST-04）', { ...wbsWithDone(T0), design: { ...wbsWithDone(T0).design, doneBy: 'devA' } });
  deny('行の end の欠落', { ...wbsWithDone(T0), design: { start: '2026-12-01', doneAt: T0 } });
  deny('start > end', { ...wbsWithDone(T0), design: { start: '2026-12-05', end: '2026-12-01', doneAt: T0 } });
  deny('形式不正（2026-12-1）', { ...wbsWithDone(T0), design: { start: '2026-12-1', end: '2026-12-04', doneAt: T0 } });
  deny('build の行に doneAt', { ...wbsWithDone(T0), build: { ...SCHED_WBS.build, doneAt: serverTimestamp() } });
  deny('wbs が map でない', ['sitemap']);
  deny('既存の doneAt（T0）を過去の別の時刻にする', { ...wbsWithDone(T0), design: { ...SCHED_WBS.design, doneAt: PAST } });
  deny('完了印の無い行に過去の doneAt', { ...SCHED_WBS, design: { ...SCHED_WBS.design, doneAt: PAST } }, { done: false });
  deny('今の doneAt を付けるが internal.marks を同じ書き込みで付けない（片側だけ）', { ...SCHED_WBS, design: { ...SCHED_WBS.design, doneAt: serverTimestamp() } }, { done: false });
  deny('doneAt を外すが internal.marks に undone を付けない（片側だけ）', { ...wbsWithDone(T0), design: SCHED_WBS.design });

  const markBatch = async ({ done, row, mark, uid = 'devA' }) => {
    await scheduleSeed(env, { state: 'approved', done });
    const db = dbAs(env, uid);
    const b = writeBatch(db);
    b.update(doc(db, CUR), { 'wbs.design': row, editSeq: 1, ...stamp(uid) });
    b.update(doc(db, INT), { 'marks.design': mark, savedByName: nameOf(uid), editSeq: 1, ...stamp(uid) });
    return b.commit();
  };
  test('完了印を付ける（doneAt＝今・marks＝本人・今・done）→ 許可', async () => {
    await assertSucceeds(markBatch({ done: false, row: { ...SCHED_WBS.design, doneAt: serverTimestamp() }, mark: { state: 'done', at: serverTimestamp(), by: 'devA' } }));
  });
  test('完了印を外す（doneAt なし・marks＝本人・今・undone）→ 許可', async () => {
    await assertSucceeds(markBatch({ done: true, row: SCHED_WBS.design, mark: { state: 'undone', at: serverTimestamp(), by: 'devA' } }));
  });
  test('marks の by が他人（doneBy の偽装）→ 拒否', async () => {
    await assertFails(markBatch({ done: false, row: { ...SCHED_WBS.design, doneAt: serverTimestamp() }, mark: { state: 'done', at: serverTimestamp(), by: 'devB' } }));
  });
  test('marks の at が過去 → 拒否', async () => {
    await assertFails(markBatch({ done: false, row: { ...SCHED_WBS.design, doneAt: serverTimestamp() }, mark: { state: 'done', at: PAST, by: 'devA' } }));
  });
  test('付けたのに marks が undone（状態の食い違い）→ 拒否', async () => {
    await assertFails(markBatch({ done: false, row: { ...SCHED_WBS.design, doneAt: serverTimestamp() }, mark: { state: 'undone', at: serverTimestamp(), by: 'devA' } }));
  });
  test('internal.marks だけ done にする（current の doneAt を付けない。片側だけ）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'approved', done: false });
    await assertFails(saveInt(dbAs(env, 'devA'), 'devA', { marks: { design: { state: 'done', at: serverTimestamp(), by: 'devA' } } }));
  });
  test('admin・devB（担当の協力会社）も完了印を付けられる（schedSaveBatch）', async () => {
    for (const uid of ['admin1', 'devB']) {
      await scheduleSeed(env, { state: 'approved', done: false });
      await assertSucceeds(schedSaveBatch(dbAs(env, uid), { uid }));
    }
  });
});

describe('SR-05・ST-19: internal', () => {
  const intAs = async (over, uid = 'devA') => { await scheduleSeed(env, { state: 'draft' }); return saveInt(dbAs(env, uid), uid, over); };
  const deny = (name, over) => test(`${name} → 拒否`, async () => { await assertFails(intAs(over)); });
  const allow = (name, over) => test(`${name} → 許可`, async () => { await assertSucceeds(intAs(over)); });
  allow('メモ 200 字・担当 30 字', { note: 'あ'.repeat(200), assignees: { design: '担'.repeat(30) } });
  allow('メモに改行（社内メモは複数行可＝reChatControl）', { note: '1 行目\n2 行目' });
  allow('担当を空のマップにする', { assignees: {} });
  deny('メモ 201 字', { note: 'あ'.repeat(201) });
  deny('メモに向きの制御（U+202E）', { note: '社内‮メモ' });
  deny('メモに C0（U+0001）', { note: '社内\u0001メモ' });
  deny('担当名 31 字', { assignees: { design: '担'.repeat(31) } });
  deny('担当名が空', { assignees: { design: '' } });
  deny('担当名に向きの制御', { assignees: { design: '担当‮' } });
  deny('担当の未知のキー', { assignees: { extra: '担当' } });
  deny('savedByName の偽装', { savedByName: '別人' });
  deny('未知のキー', { secret: 'x' });
  deny('editSeq +2', { editSeq: 2 });
  deny('editSeq が同じ', { editSeq: 0 });
  deny('updatedBy が他人', { updatedBy: 'devB' });
  deny('marks に build（完了印の無い行）', { marks: { build: { state: 'done', at: serverTimestamp(), by: 'devA' } } });
});

describe('ST-04: お客様の読める文書に社内値を置かない', () => {
  for (const [k, v] of Object.entries({ note: 'メモ', assignees: SCHED_ASSIGNEES, savedByName: USERS.devA.name })) {
    test(`current に ${k} を足す → 拒否`, async () => {
      await scheduleSeed(env, { state: 'draft' });
      await assertFails(updateDoc(doc(dbAs(env, 'devA'), CUR), { wbs: wbsMoved(), [k]: v, editSeq: 1, ...stamp('devA') }));
    });
    test(`submit の承認文書に ${k} を写す → 拒否`, async () => {
      await scheduleSeed(env, { state: 'draft' });
      await assertFails(submitWith(dbAs(env, 'devA'), { log: { [k]: v } }));
    });
  }
  test('お客様の承認文書に note・assignees → 拒否', async () => {
    for (const log of [{ note: 'メモ' }, { assignees: SCHED_ASSIGNEES }]) {
      await scheduleSeed(env, { state: 'requested' });
      await assertFails(approveWith(dbAs(env, 'client1'), { log }));
    }
  });
});

describe('SR-06・ST-03: 読み取り', () => {
  const get = (uid, path, token) => getDoc(doc(uid === 'unauth' ? unauth() : dbAs(env, uid, token), path));
  test('お客様の current: draft（rev 0）→ 拒否、requested・approved → 許可、未作成 → 拒否', async () => {
    await scheduleSeed(env, { state: 'draft' });
    await assertFails(get('client1', CUR));
    for (const state of ['requested', 'approved']) { await scheduleSeed(env, { state }); await assertSucceeds(get('client1', CUR)); }
    await scheduleSeed(env, { state: 'none' });
    await assertFails(get('client1', CUR));
  });
  test('L-15（受容）: 差し戻し後（draft・rev 1）の current はお客様が読める', async () => {
    await scheduleSeed(env, { state: 'draft', rev: 1 });
    await assertSucceeds(get('client1', CUR));
  });
  test('お客様の internal はどの状態でも拒否', async () => {
    for (const state of ['draft', 'requested', 'approved']) { await scheduleSeed(env, { state }); await assertFails(get('client1', INT)); }
  });
  test('admin1（担当外）・devA・devB は current・internal を読める（draft でも）', async () => {
    await scheduleSeed(env, { state: 'draft' });
    for (const uid of ['admin1', 'devA', 'devB']) { await assertSucceeds(get(uid, CUR)); await assertSucceeds(get(uid, INT)); }
  });
  test('担当外の開発者・協力会社・他案件のお客様・無効化・未ログイン・メール不一致・未確認メールは current・internal とも拒否（ST-02）', async () => {
    await scheduleSeed(env, { state: 'approved' });
    for (const uid of ['devC', 'devP2', 'client2', 'devOff', 'clientOff', 'adminOff', 'unauth']) {
      await assertFails(get(uid, CUR)); await assertFails(get(uid, INT));
    }
    for (const token of [{ email: 'changed@afro.example' }, { email_verified: false }]) {
      for (const uid of ['admin1', 'devA', 'client1']) { await assertFails(get(uid, CUR, token)); await assertFails(get(uid, INT, token)); }
    }
  });
  test('schedule の list は全員拒否（admin も）', async () => {
    await scheduleSeed(env, { state: 'approved' });
    for (const uid of ['admin1', 'devA', 'client1']) await assertFails(getDocs(collection(dbAs(env, uid), `${P}/schedule`)));
  });
  test('アーカイブ中も読める（admin・担当・お客様の current）', async () => {
    await scheduleSeed(env, { state: 'approved' });
    await archiveRaw();
    for (const uid of ['admin1', 'devA']) { await assertSucceeds(get(uid, CUR)); await assertSucceeds(get(uid, INT)); }
    await assertSucceeds(get('client1', CUR));
    await assertFails(get('client1', INT));
  });
});

describe('SR-07・ST-05・ST-20・ST-22: submit', () => {
  const deny = (name, opts, seedOpts = { state: 'draft' }, uid = 'devA') => test(`${name} → 拒否`, async () => {
    await scheduleSeed(env, seedOpts);
    await assertFails(submitWith(dbAs(env, uid), { uid, ...opts }));
  });
  for (const uid of ['devA', 'admin1']) {
    test(`${uid}: 版 +1・記録 1 件で成立（schedSubmitBatch）→ 許可、要約は requested・rev 1・releaseDate`, async () => {
      await scheduleSeed(env, { state: 'draft' });
      await assertSucceeds(schedSubmitBatch(dbAs(env, uid), { uid }));
      const s = (await readAdmin(P)).schedule;
      assert.equal(s.status, 'requested'); assert.equal(s.revision, 1); assert.equal(s.releaseDate, SCHED_DATES.releaseDate);
    });
  }
  deny('お客様の submit', {}, undefined, 'client1');
  deny('担当外の開発者の submit', {}, undefined, 'devC');
  deny('記録なし', { skip: ['log'] });
  deny('案件の遷移なし（current と記録だけ）', { skip: ['project'] });
  deny('current の更新なし（要約と記録だけ。rev 0）', { skip: ['current'] });
  deny('current の更新なし（要約と記録だけ。差し戻し後 rev 1 → 2。ST-20）', { fromRev: 1, skip: ['current'] }, { state: 'draft', rev: 1 });
  deny('current の予定日が internal.draft と不一致', { cur: { releaseDate: '2026-12-31' }, summary: { 'schedule.releaseDate': '2026-12-31' }, log: { releaseDate: '2026-12-31' } });
  deny('承認文書の写しが current と不一致（releaseDate）', { log: { releaseDate: '2026-12-31' } });
  deny('承認文書の写しが current と不一致（wbs）', { wbs: wbsMoved() });
  deny('承認文書に buildDue が無い（current にはある）', { log: { buildDue: undefined } });
  deny('要約の releaseDate が current と不一致（ST-05）', { summary: { 'schedule.releaseDate': '2027-01-15' } });
  deny('要約に余分なキー（approvedAt）', { summary: { 'schedule.approvedAt': serverTimestamp() } });
  deny('requestedAt が今でない', { summary: { 'schedule.requestedAt': T0 } });
  deny('版の飛び（+2）', { rev: 2 });
  deny('記録の ID の版が違う（rev 1 の依頼を schedule-r2-submit に）', { aid: 'schedule-r2-submit' });
  deny('記録の side が client', { log: { side: 'client' } });
  deny("開発者が actorRole: 'admin' を名乗る", { log: { actorRole: 'admin' } });
  deny('admin の記録に actorRole が無い', { log: { actorRole: undefined } }, undefined, 'admin1');
  deny('current の editSeq が +1 でない', { seq: 1 });
  deny('同じ版の 2 回目（requested 中の submit）', { fromRev: 1 }, { state: 'requested' });
  deny('approved から reopen なしで submit', { fromRev: 1 }, { state: 'approved' });
  test('ST-22: revision 50 → 51 の submit → 拒否、49 → 50 → 許可', async () => {
    await scheduleSeed(env, { state: 'draft', rev: 50 });
    await assertFails(submitWith(dbAs(env, 'devA'), { fromRev: 50 }));
    await scheduleSeed(env, { state: 'draft', rev: 49 });
    await assertSucceeds(submitWith(dbAs(env, 'devA'), { fromRev: 49 }));
  });
  test('current だけを submit の形で更新（要約を requested にしない。ST-20）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'draft' });
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), CUR), { revision: 1, ...SCHED_DATES, editSeq: 1, ...stamp('devA') }));
  });
});

describe('SR-08・ST-10: 依頼中・承認後の変更', () => {
  test('requested 中の internal.draft の変更 → 拒否（AC-04）', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertFails(saveInt(dbAs(env, 'devA'), 'devA', { draft: { ...SCHED_DATES, releaseDate: '2027-01-15' } }));
  });
  test('requested 中の WBS・担当・メモの変更 → 許可（状態・版は不変）', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(saveWbs(dbAs(env, 'devA'), 'devA', wbsMoved()));
    await assertSucceeds(saveInt(dbAs(env, 'devA'), 'devA', { assignees: { design: '新しい担当' }, note: '新しいメモ' }));
    const s = (await readAdmin(P)).schedule;
    assert.equal(s.status, 'requested'); assert.equal(s.revision, 1);
  });
  test('requested・approved 中の current の予定日の変更 → 拒否', async () => {
    for (const state of ['requested', 'approved']) {
      await scheduleSeed(env, { state });
      await assertFails(updateDoc(doc(dbAs(env, 'devA'), CUR), { deliveryDate: '2026-12-21', editSeq: 1, ...stamp('devA') }));
    }
  });
  test('approved 中の WBS の変更 → 許可・要約は approved のまま', async () => {
    await scheduleSeed(env, { state: 'approved' });
    await assertSucceeds(saveWbs(dbAs(env, 'admin1'), 'admin1', wbsMoved()));
    assert.equal((await readAdmin(P)).schedule.status, 'approved');
  });
  test('ST-09: 依頼中に WBS が変わった後、古い WBS の写しでお客様・代理が承認 → 拒否（新しい写しなら許可）', async () => {
    for (const [uid, proxy] of [['client1', false], ['admin1', true]]) {
      await scheduleSeed(env, { state: 'requested' });
      await assertSucceeds(saveWbs(dbAs(env, 'devA'), 'devA', wbsMoved()));
      await assertFails(approveWith(dbAs(env, uid), { uid, proxy }));
      await assertSucceeds(approveWith(dbAs(env, uid), { uid, proxy, wbs: wbsMoved() }));
    }
  });
});

describe('SR-09・ST-16: withdraw', () => {
  for (const uid of ['devA', 'admin1']) {
    test(`${uid}: 取り下げ → 許可・続けて再依頼（rev 2）→ 許可`, async () => {
      await scheduleSeed(env, { state: 'requested' });
      await assertSucceeds(schedWithdrawBatch(dbAs(env, uid), { uid }));
      await assertSucceeds(schedSubmitBatch(dbAs(env, uid), { uid, fromRev: 1 }));
      assert.equal((await readAdmin(P)).schedule.revision, 2);
    });
  }
  test('note 200 字 → 許可', async () => { await scheduleSeed(env, { state: 'requested' }); await assertSucceeds(moveWith(dbAs(env, 'devA'), 'withdraw', { note: 'あ'.repeat(200) })); });
  for (const [name, note] of Object.entries(NOTE_BAD)) {
    test(`note が ${name} → 拒否`, async () => { await scheduleSeed(env, { state: 'requested' }); await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', { note })); });
  }
  test('note なし → 拒否', async () => { await scheduleSeed(env, { state: 'requested' }); await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', { log: { note: undefined } })); });
  for (const uid of ['client1', 'devC']) {
    test(`${uid} の取り下げ → 拒否`, async () => { await scheduleSeed(env, { state: 'requested' }); await assertFails(moveWith(dbAs(env, uid), 'withdraw', { uid })); });
  }
  test('同じ版で 2 回目の取り下げ → 拒否', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(moveWith(dbAs(env, 'devA'), 'withdraw'));
    await assertFails(moveWith(dbAs(env, 'devB'), 'withdraw', { uid: 'devB' }));
  });
  test('記録なし・案件の遷移なし・approved からの withdraw・記録に wbs → 拒否', async () => {
    for (const [opts, state] of [[{ skip: ['log'] }, 'requested'], [{ skip: ['project'] }, 'requested'], [{}, 'approved'], [{ log: { wbs: wbsWithDone(T0) } }, 'requested']]) {
      await scheduleSeed(env, { state });
      await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', opts));
    }
  });
  test('取り下げと同時に要約の releaseDate を変える → 拒否', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw', { summary: { 'schedule.releaseDate': '2027-01-15' } }));
  });
});

describe('SR-10・ST-08・ST-09: お客様本人の承認', () => {
  const deny = (name, opts, seedOpts = { state: 'requested' }, uid = 'client1') => test(`${name} → 拒否`, async () => {
    await scheduleSeed(env, seedOpts);
    await assertFails(approveWith(dbAs(env, uid), { uid, ...opts }));
  });
  test('正しい形（schedApproveBatch）→ 許可・要約に approvedVia なし', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(schedApproveBatch(dbAs(env, 'client1')));
    const s = (await readAdmin(P)).schedule;
    assert.equal(s.status, 'approved'); assert.equal(s.approvedBy, 'client1'); assert.ok(!('approvedVia' in s));
  });
  test("actorRole: 'client' を付ける → 許可", async () => { await scheduleSeed(env, { state: 'requested' }); await assertSucceeds(approveWith(dbAs(env, 'client1'), { log: { actorRole: 'client' } })); });
  deny("side: 'afro'", { log: { side: 'afro' } });
  deny('proxy: true', { log: { proxy: true } });
  deny('note を付ける', { log: { note: SCHED_NOTE } });
  deny("actorRole: 'admin'", { log: { actorRole: 'admin' } });
  deny('actorUid の偽装', { log: { actorUid: 'client2' } });
  deny('actorName の偽装', { log: { actorName: '別人' } });
  deny('actorEmail の偽装', { log: { actorEmail: 'x@customer.example' } });
  deny('at が過去', { log: { at: T0 } });
  deny("要約に approvedVia: 'proxy'", { summary: { 'schedule.approvedVia': 'proxy' } });
  deny('approvedBy が他人', { summary: { 'schedule.approvedBy': 'devA' } });
  deny('approvedAt が過去', { summary: { 'schedule.approvedAt': T0 } });
  deny('approvalId が違う', { summary: { 'schedule.approvalId': 'schedule-r2-approve' } });
  deny('承認と同時に要約の releaseDate を変える', { summary: { 'schedule.releaseDate': '2027-01-15' } });
  deny('写しの deliveryDate が current と違う', { log: { deliveryDate: '2026-12-19' } });
  deny('写しの wbs が current と違う', { wbs: wbsMoved() });
  deny('記録なし（要約だけ approved）', { skip: ['log'] });
  deny('古い版の ID（rev 2 が依頼中に rev 1 を承認）', { rev: 1 }, { state: 'requested', rev: 2 });
  deny('draft（差し戻し後）の承認', {}, { state: 'draft', rev: 1 });
  deny('approved の 2 回目の承認', {}, { state: 'approved' });
  deny('他案件のお客様（client2）', {}, undefined, 'client2');
  deny('開発者が side client で承認', { log: { side: 'client' } }, undefined, 'devA');
  deny('admin が本人の承認（approvedVia なし・side client）', { log: { side: 'client' } }, undefined, 'admin1');
});

describe('SR-11・ST-12・ST-13: 代理承認', () => {
  const deny = (name, opts, uid = 'admin1') => test(`${name} → 拒否`, async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertFails(approveWith(dbAs(env, uid), { uid, proxy: true, ...opts }));
  });
  for (const uid of ['admin1', 'admin2']) {
    test(`${uid}: 正しい形（schedProxyBatch）→ 許可・approvedVia proxy`, async () => {
      await scheduleSeed(env, { state: 'requested' });
      await assertSucceeds(schedProxyBatch(dbAs(env, uid), { uid }));
      assert.equal((await readAdmin(P)).schedule.approvedVia, 'proxy');
    });
  }
  test('note 200 字（前後の空白は数えない）→ 許可', async () => { await scheduleSeed(env, { state: 'requested' }); await assertSucceeds(approveWith(dbAs(env, 'admin1'), { uid: 'admin1', proxy: true, note: ` ${'あ'.repeat(200)} ` })); });
  for (const [name, note] of Object.entries(NOTE_BAD)) deny(`note が ${name}`, { note });
  deny('note なし', { log: { note: undefined } });
  deny('proxy なし', { log: { proxy: undefined } });
  deny('proxy: false', { log: { proxy: false } });
  deny('actorRole なし', { log: { actorRole: undefined } });
  deny("side: 'client'", { log: { side: 'client' } });
  deny('要約に approvedVia が無い', { summary: { 'schedule.approvedVia': deleteField() } });
  deny('記録の actorUid が他の admin', { log: { actorUid: 'admin2' } });
  deny('開発者の代理', {}, 'devA');
  deny('お客様の代理', {}, 'client1');
  test('ST-13: 本人の承認の後の代理・代理の後の本人の承認・同じ版の二重の承認 → 拒否', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(approveWith(dbAs(env, 'client1')));
    await assertFails(approveWith(dbAs(env, 'admin1'), { uid: 'admin1', proxy: true }));
    await assertFails(approveWith(dbAs(env, 'client1')));
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(approveWith(dbAs(env, 'admin1'), { uid: 'admin1', proxy: true }));
    await assertFails(approveWith(dbAs(env, 'client1')));
    await assertFails(approveWith(dbAs(env, 'admin2'), { uid: 'admin2', proxy: true }));
  });
  test('ST-13: 承認と取り下げは一方だけ（承認の後の取り下げ・取り下げの後の承認 → 拒否）', async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(approveWith(dbAs(env, 'client1')));
    await assertFails(moveWith(dbAs(env, 'devA'), 'withdraw'));
    await scheduleSeed(env, { state: 'requested' });
    await assertSucceeds(moveWith(dbAs(env, 'devA'), 'withdraw'));
    await assertFails(approveWith(dbAs(env, 'client1')));
  });
  test('代理の後の再計画 → 再依頼 → 本人の承認で approvedVia が消える（消さない承認は拒否）', async () => {
    await scheduleSeed(env, { state: 'approved', approvedVia: 'proxy' });
    await assertSucceeds(schedReopenBatch(dbAs(env, 'devA')));
    const dates = { ...SCHED_DATES, releaseDate: '2027-01-15' };
    await assertSucceeds(submitWith(dbAs(env, 'devA'), { fromRev: 1, dates }));
    await assertFails(approveWith(dbAs(env, 'client1'), { rev: 2, dates, summary: { 'schedule.approvedVia': undefined } }));
    await assertSucceeds(approveWith(dbAs(env, 'client1'), { rev: 2, dates }));
    const s = (await readAdmin(P)).schedule;
    assert.equal(s.approvedRevision, 2); assert.equal(s.releaseDate, '2027-01-15'); assert.ok(!('approvedVia' in s));
  });
});

describe('SR-12・ST-11・ST-16: 再計画（reopen）', () => {
  const NEW = { ...SCHED_DATES, releaseDate: '2027-01-15' };
  for (const uid of ['devA', 'admin1']) {
    test(`${uid}: approved で draft の変更＋reopen（note あり）→ 許可・続けて submit は rev 2`, async () => {
      await scheduleSeed(env, { state: 'approved' });
      await assertSucceeds(schedReopenBatch(dbAs(env, uid), { uid }));
      await assertSucceeds(submitWith(dbAs(env, uid), { uid, fromRev: 1, dates: NEW }));
      const s = (await readAdmin(P)).schedule;
      assert.equal(s.status, 'requested'); assert.equal(s.revision, 2); assert.equal(s.releaseDate, NEW.releaseDate);
    });
  }
  test('reopen なしの draft の変更（approved のまま）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'approved' });
    await assertFails(saveInt(dbAs(env, 'devA'), 'devA', { draft: NEW }));
  });
  for (const [name, note] of Object.entries(NOTE_BAD)) {
    test(`reopen の note が ${name} → 拒否`, async () => { await scheduleSeed(env, { state: 'approved' }); await assertFails(moveWith(dbAs(env, 'devA'), 'reopen', { note, draft: NEW })); });
  }
  test('reopen の note なし → 拒否', async () => { await scheduleSeed(env, { state: 'approved' }); await assertFails(moveWith(dbAs(env, 'devA'), 'reopen', { log: { note: undefined }, draft: NEW })); });
  test('お客様・担当外の開発者の reopen → 拒否', async () => {
    for (const uid of ['client1', 'devC']) { await scheduleSeed(env, { state: 'approved' }); await assertFails(moveWith(dbAs(env, uid), 'reopen', { uid })); }
  });
  test('案件の遷移なし（記録と draft だけ）・記録なし（遷移と draft だけ）・requested からの reopen → 拒否', async () => {
    for (const [opts, state] of [[{ skip: ['project'], draft: NEW }, 'approved'], [{ skip: ['log'], draft: NEW }, 'approved'], [{}, 'requested']]) {
      await scheduleSeed(env, { state });
      await assertFails(moveWith(dbAs(env, 'devA'), 'reopen', opts));
    }
  });
  test('ST-05: 再計画と同時に要約の releaseDate を draft の値にする → 拒否', async () => {
    await scheduleSeed(env, { state: 'approved' });
    await assertFails(moveWith(dbAs(env, 'devA'), 'reopen', { draft: NEW, summary: { 'schedule.releaseDate': NEW.releaseDate } }));
  });
  test('ST-21: approved* を消す（要約を {draft, 1, …} で丸ごと置く）reopen → 拒否', async () => {
    await scheduleSeed(env, { state: 'approved' });
    const db = dbAs(env, 'devA');
    const b = writeBatch(db);
    b.update(doc(db, P), { schedule: { status: 'draft', revision: 1, requestedAt: T0, releaseDate: SCHED_DATES.releaseDate }, ...stamp('devA') });
    b.set(doc(db, ap('schedule-r1-reopen')), schedLogDoc('devA', 'reopen', 1, { note: SCHED_NOTE }));
    await assertFails(b.commit());
  });
});

describe('SR-13: 追記のみ', () => {
  test('schedule の承認文書の update・delete は admin を含め全員拒否・schedule 文書の delete も拒否', async () => {
    await scheduleSeed(env, { state: 'requested' });
    for (const uid of ['admin1', 'devA', 'client1']) {
      const db = dbAs(env, uid);
      await assertFails(updateDoc(doc(db, ap('schedule-r1-submit')), { releaseDate: '2027-01-15' }));
      await assertFails(deleteDoc(doc(db, ap('schedule-r1-submit'))));
      await assertFails(deleteDoc(doc(db, CUR)));
      await assertFails(deleteDoc(doc(db, INT)));
    }
  });
  test('既存の記録の ID に同じ形でもう一度書く（上書き）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'draft', rev: 1 });
    await assertFails(setDoc(doc(dbAs(env, 'devA'), ap('schedule-r1-submit')), schedLogDoc('devA', 'submit', 1, { ...SCHED_DATES, wbs: wbsWithDone(T0) })));
  });
});

describe('SR-14・ST-14（追加）: kind と ID の結び付け', () => {
  test("kind 'schedule' で ID requirements-r1-approve（お客様の承認）→ 拒否", async () => {
    await scheduleSeed(env, { state: 'requested' });
    await assertFails(approveWith(dbAs(env, 'client1'), { aid: 'requirements-r1-approve' }));
  });
  test("kind 'schedule' の submit を ID requirements-r2-submit に → 拒否", async () => {
    await scheduleSeed(env, { state: 'draft', rev: 1 });
    await assertFails(submitWith(dbAs(env, 'devA'), { fromRev: 1, aid: 'requirements-r2-submit' }));
  });
  test("kind 'requirements' の記録で schedule の submit → 拒否", async () => {
    await scheduleSeed(env, { state: 'draft' });
    await assertFails(submitWith(dbAs(env, 'devA'), { log: { kind: 'requirements' } }));
  });
  test('スケジュールの第 1 版の承認文書があっても、要件定義書の第 1 版の承認は引き続きできる', async () => {
    await seed(env, { reqState: 'analyzed' });
    await raw(async (db) => {
      await updateDoc(doc(db, P), { schedule: SUMMARY });
      await setDoc(doc(db, ap('schedule-r1-approve')), { ...schedLogDoc('client1', 'approve', 1, { ...SCHED_DATES, wbs: SCHED_WBS }), at: T0 });
    });
    await assertSucceeds(approveBatch(dbAs(env, 'client1')));
  });
});

describe('SR-15・ST-07: アーカイブ中は全員読むだけ（L-17）', () => {
  const ops = {
    'WBS の保存': ['approved', true, (uid) => saveWbs(dbAs(env, uid), uid, wbsMoved())],
    'internal の保存': ['approved', true, (uid) => saveInt(dbAs(env, uid), uid, { note: '新しいメモ' })],
    '完了印': ['approved', false, (uid) => schedSaveBatch(dbAs(env, uid), { uid })],
    'submit': ['draft', true, (uid) => schedSubmitBatch(dbAs(env, uid), { uid })],
    'withdraw': ['requested', true, (uid) => schedWithdrawBatch(dbAs(env, uid), { uid })],
    'reopen': ['approved', true, (uid) => schedReopenBatch(dbAs(env, uid), { uid })],
  };
  for (const [name, [state, done, run]] of Object.entries(ops)) {
    test(`${name}: devA・admin1 とも拒否`, async () => {
      for (const uid of ['devA', 'admin1']) { await scheduleSeed(env, { state, done }); await archiveRaw(); await assertFails(run(uid)); }
    });
  }
  test('お客様の承認・代理承認 → 拒否', async () => {
    await scheduleSeed(env, { state: 'requested' }); await archiveRaw();
    await assertFails(schedApproveBatch(dbAs(env, 'client1')));
    await assertFails(schedProxyBatch(dbAs(env, 'admin1')));
  });
  test('アーカイブと WBS の保存を同じバッチ → 拒否（事後の archived）', async () => {
    await scheduleSeed(env, { state: 'approved' });
    const db = dbAs(env, 'devA');
    const b = writeBatch(db);
    b.update(doc(db, P), { archived: true, ...stamp('devA') });
    b.update(doc(db, CUR), { wbs: wbsMoved(), editSeq: 1, ...stamp('devA') });
    await assertFails(b.commit());
  });
  test('アーカイブ解除と WBS の保存を同じバッチ → 拒否（事前の archived）', async () => {
    await scheduleSeed(env, { state: 'approved' }); await archiveRaw();
    const db = dbAs(env, 'admin1');
    const b = writeBatch(db);
    b.update(doc(db, P), { archived: false, ...stamp('admin1') });
    b.update(doc(db, CUR), { wbs: wbsMoved(), editSeq: 1, ...stamp('admin1') });
    await assertFails(b.commit());
  });
  test('アーカイブと submit を同じ書き込み → 拒否', async () => {
    await scheduleSeed(env, { state: 'draft' });
    await assertFails(submitWith(dbAs(env, 'devA'), { summary: { archived: true } }));
  });
});

describe('ST-21（追加）: 楽観ロック（editSeq）', () => {
  test('同じ editSeq から current を 2 回保存 → 2 回目拒否（読み直した editSeq なら許可）', async () => {
    await scheduleSeed(env, { state: 'approved' });
    await assertSucceeds(saveWbs(dbAs(env, 'devA'), 'devA', wbsMoved()));
    await assertFails(saveWbs(dbAs(env, 'devB'), 'devB', wbsWithDone(T0)));
    await assertSucceeds(saveWbs(dbAs(env, 'devB'), 'devB', wbsWithDone(T0), 1));
  });
  test('同じ editSeq から internal を 2 回保存 → 2 回目拒否', async () => {
    await scheduleSeed(env, { state: 'draft' });
    await assertSucceeds(saveInt(dbAs(env, 'devA'), 'devA', { note: '1 回目' }));
    await assertFails(saveInt(dbAs(env, 'devB'), 'devB', { note: '2 回目' }));
  });
  test('同時保存（schedSaveBatch）を同じ seq で 2 回 → 2 回目拒否', async () => {
    await scheduleSeed(env, { state: 'approved', done: false });
    await assertSucceeds(schedSaveBatch(dbAs(env, 'devA')));
    await assertFails(schedSaveBatch(dbAs(env, 'devA')));
  });
  test('approved* を消す set（案件文書を丸ごと置き直す）→ 拒否', async () => {
    await scheduleSeed(env, { state: 'approved' });
    const cur = await readAdmin(P);
    const { approvedRevision: _a, approvedAt: _b, approvedBy: _c, approvalId: _d, ...rest } = cur.schedule;
    await assertFails(setDoc(doc(dbAs(env, 'admin1'), P), { ...cur, schedule: rest, ...stamp('admin1') }));
  });
});

describe('監査 L-A（2026-11-27）: 多層防御（L-B は G1 の余裕のため受容。firestore.rules の schedCurUpdateOk の上のコメント）', () => {
  test('L-A: 依頼中（requested → requested）に current の予定日を internal.draft の写しへ差し替える → 拒否（internal.draft が依頼中に動いた場合を模擬）', async () => {
    await scheduleSeed(env, { state: 'requested' });
    const draft = { ...SCHED_DATES, releaseDate: '2027-01-15' };
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), INT), { draft }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), CUR), { releaseDate: draft.releaseDate, editSeq: 1, ...stamp('devA') }));
  });
});
