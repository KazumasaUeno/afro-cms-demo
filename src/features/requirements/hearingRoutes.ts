import { useLocation } from 'react-router-dom';
import { areaOf } from '@/components/layout/nav';

export interface HearingRoutes {
  /** 開発者画面（/dev 配下）で開いているか。管理者だけの操作（サイトマップへ進む等。承認はお客様ポータルだけ）を出し分ける */
  dev: boolean;
  /** 入力の正の画面（AI 分析の前は入力、分析後は要件定義書） */
  input: string;
  /** ヒアリングの回答（AI 分析の後の見直し） */
  answers: string;
  /** 要件定義の画面。demo は要件定義書の画面（0.28.0。AI 分析の前は「まだ作成されていません」、分析後は要件定義書）、
   *  live は AI 下書きの要件定義の画面（0.49.1。LiveRequirementsPage。ヒアリングの「要件定義へ進む」の行き先） */
  doc: string;
  /** その案件のプロジェクト詳細（改善提案の「プロジェクトに戻る」。0.38.0。live の router にもある） */
  project: (projectId: string) => string;
}

const ADMIN: HearingRoutes = { dev: false, input: '/ai-studio', answers: '/ai-studio/hearing', doc: '/ai-studio/requirements', project: (id) => `/projects/${id}` };
const DEV: HearingRoutes = { dev: true, input: '/dev/hearing', answers: '/dev/hearing/answers', doc: '/dev/requirements', project: (id) => `/dev/projects/${id}` };

/**
 * ヒアリング・要件定義の画面は、管理者画面（/ai-studio）と開発者画面（/dev/hearing。0.25.0）で同じ部品を使う。
 * 戻り先・行き先をいまのエリアの中に保つ（開発者が管理者画面の URL へ飛ばされて /login へ戻されないように）。
 * 表示の出し分けだけで、セキュリティ境界ではない（担当案件の制限は DevProjectGate、実体はルール）。
 */
export function useHearingRoutes(): HearingRoutes {
  const { pathname } = useLocation();
  return areaOf(pathname) === 'dev' ? DEV : ADMIN;
}
