import {api, post} from '../api';
import type {CatalogState} from './catalog';
import type {Album} from '../../types/api';

/** Действия с альбомами снимков возвращают свежее дерево альбомов. */
type AlbumsReply = {albums: Album[]};
/** Действия с альбомами людей возвращают состояние каталога целиком. */
type PeopleAlbumsReply = {state: CatalogState};

export const getAlbums = () =>
  api<AlbumsReply>('/api/albums').then(data => data.albums ?? []);

// Бэкенд читает parent_id: с полем parent альбом молча ложился в корень.
export const createAlbum = (title: string, parentId = 0, paths: string[] = []) =>
  post<AlbumsReply & {id: number}>('/api/albums/create', {title, parent_id: parentId, paths});
export const renameAlbum = (id: number, title: string) =>
  post<AlbumsReply>('/api/albums/rename', {id, title});
export const deleteAlbum = (id: number) => post<AlbumsReply>('/api/albums/delete', {id});
export const moveAlbum = (id: number, parentId: number) =>
  post<AlbumsReply>('/api/albums/move', {id, parent_id: parentId});
export const addAlbumPhotos = (id: number, paths: string[]) =>
  post<AlbumsReply>('/api/albums/photos', {id, add: paths});

export const createPeopleAlbum = (title: string, parentId = 0, groupKeys: string[] = []) =>
  post<PeopleAlbumsReply & {id: number}>('/api/people-albums/create',
    {title, parent_id: parentId, group_keys: groupKeys});
export const renamePeopleAlbum = (id: number, title: string) =>
  post<PeopleAlbumsReply>('/api/people-albums/rename', {id, title});
export const deletePeopleAlbum = (id: number) =>
  post<PeopleAlbumsReply>('/api/people-albums/delete', {id});
export const movePeopleAlbum = (id: number, parentId: number) =>
  post<PeopleAlbumsReply>('/api/people-albums/move', {id, parent_id: parentId});
/** Скрытие альбома людей доступно только администратору — проверка на бэкенде. */
export const setPeopleAlbumHidden = (id: number, hidden: boolean) =>
  post<PeopleAlbumsReply>('/api/people-albums/hidden', {id, hidden});
export const addPeopleAlbumMembers = (id: number, groupKeys: string[]) =>
  post<PeopleAlbumsReply>('/api/people-albums/members', {id, add: groupKeys});
