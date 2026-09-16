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
  /** Сохранено разметкой прямо из ответа RAM++ или Qwen. */
  local_reviewed?: number;
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
  /** Что сказали разметчики, уже смотревшие снимок: движок → метки. Пустой массив — ничего не нашёл. */
  router_alternatives?: Partial<Record<TaggerId, string[]>>;
}

export type TaggerId = 'ram_plus' | 'qwen' | 'lmstudio';

export interface TaggerQuality {
  /** Сколько снимков, размеченных вручную, разметчик тоже посмотрел. */
  photos: number;
  /** Доля верных среди того, что он отметил. */
  precision: number | null;
  /** Доля найденного из того, что отметили вы. */
  recall: number | null;
}

export interface RouterTagger {
  id: TaggerId | 'zero_shot' | 'trained';
  title: string;
  /** Основной источник меток — для сравнения, не запускается. */
  base?: boolean;
  ready: boolean;
  note?: string;
  detail?: string;
  tagged?: number;
  accepted?: number;
  labels: number;
  quality: TaggerQuality;
}

export interface RouterJob {
  active?: boolean;
  status?: string;
  action?: 'train' | 'bootstrap' | 'tag';
  engine?: TaggerId;
  scope?: 'queue' | 'reviewed';
  accept?: boolean;
  accepted?: number;
  errors?: number;
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

export const getRouterTaggers = () => api<{taggers: RouterTagger[]}>('/api/router/taggers');

export const getRouterBatches = () => api<{batches: RouterBatch[]}>('/api/router/batches');

export const runRouter = (action: 'bootstrap' | 'train') => post(`/api/router/${action}`);
export const saveRouterLabel = (payload: {path: string; labels: Record<string, boolean>; propagate: boolean}) =>
  post<{similar?: string[]; auto_started?: boolean}>('/api/router/label', payload);
export const skipRouterPhoto = (path: string) => post('/api/router/skip', {path});
export const clearRouterSkips = () => post<{restored: number}>('/api/router/skips/clear');
export const cancelRouterBatch = (batchId: string) => post('/api/router/batch/cancel', {batch_id: batchId});
export const importRouterAnswer = (text: string) =>
  post<{imported: number; skipped: string[]; auto_started?: boolean}>('/api/router/import', {text});
export const startRouterTagging = (payload: {
  engine: TaggerId; scope: 'queue' | 'reviewed'; count: number; accept: boolean; adult: string;
}) => post('/api/router/tag', payload);
export const stopRouterJob = () => post('/api/router/stop');
export const activateRouterModel = (payload: {version: string}) => post('/api/router/activate', payload);

/** Адрес архива-пакета: запрос сам создаёт пакет и резервирует снимки. */
export const routerExportUrl = (count: number, hideAdult: boolean) =>
  `/api/router/export${query({count, adult: hideAdult ? 'hide' : ''})}`;
