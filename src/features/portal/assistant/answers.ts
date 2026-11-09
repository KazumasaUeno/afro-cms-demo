import type { DemoState } from '@/types';
import { currentProject } from '@/store/DemoStore';
import { STAGES, stageIndex } from '@/data/projects';
import { memberById } from '@/data/members';
import { formatDate } from '@/services/time';
import { approvalSteps, hearingTodo } from '../portalSteps';

/**
 * お客様ポータルの AI アシスタント（シミュレーション）。
 * 実際の AI は呼ばない。画面の状態（store）から、用意した文を組み立てて返す。
 * 入力した文は外部へ送らない。
 */

export interface AssistantReply {
  text: string;
  action?: { label: string; to: string };
}

/** お客様にお願いしていること（ホームの「ご確認をお願いしたいこと」と同じ数え方） */
export function clientTodos(state: DemoState): { label: string; to: string }[] {
  const out: { label: string; to: string }[] = [];
  const h = hearingTodo(state);
  // ヒアリングは 1 件として数える（ホームと同じ）
  const hearing = [h.unanswered ? `未回答 ${h.unanswered} 問` : '', h.toConfirm ? `代理入力の確認 ${h.toConfirm} 問` : ''].filter(Boolean);
  if (hearing.length) out.push({ label: `ヒアリング（${hearing.join('・')}）`, to: '/portal/requirements' });
  approvalSteps(state).filter((s) => s.status === 'waiting').forEach((s) => {
    out.push({ label: s.progress ? `${s.title}（${s.progress.done} / ${s.progress.total}）` : `${s.title}の承認`, to: s.key === 'quality' ? '/portal/quality' : `/portal/approvals#${s.key}` });
  });
  const review = state.pages.filter((p) => p.status === 'review').length;
  if (review) out.push({ label: `ページ・お知らせの公開承認 ${review} 件`, to: '/portal/publish' });
  return out;
}

function nextTodo(state: DemoState): AssistantReply {
  const todos = clientTodos(state);
  if (!todos.length) return { text: 'いまお願いしたいことはありません。制作はアフロが進めています。次にお願いすることができたら、ここでお知らせします。' };
  return {
    text: `いまお願いしたいことは ${todos.length} 件です。\n${todos.map((t, i) => `${i + 1}. ${t.label}`).join('\n')}\nまずは 1 つめから進めるのがおすすめです。`,
    action: { label: '1 つめを開く', to: todos[0].to },
  };
}

/** いま開いている画面の案内（パネルの最初のあいさつ） */
export function pageGuide(pathname: string, state: DemoState): AssistantReply {
  const project = currentProject(state);
  const h = hearingTodo(state);
  switch (pathname) {
    case '/portal/requirements':
      if (state.requirements.status !== 'draft') return { text: '要件定義書ができあがったので、ヒアリングの回答は締め切りました。内容は「確認・承認」でご確認ください。', action: { label: '確認・承認へ', to: '/portal/approvals#requirements' } };
      return { text: h.unanswered
        ? `この画面では、要件を決めるための質問にお答えいただきます。未回答はあと ${h.unanswered} 問です。分からない質問は空欄のままで大丈夫です。`
        : 'お客様の担当の質問はすべて回答済みです。ありがとうございます。アフロが内容をもとに要件定義書を作ります。' };
    case '/portal/approvals': {
      const waiting = approvalSteps(state).filter((s) => s.status === 'waiting' && s.key !== 'quality');
      return { text: waiting.length
        ? `承認をお願いしたい項目が ${waiting.length} つあります（${waiting.map((s) => s.title).join('・')}）。内容を見て「承認する」を押してください。承認した日時はアフロにも記録されます。`
        : 'いま承認をお願いしている項目はありません。' };
    }
    case '/portal/quality':
      return { text: '公開前に、お客様の目で確認していただく項目です。実際のページを見ながらチェックしてください。カテゴリごとにまとめて確認することもできます。' };
    case '/portal/pages':
      return { text: 'ページやお知らせを書いて、公開や予約公開ができます。「承認依頼」にすると、社内の承認を経てから公開されます。' };
    case '/portal/publish': {
      const review = state.pages.filter((p) => p.status === 'review').length;
      return { text: review ? `承認待ちの更新が ${review} 件あります。変更前と変更後を見比べて、承認するか、コメントを付けて差し戻してください。` : '承認待ちの更新はありません。' };
    }
    case '/portal/reports':
      return { text: state.diagnoses.length
        ? `公開後の改善レポートを ${state.diagnoses.length} 件お届けしています。点数が低いカテゴリから改善の提案を読むのがおすすめです。`
        : '公開後に、サイトの改善レポートがここに届きます。' };
    default: {
      const todos = clientTodos(state);
      return {
        text: `こんにちは、${project.clientName} さま。AIアシスタントです。制作の進み具合のご案内や、画面の使い方のご質問にお答えします。${todos.length ? `いまお願いしたいことが ${todos.length} 件あります。` : ''}`,
        action: todos.length ? { label: 'お願いしたいことを見る', to: todos[0].to } : undefined,
      };
    }
  }
}

interface Topic {
  id: string;
  /** 候補ボタンの文言 */
  label: string;
  /** 自由入力でこの話題とみなす語 */
  keywords: string[];
  answer: (state: DemoState) => AssistantReply;
}

export const TOPICS: Topic[] = [
  { id: 'next', label: 'いま何をすればいい？', keywords: ['何をすれば', 'やること', '次', 'お願い', 'todo', 'タスク'], answer: nextTodo },
  {
    id: 'progress', label: '今どこまで進んでいる？', keywords: ['進み', '進捗', 'どこまで', '状況', '段階'],
    answer: (state) => {
      const p = currentProject(state);
      const stage = STAGES[stageIndex(p.stage)];
      return { text: `全体の ${p.progress}% まで進んでいます。いまは「${stage.no}. ${stage.label}」の段階で、${stage.description}ところです。` };
    },
  },
  // 「お知らせを公開したい」を公開日の質問と取り違えないよう、launch より先に判定する
  {
    id: 'news', label: 'お知らせを出したい', keywords: ['お知らせ', 'ニュース', '記事', '更新', 'ページ'],
    answer: () => ({ text: '「ページ・お知らせ」から書けます。タイトルと本文を書いて、すぐ公開するか、日時を決めて予約公開できます。', action: { label: 'お知らせを書く', to: '/portal/pages?new=news' } }),
  },
  {
    id: 'launch', label: '公開はいつ？', keywords: ['公開', 'いつ', '予定', '納期', 'リリース'],
    answer: (state) => {
      const p = currentProject(state);
      if (!p.launchDate) return { text: '公開日はまだ調整中です。決まり次第ホームに表示します。' };
      const days = Math.max(0, Math.ceil((new Date(p.launchDate).getTime() - Date.now()) / 86400000));
      return { text: `公開予定は ${formatDate(p.launchDate)}、あと ${days} 日です。承認が遅れると公開日も後ろにずれることがあるので、お願いしたいことは早めに進めていただけると助かります。` };
    },
  },
  {
    id: 'proxy', label: '「代理入力」って何？', keywords: ['代理', '代わり', '確認待ち'],
    answer: () => ({ text: 'お客様の担当の質問に、アフロが代わりに答えた回答のことです。内容が合っていれば「内容を確認しました」を押してください。違っていれば書き直すと、お客様の回答になります。確認が終わるまで要件定義書は承認できません。', action: { label: 'ヒアリングを開く', to: '/portal/requirements' } }),
  },
  {
    id: 'approve', label: '承認するとどうなる？', keywords: ['承認', '取り消', 'やり直'],
    answer: () => ({ text: '承認すると、その内容で次の制作に進みます（要件定義書 → サイトマップ → トップデザイン → 品質チェックの順）。承認した日時はアフロにも記録されます。承認後に変えたいことがあれば、担当者にご相談ください。', action: { label: '確認・承認を開く', to: '/portal/approvals' } }),
  },
  {
    id: 'contact', label: '担当者と話したい', keywords: ['担当', '相談', '電話', '連絡', '人と'],
    answer: (state) => {
      const owner = memberById(currentProject(state).ownerId);
      return { text: `担当は ${owner.name}（${owner.role}）です。ホームの「担当者に相談する」から連絡できます（デモのため送信はされません）。`, action: { label: 'ホームを開く', to: '/portal' } };
    },
  },
];

/** 自由入力への返答。話題が見つからないときは、候補と担当者への相談を案内する */
export function reply(input: string, state: DemoState): AssistantReply {
  const q = input.trim().toLowerCase();
  const topic = TOPICS.find((t) => t.keywords.some((k) => q.includes(k.toLowerCase())));
  if (topic) return topic.answer(state);
  return { text: 'すみません、その質問にはまだお答えできません（デモでは、用意した質問にだけお答えします）。下の候補から選ぶか、担当者にご相談ください。' };
}
