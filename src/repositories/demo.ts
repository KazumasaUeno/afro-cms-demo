import { useMemo } from 'react';
import type { ApprovalLog, DemoState } from '@/types';
import { allDevPeople } from '@/data/people';
import { clientAccountsState, devAccessState, devProjectsState, devUsersState, useDemo } from '@/store/DemoStore';
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
        useHistory: (projectId) => ready(approvalLogsOf(useDemo().state, projectId)),
        approveRequirements: (_projectId, by) => run({ type: 'approveRequirements', by }),
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
