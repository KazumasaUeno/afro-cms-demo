import type { DeployEnv, DevTaskStatus } from '@/types';
import type { PillTone } from '@/components/ui';
import { DEV_ENVS, DEV_TASK_STATUSES } from '@/data/dev';

/** 開発者画面の共通表示（状態の色と名前） */
export const TASK_TONE: Record<DevTaskStatus, PillTone> = { todo: 'neutral', doing: 'info', review: 'warning', done: 'success' };

export const taskLabel = (s: DevTaskStatus) => DEV_TASK_STATUSES.find((x) => x.id === s)?.label ?? s;

export const envDef = (env: DeployEnv) => DEV_ENVS.find((e) => e.id === env) ?? DEV_ENVS[0];

export const ENV_TONE: Record<DeployEnv, PillTone> = { development: 'neutral', staging: 'info', production: 'accent' };
