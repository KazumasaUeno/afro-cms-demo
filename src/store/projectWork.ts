import type { AnswerValue, DemoState, ProjectContent, ProjectWork, QualityCheck, RequirementSession, Stage } from '@/types';
import { emptySitemap, sitemapFor } from '@/data/sitemap';
import { QUALITY_ITEMS } from '@/data/quality';
import { daysAgo, hoursAgo } from '@/services/time';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { emptyContent, emptySignage, seedContentFor } from '@/data/projectContent';
import { clientActorName, seedProjects } from '@/data/projects';

/**
 * 案件ごとの制作データ（ヒアリング・要件定義・サイトマップ・デザイン・品質チェック。0.29.0。2026-11-12 ユーザー決定）。
 *
 * 画面は従来どおり state.requirements・sitemap・design・qualityChecks（= 選んでいる案件の分）を読み書きする。
 * 選んでいない案件の分は state.projectWork に置き、案件を切り替えるときに入れ替える（switchWork）。
 * 画面で選んでいる案件と違う案件を表示するときは workView で、その案件の分を差し込んだ state を作って読む。
 * 公開後のデータ（ページ・お知らせ、AI 診断、サイネージ）も同じ方式で案件ごとに持つ（0.30.0。2026-11-13 ユーザー指示。data/projectContent.ts）。
 */

/** 制作データと公開後のデータ（workOf が返す形。公開後のデータは必ずある） */
export type FullWork = ProjectWork & ProjectContent;

/** まだヒアリングしていない案件の要件（受託開発ではアフロが全問を入力する。2026-11-10 決定） */
export const blankRequirements = (projectId: string): RequirementSession => ({
  projectId, answers: {}, competitors: [], status: 'draft', mode: 'afro', answerMeta: {},
});

export const blankWork = (projectId: string): FullWork => ({
  requirements: blankRequirements(projectId),
  sitemap: emptySitemap(),
  design: { selected: null },
  qualityChecks: {},
  ...emptyContent(),
});

/* ---------- 初期データ（各案件の段階より前は入力・承認済み） ---------- */

type Answers = Record<string, AnswerValue>;

/** ヒアリングの回答（架空の顧客。src/data/requirements.ts の質問 id） */
const HEARING: Record<string, Answers> = {
  p8: {
    'q-url': 'https://hanami-ryokan.example.jp',
    'q-purpose': ['問い合わせを増やしたい', 'ブランドを刷新したい', 'スマホ対応したい'],
    'q-issue': '予約サイト経由ばかりで、自社サイトからの直接予約が少ない',
    'q-competitor': ['https://ryokan-sample.example.jp'],
    'q-improve': ['写真・ビジュアル', '問い合わせ導線', 'スマホ表示'],
    'q-keep': '露天風呂と庭の写真は評判が良い',
    'q-target': '記念日に夫婦で訪れる 40〜60 代と、海外からの旅行者',
    'q-strength': '創業 120 年。全室から庭が見え、地元の食材の会席料理',
    'q-market': '客室ごとの写真と料金が一覧で見られる',
    'q-content': '客室・料理・温泉・アクセス・宿泊プラン',
    'q-feature': '予約システムへの導線、英語ページ',
    'q-cv': '来店予約',
    'q-seo': '地域名＋旅館、地域名＋露天風呂付き客室',
    'q-ops': '両方',
    'q-infra': 'サーバー・ドメインとも自社管理',
    'q-schedule': '2026 年 3 月（春の観光シーズン前）',
    'q-other': '季節のお知らせを女将が更新したい',
    'q-dns-owner': 'お客様',
    'q-dns-switch': 'アフロへ移管',
    'q-dns-note': '予約システムを同じドメインで使っている',
  },
  p2: {
    'q-url': 'https://hojo-kensetsu.example.jp',
    'q-purpose': ['採用を強化したい', '問い合わせを増やしたい', 'スマホ対応したい'],
    'q-issue': '施工事例が古いまま更新できず、若手の応募がほとんど来ない',
    'q-competitor': ['https://kenchiku-sample.example.jp'],
    'q-improve': ['スマホ表示', '写真・ビジュアル', '更新のしやすさ'],
    'q-keep': '創業からの施工実績の一覧は評判が良いので残したい',
    'q-target': '地元で働きたい 20〜30 代の施工管理志望者と、地域の法人・個人の施主',
    'q-strength': '創業 52 年。公共工事と住宅の両方を自社施工で手がけている',
    'q-market': '社員インタビューが多く、働く様子が写真で分かる',
    'q-content': '施工事例・会社案内・採用情報・社員インタビュー',
    'q-feature': '採用エントリーフォーム、施工事例の更新',
    'q-cv': '採用応募',
    'q-seo': '地域名＋建設会社、地域名＋施工管理 求人',
    'q-ops': '社内担当者',
    'q-infra': 'レンタルサーバーを自社で契約。ドメインも自社で管理',
    'q-schedule': '2027 年 4 月（新卒採用の広報開始前）',
    'q-other': '現場の写真を社員がスマホから載せられるようにしたい',
    'q-dns-owner': 'お客様',
    'q-dns-switch': 'お客様側で設定変更',
    'q-dns-note': 'メールを同じドメインで使っている',
  },
  p3: {
    'q-url': 'https://hidamari-dental.example.jp',
    'q-purpose': ['問い合わせを増やしたい', 'スマホ対応したい', 'ブランドを刷新したい'],
    'q-issue': 'スマホで診療時間と予約方法が見つけにくく、電話が集中している',
    'q-competitor': ['https://dental-sample.example.jp'],
    'q-improve': ['スマホ表示', '問い合わせ導線', 'ファーストビュー'],
    'q-keep': '院長のあいさつ動画は好評なので残したい',
    'q-target': '近隣に住む子育て世代の家族',
    'q-strength': '小児歯科と矯正を同じ院内で受けられ、土日も診療している',
    'q-market': '予約ボタンが常に表示されていて迷わない',
    'q-content': '診療案内・料金・医師紹介・アクセス・ネット予約',
    'q-feature': 'ネット予約（既存の予約システムへのリンク）',
    'q-cv': '来店予約',
    'q-seo': '地域名＋小児歯科、地域名＋矯正',
    'q-ops': '両方',
    'q-infra': 'サーバー・ドメインとも前の制作会社が管理',
    'q-schedule': '2027 年 1 月（開院 10 周年）',
    'q-other': '休診日のお知らせを受付スタッフが更新したい',
    'q-dns-owner': '制作会社・他社',
    'q-dns-switch': 'アフロへ移管',
    'q-dns-note': '予約システムを reserve のサブドメインで使っている',
  },
  p4: {
    'q-url': 'https://lumiere-bridal.example.jp',
    'q-purpose': ['ブランドを刷新したい', '問い合わせを増やしたい'],
    'q-issue': 'フェアの情報が探しにくく、来館予約が他の式場に流れている',
    'q-competitor': ['https://bridal-sample.example.jp'],
    'q-improve': ['写真・ビジュアル', 'ファーストビュー', '問い合わせ導線'],
    'q-keep': 'チャペルの写真は撮り下ろしで評判が良い',
    'q-target': '結婚式場を探している 20 代後半〜30 代のカップル',
    'q-strength': '一日一組の貸切と、専属シェフのコース料理',
    'q-market': 'フェアの空き状況がカレンダーで見られる',
    'q-content': 'ブライダルフェア・会場紹介・料理・プラン・実例',
    'q-feature': 'フェアの来館予約フォーム、お知らせの予約公開',
    'q-cv': '来店予約',
    'q-seo': '地域名＋結婚式場、地域名＋少人数婚',
    'q-ops': '社内担当者',
    'q-infra': 'サーバーは自社契約。ドメインは自社管理',
    'q-schedule': '2026 年 11 月末（冬のフェア前）',
    'q-other': 'フェアの情報をスタッフが毎週更新したい',
    'q-dns-owner': 'お客様',
    'q-dns-switch': 'アフロへ移管',
    'q-dns-note': '特になし',
  },
  p5: {
    'q-url': 'https://sorano-seiki.example.jp',
    'q-purpose': ['問い合わせを増やしたい', '更新を楽にしたい'],
    'q-issue': '製品情報が PDF ばかりで、検索から問い合わせにつながらない',
    'q-competitor': ['https://seiki-sample.example.jp'],
    'q-improve': ['SEO', '問い合わせ導線', '更新のしやすさ'],
    'q-keep': '加工実績の写真は営業資料にも使っているので残したい',
    'q-target': '精密部品の調達を担当する製造業の購買・設計担当者',
    'q-strength': '±1 ミクロンの精密加工と、試作 1 個からの短納期',
    'q-market': '製品ごとの仕様表がページで読める',
    'q-content': '製品情報・加工事例・設備一覧・会社案内・お問い合わせ',
    'q-feature': '図面を添付できる見積フォーム',
    'q-cv': '問い合わせ',
    'q-seo': '精密加工 試作、金属部品 短納期',
    'q-ops': '社内担当者',
    'q-infra': 'サーバー・ドメインとも自社管理',
    'q-schedule': '2026 年 6 月（展示会の前）',
    'q-other': '新製品の情報を営業担当が更新したい',
    'q-dns-owner': 'お客様',
    'q-dns-switch': 'お客様側で設定変更',
    'q-dns-note': '社内システムを同じドメインで使っている',
  },
  p6: {
    'q-url': 'https://manabiya.example.org',
    'q-purpose': ['問い合わせを増やしたい', '更新を楽にしたい', 'スマホ対応したい'],
    'q-issue': '講座の募集をチラシに頼っていて、若い世代に届いていない',
    'q-competitor': ['https://manabi-sample.example.org'],
    'q-improve': ['スマホ表示', 'ナビゲーション', '更新のしやすさ'],
    'q-keep': '受講者の声のページは残したい',
    'q-target': '地域の学び直しをしたい社会人と、子どもの習い事を探す保護者',
    'q-strength': '地域の専門家が講師で、受講料が手ごろ',
    'q-market': '講座が日付とジャンルで探せる',
    'q-content': '講座一覧・講師紹介・受講者の声・団体概要・寄付',
    'q-feature': '講座の申込フォーム、お知らせの更新',
    'q-cv': '問い合わせ',
    'q-seo': '地域名＋講座、地域名＋習い事',
    'q-ops': '社内担当者',
    'q-infra': 'サーバーはボランティアが管理。ドメインは団体で管理',
    'q-schedule': '2026 年 4 月（新年度の募集開始）',
    'q-other': 'ボランティアのスタッフが交代で更新できるようにしたい',
    'q-dns-owner': 'お客様',
    'q-dns-switch': 'アフロへ移管',
    'q-dns-note': '特になし',
  },
};

/** デザイン要件定義の回答（src/data/designRequirements.ts の質問 id）。制作の段階より先の案件だけ */
const DESIGN: Record<string, Answers> = {
  p8: {
    'q-design-dislike': '写真が古く、旅館の落ち着いた雰囲気が伝わらない',
    'q-image': '静かで上質、また訪れたくなる',
    'q-design-ref': '縦書きと余白を生かした和風のサイト',
    'q-brand': 'ロゴの朱色',
    'q-design-media': '客室・料理・庭は撮り下ろし。季節の動画も使う',
    'q-design-sp': '空室確認と予約までを片手で操作したい',
  },
  p3: {
    'q-design-dislike': '色が多く、子ども向けなのか大人向けなのか分からない',
    'q-image': '清潔で、子ども連れでも気軽に行ける',
    'q-design-ref': '写真が明るく、余白の多い医院のサイト',
    'q-brand': 'ロゴの若草色',
    'q-design-media': '院内と先生の写真は撮り下ろし',
    'q-design-sp': '予約ボタンと電話ボタンを常に下に出したい',
  },
  p4: {
    'q-design-dislike': '写真が小さく、会場の雰囲気が伝わらない',
    'q-image': '上質で、特別な一日を任せられる',
    'q-design-ref': '写真を画面いっぱいに使ったホテルのサイト',
    'q-brand': 'ロゴのローズ色と金',
    'q-design-media': '写真は撮り下ろし。動画も使いたい',
    'q-design-sp': 'フェアの予約まで指一本でたどり着けるようにしたい',
  },
  p5: {
    'q-design-dislike': '古いレイアウトで、技術力が伝わらない',
    'q-image': '確かな技術で、相談しやすい',
    'q-design-ref': '製品写真と数値を大きく見せる製造業のサイト',
    'q-brand': 'コーポレートカラーのスレートグレー',
    'q-design-media': '加工の様子は動画、製品は撮り下ろし写真',
    'q-design-sp': '仕様表をスマホでも横にずらさずに読みたい',
  },
  p6: {
    'q-design-dislike': '文字ばかりで、講座の楽しさが伝わらない',
    'q-image': '温かく、誰でも参加できる',
    'q-design-ref': 'イラストと写真を組み合わせた市民講座のサイト',
    'q-brand': 'ロゴの紫',
    'q-design-media': '講座の写真と手描きのイラスト',
    'q-design-sp': '講座を探して申し込むまでをスマホで完結させたい',
  },
};

const answerMetaOf = (answers: Answers, at: string) =>
  Object.fromEntries(Object.keys(answers).map((id) => [id, { by: 'afro' as const, at }]));

/**
 * 品質チェック。partial は品質管理の途中（A 区分を中心に一部だけ）、そうでなければ全項目をアフロ・お客様の双方が確認済み。
 * clientBy は案件のお客様の担当者（以前は「お客様 担当者」「Lumière Atelier 担当者」の固定。0.30.2）
 */
function qualityChecks(partial: boolean, clientBy: string): Record<string, QualityCheck> {
  const checks: Record<string, QualityCheck> = {};
  QUALITY_ITEMS.forEach((item, i) => {
    if (!partial) {
      // 全ページ構築（運用＝20 日前・改善＝10 日前）の後に確認した日付にする
      checks[item.id] = { afroAt: daysAgo(8 - i * 0.05), afroBy: '藤井 慎', clientAt: daysAgo(6 - i * 0.05), clientBy };
    } else if (item.categoryId === 'qc1' || item.categoryId === 'qc2') {
      checks[item.id] = {
        afroAt: daysAgo(2 - i * 0.05), afroBy: '藤井 慎',
        ...(i % 3 !== 2 ? { clientAt: hoursAgo(20 - i), clientBy } : {}),
      };
    } else if (item.categoryId === 'qc5' && item.priority === 'A') {
      checks[item.id] = { afroAt: hoursAgo(9), afroBy: '黒田 蓮' };
    }
  });
  return checks;
}

const ORDER: Stage[] = ['hearing', 'requirements', 'build', 'quality', 'operation', 'improvement'];

/**
 * 案件の段階に合う制作データ。段階より前の工程は入力・承認済みにする。
 * - requirements: ヒアリング済み・AI 分析済み（要件定義書の承認待ち。サイトマップはまだ無い）
 * - build: 要件定義書を承認済み・サイトマップを作成して承認済み、デザイン要件定義を入力済み（デザイン案の採用待ち）
 * - quality: デザイン採用・全ページ構築まで済み、品質チェックが途中
 * - operation / improvement: 品質チェックまで完了
 * 公開後のデータ（ページ・診断・サイネージ）は段階ではなく案件の id で決める（data/projectContent.ts。0.30.0）
 */
export function seedWorkFor(projectId: string, stage: Stage): FullWork {
  const work: FullWork = { ...blankWork(projectId), ...seedContentFor(projectId) };
  const answers = HEARING[projectId];
  const at = ORDER.indexOf(stage);
  if (!answers || at < 1) return work;
  const heardAt = daysAgo(90 - at * 10);
  work.requirements = {
    ...work.requirements,
    answers,
    competitors: Array.isArray(answers['q-competitor']) ? answers['q-competitor'] : [],
    answerMeta: answerMetaOf(answers, heardAt),
    status: at >= 2 ? 'approved' : 'analyzed',
    analyzedAt: at >= 2 ? daysAgo(80 - at * 10) : hoursAgo(3),
    ...(at >= 2 ? { approvedAt: daysAgo(75 - at * 10) } : {}),
  };
  if (at >= 2) {
    work.sitemap = { ...sitemapFor(projectId), approvedAt: at >= 3 ? daysAgo(70 - at * 10) : daysAgo(1.5) };
    const design = DESIGN[projectId] ?? {};
    work.design = { selected: null, answers: design, answerMeta: answerMetaOf(design, daysAgo(at >= 3 ? 65 - at * 10 : 1)) };
  }
  if (at >= 3) {
    const built = daysAgo(60 - at * 10);
    work.design = { ...work.design, selected: 'premium', approvedAt: daysAgo(62 - at * 10), buildStartedAt: built, buildCompletedAt: built };
    const client = seedProjects().find((p) => p.id === projectId)?.clientName;
    work.qualityChecks = qualityChecks(at === 3, client ? clientActorName(client) : 'お客様 担当者');
  }
  return work;
}

/* ---------- 選んでいる案件の入れ替え ---------- */

// サイネージは読み込み時に必ず入れる（DemoStore の withProjectContent）。無いときの空は念のため
const currentWork = (state: DemoState): FullWork => ({
  requirements: state.requirements, sitemap: state.sitemap, design: state.design, qualityChecks: state.qualityChecks,
  pages: state.pages, diagnoses: state.diagnoses, signage: state.signage ?? emptySignage(),
});

/** 保存した制作データに公開後のデータが無ければ（0.29 までの保存データ）、その案件の初期データで補う。そろっていれば同じものを返す */
export function withContent(projectId: string, work: ProjectWork): FullWork {
  if (work.pages && work.diagnoses && work.signage) return work as FullWork;
  const seed = seedContentFor(projectId);
  return { ...work, pages: work.pages ?? seed.pages, diagnoses: work.diagnoses ?? seed.diagnoses, signage: work.signage ?? seed.signage };
}

/** 案件の制作データと公開後のデータ（保存に無い案件は、その案件の段階に合う初期データ） */
export function workOf(state: DemoState, projectId: string): FullWork {
  if (projectId === state.requirements.projectId) return currentWork(state);
  const saved = state.projectWork?.[projectId];
  if (saved) return withContent(projectId, saved);
  const p = state.projects.find((x) => x.id === projectId);
  return seedWorkFor(projectId, p?.stage ?? 'hearing');
}

/** その案件の制作データを差し込んだ state（読み取り専用。選んでいる案件と違う案件を表示するときに使う） */
export function workView(state: DemoState, projectId: string): DemoState {
  return projectId === state.requirements.projectId ? state : { ...state, ...workOf(state, projectId) };
}

/**
 * 開発者画面の開発データ（構築タスク・デプロイ）は MINAMO COFFEE の分だけなので、デプロイの関門・次の作業は
 * 選んでいる案件ではなく MINAMO COFFEE のトップデザイン承認で判定する（0.29.0）
 */
export const demoDesignApprovedAt = (state: DemoState): string | undefined => workOf(state, CLIENT_PROJECT_ID).design.approvedAt;

/** 選んでいる案件を切り替える。いまの案件の制作データ・公開後のデータを projectWork へしまい、次の案件の分を出す */
export function switchWork(state: DemoState, projectId: string): DemoState {
  const cur = state.requirements.projectId;
  if (projectId === cur) return state;
  const next = workOf(state, projectId);
  const rest = { ...(state.projectWork ?? {}), [cur]: currentWork(state) };
  delete rest[projectId];
  return { ...state, ...next, projectWork: rest };
}
