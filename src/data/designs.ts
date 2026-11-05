import type { DesignVariant } from '@/types';

export const DESIGN_VARIANTS: DesignVariant[] = [
  {
    id: 'minimal', label: 'Design A', name: 'ミニマル', tagline: '余白で語る、静かな上質',
    description: '大きな余白と細い罫線、モノトーン写真で「丁寧なものづくり」を伝える構成。商品1点を主役にします。',
    palette: ['#FAFAF7', '#1C1C1C', '#B45309', '#E7E5E4'], fonts: 'Noto Serif JP / Inter',
    score: { brand: 82, conversion: 74, readability: 93 },
  },
  {
    id: 'creative', label: 'Design B', name: 'クリエイティブ', tagline: '動きと色で、記憶に残る',
    description: '大胆なタイポグラフィと非対称グリッド、カラーブロックで若い層の「行ってみたい」を引き出す構成。',
    palette: ['#FFF7ED', '#1E1B4B', '#F97316', '#A78BFA'], fonts: 'Inter Display / Noto Sans JP',
    score: { brand: 91, conversion: 79, readability: 78 },
  },
  {
    id: 'premium', label: 'Design C', name: 'プレミアム', tagline: '深い色で、ギフトの格を',
    description: 'ダークトーンと金のアクセント、ストーリー型の縦長構成で、法人ギフト・高単価商品の購入を後押しします。',
    palette: ['#14110F', '#F5EFE6', '#C8A15A', '#3F3A34'], fonts: 'Cormorant / Noto Serif JP',
    score: { brand: 88, conversion: 85, readability: 84 },
  },
];
