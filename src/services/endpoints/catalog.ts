import {api, post, query} from '../api';
import type {
  CatalogStats, Folder, Group, GroupDetail, NamedPerson, PeopleAlbum, PhotoCard, PhotoGroupsPage,
  PhotosPage,
} from '../../types/api';

export interface CatalogState {
  stats: CatalogStats;
  groups: Group[];
  people: NamedPerson[];
  people_albums: PeopleAlbum[];
}

export const getState = (hideAdult: boolean) =>
  api<CatalogState>(`/api/state${query({adult: hideAdult ? 'hide' : ''})}`);

export const getGroup = (key: string, hideAdult: boolean) =>
  api<GroupDetail>(`/api/group${query({key, adult: hideAdult ? 'hide' : ''})}`);

export interface PhotosParams {
  limit: number;
  offset: number;
  q?: string;
  person?: string[];
  type?: string;
  kind?: string;
  blurry?: boolean;
  adult?: boolean;
  folder?: string;
  folderDeep?: boolean;
  folderExclude?: string;
  album?: number;
  hidden?: boolean;
  /** Только снимки одной группы (см. getPhotoGroups). */
  groupBy?: string;
  group?: string;
  order?: string;
}

export type PhotoFilterParams = Omit<PhotosParams, 'limit' | 'offset' | 'groupBy' | 'group' | 'order'>;

function filterSearch(params: PhotoFilterParams): URLSearchParams {
  const search = new URLSearchParams();
  params.person?.forEach(name => search.append('person', name));
  if (params.q) search.set('q', params.q);
  if (params.type) search.set('type', params.type);
  if (params.kind) search.set('kind', params.kind);
  if (params.blurry) search.set('blurry', '1');
  if (params.adult) search.set('adult', '1');
  if (params.hidden) search.set('hidden', '1');
  if (params.folder) {
    search.set('folder', params.folder);
    if (params.folderDeep === false) search.set('folder_deep', '0');
  }
  if (params.folderExclude) search.set('exclude_folder', params.folderExclude);
  if (params.album) search.set('album', String(params.album));
  return search;
}

export function getPhotos(params: PhotosParams): Promise<PhotosPage> {
  const search = filterSearch(params);
  if (params.groupBy && params.group !== undefined) {
    search.set('group_by', params.groupBy);
    search.set('group', params.group);
  }
  if (params.order) search.set('order', params.order);
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  return api<PhotosPage>(`/api/photos?${search.toString()}`);
}

export function getPhotoGroups(params: PhotoFilterParams, by: string, order: string): Promise<PhotoGroupsPage> {
  const search = filterSearch(params);
  search.set('by', by);
  search.set('order', order);
  return api<PhotoGroupsPage>(`/api/photos/groups?${search.toString()}`);
}

export const getPhoto = (path: string) =>
  api<{photo: PhotoCard}>(`/api/photo${query({path})}`).then(data => data.photo);

export const getFolders = (path: string) =>
  api<{path: string; trail: Array<{name: string; path: string}>; folders: Folder[]}>(
    `/api/folders${query({path})}`);

export const undo = () => post<{description: string | null; state: CatalogState}>('/api/undo');
