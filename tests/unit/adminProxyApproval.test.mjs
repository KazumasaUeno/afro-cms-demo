// 管理者の代理承認（docs/design/ADMIN_FULL_RIGHTS_PLAN.md L-2・L-4・§7-2・§7-5）の純粋関数: 理由の整え方と検査、承認の履歴の表示。
// 権限の検査は tests/rules/（エミュレータ。Unit A）。ここは Rules に送る前の検査と、履歴に「代理」と出す変換
// 実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProxyNote, PROXY_NOTE_MAX, proxyNoteLength, proxyVersionOk, validateProxyNote } from '../../src/live/proxyApproval.ts';
import { approvalLogFrom, approvalLogsFrom, proxyApprovalText } from '../../src/live/model.ts';

const ts = (iso) => ({ toDate: () => new Date(iso) });

test('cleanProxyNote: 向きの制御（U+202A〜202E・U+2066〜2069）と C0 制御文字・DEL を除き、改行・タブは空白にして trim する', () => {
  assert.equal(cleanProxyNote('  打ち合わせで承認  '), '打ち合わせで承認');
  assert.equal(cleanProxyNote('a\u202Eb\u202Ac\u2066d\u2069e'), 'abcde');
  assert.equal(cleanProxyNote('a\u0000b\u0007c\u001Fd\u007Fe'), 'abcde');
  assert.equal(cleanProxyNote('1行目\n2行目\r\n3行目\r4\t5'), '1行目 2行目 3行目 4 5');
  // 残る文字に制御文字・向きの制御が無い（Rules の拒否の正規表現と同じ範囲）
  const all = Array.from({ length: 0x20 }, (_, i) => String.fromCharCode(i)).join('') + '\u007F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069';
  assert.equal(cleanProxyNote(`x${all}y`), 'x   y'); // タブ・LF・CR がそれぞれ空白になる
  assert.doesNotMatch(cleanProxyNote(`x${all}y`), /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/);
});

test('validateProxyNote: trim 後 1〜200 字（コードポイントで数える）・空・制御文字だけは拒否', () => {
  assert.equal(PROXY_NOTE_MAX, 200);
  assert.match(validateProxyNote(cleanProxyNote('')), /理由を入力/);
  assert.match(validateProxyNote(cleanProxyNote('   \n\t\u202E ')), /理由を入力/);
  assert.equal(validateProxyNote('あ'), null);
  assert.equal(validateProxyNote('あ'.repeat(200)), null);
  assert.match(validateProxyNote('あ'.repeat(201)), /200文字以内/);
  // サロゲートペアは 1 字（Rules の . と同じ）
  assert.equal(proxyNoteLength('😀'.repeat(200)), 200);
  assert.equal(validateProxyNote('😀'.repeat(200)), null);
});

const submit = (over = {}) => ({
  schemaVersion: 1, kind: 'requirements', action: 'submit', revision: 2, side: 'afro', actorUid: 'admin1', actorName: '管理 太郎', actorEmail: 'a@x', actorRole: 'admin', at: ts('2026-11-26T01:00:00.000Z'), ...over,
});
const proxyApprove = (over = {}) => ({
  schemaVersion: 1, kind: 'requirements', action: 'approve', revision: 2, side: 'afro', proxy: true, note: '打ち合わせで口頭の承認', actorRole: 'admin',
  actorUid: 'admin1', actorName: '管理 太郎', actorEmail: 'a@x', at: ts('2026-11-26T02:00:00.000Z'), ...over,
});

test('approvalLogFrom: 代理承認は「アフロ（名前）が代理で承認」・side afro・理由つき。名前は記録の actorName（uid から引かない）', () => {
  const l = approvalLogFrom('p1', 'requirements-r2-approve', proxyApprove());
  assert.equal(l.action, 'アフロ（管理 太郎）が代理で承認');
  assert.equal(l.action, proxyApprovalText('管理 太郎'));
  assert.equal(l.side, 'afro');
  assert.equal(l.actor, '管理 太郎');
  assert.equal(l.target, '要件定義（第2版）');
  assert.equal(l.at, '2026-11-26T02:00:00.000Z');
  assert.deepEqual(l.proxy, { note: '打ち合わせで口頭の承認', sameAsRequester: false });
  // 画面の型に uid を出さない
  assert.equal(JSON.stringify(l).includes('admin1'), false);
  // 名前が空なら「管理者」
  assert.equal(approvalLogFrom('p1', 'x', proxyApprove({ actorName: '' })).action, 'アフロ（管理者）が代理で承認');
});

test('approvalLogFrom: 本人の承認・依頼・差し戻しは従来どおり（proxy を持たない）。approve 以外の proxy は無視', () => {
  const own = approvalLogFrom('p1', 'requirements-r2-approve', { action: 'approve', revision: 2, side: 'client', actorName: '顧客 花子', at: ts('2026-11-26T02:00:00.000Z') });
  assert.equal(own.action, '要件定義書を承認');
  assert.equal(own.side, 'client');
  assert.equal('proxy' in own, false);
  assert.equal(approvalLogFrom('p1', 's', submit()).action, '要件定義書の確認を依頼');
  assert.equal(approvalLogFrom('p1', 'w', { action: 'withdraw', revision: 2, side: 'afro', actorName: 'x', proxy: true }).action, '確認依頼を差し戻し');
  assert.equal('proxy' in approvalLogFrom('p1', 'w', { action: 'withdraw', revision: 2, side: 'afro', proxy: true }), false);
  // side:'client' と proxy:true が同時にあっても代理として afro に数える（本人の行動と数えない）
  assert.equal(approvalLogFrom('p1', 'x', proxyApprove({ side: 'client' })).side, 'afro');
});

test('approvalLogsFrom: 同じ版の依頼（submit）と同じ uid の代理承認は sameAsRequester。別の人・別の版・依頼なしは false', () => {
  const same = approvalLogsFrom('p1', [
    { id: 'requirements-r2-approve', data: proxyApprove() },
    { id: 'requirements-r2-submit', data: submit() },
  ]);
  assert.deepEqual(same.map((l) => l.id), ['requirements-r2-approve', 'requirements-r2-submit']);
  assert.equal(same[0].proxy.sameAsRequester, true);
  assert.equal('proxy' in same[1], false);
  const other = approvalLogsFrom('p1', [{ id: 'a', data: proxyApprove() }, { id: 's', data: submit({ actorUid: 'dev1', actorRole: 'developer' }) }]);
  assert.equal(other[0].proxy.sameAsRequester, false);
  const oldRev = approvalLogsFrom('p1', [{ id: 'a', data: proxyApprove() }, { id: 's', data: submit({ revision: 1 }) }]);
  assert.equal(oldRev[0].proxy.sameAsRequester, false);
  assert.equal(approvalLogsFrom('p1', [{ id: 'a', data: proxyApprove() }])[0].proxy.sameAsRequester, false);
});

test('proxyVersionOk: ダイアログを開いた時点の確認依頼の日時と一致するときだけ承認できる（Codex P2）', () => {
  assert.equal(proxyVersionOk('2026-11-26T01:00:00.000Z', '2026-11-26T01:00:00.000Z'), true);
  assert.equal(proxyVersionOk('2026-11-26T01:00:00.000Z', '2026-11-26T02:00:00.000Z'), false); // 差し戻し→再提出
  assert.equal(proxyVersionOk('', ''), false);
  assert.equal(proxyVersionOk(undefined, '2026-11-26T01:00:00.000Z'), false);
});
