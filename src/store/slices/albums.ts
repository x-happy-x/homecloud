import type {StateCreator} from 'zustand';
import type {Store} from '../index';

/** Что именно раскладывают по альбомам: снимки галереи или группы лиц. */
export type AlbumPickTarget =
  | {kind: 'photos'; paths: string[]}
  | {kind: 'people'; keys: string[]}
  | null;

export interface AlbumsSlice {
  albums: {
    pickTarget: AlbumPickTarget;
    /** Открытый альбом людей на экране «Люди». */
    peopleAlbum: number;
  };
  openAlbumPick(target: NonNullable<AlbumPickTarget>): void;
  closeAlbumPick(): void;
  setPeopleAlbum(id: number): void;
}

export const createAlbumsSlice: StateCreator<Store, [], [], AlbumsSlice> = set => ({
  albums: {pickTarget: null, peopleAlbum: 0},

  openAlbumPick: pickTarget => set(state => ({albums: {...state.albums, pickTarget}})),
  closeAlbumPick: () => set(state => ({albums: {...state.albums, pickTarget: null}})),
  setPeopleAlbum: peopleAlbum => set(state => ({albums: {...state.albums, peopleAlbum}})),
});
