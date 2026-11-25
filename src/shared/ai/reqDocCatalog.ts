/**
 * 要件定義書の会社標準ひな型（TPL-WEB-REQ）の項目カタログ（docs/design/REQUIREMENTS_DOC_TEMPLATE.md §1・§2）。
 *
 * - 正はこのファイル 1 か所。scripts/gen-ai-shared.mjs が functions/src/ai/shared/ へ写す（手で写さない）
 * - 原本は docs/reference/WEBサイト構築_要件定義書ひな型_v0.1.docx、本文の抜き出しは docs/reference/requirements-template-v0.1.extracted.txt。
 *   カタログは抜き出した本文から手で起こし、tests/unit/reqDocCatalog.test.mjs が本文と照合する（章・項目名・区分・確認対象・件数）
 * - **版ごとに持つ**。保存した提案は作った時の版（template.version）のカタログで描く。版を上げるときは新しい版のキーを足し、古い版は消さない
 * - 項目 id は 't{章番号}-{章内の連番}'。**一度付けた id は変えない**（版が変わって消えた項目は欠番にする）
 * - ひな型の 09・13・20 章は欠番（ひな型どおり。中身は作らない＝Q-2）。16 章には章末の特記欄が無い（hasNotes: false）。
 *   23 章「標準仕様の管理・最終承認」は項目が無い（表紙と承認欄で扱う）のでカタログに載せない
 * - fill: 誰が下書きするか（§2）。ai＝AI が回答・診断から／server＝サーバーが選択式の回答・案件の欄を決まった形で転記（自由記述は転記しない）／
 *   human＝材料が無く担当開発者が書く／standard＝固定。アフロの標準仕様が決まるまで「確認中」で、AI は書かない（Q-1）
 * - feeds: 材料のキー。'q-*'＝ヒアリングの質問 ID（src/data/requirements.ts）／基本チェックのキー（AI_SITE_CHECK_KEYS）／
 *   'site_text'＝現行トップページの本文／'project:*'＝案件の欄／'schedule:*'＝日程（ProjectSchedule。要件定義の承認後に入る）／
 *   'derived:openItems'＝「未確定」の項目の一覧（サーバーが集める）。
 *   fill が ai の項目の質問 ID は AI_SENT_QUESTION_IDS の中だけ（q-infra・q-dns-* は AI へ送らない）
 */
import type { AiSiteCheckKey, ReqDocFill, ReqDocKubun } from '../../types/aiDraft';

export const REQ_DOC_TEMPLATE = { id: 'TPL-WEB-REQ', version: '0.1', date: '2026-11-24' } as const;

export type ReqDocFeed =
  | `q-${string}`
  | AiSiteCheckKey
  | 'site_text'
  | 'project:siteName'
  | 'project:clientName'
  | 'schedule:releaseDate'
  | 'schedule:deliveryDate'
  | 'schedule:buildDue'
  | 'derived:openItems';

export interface ReqDocCatalogChapter {
  /** 'c01' 形式 */
  id: string;
  /** ひな型の章番号（'01'。欠番あり） */
  no: string;
  title: string;
  /** 章末の「特記事項・対象外・追加費用・承認状況」の欄があるか（16 章だけ false） */
  hasNotes: boolean;
}

export interface ReqDocCatalogItem {
  /** 't01-01' 形式（変えない） */
  id: string;
  chapterId: string;
  label: string;
  kubun: ReqDocKubun;
  /** 確認対象（ひな型の本文のまま） */
  target: string;
  fill: ReqDocFill;
  feeds: ReqDocFeed[];
}

export interface ReqDocCatalog {
  chapters: ReqDocCatalogChapter[];
  items: ReqDocCatalogItem[];
}

export const REQ_DOC_CATALOG: Record<string, ReqDocCatalog> = {
  '0.1': {
    chapters: [
      { id: 'c01', no: '01', title: 'プロジェクト概要・体制', hasNotes: true },
      { id: 'c02', no: '02', title: '業務スコープ', hasNotes: true },
      { id: 'c03', no: '03', title: 'サイト基本要件', hasNotes: true },
      { id: 'c04', no: '04', title: 'サイトマップ・ページ一覧', hasNotes: true },
      { id: 'c05', no: '05', title: 'デザイン要件', hasNotes: true },
      { id: 'c06', no: '06', title: 'コンテンツ要件', hasNotes: true },
      { id: 'c07', no: '07', title: '機能要件', hasNotes: true },
      { id: 'c08', no: '08', title: 'CMS要件', hasNotes: true },
      { id: 'c10', no: '10', title: 'SEO・アクセス解析', hasNotes: true },
      { id: 'c11', no: '11', title: 'インフラ・ホスティング', hasNotes: true },
      { id: 'c12', no: '12', title: 'ドメイン・ネットワーク', hasNotes: true },
      { id: 'c14', no: '14', title: 'セキュリティ要件', hasNotes: true },
      { id: 'c15', no: '15', title: 'バックアップ・災害復旧', hasNotes: true },
      { id: 'c16', no: '16', title: '運用・保守要件', hasNotes: false },
      { id: 'c17', no: '17', title: 'テスト・検収要件', hasNotes: true },
      { id: 'c18', no: '18', title: '移行・リリース要件', hasNotes: true },
      { id: 'c19', no: '19', title: 'スケジュール管理', hasNotes: true },
      { id: 'c21', no: '21', title: '責任分界表', hasNotes: true },
      { id: 'c22', no: '22', title: '未決事項・課題管理', hasNotes: true },
    ],
    items: [
      // 01 プロジェクト概要・体制
      { id: 't01-01', chapterId: 'c01', label: '案件名', kubun: 'individual', target: '正式名称', fill: 'server', feeds: ['project:siteName'] },
      { id: 't01-02', chapterId: 'c01', label: '顧客名', kubun: 'individual', target: '法人名', fill: 'server', feeds: ['project:clientName'] },
      { id: 't01-03', chapterId: 'c01', label: '背景・課題', kubun: 'individual', target: '現状の課題', fill: 'ai', feeds: ['q-issue', 'q-purpose', 'q-keep'] },
      { id: 't01-04', chapterId: 'c01', label: '目的・KPI', kubun: 'individual', target: '目標値と測定方法', fill: 'ai', feeds: ['q-purpose', 'q-improve', 'q-cv'] },
      { id: 't01-05', chapterId: 'c01', label: '責任者', kubun: 'individual', target: '双方の責任者', fill: 'human', feeds: [] },
      { id: 't01-06', chapterId: 'c01', label: '承認者', kubun: 'individual', target: '最終承認者', fill: 'human', feeds: [] },
      { id: 't01-07', chapterId: 'c01', label: '連絡体制', kubun: 'individual', target: '連絡手段と頻度', fill: 'human', feeds: [] },
      // 02 業務スコープ
      { id: 't02-01', chapterId: 'c02', label: '構築区分', kubun: 'individual', target: '新規／改修', fill: 'ai', feeds: ['q-url'] },
      { id: 't02-02', chapterId: 'c02', label: '受託範囲', kubun: 'individual', target: '設計・制作・開発・公開', fill: 'human', feeds: [] },
      { id: 't02-03', chapterId: 'c02', label: '対象外', kubun: 'individual', target: '明示する除外事項', fill: 'human', feeds: [] },
      { id: 't02-04', chapterId: 'c02', label: '成果物', kubun: 'individual', target: '納品物と形式', fill: 'human', feeds: [] },
      { id: 't02-05', chapterId: 'c02', label: '変更管理', kubun: 'individual', target: '追加見積と承認方法', fill: 'human', feeds: [] },
      // 03 サイト基本要件
      { id: 't03-01', chapterId: 'c03', label: 'サイト種別', kubun: 'individual', target: '企業／サービス／採用／その他', fill: 'ai', feeds: ['q-purpose', 'q-cv', 'q-content'] },
      { id: 't03-02', chapterId: 'c03', label: 'ターゲット', kubun: 'individual', target: '属性・地域', fill: 'ai', feeds: ['q-target'] },
      { id: 't03-03', chapterId: 'c03', label: '対応言語', kubun: 'individual', target: '日本語／多言語', fill: 'ai', feeds: ['q-other'] },
      { id: 't03-04', chapterId: 'c03', label: '想定アクセス', kubun: 'individual', target: '月間PV・ピーク', fill: 'human', feeds: [] },
      { id: 't03-05', chapterId: 'c03', label: '参考サイト', kubun: 'individual', target: 'URLと参考箇所', fill: 'ai', feeds: ['q-competitor', 'q-market'] },
      // 04 サイトマップ・ページ一覧
      { id: 't04-01', chapterId: 'c04', label: 'サイトマップ', kubun: 'individual', target: '階層構造', fill: 'ai', feeds: ['q-content', 'site_text'] },
      { id: 't04-02', chapterId: 'c04', label: 'ページ一覧', kubun: 'individual', target: '名称・URL・テンプレート', fill: 'ai', feeds: ['q-content', 'site_text'] },
      { id: 't04-03', chapterId: 'c04', label: 'ページ数', kubun: 'individual', target: '新規・移行別', fill: 'human', feeds: [] },
      { id: 't04-04', chapterId: 'c04', label: '画面遷移', kubun: 'individual', target: '主要導線', fill: 'ai', feeds: ['q-cv', 'q-improve'] },
      { id: 't04-05', chapterId: 'c04', label: '共通部品', kubun: 'individual', target: 'ヘッダー・フッター', fill: 'ai', feeds: ['q-content', 'site_text'] },
      // 05 デザイン要件
      { id: 't05-01', chapterId: 'c05', label: 'ブランド', kubun: 'individual', target: 'ロゴ・ガイドライン', fill: 'human', feeds: [] },
      { id: 't05-02', chapterId: 'c05', label: '配色', kubun: 'individual', target: '指定色', fill: 'human', feeds: [] },
      { id: 't05-03', chapterId: 'c05', label: 'フォント', kubun: 'individual', target: '指定とライセンス', fill: 'human', feeds: [] },
      { id: 't05-04', chapterId: 'c05', label: 'UI/UX', kubun: 'individual', target: '導線と操作性', fill: 'ai', feeds: ['q-issue', 'q-improve'] },
      { id: 't05-05', chapterId: 'c05', label: 'レスポンシブ', kubun: 'individual', target: '対象画面幅', fill: 'ai', feeds: ['q-improve', 'viewport'] },
      { id: 't05-06', chapterId: 'c05', label: 'アクセシビリティ', kubun: 'individual', target: '目標基準', fill: 'ai', feeds: ['alt-missing'] },
      { id: 't05-07', chapterId: 'c05', label: 'デザイン承認', kubun: 'individual', target: '確認回数', fill: 'human', feeds: [] },
      // 06 コンテンツ要件
      { id: 't06-01', chapterId: 'c06', label: '原稿', kubun: 'individual', target: '提供者と期限', fill: 'human', feeds: [] },
      { id: 't06-02', chapterId: 'c06', label: '画像・動画', kubun: 'individual', target: '提供者と形式', fill: 'ai', feeds: ['q-keep'] },
      { id: 't06-03', chapterId: 'c06', label: '翻訳', kubun: 'individual', target: '対象言語と担当', fill: 'human', feeds: [] },
      { id: 't06-04', chapterId: 'c06', label: '著作権', kubun: 'individual', target: '素材利用許諾', fill: 'human', feeds: [] },
      { id: 't06-05', chapterId: 'c06', label: '移行', kubun: 'individual', target: '対象と件数', fill: 'ai', feeds: ['q-keep', 'q-content'] },
      { id: 't06-06', chapterId: 'c06', label: '法定表示', kubun: 'individual', target: 'プライバシー等', fill: 'ai', feeds: ['q-cv', 'q-feature'] },
      // 07 機能要件
      { id: 't07-01', chapterId: 'c07', label: '問い合わせ', kubun: 'optional', target: '項目・宛先・自動返信・迷惑対策', fill: 'ai', feeds: ['q-cv', 'q-feature'] },
      { id: 't07-02', chapterId: 'c07', label: '検索', kubun: 'optional', target: '検索対象', fill: 'ai', feeds: ['q-feature', 'q-other'] },
      { id: 't07-03', chapterId: 'c07', label: '会員登録', kubun: 'optional', target: '登録項目', fill: 'ai', feeds: ['q-feature', 'q-other'] },
      { id: 't07-04', chapterId: 'c07', label: 'ログイン', kubun: 'optional', target: '認証方式', fill: 'ai', feeds: ['q-feature', 'q-other'] },
      { id: 't07-05', chapterId: 'c07', label: '予約', kubun: 'optional', target: '枠・通知', fill: 'ai', feeds: ['q-cv', 'q-feature'] },
      { id: 't07-06', chapterId: 'c07', label: '決済', kubun: 'optional', target: '方式・返金', fill: 'ai', feeds: ['q-cv', 'q-purpose', 'q-feature'] },
      { id: 't07-07', chapterId: 'c07', label: '通知', kubun: 'optional', target: '送信条件', fill: 'ai', feeds: ['q-feature', 'q-other'] },
      { id: 't07-08', chapterId: 'c07', label: '多言語', kubun: 'optional', target: '切替方式', fill: 'ai', feeds: ['q-feature', 'q-other'] },
      { id: 't07-09', chapterId: 'c07', label: 'Cookie同意', kubun: 'optional', target: '対象と方式', fill: 'human', feeds: [] },
      // 08 CMS要件
      { id: 't08-01', chapterId: 'c08', label: 'CMS種別', kubun: 'optional', target: '製品・バージョン', fill: 'ai', feeds: ['q-ops', 'q-purpose', 'q-improve', 'q-content'] },
      { id: 't08-02', chapterId: 'c08', label: '更新範囲', kubun: 'optional', target: 'ページ・記事・画像', fill: 'ai', feeds: ['q-ops', 'q-purpose', 'q-improve', 'q-content'] },
      { id: 't08-03', chapterId: 'c08', label: '権限', kubun: 'optional', target: '管理者・編集者', fill: 'ai', feeds: ['q-ops', 'q-other'] },
      { id: 't08-04', chapterId: 'c08', label: '承認フロー', kubun: 'optional', target: '公開承認', fill: 'ai', feeds: ['q-ops', 'q-other'] },
      { id: 't08-05', chapterId: 'c08', label: '操作履歴', kubun: 'optional', target: '記録範囲', fill: 'human', feeds: [] },
      { id: 't08-06', chapterId: 'c08', label: 'プレビュー', kubun: 'optional', target: '公開前確認', fill: 'human', feeds: [] },
      { id: 't08-07', chapterId: 'c08', label: '公開予約', kubun: 'optional', target: '日時指定', fill: 'human', feeds: [] },
      // 10 SEO・アクセス解析
      { id: 't10-01', chapterId: 'c10', label: 'メタ情報', kubun: 'optional', target: 'title・description', fill: 'ai', feeds: ['title-length', 'description', 'q-seo'] },
      { id: 't10-02', chapterId: 'c10', label: '構造化データ', kubun: 'optional', target: '対象ページ', fill: 'ai', feeds: ['structured-data'] },
      { id: 't10-03', chapterId: 'c10', label: 'XMLサイトマップ', kubun: 'optional', target: '生成方法', fill: 'ai', feeds: ['sitemap'] },
      { id: 't10-04', chapterId: 'c10', label: 'robots.txt', kubun: 'optional', target: '制御', fill: 'human', feeds: [] },
      { id: 't10-05', chapterId: 'c10', label: 'リダイレクト', kubun: 'optional', target: '旧URL対応', fill: 'ai', feeds: ['q-url'] },
      { id: 't10-06', chapterId: 'c10', label: 'GA4', kubun: 'optional', target: 'アカウント・イベント', fill: 'human', feeds: [] },
      { id: 't10-07', chapterId: 'c10', label: 'Search Console', kubun: 'optional', target: '所有権', fill: 'human', feeds: [] },
      // 11 インフラ・ホスティング
      { id: 't11-01', chapterId: 'c11', label: 'ホスティング方式', kubun: 'fixed', target: '提供事業者・プラン', fill: 'standard', feeds: [] },
      { id: 't11-02', chapterId: 'c11', label: '構成', kubun: 'fixed', target: 'WEB・DB・ストレージ・CDN', fill: 'standard', feeds: [] },
      { id: 't11-03', chapterId: 'c11', label: 'スペック', kubun: 'fixed', target: 'CPU・RAM・容量・転送量', fill: 'standard', feeds: [] },
      { id: 't11-04', chapterId: 'c11', label: 'ソフトウェア', kubun: 'fixed', target: 'OS・言語・DB', fill: 'standard', feeds: [] },
      { id: 't11-05', chapterId: 'c11', label: '環境', kubun: 'fixed', target: '開発・検証・本番', fill: 'standard', feeds: [] },
      { id: 't11-06', chapterId: 'c11', label: '設置場所', kubun: 'fixed', target: 'リージョン', fill: 'standard', feeds: [] },
      { id: 't11-07', chapterId: 'c11', label: '契約管理', kubun: 'fixed', target: '名義・権限', fill: 'standard', feeds: [] },
      { id: 't11-08', chapterId: 'c11', label: '拡張性', kubun: 'fixed', target: '容量超過時の対応', fill: 'standard', feeds: [] },
      // 12 ドメイン・ネットワーク
      { id: 't12-01', chapterId: 'c12', label: 'ドメイン', kubun: 'individual', target: '取得・所有者', fill: 'server', feeds: ['q-dns-owner'] },
      { id: 't12-02', chapterId: 'c12', label: 'DNS', kubun: 'individual', target: '管理者・移管', fill: 'server', feeds: ['q-dns-owner', 'q-dns-switch'] },
      { id: 't12-03', chapterId: 'c12', label: 'SSL/TLS', kubun: 'fixed', target: '証明書・更新', fill: 'standard', feeds: [] },
      { id: 't12-04', chapterId: 'c12', label: 'メール', kubun: 'fixed', target: '提供有無・容量', fill: 'standard', feeds: [] },
      { id: 't12-05', chapterId: 'c12', label: 'メール認証', kubun: 'fixed', target: 'SPF・DKIM・DMARC', fill: 'standard', feeds: [] },
      { id: 't12-06', chapterId: 'c12', label: 'ネットワーク', kubun: 'fixed', target: 'IP制限・通信制御', fill: 'standard', feeds: [] },
      // 14 セキュリティ要件
      { id: 't14-01', chapterId: 'c14', label: 'アクセス管理', kubun: 'fixed', target: 'ID・MFA・権限', fill: 'standard', feeds: [] },
      { id: 't14-02', chapterId: 'c14', label: '通信保護', kubun: 'fixed', target: 'HTTPS・TLS', fill: 'standard', feeds: [] },
      { id: 't14-03', chapterId: 'c14', label: '攻撃対策', kubun: 'fixed', target: 'WAF・DDoS', fill: 'standard', feeds: [] },
      { id: 't14-04', chapterId: 'c14', label: '脆弱性管理', kubun: 'fixed', target: '更新・診断', fill: 'standard', feeds: [] },
      { id: 't14-05', chapterId: 'c14', label: 'データ保護', kubun: 'fixed', target: '暗号化・保存期間', fill: 'standard', feeds: [] },
      { id: 't14-06', chapterId: 'c14', label: 'ログ管理', kubun: 'fixed', target: '種類・保存期間', fill: 'standard', feeds: [] },
      { id: 't14-07', chapterId: 'c14', label: '事故対応', kubun: 'fixed', target: '検知・報告・復旧', fill: 'standard', feeds: [] },
      { id: 't14-08', chapterId: 'c14', label: '秘密情報', kubun: 'fixed', target: '鍵・認証情報の管理', fill: 'standard', feeds: [] },
      // 15 バックアップ・災害復旧
      { id: 't15-01', chapterId: 'c15', label: '対象', kubun: 'fixed', target: 'WEB・DB・設定', fill: 'standard', feeds: [] },
      { id: 't15-02', chapterId: 'c15', label: '頻度', kubun: 'fixed', target: '取得間隔', fill: 'standard', feeds: [] },
      { id: 't15-03', chapterId: 'c15', label: '保存期間', kubun: 'fixed', target: '世代・日数', fill: 'standard', feeds: [] },
      { id: 't15-04', chapterId: 'c15', label: '保存場所', kubun: 'fixed', target: '別環境の有無', fill: 'standard', feeds: [] },
      { id: 't15-05', chapterId: 'c15', label: 'RTO', kubun: 'fixed', target: '復旧時間目標', fill: 'standard', feeds: [] },
      { id: 't15-06', chapterId: 'c15', label: 'RPO', kubun: 'fixed', target: '復旧時点目標', fill: 'standard', feeds: [] },
      { id: 't15-07', chapterId: 'c15', label: '復旧対応', kubun: 'fixed', target: '手順・費用・テスト', fill: 'standard', feeds: [] },
      // 16 運用・保守要件
      { id: 't16-01', chapterId: 'c16', label: '監視', kubun: 'fixed', target: '死活・リソース', fill: 'standard', feeds: [] },
      { id: 't16-02', chapterId: 'c16', label: 'メンテナンス', kubun: 'fixed', target: '頻度・通知', fill: 'standard', feeds: [] },
      { id: 't16-03', chapterId: 'c16', label: '更新', kubun: 'fixed', target: 'OS・CMS・ライブラリ', fill: 'standard', feeds: [] },
      { id: 't16-04', chapterId: 'c16', label: '更新代行', kubun: 'individual', target: '範囲・回数', fill: 'ai', feeds: ['q-ops'] },
      { id: 't16-05', chapterId: 'c16', label: '障害対応', kubun: 'fixed', target: '受付・初動', fill: 'standard', feeds: [] },
      { id: 't16-06', chapterId: 'c16', label: 'サポート', kubun: 'fixed', target: '曜日・時間・手段', fill: 'standard', feeds: [] },
      // 17 テスト・検収要件
      { id: 't17-01', chapterId: 'c17', label: 'テスト範囲', kubun: 'individual', target: '単体・結合・総合', fill: 'human', feeds: [] },
      { id: 't17-02', chapterId: 'c17', label: '表示確認', kubun: 'individual', target: '端末・ブラウザ', fill: 'human', feeds: [] },
      { id: 't17-03', chapterId: 'c17', label: '機能確認', kubun: 'individual', target: '合格条件', fill: 'human', feeds: [] },
      { id: 't17-04', chapterId: 'c17', label: '性能確認', kubun: 'individual', target: '測定条件', fill: 'human', feeds: [] },
      { id: 't17-05', chapterId: 'c17', label: 'セキュリティ確認', kubun: 'individual', target: '診断範囲', fill: 'human', feeds: [] },
      { id: 't17-06', chapterId: 'c17', label: '検収', kubun: 'individual', target: '期間・承認者', fill: 'human', feeds: [] },
      { id: 't17-07', chapterId: 'c17', label: '不具合', kubun: 'individual', target: '重要度・再試験', fill: 'human', feeds: [] },
      // 18 移行・リリース要件
      { id: 't18-01', chapterId: 'c18', label: 'データ移行', kubun: 'individual', target: '対象・件数', fill: 'ai', feeds: ['q-keep', 'q-content'] },
      { id: 't18-02', chapterId: 'c18', label: 'DNS切替', kubun: 'individual', target: '日時・担当', fill: 'server', feeds: ['q-dns-switch'] },
      { id: 't18-03', chapterId: 'c18', label: '公開', kubun: 'individual', target: '承認・手順', fill: 'ai', feeds: ['q-schedule'] },
      { id: 't18-04', chapterId: 'c18', label: '切り戻し', kubun: 'individual', target: '条件・方法', fill: 'human', feeds: [] },
      { id: 't18-05', chapterId: 'c18', label: '操作説明', kubun: 'individual', target: 'マニュアル・研修', fill: 'ai', feeds: ['q-ops'] },
      { id: 't18-06', chapterId: 'c18', label: '公開後対応', kubun: 'individual', target: '無償修正期間', fill: 'human', feeds: [] },
      // 19 スケジュール管理
      { id: 't19-01', chapterId: 'c19', label: '要件定義', kubun: 'individual', target: '開始・終了', fill: 'human', feeds: [] },
      { id: 't19-02', chapterId: 'c19', label: 'デザイン', kubun: 'individual', target: '開始・終了', fill: 'human', feeds: [] },
      { id: 't19-03', chapterId: 'c19', label: '実装', kubun: 'individual', target: '開始・終了', fill: 'server', feeds: ['schedule:buildDue'] },
      { id: 't19-04', chapterId: 'c19', label: 'テスト', kubun: 'individual', target: '開始・終了', fill: 'human', feeds: [] },
      { id: 't19-05', chapterId: 'c19', label: '検収', kubun: 'individual', target: '期限', fill: 'server', feeds: ['schedule:deliveryDate'] },
      { id: 't19-06', chapterId: 'c19', label: '公開', kubun: 'individual', target: '予定日', fill: 'ai', feeds: ['q-schedule', 'schedule:releaseDate'] },
      { id: 't19-07', chapterId: 'c19', label: '素材提供', kubun: 'individual', target: '期限', fill: 'human', feeds: [] },
      { id: 't19-08', chapterId: 'c19', label: '承認', kubun: 'individual', target: '期限', fill: 'human', feeds: [] },
      // 21 責任分界表
      { id: 't21-01', chapterId: 'c21', label: 'サーバー管理', kubun: 'individual', target: '受注者／発注者／外部事業者', fill: 'human', feeds: [] },
      { id: 't21-02', chapterId: 'c21', label: '監視', kubun: 'individual', target: '実施・連絡担当', fill: 'human', feeds: [] },
      { id: 't21-03', chapterId: 'c21', label: 'SSL更新', kubun: 'individual', target: '担当', fill: 'human', feeds: [] },
      { id: 't21-04', chapterId: 'c21', label: 'バックアップ', kubun: 'individual', target: '取得・復旧担当', fill: 'human', feeds: [] },
      { id: 't21-05', chapterId: 'c21', label: 'CMS更新', kubun: 'individual', target: '担当', fill: 'ai', feeds: ['q-ops'] },
      { id: 't21-06', chapterId: 'c21', label: 'コンテンツ更新', kubun: 'individual', target: '担当', fill: 'ai', feeds: ['q-ops'] },
      { id: 't21-07', chapterId: 'c21', label: '素材権利', kubun: 'individual', target: '確認担当', fill: 'human', feeds: [] },
      { id: 't21-08', chapterId: 'c21', label: '障害対応', kubun: 'individual', target: '一次・二次担当', fill: 'human', feeds: [] },
      { id: 't21-09', chapterId: 'c21', label: '利用者管理', kubun: 'individual', target: '担当', fill: 'human', feeds: [] },
      { id: 't21-10', chapterId: 'c21', label: '事故対応', kubun: 'individual', target: '報告・判断担当', fill: 'human', feeds: [] },
      { id: 't21-11', chapterId: 'c21', label: '契約終了', kubun: 'individual', target: '移管・削除担当', fill: 'human', feeds: [] },
      // 22 未決事項・課題管理
      { id: 't22-01', chapterId: 'c22', label: '未決事項', kubun: 'individual', target: '内容・担当・期限', fill: 'server', feeds: ['derived:openItems'] },
      { id: 't22-02', chapterId: 'c22', label: '課題', kubun: 'individual', target: '影響・対応策', fill: 'ai', feeds: ['q-issue'] },
      { id: 't22-03', chapterId: 'c22', label: '変更要求', kubun: 'individual', target: '変更内容・承認', fill: 'human', feeds: [] },
      { id: 't22-04', chapterId: 'c22', label: '決定事項', kubun: 'individual', target: '決定日・承認者', fill: 'human', feeds: [] },
    ],
  },
};

/** 版のカタログ（無い版は undefined。表示側は「旧版の項目」として扱う＝設計 §6.1） */
export function reqDocCatalogOf(version: string): ReqDocCatalog | undefined {
  return Object.prototype.hasOwnProperty.call(REQ_DOC_CATALOG, version) ? REQ_DOC_CATALOG[version] : undefined;
}
