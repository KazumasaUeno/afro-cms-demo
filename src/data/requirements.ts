import type { ProposalPoint, RequirementCategory, RequirementQuestion } from '@/types';

/** 資料「12項目81問」のカテゴリ。questionCount は資料上の問数 */
export const REQUIREMENT_CATEGORIES: RequirementCategory[] = [
  { id: 'rc1', no: 1, title: '現状とリニューアルの目的', questionCount: 8 },
  { id: 'rc2', no: 2, title: '事業・ターゲット', questionCount: 7 },
  { id: 'rc3', no: 3, title: '競合・市場', questionCount: 6 },
  { id: 'rc4', no: 4, title: 'コンテンツ', questionCount: 8 },
  { id: 'rc5', no: 5, title: '機能・システム', questionCount: 7 },
  { id: 'rc6', no: 6, title: '導線・コンバージョン', questionCount: 6 },
  { id: 'rc7', no: 7, title: 'SEO・集客', questionCount: 7 },
  { id: 'rc8', no: 8, title: 'デザイン・ブランド', questionCount: 6 },
  { id: 'rc9', no: 9, title: '運用体制', questionCount: 7 },
  { id: 'rc10', no: 10, title: '技術・インフラ', questionCount: 6 },
  { id: 'rc11', no: 11, title: 'スケジュール・予算', questionCount: 7 },
  { id: 'rc12', no: 12, title: 'その他・要望', questionCount: 6 },
];

export const TOTAL_REQUIREMENT_QUESTIONS = REQUIREMENT_CATEGORIES.reduce((s, c) => s + c.questionCount, 0); // 81

export const PURPOSE_OPTIONS = ['問い合わせを増やしたい', '採用を強化したい', 'ブランドを刷新したい', 'EC売上を伸ばしたい', '更新を楽にしたい', 'スマホ対応したい'];
export const IMPROVE_OPTIONS = ['ファーストビュー', 'ナビゲーション', 'スマホ表示', '表示速度', '問い合わせ導線', '写真・ビジュアル', 'SEO', '更新のしやすさ'];

/**
 * 代表質問。featured=true がウィザードで実際に聞く質問。
 * owner は共同モードの担当（事業・ターゲット・好みはお客様、URL・競合・機能・SEO・インフラはアフロ）。
 * それ以外は「カテゴリ一覧」画面で入力できるサンプル（全81問の一部）。
 */
export const REQUIREMENT_QUESTIONS: RequirementQuestion[] = [
  { id: 'q-url', categoryId: 'rc1', priority: 'A', kind: 'url', text: '現在のホームページのURLを教えてください', placeholder: 'https://example.co.jp', featured: true, owner: 'afro' },
  { id: 'q-purpose', categoryId: 'rc1', priority: 'A', kind: 'multi', text: '今回HPをリニューアルしようと考えたきっかけは何ですか？', options: PURPOSE_OPTIONS, featured: true, owner: 'client' },
  { id: 'q-issue', categoryId: 'rc1', priority: 'A', kind: 'longtext', text: '現在のHPで最も大きな課題は何ですか？', placeholder: '例：スマホで見づらく、問い合わせがほとんど来ない', featured: true, owner: 'client' },
  { id: 'q-competitor', categoryId: 'rc3', priority: 'A', kind: 'url', text: '意識している競合サイトはありますか？', placeholder: 'https://competitor.example.jp', featured: true, owner: 'afro' },
  { id: 'q-improve', categoryId: 'rc1', priority: 'A', kind: 'multi', text: 'リニューアルによって最も改善したいことは何ですか？', options: IMPROVE_OPTIONS, featured: true, owner: 'client' },
  { id: 'q-keep', categoryId: 'rc1', priority: 'B', kind: 'longtext', text: '現在のHPで評価している点・残したい点はありますか？', owner: 'client' },
  { id: 'q-target', categoryId: 'rc2', priority: 'A', kind: 'text', text: '主なターゲットは誰ですか？', owner: 'client' },
  { id: 'q-strength', categoryId: 'rc2', priority: 'A', kind: 'longtext', text: '競合と比べた強み・選ばれる理由は何ですか？', owner: 'client' },
  { id: 'q-market', categoryId: 'rc3', priority: 'B', kind: 'text', text: '競合サイトで良いと感じる点はどこですか？', owner: 'afro' },
  { id: 'q-content', categoryId: 'rc4', priority: 'A', kind: 'text', text: '必ず掲載したいコンテンツは何ですか？', owner: 'client' },
  { id: 'q-feature', categoryId: 'rc5', priority: 'B', kind: 'text', text: '必要な機能（予約・EC・会員など）はありますか？', owner: 'afro' },
  { id: 'q-cv', categoryId: 'rc6', priority: 'A', kind: 'single', text: '最も重要なコンバージョンは何ですか？', options: ['問い合わせ', '資料請求', '来店予約', '購入', '採用応募'], owner: 'client' },
  { id: 'q-seo', categoryId: 'rc7', priority: 'B', kind: 'text', text: '上位表示したいキーワードはありますか？', owner: 'afro' },
  { id: 'q-design-dislike', categoryId: 'rc8', priority: 'A', kind: 'longtext', text: '現在のHPのデザインで不満な点は何ですか？', owner: 'client' },
  { id: 'q-image', categoryId: 'rc8', priority: 'A', kind: 'text', text: 'ユーザーにどのような企業イメージを持ってほしいですか？', owner: 'client' },
  { id: 'q-brand', categoryId: 'rc8', priority: 'B', kind: 'text', text: 'コーポレートカラーやブランドガイドラインはありますか？', owner: 'client' },
  { id: 'q-ops', categoryId: 'rc9', priority: 'A', kind: 'single', text: '公開後の更新は誰が行いますか？', options: ['社内担当者', 'アフロに依頼', '両方'], owner: 'client' },
  { id: 'q-infra', categoryId: 'rc10', priority: 'B', kind: 'text', text: '現在のサーバー・ドメインの管理状況を教えてください', owner: 'afro' },
  { id: 'q-schedule', categoryId: 'rc11', priority: 'A', kind: 'text', text: '公開希望時期はいつですか？', owner: 'client' },
  { id: 'q-other', categoryId: 'rc12', priority: 'B', kind: 'longtext', text: 'その他、ご要望があれば自由にご記入ください', owner: 'client' },
];

/** AI分析（シミュレーション）の工程 */
export const ANALYSIS_STEPS = [
  { key: 'crawl', label: '調査', detail: '現行サイト 24ページを巡回して構造を取得' },
  { key: 'analyze', label: '分析', detail: '競合 2サイトと比較し、導線・表示速度・訴求を評価' },
  { key: 'organize', label: '整理', detail: '課題を 12項目の要件に分類し、優先度をつける' },
  { key: 'propose', label: '提案作成', detail: '改善ポイントと新しいサイト構成をまとめる' },
] as const;

/**
 * 事前に用意した提案（AIの実生成ではない）。
 * 回答内容に応じて並びと文言の一部を差し替える（features/requirements/buildProposal.ts）。
 */
export const PROPOSAL_LIBRARY: ProposalPoint[] = [
  { id: 'pp1', area: 'ファーストビュー', priority: 'high', title: '3秒で事業が伝わるファーストビューへ', detail: 'キャッチコピー・実績数値・主要CTAを1画面に集約し、現在のスライダーを廃止します。', impact: '直帰率 −18% 見込み' },
  { id: 'pp2', area: '問い合わせ導線', priority: 'high', title: '問い合わせまでを最短2クリックに', detail: '全ページ下部と固定ヘッダーに相談ボタンを配置し、フォーム項目を11→5に削減します。', impact: '問い合わせ +35% 見込み' },
  { id: 'pp3', area: 'スマホ表示', priority: 'high', title: 'スマートフォンを主役にした設計', detail: 'アクセスの72%がスマホです。親指で届く位置にナビを置き、文字サイズを16px以上に統一します。', impact: 'スマホCVR +0.8pt 見込み' },
  { id: 'pp4', area: '表示速度', priority: 'medium', title: '表示速度を 4.8秒 → 1.6秒へ', detail: '画像を次世代形式に変換し、遅延読み込みと不要スクリプトの削除を行います。', impact: 'LCP 改善' },
  { id: 'pp5', area: 'ナビゲーション', priority: 'medium', title: '情報を7つの入口に再編', detail: '現在21あるメニューを目的別に統合し、迷わず目的のページへ届く構造にします。', impact: '回遊率 +22% 見込み' },
  { id: 'pp6', area: 'SEO', priority: 'medium', title: '地域×サービスのページを新設', detail: '検索需要の高い「地域名＋サービス名」の専用ページを用意し、構造化データを付与します。', impact: '自然検索 +40% 見込み' },
  { id: 'pp7', area: '写真・ビジュアル', priority: 'low', title: '素材写真を自社の実写へ', detail: 'フリー素材を撮り下ろし写真に置き換え、信頼感と独自性を高めます。', impact: 'ブランド想起の向上' },
  { id: 'pp8', area: '更新のしやすさ', priority: 'low', title: '社内で更新できるCMSへ', detail: 'お知らせ・実績を担当者がブラウザから更新でき、公開前に承認できる運用にします。', impact: '更新頻度 月1→週1' },
];
