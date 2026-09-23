import {api, post, query} from '../api';
import type {CandidateFace} from '../../types/api';
import type {CatalogState} from './catalog';

export interface CatalogChangeReply {
  ok: boolean;
  state: CatalogState;
}

export const assignGroups = (payload: Record<string, unknown>) =>
  post<CatalogChangeReply>('/api/assign-groups', payload);

export const assignFaces = (payload: Record<string, unknown>) =>
  post<CatalogChangeReply>('/api/assign-faces', payload);

export const excludeFaces = (payload: Record<string, unknown>) => post<CatalogChangeReply>('/api/exclude', payload);

/** Исключить сразу все лица одного файла (`folder: false`) или всей папки. */
export const excludePath = (path: string, folder: boolean) =>
  post('/api/exclude-path', {path, folder});

/** Сколько людей на самом деле в ролике — подсказка против лишних групп. */
export const getVideoPeopleHint = (path: string) =>
  api<{path: string; count: number | null}>(`/api/video-people${query({path})}`);

export const setVideoPeopleHint = (path: string, count: number | null) =>
  post('/api/video-people', {path, count});

export const setAvatar = (payload: Record<string, unknown>) => post('/api/set-avatar', payload);
export const clearAvatar = (payload: Record<string, unknown>) => post('/api/clear-avatar', payload);

// Форму ответа задаёт вызывающий экран: здесь она ничем не ограничена,
// а описывать её дважды смысла нет.
export const getSimilar = <T,>(key: string, limit = 8) =>
  api<T>(`/api/similar${query({key, limit})}`);

export const getSimilarPairs = <T,>(namedOnly: boolean, limit = 24) =>
  api<T>(`/api/similar-pairs${query({limit, named: namedOnly ? 1 : ''})}`);

export const compareGroups = <T,>(a: string, b: string) => api<T>(`/api/compare${query({a, b})}`);

export interface FaceSuggestion {
  /** Ключ автоматической группы, например `auto:12`. */
  key: string;
  person_id: number;
  name: string;
  bigfam_id?: string | null;
  /** Похожесть на ближайшее названное лицо, от 0 до 1. */
  score: number;
  faces: number;
}

export interface FaceSuggestions {
  enabled: boolean;
  threshold: number;
  suggestions: FaceSuggestion[];
}

/** Кого напоминают безымянные группы. Только подсказка: ничего не меняет. */
export const getFaceSuggestions = () => api<FaceSuggestions>('/api/suggestions');

/**
 * Безымянные лица, похожие на названного человека, — по одному, а не группой.
 * Только подсказка: имя появится, когда человек подтвердит.
 */
export const getPersonCandidates = (key: string, hideAdult: boolean) =>
  api<{key: string; faces: CandidateFace[]}>(
    `/api/person-candidates${query({key, adult: hideAdult ? 'hide' : ''})}`);
