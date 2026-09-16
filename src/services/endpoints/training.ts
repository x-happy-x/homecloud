import {api, post, query} from '../api';
import type {PhotoSummary} from '../../types/api';

export interface RouterLabel {
  id: string;
  title: string;
  group?: string;
}

export interface RouterModel {
  version: string;
  status: string;
  trained_at?: string;
  dataset_size: number;
  embedding_model: string;
  metrics?: Record<string, number | {f1: number; support: number}> & {macro_f1?: number};
}

export interface RouterSummary {
  embedding_model?: string;
  /** zero_shot — метки ставит общая модель, trained — своя обученная версия. */
  source?: 'zero_shot' | 'trained';
  active_version?: string;
  pending?: number;
  embedded?: number;
  predicted?: number;
  reviewed?: number;
  human_reviewed?: number;
  propagated?: number;
  ai_reviewed?: number;
  pending_batches?: number;
  skipped?: number;
  batch_sizes?: number[];
  new_since_training?: number;
  auto_train?: boolean;
  auto_train_every?: number;
  labels?: RouterLabel[];
  models?: RouterModel[];
}

export interface RouterQueueItem extends PhotoSummary {
  filename: string;
  folder: string;
  router_scores?: Record<string, number>;
  /** Самые уверенные варианты модели. */
  router_suggested?: string[];
  /** Метки ставит своя обученная версия — её подсказки можно отмечать заранее. */
  router_trained?: boolean;
}

export interface RouterJob {
  active?: boolean;
  status?: string;
  action?: 'train' | 'bootstrap';
  completed?: number;
  total?: number;
  loss?: number;
  error?: string;
}

export interface RouterBatch {
  batch_id: string;
  created_at: string;
  prompt: string;
  items: Array<{file: string; path: string; photo?: PhotoSummary & {filename?: string}}>;
}

export const getRouterSummary = () => api<RouterSummary>('/api/router/summary');
export const getRouterStatus = () => api<RouterJob>('/api/router/status');

export const getRouterReview = (hideAdult: boolean, limit = 24) =>
  api<{photos: RouterQueueItem[]}>(`/api/router/review${query({limit, adult: hideAdult ? 'hide' : ''})}`);

export const getRouterBatches = () => api<{batches: RouterBatch[]}>('/api/router/batches');

export const runRouter = (action: 'bootstrap' | 'train') => post(`/api/router/${action}`);
export const saveRouterLabel = (payload: {path: string; labels: Record<string, boolean>; propagate: boolean}) =>
  post<{similar?: string[]; auto_started?: boolean}>('/api/router/label', payload);
export const skipRouterPhoto = (path: string) => post('/api/router/skip', {path});
export const clearRouterSkips = () => post<{restored: number}>('/api/router/skips/clear');
export const cancelRouterBatch = (batchId: string) => post('/api/router/batch/cancel', {batch_id: batchId});
export const importRouterAnswer = (text: string) =>
  post<{imported: number; skipped: string[]; auto_started?: boolean}>('/api/router/import', {text});
export const activateRouterModel = (payload: {version: string}) => post('/api/router/activate', payload);

/** Адрес архива-пакета: запрос сам создаёт пакет и резервирует снимки. */
export const routerExportUrl = (count: number, hideAdult: boolean) =>
  `/api/router/export${query({count, adult: hideAdult ? 'hide' : ''})}`;
