import {api, post} from '../api';
import type {Album} from '../../types/api';

export const getAlbums = () =>
  api<{albums: Album[]; paths?: string[]}>('/api/albums');

export const createAlbum = (title: string, parent = 0) =>
  post('/api/albums/create', {title, parent});
export const renameAlbum = (id: number, title: string) => post('/api/albums/rename', {id, title});
export const deleteAlbum = (id: number) => post('/api/albums/delete', {id});
export const moveAlbum = (id: number, parent: number) => post('/api/albums/move', {id, parent});
export const setAlbumPhotos = (payload: Record<string, unknown>) =>
  post('/api/albums/photos', payload);

export const createPeopleAlbum = (title: string, parent = 0) =>
  post('/api/people-albums/create', {title, parent});
export const renamePeopleAlbum = (id: number, title: string) =>
  post('/api/people-albums/rename', {id, title});
export const deletePeopleAlbum = (id: number) => post('/api/people-albums/delete', {id});
export const movePeopleAlbum = (id: number, parent: number) =>
  post('/api/people-albums/move', {id, parent});
/** Скрытие альбома людей доступно только администратору — проверка на бэкенде. */
export const setPeopleAlbumHidden = (id: number, hidden: boolean) =>
  post('/api/people-albums/hidden', {id, hidden});
export const setPeopleAlbumMembers = (payload: Record<string, unknown>) =>
  post('/api/people-albums/members', payload);
