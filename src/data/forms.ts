import type { DemoState, FormDef, FormField, FormFieldType, FormsState, FormSubmission, Project } from '@/types';
import { daysAgo, hoursAgo } from '@/services/time';
import { isSiteLive } from './projectContent';
import { EMAIL_RE, normalizeEmail, seedClientAccounts } from './users';

/**
 * フォーム管理（0.37.0。案件ごと。2026-11-13 ユーザー指示）。
 * - 開発者画面: フォームの作成・項目の編集・通知先・受付の停止（運用の作業はアフロの開発者が行う）
 * - お客様ポータル: 受信した問い合わせの確認・対応状況（未対応 / 対応済み）・CSV 保存
 * - 管理者画面: 見るだけ（件数）
 * デモのため、実際のサイトからは受信しない（受信の見本は架空のデータ）。通知のメールも送らない。
 * 保存データに無い案件は、公開中の案件なら「お問い合わせ」の見本、公開前の案件なら空（最初に変えたときに保存する）
 */
export const FORM_LIMITS = { name: 30, fields: 12, label: 30, options: 10, option: 30, recipients: 5 } as const;

export const FIELD_TYPES: { id: FormFieldType; label: string }[] = [
  { id: 'text', label: '1行テキスト' },
  { id: 'textarea', label: '複数行テキスト' },
  { id: 'email', label: 'メールアドレス' },
  { id: 'tel', label: '電話番号' },
  { id: 'select', label: '選択肢' },
  { id: 'checkbox', label: 'チェックボックス' },
];
export const fieldTypeLabel = (t: FormFieldType): string => FIELD_TYPES.find((x) => x.id === t)?.label ?? t;

export interface FormDraft {
  /** 無ければ新規 */
  id?: string;
  name: string;
  /** id が空の項目は新しい項目 */
  fields: FormField[];
  recipients: string[];
}

export type FormErrors = Partial<Record<'name' | 'fields' | 'recipients', string>> & { fieldErrors?: Record<number, string> };

export function validateForm(d: FormDraft, forms: FormDef[]): FormErrors {
  const e: FormErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'フォーム名を入力してください';
  else if (name.length > FORM_LIMITS.name) e.name = `フォーム名は${FORM_LIMITS.name}文字以内にしてください`;
  else if (forms.some((f) => f.name === name && f.id !== d.id)) e.name = '同じ名前のフォームがあります';
  if (d.fields.length === 0) e.fields = '項目を 1 つ以上追加してください';
  else if (d.fields.length > FORM_LIMITS.fields) e.fields = `項目は${FORM_LIMITS.fields}個までです`;
  const fe: Record<number, string> = {};
  const labels = new Set<string>();
  d.fields.forEach((f, i) => {
    const label = f.label.trim();
    if (!label) fe[i] = '項目名を入力してください';
    else if (label.length > FORM_LIMITS.label) fe[i] = `項目名は${FORM_LIMITS.label}文字以内にしてください`;
    else if (labels.has(label)) fe[i] = '同じ項目名があります';
    else if (f.type === 'select') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) fe[i] = '選択肢を 1 つ以上入力してください';
      else if (opts.length > FORM_LIMITS.options) fe[i] = `選択肢は${FORM_LIMITS.options}個までです`;
      else if (opts.some((o) => o.length > FORM_LIMITS.option)) fe[i] = `選択肢は${FORM_LIMITS.option}文字以内にしてください`;
    }
    labels.add(label);
  });
  if (Object.keys(fe).length) e.fieldErrors = fe;
  const rs = d.recipients.map(normalizeEmail).filter(Boolean);
  if (rs.length === 0) e.recipients = '通知先のメールアドレスを 1 つ以上入力してください';
  else if (rs.length > FORM_LIMITS.recipients) e.recipients = `通知先は${FORM_LIMITS.recipients}件までです`;
  else if (rs.some((r) => r.length > 254 || !EMAIL_RE.test(r))) e.recipients = 'メールアドレスの形式が正しくありません（例: name@example.com）';
  else if (new Set(rs).size !== rs.length) e.recipients = '同じメールアドレスが重複しています';
  return e;
}

/* ---------- 見本（架空のデータ） ---------- */

const SEED_FIELDS: FormField[] = [
  { id: 'f-name', label: 'お名前', type: 'text', required: true },
  { id: 'f-email', label: 'メールアドレス', type: 'email', required: true },
  { id: 'f-tel', label: '電話番号', type: 'tel', required: false },
  { id: 'f-kind', label: 'お問い合わせの種類', type: 'select', required: true, options: ['商品・サービスについて', '法人のご相談', '取材・その他'] },
  { id: 'f-body', label: 'お問い合わせ内容', type: 'textarea', required: true },
];

type SeedSubmission = { name: string; email: string; tel: string; kind: string; body: string; hours: number; done?: boolean };

/**
 * 問い合わせの見本（架空）。案件の業種に合わせた文面にする（0.39.2。2026-11-16 ユーザー指示。以前は全案件で喫茶店向けの同じ文面だった）。
 * 種類は SEED_FIELDS の選択肢（商品・サービスについて / 法人のご相談 / 取材・その他）から選ぶ。ここに無い案件は GENERIC
 */
const SEED_SUBMISSIONS: Record<string, SeedSubmission[]> = {
  // MINAMO COFFEE（飲食・EC）
  p1: [
    { name: '山田 花子', email: 'hanako.yamada@example.com', tel: '090-0000-0001', kind: '商品・サービスについて', body: '営業時間と定休日を教えてください。', hours: 5 },
    { name: '佐藤 健', email: 'ken.sato@example.com', tel: '', kind: '法人のご相談', body: '社内イベント向けに 50 名分のコーヒーの注文を検討しています。見積をお願いできますか。', hours: 26 },
    { name: '鈴木 美咲', email: 'misaki.suzuki@example.com', tel: '080-0000-0002', kind: '取材・その他', body: '地域情報誌の取材のご相談です。来月の掲載を予定しています。', hours: 74, done: true },
    { name: 'Emily Clark', email: 'emily.clark@example.com', tel: '', kind: '商品・サービスについて', body: 'Do you have an English menu? （英語での問い合わせの見本）', hours: 150, done: true },
  ],
  // SORANO Precision（製造業）
  p5: [
    { name: '高橋 誠', email: 'makoto.takahashi@example.com', tel: '03-0000-0001', kind: '法人のご相談', body: 'アルミ部品の試作（10 個）をお願いしたいです。図面を送るので、納期と概算をいただけますか。', hours: 4 },
    { name: '伊藤 由美', email: 'yumi.ito@example.com', tel: '', kind: '商品・サービスについて', body: '5 軸加工機での加工に対応している材質の一覧はありますか。', hours: 30 },
    { name: '渡辺 剛', email: 'tsuyoshi.watanabe@example.com', tel: '090-0000-0003', kind: '取材・その他', body: '工場見学（10 名程度）の受け入れは可能でしょうか。', hours: 80, done: true },
    { name: '中村 亮', email: 'ryo.nakamura@example.com', tel: '', kind: '取材・その他', body: '技術職の中途採用の募集はありますか。', hours: 160, done: true },
  ],
  // Machi no Manabiya（教育・NPO）
  p6: [
    { name: '小林 さくら', email: 'sakura.kobayashi@example.com', tel: '080-0000-0004', kind: '商品・サービスについて', body: '小学 3 年生の子どもが参加できる講座はありますか。申し込み方法も教えてください。', hours: 6 },
    { name: '加藤 浩', email: 'hiroshi.kato@example.com', tel: '', kind: '取材・その他', body: '週末のボランティアに参加したいです。説明会の日程はありますか。', hours: 28 },
    { name: '吉田 恵', email: 'megumi.yoshida@example.com', tel: '090-0000-0005', kind: '法人のご相談', body: '地元企業として、子ども向け講座への協賛を検討しています。', hours: 90, done: true },
    { name: '山本 翔', email: 'sho.yamamoto@example.com', tel: '', kind: '商品・サービスについて', body: '先週の講座の資料をいただくことはできますか。', hours: 170, done: true },
  ],
  // Hanami Ryokan（宿泊・観光）
  p8: [
    { name: '松本 亜希', email: 'aki.matsumoto@example.com', tel: '090-0000-0006', kind: '商品・サービスについて', body: '来月の土曜日に 2 名で 1 泊したいです。露天風呂付きの客室は空いていますか。', hours: 3 },
    { name: '井上 大輔', email: 'daisuke.inoue@example.com', tel: '', kind: '法人のご相談', body: '社員旅行（20 名・1 泊 2 食）の団体プランの見積をお願いします。', hours: 22 },
    { name: '木村 優子', email: 'yuko.kimura@example.com', tel: '080-0000-0007', kind: '商品・サービスについて', body: '小麦アレルギーがあります。夕食の対応は可能でしょうか。', hours: 70, done: true },
    { name: 'Lucas Martin', email: 'lucas.martin@example.com', tel: '', kind: '商品・サービスについて', body: 'Is there a shuttle bus from the station? （英語での問い合わせの見本）', hours: 140, done: true },
  ],
};

/** 業種の決まっていない案件（新しく作った案件など）の見本 */
const GENERIC: SeedSubmission[] = [
  { name: '山田 花子', email: 'hanako.yamada@example.com', tel: '090-0000-0001', kind: '商品・サービスについて', body: 'サービスの料金と、申し込みまでの流れを教えてください。', hours: 5 },
  { name: '佐藤 健', email: 'ken.sato@example.com', tel: '', kind: '法人のご相談', body: '法人での利用を検討しています。資料をお送りいただけますか。', hours: 26 },
  { name: '鈴木 美咲', email: 'misaki.suzuki@example.com', tel: '080-0000-0002', kind: '取材・その他', body: '地域情報誌の取材のご相談です。来月の掲載を予定しています。', hours: 74, done: true },
];

/** 通知先の初期値。その案件のお客様アカウントのメール（無ければサイトの info@） */
function seedRecipients(state: Pick<DemoState, 'clientAccounts'>, project: Project): string[] {
  const accounts = (state.clientAccounts ?? seedClientAccounts()).filter((a) => a.projectId === project.id && a.status !== 'disabled' && a.email);
  if (accounts.length) return accounts.slice(0, FORM_LIMITS.recipients).map((a) => a.email);
  let host = '';
  try { host = new URL(project.siteUrl).hostname; } catch { host = ''; }
  return [`info@${host || 'example.jp'}`];
}

function seedForms(state: Pick<DemoState, 'clientAccounts'>, project: Project): FormsState {
  const formId = `form-contact-${project.id}`;
  const form: FormDef = {
    id: formId, name: 'お問い合わせ', fields: SEED_FIELDS, recipients: seedRecipients(state, project), enabled: true,
    updatedAt: daysAgo(20), updatedBy: 'アフロ',
  };
  const submissions: FormSubmission[] = (SEED_SUBMISSIONS[project.id] ?? GENERIC).map((x, i) => ({
    id: `sub-${project.id}-${i + 1}`, formId, at: hoursAgo(x.hours),
    values: { 'f-name': x.name, 'f-email': x.email, 'f-tel': x.tel, 'f-kind': x.kind, 'f-body': x.body },
    status: x.done ? 'done' : 'open',
    ...(x.done ? { handledBy: 'お客様 担当者', handledAt: hoursAgo(x.hours - 3) } : {}),
  }));
  return { forms: [form], submissions };
}

const EMPTY: FormsState = { forms: [], submissions: [] };
// 見本は描画のたびに作り直さない（日時・id を同じにする）。
// 宛先はお客様アカウント・サイトの URL から作るので、キーに宛先を含める（後から担当者を足しても古い宛先のまま残らない。0.39.1。2026-11-16）
const seedCache = new Map<string, FormsState>();

/** 選んでいる案件のフォーム（保存に無ければ見本） */
export function formsOf(state: Pick<DemoState, 'forms' | 'projects' | 'requirements' | 'clientAccounts'>): FormsState {
  if (state.forms) return state.forms;
  const project = state.projects.find((p) => p.id === state.requirements.projectId);
  if (!project || !isSiteLive(project.stage)) return EMPTY;
  const key = `${project.id}
${seedRecipients(state, project).join(',')}`;
  let seeded = seedCache.get(key);
  if (!seeded) {
    seeded = seedForms(state, project);
    seedCache.set(key, seeded);
  }
  return seeded;
}

export const openCount = (forms: FormsState, formId?: string): number =>
  forms.submissions.filter((s) => s.status === 'open' && (!formId || s.formId === formId)).length;

/** 問い合わせの CSV の行（見出し＋1 件 1 行）。削除した項目の値も末尾に「（削除した項目）」として出す */
export function submissionRows(form: FormDef, subs: FormSubmission[], stamp: (iso: string) => string): string[][] {
  const known = new Set(form.fields.map((f) => f.id));
  const head = ['受信日時（日本時間）', '状態', ...form.fields.map((f) => f.label), '（削除した項目）', '対応者', '対応日時（日本時間）'];
  const rows = subs.map((s) => [
    stamp(s.at), s.status === 'done' ? '対応済み' : '未対応',
    ...form.fields.map((f) => s.values[f.id] ?? ''),
    Object.entries(s.values).filter(([k, v]) => !known.has(k) && v).map(([, v]) => v).join(' / '),
    s.handledBy ?? '', s.handledAt ? stamp(s.handledAt) : '',
  ]);
  return [head, ...rows];
}
