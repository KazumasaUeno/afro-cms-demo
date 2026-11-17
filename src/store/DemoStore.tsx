import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { DemoState, ProjectWork } from '@/types';
import { loadJson, removeKey, saveJson, STORAGE_KEY } from '@/services/storage';
import { createSeedState, isDemoState } from './seed';
import { seedProjects } from '@/data/projects';
import { ACTOR, clientActorOf, reducer, type Action } from './reducer';
import { syncDemoProject } from './demoProject';
import { approvalLogsFromWork, devTeamOf, lastClientCheck, seedDevOwner, seedWorkFor, switchWork, withContent } from './projectWork';
import { seedSchedule } from '@/data/schedule';
import { approvalSteps } from '@/features/portal/portalSteps';
import { clientActorName } from '@/data/projects';
import { nowIso } from '@/services/time';
import { QUALITY_ITEMS } from '@/data/quality';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import { seedContentFor } from '@/data/projectContent';
import { seedSignage } from '@/data/signage';
import { MEMBERS } from '@/data/members';
import { DEV_SEED_REV, OLD_SEED_DEV_PROJECTS, seedDevProjects } from '@/data/users';
import { seedDevFor } from '@/data/dev';
import { withProjectPresets } from '@/data/assets';
import { moveDesignAnswers } from '@/features/design/designReq';
import { emptySitemap, sitemapCreated } from '@/data/sitemap';
import { useToast } from '@/hooks/useToast';

interface StoreValue {
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  resetDemo: () => void;
  /** いまの状態をすぐに保存する（「保存」ボタン用）。保存できたら true（プライベートモード・容量超過では false） */
  flush: () => boolean;
  /** 自動保存（操作のたびの書き込み）に失敗している間 true（0.39.1。容量超過・プライベートモード）。次に保存できたら false に戻る */
  saveFailed: boolean;
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

/**
 * 開発データ（構築タスク・デプロイ）を案件ごとにする（2026-11-17 ユーザー指示。版は上げない）。
 * それより前の保存データの dev は 1 組だけ（projectId なし）で、中身は MINAMO COFFEE（p1）の分。
 * - 制作データの持ち主（requirements.projectId）が p1 なら、p1 の分の印を付ける
 * - 持ち主が p1 以外なら projectWork.p1 へ移す（上には持ち主の案件の初期データを置く）
 * - 開発データの無い案件は、その案件の段階に合う初期データで補う（表示のたびに作り直さない）
 * withCurrentWork（選んでいる案件への入れ替え）より前に行う（入れ替えで p1 の分が別の案件へ渡らないように）
 */
function withProjectDev(state: DemoState): DemoState {
  const stageOf = (id: string) => state.projects.find((p) => p.id === id)?.stage ?? 'hearing';
  const owner = state.requirements.projectId;
  let work = state.projectWork ?? {};
  let top = state.dev;
  if (top && !top.projectId) {
    if (owner === CLIENT_PROJECT_ID) top = { ...top, projectId: CLIENT_PROJECT_ID };
    else {
      if (work[CLIENT_PROJECT_ID]) work = { ...work, [CLIENT_PROJECT_ID]: { ...work[CLIENT_PROJECT_ID], dev: { ...top, projectId: CLIENT_PROJECT_ID } } };
      top = undefined;
    }
  }
  if (!top) top = seedDevFor(owner, stageOf(owner), devTeamOf(state, owner));
  const lacking = Object.keys(work).filter((id) => !work[id].dev);
  if (lacking.length) work = { ...work, ...Object.fromEntries(lacking.map((id) => [id, { ...work[id], dev: seedDevFor(id, stageOf(id), devTeamOf(state, id)) }])) };
  // 素材ドライブの古い見本（SVG の珈琲 4 点）も、その案件の写真に置き換える（2026-11-17）
  const assets = withProjectPresets(owner, state.assets);
  const oldPresets = Object.keys(work).filter((id) => withProjectPresets(id, work[id].assets) !== work[id].assets);
  if (oldPresets.length) work = { ...work, ...Object.fromEntries(oldPresets.map((id) => [id, { ...work[id], assets: withProjectPresets(id, work[id].assets) }])) };
  if (top === state.dev && assets === state.assets && work === (state.projectWork ?? {})) return state;
  return { ...state, dev: top, ...(assets ? { assets } : {}), ...(state.projectWork || lacking.length ? { projectWork: work } : {}) };
}

/** 初期データに後から足した見本の案件（p7 など）を、保存済みのデータにも加える（無い id だけ。制作データは withCurrentWork が段階から補う） */
function withSeedProjects(state: DemoState): DemoState {
  const missing = seedProjects().filter((p) => !state.projects.some((x) => x.id === p.id));
  return missing.length ? { ...state, projects: [...state.projects, ...missing] } : state;
}

/**
 * 0.30.2 までのアクティビティには、お客様側の操作の印（side）が無い。会社名を後から直すと名前では見分けられなくなるので、
 * 読み込み時に 1 回だけ、いまの担当者名か旧名（0.30.1 まで全案件で使っていた「ミナモ珈琲 担当者」）の記録に印を付ける（0.30.4。版は上げない）
 */
export function withClientMarks(state: DemoState): DemoState {
  let changed = false;
  const activities = state.activities.map((a) => {
    if (a.side || !a.projectId || (a.actor !== ACTOR.client && a.actor !== clientActorOf(state, a.projectId))) return a;
    changed = true;
    return { ...a, side: 'client' as const };
  });
  return changed ? { ...state, activities } : state;
}

/**
 * 開発者画面の権限は全員にある（2026-11-16 ユーザー指示）。0.39.5 までの保存データ（devSeed なし）に 1 回だけ当てる（版は上げない）:
 * - 固定のメンバー全員に開発者画面の権限を付ける（登録した開発者の権限はそのまま）
 * - 担当が初期のまま（OLD_SEED_DEV_PROJECTS と同じ）の人だけ、新しい初期の担当にする（管理者が変えた担当は残す）
 * 当てたら devSeed を付け、以後は管理者の変更（権限を外すなど）を上書きしない
 */
function withDevSeed(state: DemoState): DemoState {
  if (state.devSeed === DEV_SEED_REV) return state;
  const access = { ...(state.devAccess ?? {}), ...Object.fromEntries(MEMBERS.map((m) => [m.id, true])) };
  const saved = state.devProjects ?? {};
  const fresh = seedDevProjects();
  const same = (a: string[] | undefined, b: string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const devProjects = { ...saved, ...Object.fromEntries(MEMBERS.filter((m) => same(saved[m.id], OLD_SEED_DEV_PROJECTS[m.id])).map((m) => [m.id, fresh[m.id]])) };
  return { ...state, devAccess: access, devProjects, devSeed: DEV_SEED_REV };
}

/**
 * 品質チェックの「完了」（0.39.7）より前の保存データ: 公開済み（運用・改善）の案件で、お客様側の全項目が済んでいるのに完了の日時が無いものは、
 * いちばん新しいお客様のチェックの日時で完了済みにする（品質管理の段階の案件は、お客様が「完了」を押す）。版は上げない
 */
function withQualityApproval(state: DemoState): DemoState {
  const live = (id: string) => ['operation', 'improvement'].includes(state.projects.find((p) => p.id === id)?.stage ?? '');
  const fix = <T extends { design: DemoState['design']; qualityChecks: DemoState['qualityChecks'] }>(w: T, id: string): T => {
    if (w.design.qualityApprovedAt || !live(id) || !QUALITY_ITEMS.every((i) => !!w.qualityChecks[i.id]?.clientAt)) return w;
    return { ...w, design: { ...w.design, qualityApprovedAt: lastClientCheck(w.qualityChecks) } };
  };
  const top = fix(state, state.requirements.projectId);
  const work = state.projectWork;
  if (!work) return top;
  const next = Object.fromEntries(Object.entries(work).map(([id, w]) => [id, fix(w, id)]));
  return Object.keys(next).some((id) => next[id] !== work[id]) ? { ...top, projectWork: next } : top;
}

/**
 * 日程・承認の依頼・承認履歴（2026-11-17 会議）より前の保存データを補う（選んでいる案件と projectWork の全案件。版は上げない）:
 * - 要件定義書を承認済みで日程の無い案件に、日程を入れる（公開予定日は案件の公開予定日から。data/schedule.ts の seedSchedule）
 * - 承認の依頼の記録が無い（approvalRequests が無い）案件は、いま承認待ちの節目を依頼済みにする（お客様の画面の承認待ちを「準備中」に戻さない）
 * - 承認済みの節目（全ページの構築を含む）で承認の記録が無いものを、承認履歴に足す
 * 品質管理の段階で品質チェックの完了がある案件は、syncDemoProject がリリースの段階にする
 */
function withScheduleAndRequests(state: DemoState): DemoState {
  // 0.41.0 より前の保存データに 1 回だけ（毎回だと、要件定義の承認の後に再読み込みするだけで日程・依頼が埋まる。2026-11-17 レビュー）
  if (state.scheduleMigrated) return state;
  const projectOf = (id: string) => state.projects.find((p) => p.id === id);
  const logs: DemoState['approvalLogs'] = [];
  const fix = <T extends ProjectWork>(w: T, id: string, view: DemoState): T => {
    let next = w;
    if (w.requirements.status === 'approved' && !w.schedule) next = { ...next, schedule: seedSchedule(w, projectOf(id)?.launchDate, seedDevOwner(id)) };
    if (!w.approvalRequests) {
      const at = nowIso();
      const waiting = approvalSteps(view).filter((x) => x.awaitingRequest).map((x) => [x.key, at]);
      next = { ...next, approvalRequests: Object.fromEntries(waiting) };
    }
    const p = projectOf(id);
    const mine = state.approvalLogs.filter((l) => (l.projectId ?? CLIENT_PROJECT_ID) === id);
    logs.push(...approvalLogsFromWork(id, w, p ? clientActorName(p.clientName) : ACTOR.client, (a) => mine.some((l) => l.action === a)));
    return next;
  };
  const topWork = fix(state as DemoState & ProjectWork, state.requirements.projectId, state);
  const work = state.projectWork ?? {};
  const nextWork = Object.fromEntries(Object.entries(work).map(([id, w]) => [id, fix(w, id, { ...state, ...w, schedule: w.schedule, approvalRequests: w.approvalRequests })]));
  const changedWork = Object.keys(nextWork).some((id) => nextWork[id] !== work[id]);
  if (topWork === state && !changedWork && logs.length === 0) return { ...state, scheduleMigrated: true };
  return {
    ...state,
    scheduleMigrated: true,
    schedule: topWork.schedule,
    approvalRequests: topWork.approvalRequests,
    ...(changedWork ? { projectWork: nextWork } : {}),
    ...(logs.length ? { approvalLogs: [...state.approvalLogs, ...logs].sort((a, b) => b.at.localeCompare(a.at)) } : {}),
  };
}

function init(): DemoState {
  // 保存済みのデータに古い進捗が残っていても、デモのデータに合わせ直す。
  // 0.27 までのヒアリングにあったデザインの 3 問の回答は、デザイン要件定義へ移す（0.28.0。版は上げない）
  // 要件定義書の承認前に持っているサイトマップは外す（0.29.4。版は上げない）
  // 公開後のデータ（ページ・診断・サイネージ）を案件ごとに分ける（0.30.0。版は上げない）
  // 日程・承認の依頼・承認履歴を補う（2026-11-17 会議。版は上げない）
  return syncDemoProject(withScheduleAndRequests(withQualityApproval(withDevSeed(withClientMarks(withoutEarlySitemap(withCurrentWork(withProjectDev(withProjectContent(withSeedProjects(moveDesignAnswers(withAfroMode(loadJson(STORAGE_KEY, isDemoState) ?? createSeedState()))))))))))));
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const timer = useRef<number | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);

  // 書き込みはまとめて行う（ドラッグ中などの連続更新で localStorage を叩きすぎない）。
  // 失敗は黙って捨てず、画面へ知らせる（SaveFailureNotice。0.39.1。2026-11-16）
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaveFailed(!saveJson(STORAGE_KEY, state)), 250);
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
      // 手動の保存の結果も通知の状態へ反映する（成功で解除し、次の失敗でまた知らせる）
      flush: () => {
        const ok = saveJson(STORAGE_KEY, latest.current);
        setSaveFailed(!ok);
        return ok;
      },
      saveFailed,
    }),
    [state, saveFailed],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/**
 * 自動保存に失敗したら 1 回だけ知らせる（0.39.1。2026-11-16）。失敗が続く間は繰り返さず、保存できた後にまた失敗したら再び出す。
 * トーストは DemoStoreProvider の内側（ToastProvider）で使うので、別の部品にしている（main.tsx）
 */
export function SaveFailureNotice() {
  const { saveFailed } = useDemo();
  const toast = useToast();
  useEffect(() => {
    if (saveFailed) toast('このブラウザに保存できませんでした（保存容量の上限を超えたか、プライベートモードです）。使っていない素材や記録を削除してください', 'error');
  }, [saveFailed, toast]);
  return null;
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
