/**
 * 素材ドライブの見本の写真（案件ごとに 4 点。2026-11-17 ユーザー指示「素材ドライブの画像もリアルっぽく」）。
 * 写真は public/demo-images/ に同梱する（Wikimedia Commons の CC0・パブリックドメインの写真を 800px に縮小。出典は public/demo-images/CREDITS.md）。
 * 外部へは取りに行かない。画像データは保存データに入れず、id から同梱のファイルを指す。
 * MINAMO COFFEE（p1）の id（beans・cafe・gift・latte）は以前の見本と同じ（保存済みのページ履歴・サイネージが同じ id で引けるように）。
 * この一覧は写真を選んだときに生成した。写真を差し替えるときは CREDITS.md も直す
 */
export interface DemoImage {
  /** 案件の中で一意（p1 以外は「案件 id-名前」） */
  id: string;
  label: string;
  /** 素材ドライブのフォルダ */
  folder: string;
  /** public/demo-images/ からのパス */
  file: string;
  /** 同梱したファイルの大きさ（素材ドライブに出す） */
  bytes: number;
}

export const PROJECT_IMAGES: Record<string, DemoImage[]> = {
  p1: [
    { id: 'beans', label: '焙煎豆', folder: '商品写真', file: 'p1/beans.jpg', bytes: 95121 },
    { id: 'cafe', label: '店内', folder: '店舗', file: 'p1/cafe.jpg', bytes: 51638 },
    { id: 'gift', label: 'ハンドドリップ', folder: '商品写真', file: 'p1/gift.jpg', bytes: 61640 },
    { id: 'latte', label: 'ラテ', folder: '商品写真', file: 'p1/latte.jpg', bytes: 30392 },
  ],
  p2: [
    { id: 'p2-site', label: '施工現場', folder: '施工写真', file: 'p2/p2-site.jpg', bytes: 151191 },
    { id: 'p2-steel', label: '鉄骨・資材', folder: '施工写真', file: 'p2/p2-steel.jpg', bytes: 135654 },
    { id: 'p2-crane', label: 'タワークレーン', folder: '施工写真', file: 'p2/p2-crane.jpg', bytes: 39397 },
    { id: 'p2-machine', label: '基礎工事の重機', folder: '施工写真', file: 'p2/p2-machine.jpg', bytes: 136766 },
  ],
  p3: [
    { id: 'p3-room', label: '診療室', folder: '院内', file: 'p3/p3-room.jpg', bytes: 43887 },
    { id: 'p3-private', label: '個室の診療室', folder: '院内', file: 'p3/p3-private.jpg', bytes: 58078 },
    { id: 'p3-model', label: '歯の模型', folder: '診療案内', file: 'p3/p3-model.jpg', bytes: 26370 },
    { id: 'p3-toothbrush', label: '歯ブラシ', folder: '診療案内', file: 'p3/p3-toothbrush.jpg', bytes: 47449 },
  ],
  p4: [
    { id: 'p4-chapel', label: 'チャペル', folder: '会場', file: 'p4/p4-chapel.jpg', bytes: 93542 },
    { id: 'p4-hall', label: '披露宴会場', folder: '会場', file: 'p4/p4-hall.jpg', bytes: 94936 },
    { id: 'p4-flowers', label: '装花', folder: '装花', file: 'p4/p4-flowers.jpg', bytes: 65091 },
    { id: 'p4-bouquet', label: 'ブーケ', folder: '装花', file: 'p4/p4-bouquet.jpg', bytes: 74047 },
  ],
  p5: [
    { id: 'p5-measure', label: '寸法の測定', folder: '加工事例', file: 'p5/p5-measure.jpg', bytes: 46018 },
    { id: 'p5-milling', label: 'フライス加工', folder: '設備', file: 'p5/p5-milling.jpg', bytes: 85875 },
    { id: 'p5-plant', label: '工場の内部', folder: '設備', file: 'p5/p5-plant.jpg', bytes: 88162 },
    { id: 'p5-aerial', label: '工場の外観', folder: '会社案内', file: 'p5/p5-aerial.jpg', bytes: 147200 },
  ],
  p6: [
    { id: 'p6-books', label: '図書コーナー', folder: '施設', file: 'p6/p6-books.jpg', bytes: 95904 },
    { id: 'p6-study', label: '学習スペース', folder: '施設', file: 'p6/p6-study.jpg', bytes: 58042 },
    { id: 'p6-pottery', label: '陶芸講座', folder: '講座', file: 'p6/p6-pottery.jpg', bytes: 44930 },
    { id: 'p6-wheel', label: 'ろくろ体験', folder: '講座', file: 'p6/p6-wheel.jpg', bytes: 60392 },
  ],
  p7: [
    { id: 'p7-beams', label: '施工事例（梁を見せた天井）', folder: '施工事例', file: 'p7/p7-beams.jpg', bytes: 62696 },
    { id: 'p7-kitchen', label: '施工事例（キッチン）', folder: '施工事例', file: 'p7/p7-kitchen.jpg', bytes: 65410 },
    { id: 'p7-exterior', label: '施工事例（外観）', folder: '施工事例', file: 'p7/p7-exterior.jpg', bytes: 57834 },
    { id: 'p7-wood', label: '木材', folder: '素材', file: 'p7/p7-wood.jpg', bytes: 79364 },
  ],
  p8: [
    { id: 'p8-room', label: '和室の客室', folder: '客室', file: 'p8/p8-room.jpg', bytes: 64206 },
    { id: 'p8-onsen', label: '露天風呂', folder: '温泉', file: 'p8/p8-onsen.jpg', bytes: 126044 },
    { id: 'p8-meal', label: 'お食事', folder: '料理', file: 'p8/p8-meal.jpg', bytes: 73350 },
    { id: 'p8-garden', label: '庭園', folder: '庭', file: 'p8/p8-garden.jpg', bytes: 119722 },
  ],
};

const ALL: DemoImage[] = Object.values(PROJECT_IMAGES).flat();
const BASE = `${import.meta.env.BASE_URL}demo-images/`;

export const demoImageById = (id: string): DemoImage | undefined => ALL.find((i) => i.id === id);

export const demoImageSrc = (i: Pick<DemoImage, 'file'>): string => `${BASE}${i.file}`;

/** 同梱の見本の写真の src か（CMS 本文のサニタイザで、同じサイトのこの場所の写真だけを通す） */
export const isDemoImageSrc = (v: string): boolean => ALL.some((i) => demoImageSrc(i) === v);
