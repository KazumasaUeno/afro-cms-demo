import { useLocation } from 'react-router-dom';
import { areaOf } from '@/components/layout/nav';

export interface HearingRoutes {
  /** 開発者画面（/dev 配下）で開いているか。管理者だけの操作（代理承認・サイトマップへ進む等）を出し分ける */
  dev: boolean;
  /** 入力の正の画面（AI 分析の前は入力、分析後は要件定義書） */
  input: string;
  /** ヒアリングの回答（AI 分析の後の見直し） */
  answers: string;
}

const ADMIN: HearingRoutes = { dev: false, input: '/ai-studio', answers: '/ai-studio/hearing' };
const DEV: HearingRoutes = { dev: true, input: '/dev/hearing', answers: '/dev/hearing/answers' };

/**
 * ヒアリング・要件定義の画面は、管理者画面（/ai-studio）と開発者画面（/dev/hearing。0.25.0）で同じ部品を使う。
 * 戻り先・行き先をいまのエリアの中に保つ（開発者が管理者画面の URL へ飛ばされて /login へ戻されないように）。
 * 表示の出し分けだけで、セキュリティ境界ではない（担当案件の制限は DevProjectGate、実体はルール）。
 */
export function useHearingRoutes(): HearingRoutes {
  const { pathname } = useLocation();
  return areaOf(pathname) === 'dev' ? DEV : ADMIN;
}
