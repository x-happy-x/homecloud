import {api, post, query} from '../api';
import type {Album, CatalogStats, Face, Group, PhotoSummary, PhotosPage} from '../../types/api';

export interface CatalogState {
  stats: CatalogStats;
  groups: Group[];
  people: Group[];
  noise?: Group[];
  excluded?: Group[];
  albums?: Album[];
  people_albums?: unknown[];
  hidden_count?: number;
}

export const getState = (hideAdult: boolean) =>
  api<CatalogState>(`/api/state${query({adult: hideAdult ? 'hide' : ''})}`);

export const getGroup = (key: string, hideAdult: boolean) =>
  api<{group: Group; faces: Face[]}>(
    `/api/group${query({key, adult: hideAdult ? 'hide' : ''})}`);

export interface PhotosParams {
  limit: number;
  offset: number;
  q?: string;
  person?: string[];
  type?: string;
  kind?: string;
  blurry?: boolean;
  adult?: string;
  folder?: string;
  folder_deep?: string;
  album?: number;
  hidden?: boolean;
}

export function getPhotos(params: PhotosParams): Promise<PhotosPage> {
  const {person = [], ...rest} = params;
  const search = new URLSearchParams(query(rest as Record<string, string | number | boolean>).slice(1));
  person.forEach(name => search.append('person', name));
  return api<PhotosPage>(`/api/photos?${search.toString()}`);
}

export const getPhoto = (path: string) =>
  api<{photo: PhotoSummary}>(`/api/photo${query({path})}`).then(data => data.photo);

export const getFolders = (path: string) =>
  api<{trail: Array<{name: string; path: string}>; items: Array<{name: string; path: string; photos: number}>}>(
    `/api/folders${query({path})}`);

export const undo = () => post('/api/undo');
