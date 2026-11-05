import type { Member } from '@/types';

/** デモ用の架空メンバー（実在の人物ではない） */
export const MEMBERS: Member[] = [
  { id: 'm1', name: '上野 航', role: 'ディレクター', color: '#4F7CFF', initials: 'WU' },
  { id: 'm2', name: '佐倉 美緒', role: 'デザイナー', color: '#8B7CF6', initials: 'MS' },
  { id: 'm3', name: '黒田 蓮', role: 'エンジニア', color: '#14B8A6', initials: 'RK' },
  { id: 'm4', name: '森 あかり', role: 'コンテンツ編集', color: '#F59E0B', initials: 'AM' },
  { id: 'm5', name: '藤井 慎', role: '品質管理', color: '#EC4899', initials: 'SF' },
];

export const memberById = (id: string): Member =>
  MEMBERS.find((m) => m.id === id) ?? MEMBERS[0];
