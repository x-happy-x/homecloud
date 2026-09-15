import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {createAlbumsSlice, type AlbumsSlice} from './slices/albums';
import {createDuplicatesSlice, type DuplicatesSlice} from './slices/duplicates';
import {createGallerySlice, type GallerySlice} from './slices/gallery';
import {createNotificationsSlice, type NotificationsSlice} from './slices/notifications';
import {createPrefsSlice, type PrefsSlice} from './slices/prefs';
import {createScanSlice, type ScanSlice} from './slices/scan';
import {createSelectionSlice, type SelectionSlice} from './slices/selection';
import {createSessionSlice, type SessionSlice} from './slices/session';
import {createSettingsSlice, type SettingsSlice} from './slices/settings';
import {createTrainingSlice, type TrainingSlice} from './slices/training';
import {createViewerSlice, type ViewerSlice} from './slices/viewer';

export interface Store extends
  SessionSlice, PrefsSlice, GallerySlice, SelectionSlice, ViewerSlice,
  ScanSlice, DuplicatesSlice, TrainingSlice, AlbumsSlice, NotificationsSlice,
  SettingsSlice {}

/**
 * Одно хранилище на всё состояние интерфейса. Серверные данные сюда не
 * попадают — они живут в кэше TanStack Query, иначе опрос раз в полторы
 * секунды перетирал бы то, что пользователь делает прямо сейчас.
 *
 * subscribeWithSelector нужен для hashSync: синхронизация со ссылкой должна
 * работать вне React, иначе она начинает гоняться с перерисовками.
 */
export const useStore = create<Store>()(subscribeWithSelector((...args) => ({
  ...createSessionSlice(...args),
  ...createPrefsSlice(...args),
  ...createGallerySlice(...args),
  ...createSelectionSlice(...args),
  ...createViewerSlice(...args),
  ...createScanSlice(...args),
  ...createDuplicatesSlice(...args),
  ...createTrainingSlice(...args),
  ...createAlbumsSlice(...args),
  ...createNotificationsSlice(...args),
  ...createSettingsSlice(...args),
})));

/** Доступ к состоянию вне компонентов — для hashSync и обработчиков запросов. */
export const store = useStore;
