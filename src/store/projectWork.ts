import type { AnswerValue, DemoState, ProjectWork, QualityCheck, RequirementSession, Stage } from '@/types';
import { seedSitemap } from '@/data/sitemap';
import { QUALITY_ITEMS } from '@/data/quality';
import { daysAgo, hoursAgo } from '@/services/time';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';

/**
 * 案件ごとの制作データ（ヒアリング・要件定義・サイトマップ・デザイン・品質チェック。0.29.0。2026-11-12 ユーザー決定）。
 *
 * 画面は従来どおり state.requirements・sitemap・design・qualityChecks（= 選んでいる案件の分）を読み書きする。
 * 選んでいない案件の分は state.projectWork に置き、案件を切り替えるときに入れ替える（switchWork）。
 * 画面で選んでいる案件と違う案件を表示するときは workView で、その案件の分を差し込んだ state を作って読む。
 */

/** まだヒアリングしていない案件の要件（受託開発ではアフロが全問を入力する。2026-11-10 決定） */
export const blankRequirements = (projectId: string): RequirementSession => ({
  projectId, answers: {}, competitors: [], status: 'draft', mode: 'afro', answerMeta: {},
});

export const blankWork = (projectId: string): ProjectWork => ({
  requirements: blankRequirements(projectId),
  sitemap: seedSitemap(),
  design: { selected: null },
  qualityChecks: {},
});

/* ---------- 初期データ（各案件の段階より前は入力・承認済み） ---------- */

type Answers = Record<string, AnswerValue>;

/** ヒアリングの回答（架空の顧客。src/data/requirements.ts の質問 id） */
const HEARING: Record<string, Answers> = {
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

/** 品質チェック。partial は品質管理の途中（A 区分を中心に一部だけ）、そうでなければ全項目をアフロ・お客様の双方が確認済み */
function qualityChecks(partial: boolean): Record<string, QualityCheck> {
  const checks: Record<string, QualityCheck> = {};
  QUALITY_ITEMS.forEach((item, i) => {
    if (!partial) {
      checks[item.id] = { afroAt: daysAgo(40 - i * 0.1), afroBy: '藤井 慎', clientAt: daysAgo(38 - i * 0.1), clientBy: 'お客様 担当者' };
    } else if (item.categoryId === 'qc1' || item.categoryId === 'qc2') {
      checks[item.id] = {
        afroAt: daysAgo(2 - i * 0.05), afroBy: '藤井 慎',
        ...(i % 3 !== 2 ? { clientAt: hoursAgo(20 - i), clientBy: 'Lumière Atelier 担当者' } : {}),
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
 * - requirements: ヒアリング済み・AI 分析済み（要件定義書の承認待ち）
 * - build: 要件定義書・サイトマップを承認済み、デザイン要件定義を入力済み（デザイン案の採用待ち）
 * - quality: デザイン採用・全ページ構築まで済み、品質チェックが途中
 * - operation / improvement: 品質チェックまで完了
 */
export function seedWorkFor(projectId: string, stage: Stage): ProjectWork {
  const work = blankWork(projectId);
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
    work.sitemap = { ...work.sitemap, approvedAt: at >= 3 ? daysAgo(70 - at * 10) : daysAgo(1.5) };
    const design = DESIGN[projectId] ?? {};
    work.design = { selected: null, answers: design, answerMeta: answerMetaOf(design, daysAgo(at >= 3 ? 65 - at * 10 : 1)) };
  }
  if (at >= 3) {
    const built = daysAgo(60 - at * 10);
    work.design = { ...work.design, selected: 'premium', approvedAt: daysAgo(62 - at * 10), buildStartedAt: built, buildCompletedAt: built };
    work.qualityChecks = qualityChecks(at === 3);
  }
  return work;
}

/* ---------- 選んでいる案件の入れ替え ---------- */

const currentWork = (state: DemoState): ProjectWork => ({
  requirements: state.requirements, sitemap: state.sitemap, design: state.design, qualityChecks: state.qualityChecks,
});

/** 案件の制作データ（保存に無い案件は、その案件の段階に合う初期データ） */
export function workOf(state: DemoState, projectId: string): ProjectWork {
  if (projectId === state.requirements.projectId) return currentWork(state);
  const saved = state.projectWork?.[projectId];
  if (saved) return saved;
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

/** 選んでいる案件を切り替える。いまの案件の制作データを projectWork へしまい、次の案件の分を出す */
export function switchWork(state: DemoState, projectId: string): DemoState {
  const cur = state.requirements.projectId;
  if (projectId === cur) return state;
  const next = workOf(state, projectId);
  const rest = { ...(state.projectWork ?? {}), [cur]: currentWork(state) };
  delete rest[projectId];
  return { ...state, ...next, projectWork: rest };
}
