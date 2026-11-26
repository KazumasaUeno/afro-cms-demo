// projects/{pid}/tasks（構築タスク）の許可・拒否（docs/design/LIVE_DASHBOARD_TASKS_CONSULT.md §2.1・§3。U2）
// 2026-11-25 ユーザー決定: 作成・状態変更は担当の開発者だけ ／ admin は見るだけ ／ 削除なし ／ お客様は読めない
// 既定の世界（fixtures.mjs seed）: p1 は devA・devB・devOff（無効）が担当、お客様 client1 ／ p2 は devC、お客様 client2
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { arrayRemove, collection, deleteDoc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { createRulesEnv } from './guard.mjs';
import { PAST, T0, dbAs, doc, seed, serverTimestamp, setDoc, stamp, updateDoc } from './fixtures.mjs';

let env;
before(async () => { env = await createRulesEnv(); });
after(async () => { await env?.clearFirestore(); await env?.cleanup(); });
beforeEach(async () => {
  await seed(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects/p1/tasks/t1'), storedTask({ assigneeUids: ['devA'] }));
    await setDoc(doc(db, 'projects/p2/tasks/t2'), storedTask({ assigneeUids: ['devC'], createdBy: 'devC', updatedBy: 'devC' }));
  });
});

function storedTask(over = {}) {
  return {
    schemaVersion: 1, title: 'トップページのヒーロー', page: 'トップ', assigneeUids: ['devA'], status: 'todo',
    createdAt: T0, createdBy: 'devA', updatedAt: T0, updatedBy: 'devA', ...over,
  };
}

/** 画面が作る形（repositories.tsx の createTask と同じ）。over の undefined はその項目を落とす */
function newTask(uid, over = {}) {
  const t = {
    schemaVersion: 1, title: 'お問い合わせフォームの送信テスト', page: 'サイト全体', assigneeUids: [uid], status: 'todo',
    createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid), ...over,
  };
  for (const [k, v] of Object.entries(t)) if (v === undefined) delete t[k];
  return t;
}

const create = (uid, over, pid = 'p1', tid = 'new1') => setDoc(doc(dbAs(env, uid), `projects/${pid}/tasks/${tid}`), newTask(uid, over));
const setStatus = (uid, status, extra = {}, path = 'projects/p1/tasks/t1') =>
  updateDoc(doc(dbAs(env, uid), path), { status, ...stamp(uid), ...extra });
const listQ = (db, pid = 'p1') => query(collection(db, `projects/${pid}/tasks`), orderBy('createdAt'), limit(300));
// 画面（repositories.tsx useLiveTasks）の形: 新しい順に 300 件（新しいタスクが上限で消えない。U2 セキュリティレビュー）
const newestQ = (db, pid = 'p1') => query(collection(db, `projects/${pid}/tasks`), orderBy('createdAt', 'desc'), limit(300));

describe('tasks: get / list', () => {
  test('担当の開発者（社内・協力会社）と admin は get・一覧（orderBy createdAt limit 300）ができる', async () => {
    for (const uid of ['devA', 'devB', 'admin1']) {
      await assertSucceeds(getDoc(doc(dbAs(env, uid), 'projects/p1/tasks/t1')));
      await assertSucceeds(getDocs(listQ(dbAs(env, uid))));
      await assertSucceeds(getDocs(newestQ(dbAs(env, uid))));
    }
  });
  test('お客様は自分の案件でも読めない（社内の作業）', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'client1'), 'projects/p1/tasks/t1')));
    await assertFails(getDocs(listQ(dbAs(env, 'client1'))));
  });
  test('担当外の開発者・他案件のお客様・無効化された人・未ログインは読めない', async () => {
    await assertFails(getDoc(doc(dbAs(env, 'devC'), 'projects/p1/tasks/t1')));
    await assertFails(getDocs(listQ(dbAs(env, 'devC'))));
    await assertFails(getDoc(doc(dbAs(env, 'client2'), 'projects/p1/tasks/t1')));
    await assertFails(getDoc(doc(dbAs(env, 'devOff'), 'projects/p1/tasks/t1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'projects/p1/tasks/t1')));
    await assertFails(getDoc(doc(dbAs(env, 'devA', { email: 'changed@afro.example' }), 'projects/p1/tasks/t1')));
  });
  test('担当を外れると即座に読めなくなる', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'projects/p1'), { memberUids: ['devB'] });
    });
    await assertFails(getDoc(doc(dbAs(env, 'devA'), 'projects/p1/tasks/t1')));
    await assertSucceeds(getDoc(doc(dbAs(env, 'devB'), 'projects/p1/tasks/t1')));
  });
});

describe('tasks: create', () => {
  test('担当の開発者は未着手のタスクを作れる（協力会社の開発者も）', async () => {
    await assertSucceeds(create('devA'));
    await assertSucceeds(create('devB', {}, 'p1', 'new2'));
  });
  test('担当を複数（案件の担当の中から）にできる', async () => {
    await assertSucceeds(create('devA', { assigneeUids: ['devA', 'devB'] }));
  });
  test('自分以外の担当だけでも作れる（案件の担当の中なら）', async () => {
    await assertSucceeds(create('devA', { assigneeUids: ['devB'] }));
  });
  test('上限ちょうど（題名 60・ページ 40・担当 20 人）で作れる（式数・get の上限に当たらない）', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => (i === 0 ? 'devA' : `m${i}`));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'projects/p1'), { memberUids: twenty });
    });
    await assertSucceeds(create('devA', { title: 'あ'.repeat(60), page: 'い'.repeat(40), assigneeUids: twenty }));
  });
  test('前後の空白は数えない（trim 後 1〜60。画面は trim して保存するが、Rules は画面と同じ数え方）', async () => {
    await assertSucceeds(create('devA', { title: `  ${'あ'.repeat(60)}  ` }));
  });

  const deny = (name, uid, over, pid = 'p1') => test(name, async () => { await assertFails(create(uid, over, pid)); });
  deny('admin は作れない（見るだけ）', 'admin1', { assigneeUids: ['devA'] });
  deny('お客様は作れない', 'client1', { assigneeUids: ['devA'] });
  deny('担当外の開発者は作れない', 'devC', {});
  deny('無効化された開発者は作れない', 'devOff', {});
  deny('担当に案件の担当外の uid（devC）を入れる → 拒否', 'devA', { assigneeUids: ['devA', 'devC'] });
  deny('担当にお客様の uid を入れる → 拒否', 'devA', { assigneeUids: ['client1'] });
  deny('担当 0 人 → 拒否', 'devA', { assigneeUids: [] });
  deny('担当の重複 → 拒否', 'devA', { assigneeUids: ['devA', 'devA'] });
  deny('担当が文字列 → 拒否', 'devA', { assigneeUids: 'devA' });
  deny('status を doing で作る → 拒否（未着手固定）', 'devA', { status: 'doing' });
  deny('status を done で作る → 拒否', 'devA', { status: 'done' });
  deny('題名 61 文字 → 拒否', 'devA', { title: 'あ'.repeat(61) });
  deny('題名が空白だけ → 拒否', 'devA', { title: '   ' });
  deny('題名が数値 → 拒否', 'devA', { title: 12 });
  deny('ページ 41 文字 → 拒否', 'devA', { page: 'い'.repeat(41) });
  deny('ページが空 → 拒否', 'devA', { page: '' });
  deny('createdAt を過去日時 → 拒否', 'devA', { createdAt: PAST });
  deny('createdBy を他人 → 拒否', 'devA', { createdBy: 'devB' });
  deny('updatedBy を他人 → 拒否', 'devA', { updatedBy: 'devB' });
  deny('updatedAt を過去日時 → 拒否', 'devA', { updatedAt: PAST });
  deny('未知のキー（assigneeId）→ 拒否', 'devA', { assigneeId: 'devA' });
  deny('schemaVersion が無い → 拒否', 'devA', { schemaVersion: undefined });
  deny('schemaVersion 2 → 拒否', 'devA', { schemaVersion: 2 });
  deny('page が無い → 拒否', 'devA', { page: undefined });
  test('存在しない案件には作れない', async () => {
    await assertFails(create('devA', {}, 'p404'));
  });
  test('既にある ID への set（上書き）は update 扱いで拒否', async () => {
    await assertFails(setDoc(doc(dbAs(env, 'devA'), 'projects/p1/tasks/t1'), newTask('devA')));
  });
});

describe('tasks: update（状態の変更だけ）', () => {
  test('担当の開発者はどの状態へも変えられる（戻すのも可）', async () => {
    for (const s of ['doing', 'review', 'done', 'todo', 'done']) await assertSucceeds(setStatus('devA', s));
  });
  test('タスクの担当でない（案件の担当の）開発者も状態を変えられる', async () => {
    await assertSucceeds(setStatus('devB', 'review'));
  });
  test('admin・お客様・担当外の開発者・無効化された開発者は変えられない', async () => {
    await assertFails(setStatus('admin1', 'done'));
    await assertFails(setStatus('client1', 'done'));
    await assertFails(setStatus('devC', 'done'));
    await assertFails(setStatus('devOff', 'done'));
    await assertFails(setStatus('devA', 'done', {}, 'projects/p2/tasks/t2'));
  });
  test('4 値以外の状態 → 拒否', async () => {
    await assertFails(setStatus('devA', 'archived'));
  });
  test('status 以外（題名・ページ・担当・作成者・作成日時・schemaVersion）を変える → 拒否', async () => {
    await assertFails(setStatus('devA', 'doing', { title: '別の題名' }));
    await assertFails(setStatus('devA', 'doing', { page: '会社概要' }));
    await assertFails(setStatus('devA', 'doing', { assigneeUids: ['devA', 'devB'] }));
    await assertFails(setStatus('devA', 'doing', { createdBy: 'devB' }));
    await assertFails(setStatus('devA', 'doing', { createdAt: serverTimestamp() }));
    await assertFails(setStatus('devA', 'doing', { schemaVersion: 2 }));
  });
  test('updatedAt・updatedBy の偽装 → 拒否', async () => {
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1/tasks/t1'), { status: 'doing', updatedAt: PAST, updatedBy: 'devA' }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1/tasks/t1'), { status: 'doing', updatedAt: serverTimestamp(), updatedBy: 'devB' }));
    await assertFails(updateDoc(doc(dbAs(env, 'devA'), 'projects/p1/tasks/t1'), { status: 'doing' }));
  });
  test('状態の変更に未知のキー（priority）を足す → 拒否（U2 セキュリティレビュー (a)）', async () => {
    await assertFails(setStatus('devA', 'doing', { priority: 'high' }));
    await assertFails(setStatus('devA', 'doing', { assigneeId: 'devA' }));
  });
  test('admin が担当から外した開発者（Rules を通した arrayRemove）は状態を変えられない（U2 セキュリティレビュー (b)）', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, 'admin1'), 'projects/p1'), { memberUids: arrayRemove('devA'), ...stamp('admin1') }));
    await assertFails(setStatus('devA', 'doing'));
    await assertFails(create('devA'));
    await assertSucceeds(setStatus('devB', 'doing'));
  });
  test('担当を外れた後は変えられない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'projects/p1'), { memberUids: ['devB'] });
    });
    await assertFails(setStatus('devA', 'doing'));
  });
});

describe('tasks: delete（誰も消せない。誤登録は完了で閉じる）', () => {
  test('admin・担当の開発者・お客様のどれも削除できない', async () => {
    for (const uid of ['admin1', 'devA', 'devB', 'client1']) {
      await assertFails(deleteDoc(doc(dbAs(env, uid), 'projects/p1/tasks/t1')));
    }
  });
});
