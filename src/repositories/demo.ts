import { useMemo } from 'react';
import type { ApprovalKey, ApprovalLog, DemoState } from '@/types';
import { allDevPeople } from '@/data/people';
import { clientAccountsState, devAccessState, devProjectsState, devUsersState, useDemo } from '@/store/DemoStore';
import { workView } from '@/store/projectWork';
import { REQUEST_TITLE } from '@/store/reducer';
import { CLIENT_PROJECT_ID } from '@/components/layout/nav';
import type { Query, Repositories } from './types';

/**
 * demo 実装（BACKEND_FIREBASE §13.2 の 1 段目）。既存の DemoStore（reducer＋localStorage `afro-cms-demo:state`）を包むだけで、
 * 動き・保存先・不変条件（承認後は回答不可など）は reducer のまま変えない。projectId は使わない（データは 1 案件分）
 */

const ready = <T>(data: T): Query<T> => ({ data, loading: false, error: null });

/** 承認の記録のうち、その案件のもの。projectId の無い古い記録は、デモのデータを持つ案件のものとみなす */
export function approvalLogsOf(state: DemoState, projectId: string): ApprovalLog[] {
  // projectId の無い古い記録は MINAMO COFFEE（0.28 までは制作データがこの案件の分だけだった）
  return state.approvalLogs.filter((l) => (l.projectId ?? CLIENT_PROJECT_ID) === projectId);
}

/**
 * 承認の履歴として画面に出す行（approvals.useHistory の demo 実装）。承認の依頼も履歴に出す（2026-11-17 ユーザー指示）。
 * 依頼の記録（ProjectWork.approvalRequests。demo だけの持ち方）はあるのに履歴の行が無いもの（この機能より前の依頼・初期データ）は、
 * 依頼の日時から行を補う（操作した人は分からないので「アフロ」）。
 * live は依頼そのものを projects/{id}/approvals に記録するので補わない（0.47.4 で画面 ApprovalHistory から移した。live で useDemo が落ちたため）
 */
export function approvalHistoryOf(state: DemoState, projectId: string): ApprovalLog[] {
  const stored = approvalLogsOf(state, projectId);
  const requests = workView(state, projectId).approvalRequests;
  const extra: ApprovalLog[] = Object.entries(requests ?? {})
    .filter(([key, at]) => !!at && !stored.some((l) => l.action === `${REQUEST_TITLE[key as ApprovalKey]}の承認を依頼`))
    .map(([key, at]) => ({ id: `req-${key}`, at: at as string, actor: 'アフロ', side: 'afro' as const, action: `${REQUEST_TITLE[key as ApprovalKey]}の承認を依頼`, target: 'お客様への承認依頼', projectId }));
  return extra.length ? [...stored, ...extra].sort((a, b) => b.at.localeCompare(a.at)) : stored;
}

export function useDemoRepositories(): Repositories {
  const { dispatch, flush } = useDemo();
  return useMemo<Repositories>(() => {
    const run = (action: Parameters<typeof dispatch>[0]): Promise<void> => {
      dispatch(action);
      return Promise.resolve();
    };
    return {
      projects: {
        useList: () => ready(useDemo().state.projects),
        useCurrentId: () => useDemo().state.currentProjectId,
        select: (id) => dispatch({ type: 'setCurrentProject', id }),
        create: (project) => run({ type: 'createProject', project }),
        update: (id, project) => run({ type: 'updateProject', id, project }),
      },
      requirements: {
        useCurrent: (_projectId) => ready(useDemo().state.requirements),
        setAnswer: (_projectId, questionId, value, by) => run({ type: 'setAnswer', questionId, value, by }),
        setAnswers: (_projectId, entries, by) => {
          entries.forEach((e) => dispatch({ type: 'setAnswer', questionId: e.questionId, value: e.value, by }));
          return Promise.resolve();
        },
        confirmAnswer: (_projectId, questionId, by) => run({ type: 'confirmAnswer', questionId, by }),
        completeAnalysis: () => run({ type: 'completeAnalysis' }),
        reset: () => run({ type: 'resetRequirements' }),
        sendBack: () => run({ type: 'sendBackRequirements' }),
        saveNow: () => Promise.resolve(flush()),
      },
      approvals: {
        useHistory: (projectId) => {
          const { state } = useDemo();
          return ready(useMemo(() => approvalHistoryOf(state, projectId), [state, projectId]));
        },
        // 代理承認（{ proxyNote }）は live だけ（demo の画面は出さない。ADMIN_FULL_RIGHTS_PLAN L-7）
        approveRequirements: (_projectId, by) => (typeof by === 'object' ? Promise.reject(new Error('デモでは代理承認を扱いません')) : run({ type: 'approveRequirements', by })),
      },
      accounts: {
        useClientAccounts: () => ready(clientAccountsState(useDemo().state)),
        useDevUsers: () => ready(devUsersState(useDemo().state)),
        useDevPeople: () => ready(allDevPeople(useDemo().state)),
        useDevAccess: () => ready(devAccessState(useDemo().state)),
        useDevProjects: () => ready(devProjectsState(useDemo().state)),
        saveClientAccount: (account) => run({ type: 'saveClientAccount', account }),
        setClientAccountStatus: (id, enabled) => run({ type: 'setClientAccountStatus', id, enabled }),
        setDevAccess: (memberId, enabled) => run({ type: 'setDevAccess', memberId, enabled }),
        saveDevUser: (user) => run({ type: 'saveDevUser', user }),
        setDevUserStatus: (id, enabled) => run({ type: 'setDevUserStatus', id, enabled }),
        setDevProjects: (memberId, projectIds) => run({ type: 'setDevProjects', memberId, projectIds }),
      },
    };
  }, [dispatch, flush]);
}
