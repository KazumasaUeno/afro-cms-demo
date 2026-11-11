import type { Activity, Project, Stage } from '@/types';
import { daysAgo, daysFromNow, hoursAgo } from '@/services/time';

export const STAGES: { id: Stage; no: number; label: string; en: string; description: string }[] = [
  { id: 'hearing', no: 1, label: 'ヒアリング', en: 'Listen', description: '現状・目的・競合をお客様から聞き取り、回答をそろえる' },
  { id: 'requirements', no: 2, label: '要件定義', en: 'Discover', description: 'ヒアリングの回答を AI が分析し、要件定義書をつくってお客様の承認を得る' },
  { id: 'build', no: 3, label: '制作', en: 'Build', description: 'サイトマップ・デザイン案・全ページ構築を承認しながら進める' },
  { id: 'quality', no: 4, label: '品質管理', en: 'Assure', description: '12項目110問をアフロと顧客の双方で確認する' },
  { id: 'operation', no: 5, label: '運用', en: 'Operate', description: 'ページ更新・お知らせ・公開ワークフローを回す' },
  { id: 'improvement', no: 6, label: '改善', en: 'Improve', description: '4か月ごとにAIがサイトを診断し、改善を提案する' },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);

/** デモ用の架空の顧客・サイト（実在の企業ではない） */
export const seedProjects = (): Project[] => [
  {
    id: 'p1', clientName: '株式会社ミナモ珈琲', siteName: 'MINAMO COFFEE', siteUrl: 'https://minamo-coffee.example.jp',
    industry: '飲食・EC', stage: 'hearing', progress: 2, ownerId: 'm1', updatedAt: hoursAgo(1.5),
    // 段階・進捗・次の作業・承認待ちの数は、読み込み時と操作のたびにデモのデータから導き直す（store/demoProject.ts）
    nextAction: 'ヒアリングを入力する', accent: '#B45309', launchDate: daysFromNow(38), pendingApprovals: 0,
  },
  {
    id: 'p2', clientName: '北条建設株式会社', siteName: 'HOJO Construction', siteUrl: 'https://hojo-kensetsu.example.jp',
    industry: '建設・不動産', stage: 'quality', progress: 72, ownerId: 'm5', updatedAt: hoursAgo(5),
    nextAction: '品質チェック（顧客側）の承認待ち', accent: '#1D4ED8', launchDate: daysFromNow(12), pendingApprovals: 4,
  },
  {
    id: 'p3', clientName: 'ひだまり歯科クリニック', siteName: 'Hidamari Dental', siteUrl: 'https://hidamari-dental.example.jp',
    industry: '医療', stage: 'hearing', progress: 10, ownerId: 'm2', updatedAt: daysAgo(1),
    nextAction: '要件ヒアリング（競合サイトの入力）', accent: '#0D9488', pendingApprovals: 0,
  },
  {
    id: 'p4', clientName: 'Lumière Atelier', siteName: 'Lumière Bridal', siteUrl: 'https://lumiere-bridal.example.jp',
    industry: 'ブライダル', stage: 'operation', progress: 88, ownerId: 'm4', updatedAt: daysAgo(2),
    nextAction: '秋フェアのお知らせを予約公開', accent: '#BE185D', pendingApprovals: 1,
  },
  {
    id: 'p5', clientName: 'ソラノ精機株式会社', siteName: 'SORANO Precision', siteUrl: 'https://sorano-seiki.example.jp',
    industry: '製造業', stage: 'improvement', progress: 100, ownerId: 'm3', updatedAt: daysAgo(4),
    nextAction: '第2回 AI改善診断のレポート送付', accent: '#475569', pendingApprovals: 0,
  },
  {
    id: 'p6', clientName: '一般社団法人まちの学び舎', siteName: 'Machi no Manabiya', siteUrl: 'https://manabiya.example.org',
    industry: '教育・NPO', stage: 'build', progress: 31, ownerId: 'm2', updatedAt: daysAgo(3),
    nextAction: 'サイトマップの承認', accent: '#7C3AED', launchDate: daysFromNow(64), pendingApprovals: 1,
  },
];

export const seedActivities = (): Activity[] => [
  { id: 'a1', at: hoursAgo(0.4), actor: 'AI', text: 'MINAMO COFFEE のデザイン案を3パターン生成しました', kind: 'ai', projectId: 'p1' },
  { id: 'a2', at: hoursAgo(1.2), actor: '佐倉 美緒', text: 'トップページのファーストビューを更新', kind: 'edit', projectId: 'p1' },
  { id: 'a3', at: hoursAgo(3), actor: '北条建設 担当者', text: '品質チェック「デザイン・ブランド」を承認', kind: 'approve', projectId: 'p2' },
  { id: 'a4', at: hoursAgo(6), actor: '森 あかり', text: '「秋のブライダルフェア」を予約公開に設定', kind: 'publish', projectId: 'p4' },
  { id: 'a5', at: daysAgo(1), actor: '藤井 慎', text: 'A区分 24項目を一括チェック', kind: 'check', projectId: 'p2' },
  { id: 'a6', at: daysAgo(1.3), actor: 'AI', text: 'SORANO Precision の第2回改善診断を作成（スコア 78）', kind: 'ai', projectId: 'p5' },
  { id: 'a7', at: daysAgo(2), actor: '上野 航', text: 'まちの学び舎のサイトマップ案にコメント', kind: 'comment', projectId: 'p6' },
];
