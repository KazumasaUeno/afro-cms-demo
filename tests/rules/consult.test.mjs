// projects/{pid}/messages と projects/{pid}.consult（相談）の許可・拒否（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.2・§3。U3）
// 2026-11-25 ユーザー決定: 送れるのはお客様（自分の案件）と担当の開発者全員 ／ admin は見るだけ ／ 編集・削除なし ／ 添付なし
// 既定の世界（fixtures.mjs seed）: p1 は devA・devB・devOff（無効）が担当、お客様 client1 ／ p2 は devC、お客様 client2
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, getDoc, getDocs, limitToLast, orderBy, query } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import { PAST, T0, USERS, dbAs, doc, seed, serverTimestamp, setDoc, updateDoc, writeBatch } from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });
beforeEach(async () => { await seed(env); });

const seqId = (n) => String(n).padStart(6, '0');
const sideOf = (uid) => (USERS[uid]?.role === 'client' ? 'client' : 'afro');

/** 画面が送る形（repositories.tsx useLiveConsultActions と同じ）。mutate で 1 か所だけ崩す */
function sendBatch(uid, { pid = 'p1', seq = 1, msg = {}, consult = {}, skipMsg = false, skipProject = false, mid, projectExtra = {} } = {}) {
  const db = dbAs(env, uid);
  const b = writeBatch(db);
  const name = USERS[uid]?.name ?? uid;
  const side = sideOf(uid);
  if (!skipMsg) {
    const m = { schemaVersion: 1, seq, text: 'トップページの写真を差し替えたいです', side, authorUid: uid, authorName: name, at: serverTimestamp(), ...msg };
    for (const [k, v] of Object.entries(m)) if (v === undefined) delete m[k];
    b.set(doc(db, `projects/${pid}/messages/${mid ?? seqId(seq)}`), m);
  }
  if (!skipProject) {
    b.update(doc(db, `projects/${pid}`), { consult: { count: seq, lastAt: serverTimestamp(), lastSide: side, lastName: name, ...consult }, ...projectExtra });
  }
  return b.commit();
}

/** 既に会話がある状態（count 件。最後は side/name・時刻 lastAt） */
async function seedConsult({ pid = 'p1', count, lastSide = 'client', lastName = USERS.client1.name, lastAt = T0, archived } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await updateDoc(doc(db, `projects/${pid}`), { consult: { count, lastAt, lastSide, lastName }, ...(archived === undefined ? {} : { archived }) });
    await setDoc(doc(db, `projects/${pid}/messages/${seqId(count)}`), {
      schemaVersion: 1, seq: count, text: '前のメッセージ', side: lastSide, authorUid: lastSide === 'client' ? 'client1' : 'devA', authorName: lastName, at: lastAt,
    });
  });
}

const msgQ = (db, pid = 'p1') => query(collection(db, `projects/${pid}/messages`), orderBy('seq'), limitToLast(50));

describe('messages: get / list', () => {
  beforeEach(async () => { await seedConsult({ count: 1 }); });
  test('admin（見るだけ）・担当の開発者（社内・協力会社）・その案件のお客様は読める', async () => {
    for (const uid of ['admin1', 'devA', 'devB', 'client1']) {
      await assertSucceeds(getDoc(doc(dbAs(env, uid), 'projects/p1/messages/000001')));
      await assertSucceeds(getDocs(msgQ(dbAs(env, uid))));
    }
  });
  test('担当外の開発者・他案件のお客様・無効化された人・未ログイン・メール不一致は読めない', async () => {
    for (const uid of ['devC', 'client2', 'devOff', 'clientOff']) {
      await assertFails(getDoc(doc(dbAs(env, uid), 'projects/p1/messages/000001')));
      await assertFails(getDocs(msgQ(dbAs(env, uid))));
    }
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'projects/p1/messages/000001')));
    await assertFails(getDoc(doc(dbAs(env, 'client1', { email: 'changed@customer.example' }), 'projects/p1/messages/000001')));
  });
});

describe('messages: 送信（メッセージ作成＋consult 更新を 1 回の書き込み）', () => {
  test('お客様が最初の 1 件を送れる（consult の無い案件）', async () => {
    await assertSucceeds(sendBatch('client1'));
  });
  test('担当の開発者は返信できる（社内・協力会社とも。担当の全員が返信者）', async () => {
    await seedConsult({ count: 1 });
    await assertSucceeds(sendBatch('devA', { seq: 2 }));
    await seedConsult({ count: 3 });
    await assertSucceeds(sendBatch('devB', { seq: 4 }));
  });
  test('開発者から先に送ってもよい（会話を始める）', async () => {
    await assertSucceeds(sendBatch('devA'));
  });
  test('上限ちょうど（本文 1000 字・前後の空白つき・seq 5000・長い名前）で送れる（式数・get の上限に当たらない）', async () => {
    await seedConsult({ count: 4999 });
    await assertSucceeds(sendBatch('client1', { seq: 5000, msg: { text: `  ${'あ'.repeat(1000)}\n` } }));
  });
  test('改行を含む本文を送れる', async () => {
    await assertSucceeds(sendBatch('client1', { msg: { text: '1 行目\n2 行目\n\n3 行目' } }));
  });

  const deny = (name, uid, opts = {}, prep) => test(name, async () => {
    if (prep) await prep();
    await assertFails(sendBatch(uid, opts));
  });
  deny('admin は送れない（見るだけ）', 'admin1', { msg: { side: 'afro' }, consult: { lastSide: 'afro' } });
  deny('担当外の開発者は送れない', 'devC');
  deny('他案件のお客様は送れない', 'client2', { pid: 'p1' });
  deny('無効化された開発者・お客様は送れない（開発者）', 'devOff');
  deny('無効化された開発者・お客様は送れない（お客様）', 'clientOff');
  deny('お客様が side を afro と偽る → 拒否', 'client1', { msg: { side: 'afro' }, consult: { lastSide: 'afro' } });
  deny('開発者が side を client と偽る → 拒否', 'devA', { msg: { side: 'client' }, consult: { lastSide: 'client' } });
  deny('authorName を他人の名前にする → 拒否', 'client1', { msg: { authorName: '別の人' }, consult: { lastName: '別の人' } });
  deny('consult の lastName だけを偽る → 拒否', 'client1', { consult: { lastName: '別の人' } });
  deny('authorUid を他人にする → 拒否', 'devA', { msg: { authorUid: 'devB' } });
  deny('at を過去日時 → 拒否', 'client1', { msg: { at: PAST } });
  deny('consult の lastAt を過去日時 → 拒否', 'client1', { consult: { lastAt: PAST } });
  deny('本文 1001 字 → 拒否', 'client1', { msg: { text: 'あ'.repeat(1001) } });
  deny('本文が空白だけ → 拒否', 'client1', { msg: { text: ' \n　' } });
  deny('本文が数値 → 拒否', 'client1', { msg: { text: 1 } });
  // 文字の向きの制御・制御文字（セキュリティ L-1。画面は cleanConsultText で送る前に除く）
  for (const code of [0x202a, 0x202e, 0x2066, 0x2069, 0x00, 0x09, 0x0d, 0x1f, 0x7f]) {
    deny(`本文に U+${code.toString(16).toUpperCase().padStart(4, '0')} → 拒否`, 'client1', { msg: { text: `請求書${String.fromCharCode(code)}を送ります` } });
  }
  deny('未知のキー（attachment）→ 拒否（添付なし）', 'client1', { msg: { attachment: 'https://example.com/a.pdf' } });
  deny('schemaVersion が無い → 拒否', 'client1', { msg: { schemaVersion: undefined } });
  deny('consult に未知のキー（preview）→ 拒否', 'client1', { consult: { preview: 'トップページの写真' } });
  deny('seq を飛ばす（count 0 から 2）→ 拒否', 'client1', { seq: 2 });
  deny('seq 0 → 拒否', 'client1', { seq: 0, mid: '000000' });
  deny('文書 ID と seq が違う（ゼロ埋めなし）→ 拒否', 'client1', { mid: '1' });
  deny('seq と consult.count が違う → 拒否', 'client1', { consult: { count: 2 } }, () => seedConsult({ count: 1 }));
  deny('既にある番号へ送る（二重送信・番号の重複）→ 拒否', 'devA', { seq: 1 }, () => seedConsult({ count: 1 }));
  deny('メッセージだけ作る（consult を変えない）→ 拒否', 'client1', { skipProject: true });
  deny('consult だけ変える（未対応を偽って消す）→ 拒否', 'devA', { seq: 2, skipMsg: true, consult: { lastSide: 'afro' } }, () => seedConsult({ count: 1 }));
  deny('consult と一緒に updatedAt・基本情報を変える → 拒否', 'devA', { projectExtra: { siteName: '別名', updatedAt: serverTimestamp(), updatedBy: 'devA' } });
  deny('1 案件 5,000 件の上限を超える → 拒否', 'client1', { seq: 5001 }, () => seedConsult({ count: 5000 }));
  deny('アーカイブした案件へは送れない', 'client1', { seq: 2 }, () => seedConsult({ count: 1, archived: true }));
  deny('2 秒以内の連投 → 拒否（lastAt が今）', 'client1', { seq: 2 }, () => seedConsult({ count: 1, lastAt: Timestamp.now() }));
  test('実際の連投: 1 件目の直後の 2 件目は拒否、存在しない案件へは送れない', async () => {
    await assertSucceeds(sendBatch('client1'));
    await assertFails(sendBatch('client1', { seq: 2 }));
    await assertFails(sendBatch('devA', { pid: 'p404' }));
  });
});

describe('messages: 編集・削除（誰もできない）', () => {
  beforeEach(async () => { await seedConsult({ count: 1 }); });
  test('admin・担当の開発者・お客様のどれも本文の変更・削除ができない', async () => {
    for (const uid of ['admin1', 'devA', 'client1']) {
      await assertFails(updateDoc(doc(dbAs(env, uid), 'projects/p1/messages/000001'), { text: '書き換え' }));
      await assertFails(deleteDoc(doc(dbAs(env, uid), 'projects/p1/messages/000001')));
    }
  });
});

describe('projects: consult の作成時・既存の更新（回帰）', () => {
  test('案件の作成時に consult を持たせる → 拒否（偽の要約）', async () => {
    const { createProjectBatch } = await import('./fixtures.mjs');
    await assertFails(createProjectBatch(dbAs(env, 'devA'), { mutate: { project: { consult: { count: 1, lastAt: serverTimestamp(), lastSide: 'client', lastName: 'x' } } } }));
    await assertSucceeds(createProjectBatch(dbAs(env, 'devA')));
  });
});
