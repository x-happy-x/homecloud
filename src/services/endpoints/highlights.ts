import {api, post, query} from '../api';
import type {PhotoCard} from '../../types/api';

export type HighlightKind = 'month' | 'year' | 'event' | 'on-this-day';

/** Сводка подборки, как её кладёт генератор в meta. */
export interface HighlightMeta {
  candidates?: number;
  representatives?: number;
  collapsed?: number;
  events?: number;
  people?: Record<string, number>;
  duration_hours?: number;
}

export interface Highlight {
  id: number;
  key: string;
  kind: HighlightKind | string;
  title: string;
  subtitle: string;
  /** Местное время съёмки без пояса, ISO. */
  period_start: string | null;
  period_end: string | null;
  score: number;
  photo_count: number;
  cover_path: string | null;
  generated_at: string;
  meta: HighlightMeta;
  cover?: PhotoCard | null;
}

/** Почему снимок попал в подборку — разбор оценки от генератора. */
export interface HighlightReasons {
  base: number;
  visual: number | null;
  technical: number;
  personal: number;
  time_source: string;
  gain: number;
  redundancy: number;
  bucket_penalty: number;
  nearest: string | null;
  pick: number;
  event: string;
  /** Сколько почти одинаковых кадров схлопнулось в этот. */
  series: number;
}

export interface HighlightPhoto extends PhotoCard {
  highlight: {position: number; score: number; pick: number; reasons: HighlightReasons};
}

export interface HighlightsPage {
  groups: Highlight[];
  total: number;
  job: HighlightsJob;
}

export interface HighlightsJob {
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'error' | string;
  step: string;
  done: number;
  total: number;
  error: string;
  started_at: number;
  finished_at: number;
  result?: {highlights?: {saved?: number; candidates?: number; kept_previous?: boolean}};
}

export const getHighlights = (kind: string, hideAdult: boolean, limit = 200) =>
  api<HighlightsPage>(`/api/highlights${query({kind, limit, adult: hideAdult ? 'hide' : ''})}`);

export const getHighlight = (key: string, hideAdult: boolean) =>
  api<{group: Highlight & {photos: HighlightPhoto[]}}>(
    `/api/highlights/${encodeURIComponent(key)}${query({adult: hideAdult ? 'hide' : ''})}`);

export const getHighlightsStatus = () => api<HighlightsJob>('/api/highlights/status');

/** curate — сначала досчитать оценки снимков (новые и изменившиеся файлы). */
export const regenerateHighlights = (curate: boolean) =>
  post<{job: HighlightsJob}>('/api/highlights/regenerate', {curate});
