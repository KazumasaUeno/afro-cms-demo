import type { DemoState } from '@/types';
import type { AreaId } from '@/components/layout/nav';
import { accountByEmail } from '@/data/users';
import { devUsersState, personByEmail } from '@/data/people';
import { normalizeEmail } from '@/data/users';
import { clientAccountsState, devAccessState } from './reducer';

/**
 * エリアごとのログイン可否（ユーザー管理の設定をログイン画面と AreaGuard で照合する）。
 * デモのため見た目の制御だけで、セキュリティ境界ではない（データも判定もすべてこのブラウザ内。本番ではサーバー側で判定する）。
 */

/** ログイン画面で入力されたメールアドレスで、そのエリアに入れるか（管理者画面は従来どおり照合しない） */
export function loginDenial(area: AreaId, email: string, state: DemoState): string | null {
  if (area === 'dev') {
    // 固定のメンバーと、ユーザー管理で登録した開発者（無効にした人は入れない）
    const m = personByEmail(state, email);
    if (m?.disabled) return 'この開発者アカウントは無効になっています。管理者に確認してください';
    return m && devAccessState(state)[m.id] ? null : 'このメールアドレスには開発者画面の権限がありません。管理者に権限の追加を依頼してください';
  }
  if (area === 'portal') {
    const a = accountByEmail(clientAccountsState(state), email);
    return a && a.status !== 'disabled' ? null : 'このメールアドレスはお客様として登録されていないか、無効になっています';
  }
  return null;
}

/**
 * ログイン中のセッションが、あとから権限を外された（無効にされた）か。
 * 0.13.0 より前のセッションや、デモ用に直接作ったセッション（どのメンバー・お客様にも当たらないメール）は、デモを止めないため対象外にする
 */
export function isRevoked(area: AreaId, email: string, state: DemoState): boolean {
  if (area === 'dev') {
    const m = personByEmail(state, email);
    if (m) return m.disabled || !devAccessState(state)[m.id];
    // 管理者がメールアドレスを変えた登録開発者の旧メール（DevUser.previousEmails）でのセッションは失効させる。
    // どの開発者の現在・過去のメールにも当たらないセッション（デモの初期セッションなど）は、従来どおり黒田として通す
    const e = normalizeEmail(email);
    return devUsersState(state).some((u) => u.previousEmails?.includes(e));
  }
  if (area === 'portal') {
    const a = accountByEmail(clientAccountsState(state), email);
    return !!a && a.status === 'disabled';
  }
  return false;
}
