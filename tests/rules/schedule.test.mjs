// スケジュール（予定日＋WBS）の Rules（docs/design/LIVE_SCHEDULE_PLAN.md §3 U1、データ設計 LIVE_SCHEDULE_WBS_DATA.md §7.1）。
// 段 0（U1-0）: 案件の schedule キーを許す（作成時は禁止）・apprCreateOk を kind で振り分ける（requirements の本体は reqApprCreateOk へそのまま）。
// SR-01〜18・ST-01〜24 の全件は U1-3 で足す。ここは段 0 の回帰（SR-02 の一部・SR-14 の一部・SR-16）
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createRulesEnv } from './guard.mjs';
import {
  ANSWERS, PROPOSAL, T0, USERS, approvalDoc, createProjectBatch, dbAs, doc, seed, serverTimestamp, setDoc, stamp, submitBatch, updateDoc, withdrawBatch, writeBatch,
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
