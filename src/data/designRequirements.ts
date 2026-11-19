import type { RequirementQuestion } from '@/types';

/**
 * デザイン要件定義の質問（0.28.0。2026-11-12 ユーザー決定）。
 * 出典: お客様の草案資料「8. デザイン・ブランド」の 6 問。サイトマップの承認の後、デザイン案（3 案）を作る前に、デザインの段階で聞く。
 * 最初の 3 問（q-design-dislike・q-image・q-brand）は 0.27 までヒアリング（rc8）にあった質問で、id はそのまま（保存データは DemoStore の読み込みで移す）。
 * 型と入力欄はヒアリングと同じ（RequirementQuestion・AnswerInput・validateAnswer）。categoryId は 1 画面のため固定。
 * demo だけ（live の Rules・ヒアリングの質問には含めない）
 */
export const DESIGN_CATEGORY_ID = 'design';

export const DESIGN_QUESTIONS: RequirementQuestion[] = [
  { id: 'q-design-dislike', categoryId: DESIGN_CATEGORY_ID, priority: 'A', kind: 'longtext', text: '現在のHPのデザインで不満な点は何ですか？', placeholder: '例：写真が暗く、文字が小さくて読みにくい', owner: 'client' },
  { id: 'q-image', categoryId: DESIGN_CATEGORY_ID, priority: 'A', kind: 'text', text: 'ユーザーにどのような企業イメージを持ってほしいですか？', placeholder: '例：誠実で相談しやすい、地元に根ざした会社', owner: 'client' },
  { id: 'q-design-ref', categoryId: DESIGN_CATEGORY_ID, priority: 'A', kind: 'longtext', text: '参考にしたいHP・デザインはありますか？', placeholder: '例：https://example.jp の写真の大きい見せ方。色は落ち着いた感じが好み', owner: 'client' },
  { id: 'q-brand', categoryId: DESIGN_CATEGORY_ID, priority: 'B', kind: 'text', text: 'コーポレートカラーやブランドガイドラインはありますか？', placeholder: '例：ロゴの緑色。ガイドラインは無し', owner: 'client' },
  { id: 'q-design-media', categoryId: DESIGN_CATEGORY_ID, priority: 'B', kind: 'text', text: '写真・イラスト・動画の利用方針はありますか？', placeholder: '例：写真は撮り下ろし。イラストは使わない', owner: 'client' },
  { id: 'q-design-sp', categoryId: DESIGN_CATEGORY_ID, priority: 'A', kind: 'longtext', text: 'スマートフォン表示で改善したい点はありますか？', placeholder: '例：メニューが押しにくい。電話ボタンを大きくしたい', owner: 'client' },
];

/** 0.27 までヒアリングにあった質問（保存データの移し替えに使う） */
export const MOVED_FROM_HEARING = ['q-design-dislike', 'q-image', 'q-brand'] as const;
