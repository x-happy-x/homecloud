import {post} from '../api';

export const hidePhotos = (paths: string[]) => post('/api/photos/hide', {paths});
export const revealPhotos = (paths: string[]) => post('/api/photos/reveal', {paths});
export const deletePhotos = (paths: string[]) => post('/api/photos/delete', {paths});

export const processPhotos = (payload: {paths: string[]; features: Record<string, boolean>; force: boolean}) =>
  post('/api/photos/process', payload);

export const assignSpeaker = (payload: Record<string, unknown>) =>
  post('/api/photos/assign-speaker', payload);

/**
 * Заливает уменьшенную копию во временное хранилище и возвращает прямую
 * ссылку — по ней строится поиск по картинке во внешних поисковиках.
 */
export const uploadForSearch = (path: string) =>
  post<{url: string}>('/api/photos/search-upload', {path});
