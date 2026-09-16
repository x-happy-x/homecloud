import {api, post} from '../api';

export interface ReclusterStep {
  key: string;
  title: string;
}

/**
 * Пересборка групп. Признака active у неё нет — идёт она или нет, видно
 * только по status.
 */
export interface ReclusterStatus {
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'error' | string;
  step: string;
  step_index: number;
  steps_total: number;
  done: number;
  total: number;
  faces_total: number;
  message: string;
  error: string;
  /** Секунды эпохи, как их отдаёт бэкенд. */
  started_at: number;
  step_started_at: number;
  steps: ReclusterStep[];
}

export const getReclusterStatus = () => api<ReclusterStatus>('/api/recluster/status');
/**
 * scope='all' — пересобрать все автоматические группы заново;
 * 'leftovers' — второй проход по одному остатку, не трогая уже собранное.
 */
export const startRecluster = (scope: 'all' | 'leftovers' = 'all') =>
  post<{job: ReclusterStatus}>('/api/recluster/start', {scope});
export const stopRecluster = () => post<{job: ReclusterStatus}>('/api/recluster/stop');

export interface DuplicatesStatus {
  active: boolean;
  /** counting — собираем список файлов, running — считаем хеши. */
  status?: string;
  done?: number;
  total?: number;
  current?: string;
  message?: string;
}

export const getDuplicatesStatus = () => api<DuplicatesStatus>('/api/duplicates/status');
export const startDuplicatesScan = (similar: boolean) => post('/api/duplicates/scan', {similar});
export const stopDuplicatesScan = () => post('/api/duplicates/stop');

export const getDuplicates = (similar: boolean, limit: number, offset: number) =>
  api<{groups: Array<Record<string, unknown>>; total: number}>(
    `/api/duplicates?similar=${similar ? 1 : 0}&limit=${limit}&offset=${offset}`);
