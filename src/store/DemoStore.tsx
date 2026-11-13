import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { DemoState } from '@/types';
import { loadJson, removeKey, saveJson, STORAGE_KEY } from '@/services/storage';
import { createSeedState, isDemoState } from './seed';
import { seedProjects } from '@/data/projects';
import { reducer, type Action } from './reducer';
import { syncDemoProject } from './demoProject';
import { seedWorkFor, switchWork, withContent } from './projectWork';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { seedContentFor } from '@/data/projectContent';
import { seedSignage } from '@/data/signage';
import { moveDesignAnswers } from '@/features/design/designReq';
import { emptySitemap, sitemapCreated } from '@/data/sitemap';

interface StoreValue {
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  resetDemo: () => void;
  /** いまの状態をすぐに保存する（「保存」ボタン用）。保存できたら true（プライベートモード・容量超過では false） */
  flush: () => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * 受託開発ではアフロがヒアリングして全問を入力する（2026-11-10 決定）。
 * 0.17 までの保存データには「共同」「お客様が入力」が残っているので、読み込み時にアフロの入力にそろえる。
 * 分担の仕組み（features/requirements/assignment.ts）は将来の Web 版のために残し、画面からは切り替えない
 */
function withAfroMode(state: DemoState): DemoState {
  return state.requirements.mode === 'afro' ? state : { ...state, requirements: { ...state.requirements, mode: 'afro' } };
}

/** 選んでいる案件と制作データの持ち主がずれた保存データ（0.28 まで。制作データは 1 案件分だけ）を、選んでいる案件の分に入れ替える */
function withCurrentWork(state: DemoState): DemoState {
  // 制作データの無い案件（0.28 までの保存データ）は、段階に合う初期データで補って保存する（表示のたびに作り直さない）
  const missing = state.projects.filter((p) => p.id !== state.requirements.projectId && !state.projectWork?.[p.id]);
  const filled = missing.length
    ? { ...state, projectWork: { ...state.projectWork, ...Object.fromEntries(missing.map((p) => [p.id, seedWorkFor(p.id, p.stage)])) } }
    : state;
  return filled.currentProjectId === filled.requirements.projectId || !filled.projects.some((p) => p.id === filled.currentProjectId)
    ? filled
    : switchWork(filled, filled.currentProjectId);
}

/**
 * サイトマップは要件定義書の承認のときに作る（0.29.4。はじめは無い）。0.29.3 までの保存データは、要件定義書が未承認でも
 * 見本のサイトマップを持っているので、未承認でサイトマップも未承認の案件は「まだ作っていない」に戻す（選んでいない案件の分も。版は上げない）
 */
function withoutEarlySitemap(state: DemoState): DemoState {
  const early = (w: Pick<DemoState, 'requirements' | 'sitemap'>) =>
    w.requirements.status !== 'approved' && !w.sitemap.approvedAt && sitemapCreated(w.sitemap);
  const work = state.projectWork ?? {};
  const ids = Object.keys(work).filter((id) => early(work[id]));
  if (!early(state) && ids.length === 0) return state;
  return {
    ...state,
    ...(early(state) ? { sitemap: emptySitemap() } : {}),
    ...(ids.length ? { projectWork: { ...work, ...Object.fromEntries(ids.map((id) => [id, { ...work[id], sitemap: emptySitemap() }])) } } : {}),
  };
}

/**
 * 公開後のデータ（ページ・お知らせ、AI 診断、サイネージ）を案件ごとにする（0.30.0。2026-11-13 ユーザー指示。版は上げない）。
 * 0.29 までの保存データは、上の pages・diagnoses・signage が 1 組だけで、中身は MINAMO COFFEE（p1）のもの。
 * - 制作データの持ち主（requirements.projectId）が p1 なら、そのまま p1 の分として使う（サイネージが無ければ見本を入れる）
 * - 持ち主が p1 以外なら、その 1 組を projectWork.p1 へ移し、上には持ち主の案件の初期データを置く
 * - projectWork の公開後のデータが無い案件は、その案件の初期データで補う
 * withCurrentWork（選んでいる案件への入れ替え）より前に行う（入れ替えで p1 の分が別の案件へ渡らないように）
 */
function withProjectContent(state: DemoState): DemoState {
  const work = state.projectWork ?? {};
  const old = !state.projectWork || Object.values(work).some((w) => !w.pages);
  if (!old) return state.signage ? state : { ...state, signage: seedContentFor(state.requirements.projectId).signage };
  const owner = state.requirements.projectId;
  let s: DemoState = state;
  if (owner === CLIENT_PROJECT_ID) {
    if (!s.signage) s = { ...s, signage: seedSignage() };
  } else {
    const p1 = state.projects.find((p) => p.id === CLIENT_PROJECT_ID);
    const base = work[CLIENT_PROJECT_ID] ?? seedWorkFor(CLIENT_PROJECT_ID, p1?.stage ?? 'hearing');
    const mine = seedContentFor(owner);
    s = {
      ...s,
      projectWork: { ...work, [CLIENT_PROJECT_ID]: { ...base, pages: state.pages, diagnoses: state.diagnoses, signage: state.signage ?? seedSignage() } },
      pages: mine.pages, diagnoses: mine.diagnoses, signage: mine.signage,
    };
  }
  const rest = s.projectWork ?? {};
  const lacking = Object.keys(rest).filter((id) => !rest[id].pages || !rest[id].diagnoses || !rest[id].signage);
  return lacking.length ? { ...s, projectWork: { ...rest, ...Object.fromEntries(lacking.map((id) => [id, withContent(id, rest[id])])) } } : s;
}

/** 初期データに後から足した見本の案件（p7 など）を、保存済みのデータにも加える（無い id だけ。制作データは withCurrentWork が段階から補う） */
function withSeedProjects(state: DemoState): DemoState {
  const missing = seedProjects().filter((p) => !state.projects.some((x) => x.id === p.id));
  return missing.length ? { ...state, projects: [...state.projects, ...missing] } : state;
}

function init(): DemoState {
  // 保存済みのデータに古い進捗が残っていても、デモのデータに合わせ直す。
  // 0.27 までのヒアリングにあったデザインの 3 問の回答は、デザイン要件定義へ移す（0.28.0。版は上げない）
  // 要件定義書の承認前に持っているサイトマップは外す（0.29.4。版は上げない）
  // 公開後のデータ（ページ・診断・サイネージ）を案件ごとに分ける（0.30.0。版は上げない）
  return syncDemoProject(withoutEarlySitemap(withCurrentWork(withProjectContent(withSeedProjects(moveDesignAnswers(withAfroMode(loadJson(STORAGE_KEY, isDemoState) ?? createSeedState())))))));
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const timer = useRef<number | undefined>(undefined);

  // 書き込みはまとめて行う（ドラッグ中などの連続更新で localStorage を叩きすぎない）
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveJson(STORAGE_KEY, state), 250);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  // 250ms 以内にタブを閉じた・再読み込みした場合も、最後の操作を失わない
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => saveJson(STORAGE_KEY, latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      resetDemo: () => {
        removeKey(STORAGE_KEY);
        dispatch({ type: 'reset' });
      },
      flush: () => saveJson(STORAGE_KEY, latest.current),
    }),
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** DemoStoreProvider の外（live モード）では null。モードに関係なく使う部品（動きを減らす設定など）だけが使う */
export function useDemoOptional(): StoreValue | null {
  return useContext(StoreContext);
}

export function useDemo(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useDemo must be used inside DemoStoreProvider');
  return v;
}

export { clientAccountsState, currentProject, devAccessState, devProjectsState, devState, signageState } from './reducer';
export { devUsersState } from '@/data/people';
