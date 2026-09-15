import type {StateCreator} from 'zustand';
import type {GroupDetail} from '../../types/api';
import type {Store} from '../index';

/**
 * Просмотрщик. Снимок галереи записан в адресе (routePhoto), поэтому своего
 * «открыт» здесь нет. Просмотр лиц группы в адрес не попадает: это лента
 * кадров одного человека поверх открытой карточки группы.
 */
export interface ViewerSlice {
  viewer: {
    /** Группа, чьи кадры листаются; null — обычная галерея. */
    faceGroup: GroupDetail | null;
    /** Номер кадра в просмотре лиц. В галерее номер выводится из адреса. */
    faceIndex: number;
    /** Выдвинутая шторка подробностей. */
    info: boolean;
    /** Панели поверх кадра; скрываются по клику для «голого» просмотра. */
    chrome: boolean;
  };
  openFaces(group: GroupDetail, index: number): void;
  setFaceIndex(index: number): void;
  closeFaces(): void;
  toggleViewerInfo(next?: boolean): void;
  toggleViewerChrome(next?: boolean): void;
}

export const createViewerSlice: StateCreator<Store, [], [], ViewerSlice> = (set, get) => {
  const patch = (part: Partial<ViewerSlice['viewer']>) =>
    set(state => ({viewer: {...state.viewer, ...part}}));

  return {
    viewer: {faceGroup: null, faceIndex: 0, info: false, chrome: true},

    openFaces: (faceGroup, faceIndex) => patch({faceGroup, faceIndex}),
    setFaceIndex: faceIndex => patch({faceIndex}),
    closeFaces: () => patch({faceGroup: null, faceIndex: 0}),
    toggleViewerInfo: next => patch({info: next ?? !get().viewer.info}),
    // Без обвязки нет и шторки сведений.
    toggleViewerChrome: next => {
      const chrome = next ?? !get().viewer.chrome;
      patch(chrome ? {chrome} : {chrome, info: false});
    },
  };
};
