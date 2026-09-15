import {api, post, query} from '../api';

export const assignGroups = (payload: Record<string, unknown>) =>
  post('/api/assign-groups', payload);

export const assignFaces = (payload: Record<string, unknown>) =>
  post('/api/assign-faces', payload);

export const excludeFaces = (payload: Record<string, unknown>) => post('/api/exclude', payload);

export const setAvatar = (payload: Record<string, unknown>) => post('/api/set-avatar', payload);
export const clearAvatar = (payload: Record<string, unknown>) => post('/api/clear-avatar', payload);

export const getSimilar = (key: string, limit = 8) =>
  api<{similar: Array<Record<string, unknown>>}>(`/api/similar${query({key, limit})}`);

export const getSimilarPairs = (namedOnly: boolean, limit = 24) =>
  api<{pairs: Array<Record<string, unknown>>}>(
    `/api/similar-pairs${query({limit, named: namedOnly ? 1 : ''})}`);

export const compareGroups = (a: string, b: string) =>
  api<Record<string, unknown>>(`/api/compare${query({a, b})}`);
