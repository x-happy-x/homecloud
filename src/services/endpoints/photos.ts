import {post} from '../api';

/** Пакетные действия со снимками: что получилось и что нет, по путям. */
export interface BatchErrors {
  errors: Array<{path?: string; error?: string} | string>;
}

export const hidePhotos = (paths: string[]) =>
  post<{hidden: number} & BatchErrors>('/api/photos/hide', {paths});
export const revealPhotos = (paths: string[]) =>
  post<{revealed: number} & BatchErrors>('/api/photos/reveal', {paths});
export const deletePhotos = (paths: string[]) =>
  post<{deleted: number} & BatchErrors>('/api/photos/delete', {paths});

export const processPhotos = (payload: {paths: string[]; features: Record<string, boolean>; force: boolean}) =>
  post('/api/photos/process', payload);

export const assignSpeaker = (payload: {
  path: string;
  speaker: string;
  name: string;
  bigfam_id: string | null;
}) => post('/api/photos/assign-speaker', payload);

/**
 * Заливает уменьшенную копию во временное хранилище и возвращает прямую
 * ссылку — по ней строится поиск по картинке во внешних поисковиках.
 */
export const uploadForSearch = (path: string) =>
  post<{url: string}>('/api/photos/search-upload', {path});
