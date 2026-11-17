import type { DemoState, QualityCheck, Stage } from '@/types';
import { QUALITY_ITEMS } from '@/data/quality';
import { STAGES } from '@/data/projects';
import { designReady } from '@/features/design/designReq';

/** 各段階から開ける関連画面 */
export const STAGE_LINKS: Record<Stage, { label: string; to: string }[]> = {
  // 入力する場所は 1 画面（0.24.0）。/ai-studio/hearing は AI 分析の前なら入力画面（/ai-studio）へ転送し、分析後は回答の見直しを開く
  hearing: [{ label: 'ヒアリングを入力', to: '/ai-studio/hearing' }],
  // 要件定義書の画面（0.28.0）。AI 分析の前は「まだ作成されていません」と入力への入口を出す（入力画面へは飛ばさない）
  requirements: [{ label: 'AI要件定義を開く', to: '/ai-studio/requirements' }],
  // 制作〜公開の日程（2026-11-17 会議。入力は開発者画面。管理者画面は見るだけ）
  schedule: [{ label: 'スケジュール', to: '/schedule' }],
  build: [
    { label: 'サイトマップ', to: '/site' },
    // デザイン要件定義（0.28.0）: サイトマップの承認の後、デザイン案を作る前に聞く
    { label: 'デザイン要件定義', to: '/ai-studio/design/requirements' },
    { label: 'デザインスタジオ', to: '/ai-studio/design' },
  ],
  quality: [{ label: '品質チェック', to: '/quality' }],
  // 公開は開発者画面の品質チェックから行う（2026-11-17 会議でリリースの段階を足した）
  release: [{ label: '品質チェック・公開', to: '/quality' }],
  // 素材ドライブ・フォーム（0.36.0・0.37.0。管理者画面は見るだけ）。[0] は次の作業の行き先に使うので末尾に足す。
  // 運用の段階にだけ置く（改善の段階でも、完了した運用の段階のボタンから開ける。2026-11-17 ユーザー指示「運用と改善で被っている」）
  operation: [{ label: 'CMSで更新', to: '/portal/pages' }, { label: '素材ドライブ', to: '/assets' }, { label: 'フォーム', to: '/forms' }],
  improvement: [{ label: 'インサイト・改善提案', to: '/insights' }],
};

export const stageLabel = (s: Stage): string => STAGES.find((x) => x.id === s)?.label ?? s;

/** アフロ・顧客の両方が確認した項目の割合（0-100） */
export function qualityCompletion(checks: Record<string, QualityCheck>): { done: number; total: number; percent: number } {
  const total = QUALITY_ITEMS.length;
  const done = QUALITY_ITEMS.filter((i) => checks[i.id]?.afroAt && checks[i.id]?.clientAt).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** 作業中プロジェクトで、次に取るべき行動（制作フローの未承認の最初の段階） */
export function nextBestAction(state: DemoState): { title: string; detail: string; to: string; cta: string } {
  const q = qualityCompletion(state.qualityChecks);
  if (state.requirements.status === 'draft') {
    return {
      title: 'ヒアリングを入力して、課題と目的を整理しましょう',
      detail: '回答がそろったら AI が現行サイトを分析し、要件定義書（改善提案書）のたたき台を作ります。',
      to: '/ai-studio', cta: 'ヒアリングを入力する',
    };
  }
  if (state.requirements.status === 'analyzed') {
    return {
      title: '要件定義書ができました。お客様の承認を待っています',
      detail: 'お客様がお客様ポータルで承認すると、サイトマップの作成へ進めます。',
      to: '/ai-studio/requirements', cta: '要件定義書を確認する',
    };
  }
  // 日程を入れるまで制作へ進めない（2026-11-17 会議。後の工程が済んでいる古い保存データは除く）
  if (!state.schedule && !state.sitemap.approvedAt) {
    return {
      title: '制作〜公開のスケジュールを入れましょう',
      detail: '要件定義書が承認されました。開発担当者が制作・納品・公開の予定日を入れると、サイトマップの承認へ進めます。',
      to: STAGE_LINKS.schedule[0].to, cta: 'スケジュールを入力する',
    };
  }
  if (!state.sitemap.approvedAt) {
    return {
      title: '改善後のサイトマップがお客様の承認待ちです',
      detail: '問い合わせまでの階層を3→1に短縮した構成案です。お客様がお客様ポータルで承認します。',
      to: '/site', cta: 'サイトマップを確認',
    };
  }
  if (!state.design.approvedAt && !designReady(state)) {
    return {
      title: 'デザイン要件定義を入力しましょう',
      detail: '必須（A）の質問に答えると、2つのデザイン案を作れます。',
      to: '/ai-studio/design/requirements', cta: 'デザイン要件定義を入力する',
    };
  }
  if (!state.design.approvedAt) {
    return {
      title: 'デザイン案2パターンが揃いました。お客様の採用を待っています',
      detail: '要件定義から生成したミニマル・クリエイティブの2案。お客様がお客様ポータルで採用すると、全ページ構築へ進めます。',
      to: '/ai-studio/design', cta: 'デザイン案を比較する',
    };
  }
  if (q.percent < 100) {
    return {
      title: `品質チェックは残り ${q.total - q.done} 項目です`,
      detail: 'A区分（機械的に確認できる項目）は一括チェックで一気に進められます。',
      to: '/quality', cta: '品質チェックへ',
    };
  }
  // 品質チェックの後は段階で分ける（0.30.0。ページ・診断が案件ごとになったため）。持ち主の案件は requirements.projectId
  const stage = state.projects.find((p) => p.id === state.requirements.projectId)?.stage;
  if (stage === 'operation') {
    const review = state.pages.filter((p) => p.status === 'review').length;
    return {
      title: review ? `お客様の公開承認を待っている更新が ${review} 件あります` : 'ページ・お知らせを更新しましょう',
      // 運用から改善へは最初の AIサイト診断で進む（0.30.1）。まだ診断が無ければその道筋も示す
      detail: `公開後の運用の段階です。お知らせの追加や予約公開で、サイトを新しく保ちます。${state.diagnoses.length === 0 ? '開発者が第1回 AIサイト診断を実行すると、改善の段階へ進みます。' : ''}`,
      to: STAGE_LINKS.operation[0].to, cta: 'CMSで更新',
    };
  }
  if (stage === 'quality' && !state.design.qualityApprovedAt) {
    return {
      title: 'お客様の品質チェックの完了（納品検収）を待っています',
      detail: 'アフロとお客様の双方の確認が済みました。お客様が品質チェックを「完了」にすると、リリース（公開）の段階へ進みます。',
      to: '/quality', cta: '品質チェックを見る',
    };
  }
  if (stage !== 'improvement') {
    return {
      // 公開は開発者画面の品質チェックで行う（0.30.1。管理者画面は見るだけなので、ここからは公開しない）
      title: '品質チェックが完了しました。サイトを公開できます',
      detail: 'アフロとお客様の双方の確認が済みました。開発者がサイトを公開すると運用の段階へ進みます。',
      to: '/quality', cta: '品質チェックを見る',
    };
  }
  // 改善の段階（2026-11-17 会議）: AIサイト診断は公開後4か月ごとに自動で実行するので、「次回の診断を実行できます」は出さない
  // （この関数は管理者画面のホーム・プロジェクト詳細で使う。管理者は見るだけ）。結果と改善提案を見る行き先にする
  return {
    title: '最新のAIサイト診断と改善提案を確認しましょう',
    detail: 'AIサイト診断は公開後4か月ごとに自動で実行されます。診断結果と改善提案はインサイトで確認できます。',
    to: '/insights', cta: 'インサイトを開く',
  };
}
