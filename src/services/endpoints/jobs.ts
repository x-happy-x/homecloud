import {api, post, query} from '../api';
import type {PhotoSummary} from '../../types/api';

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
  errors?: number;
  /** Файлов с посчитанным хешем содержимого и с перцептивным хешем. */
  hashed?: number;
  pictured?: number;
}

export const getDuplicatesStatus = () => api<DuplicatesStatus>('/api/duplicates/status');
export const startDuplicatesScan = (similar: boolean) => post('/api/duplicates/scan', {similar});
export const stopDuplicatesScan = () => post('/api/duplicates/stop');

export interface DuplicatePhoto extends PhotoSummary {
  folder?: string;
  filename?: string;
}

export interface DuplicateGroup {
  key: string;
  kind: 'exact' | 'similar';
  /** Что оставить по мнению сервера: самый крупный кадр, затем самый тяжёлый файл. */
  keep: string;
  count: number;
  /** Байт освободится, если удалить всё, кроме keep. */
  extra: number;
  /** Самый большой файл группы. */
  file_size?: number;
  /** Все пути группы, keep первым. */
  paths: string[];
  /** Карточки первых путей — не больше дюжины. */
  photos: DuplicatePhoto[];

}

export interface DuplicatesSummary {
  groups: number;
  exact: number;
  similar: number;
  files: number;
  extra_files: number;
  extra_bytes: number;
  small_groups: number;
  hashed: number;
  pictured: number;
  top_folders: Array<{folder: string; copies: number}>;
}

export interface DuplicatesPage {
  groups: DuplicateGroup[];
  /** Групп после фильтра. */
  total: number;
  /** Сводка по группам выбранной папки, до фильтров вида и размера. */
  summary?: DuplicatesSummary;
}

export const getDuplicates = (
  similar: boolean,
  filters: {kind: string; sort: string; hideSmall: boolean; folder: string},
  limit: number,
  offset: number,
  signal?: AbortSignal,
) => api<DuplicatesPage>(`/api/duplicates${query({
  similar: similar ? 1 : 0, kind: filters.kind, sort: filters.sort, folder: filters.folder,
  hide_small: filters.hideSmall ? 1 : 0, limit, offset,
})}`, {signal});
