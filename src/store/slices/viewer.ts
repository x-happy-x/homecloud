import type {StateCreator} from 'zustand';
import type {GroupFace as Face, PhotoCard as PhotoSummary} from '../../types/api';
import type {Store} from '../index';

export interface ViewerSlice {
  viewer: {
    open: boolean;
    index: number;
    /** Просмотр кадров одного человека: лента подменена его снимками. */
    isFaces: boolean;
    faces: Face[] | null;
    /** Лента галереи, отложенная на время просмотра лиц. */
    savedGallery: PhotoSummary[] | null;
    /** Выдвинутая шторка подробностей. */
    info: boolean;
    /** Панели поверх кадра; скрываются по клику для «голого» просмотра. */
    chrome: boolean;
  };
  openViewer(index: number): void;
  closeViewer(): void;
  setViewerIndex(index: number): void;
  toggleViewerInfo(next?: boolean): void;
  toggleViewerChrome(next?: boolean): void;
  enterFaceViewer(faces: Face[], gallery: PhotoSummary[]): void;
  leaveFaceViewer(): PhotoSummary[] | null;
}

export const createViewerSlice: StateCreator<Store, [], [], ViewerSlice> = (set, get) => {
  const patch = (part: Partial<ViewerSlice['viewer']>) =>
    set(state => ({viewer: {...state.viewer, ...part}}));

  return {
    viewer: {
      open: false, index: 0, isFaces: false, faces: null,
      savedGallery: null, info: false, chrome: true,
    },

    openViewer: index => patch({open: true, index, chrome: true}),
    closeViewer: () => patch({open: false, chrome: true}),
    setViewerIndex: index => patch({index}),
    toggleViewerInfo: next => patch({info: next ?? !get().viewer.info}),
    toggleViewerChrome: next => patch({chrome: next ?? !get().viewer.chrome}),

    enterFaceViewer: (faces, gallery) =>
      patch({isFaces: true, faces, savedGallery: gallery}),

    leaveFaceViewer: () => {
      const saved = get().viewer.savedGallery;
      patch({isFaces: false, faces: null, savedGallery: null});
      return saved;
    },
  };
};
