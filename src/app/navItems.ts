import type {GalleryFilters} from '../store/slices/gallery';
import type {IconName} from '../ui/Icon/Icon';
import {ANALYSIS_VIEWS, type ViewName} from './routes';

export type NavId =
  | 'photos' | 'highlights' | 'people' | 'video'
  | 'analysis' | 'hidden' | 'settings';

export interface NavEntry {
  id: NavId;
  view: ViewName;
  icon: IconName;
  label: string;
  /** Короткая подпись для узкой панели и телефона. */
  short: string;
  /**
   * Пункты «Видео» и «Скрытые» — та же галерея с отбором. У «Фотографий»
   * отбор снимается, иначе из видео назад в фотографии не уйти.
   */
  filters?: Partial<GalleryFilters>;
  /** Открывать раздел, с которого ушли в прошлый раз (у «Анализа»). */
  lastTab?: boolean;
}

/** То, что смотрят: верх боковой панели. */
export const PRIMARY_NAV: NavEntry[] = [
  {id: 'photos', view: 'photos', icon: 'photos', label: 'Фотографии', short: 'Фото', filters: {kind: '', hidden: false}},
  {id: 'highlights', view: 'highlights', icon: 'highlights', label: 'Воспоминания', short: 'Память'},
  {id: 'people', view: 'people', icon: 'people', label: 'Люди', short: 'Люди'},
  {id: 'video', view: 'photos', icon: 'video', label: 'Видео', short: 'Видео', filters: {kind: 'video', hidden: false}},
];

/**
 * Обслуживание каталога: «Анализ» — один пункт с разделами внутри, как у
 * «Настроек» (проверка, сканирование, дубликаты, обучение). Пункт открывает
 * раздел, с которого ушли в прошлый раз.
 */
export const CATALOG_NAV: NavEntry[] = [
  {id: 'analysis', view: 'review', icon: 'analysis', label: 'Анализ', short: 'Анализ', lastTab: true},
  {id: 'settings', view: 'settings', icon: 'settings', label: 'Настройки', short: 'Настройки'},
];

/**
 * Скрытые снимки в навигации не видны: их открывает щелчок по логотипу и
 * названию сервиса.
 */
export const HIDDEN_NAV: NavEntry = {
  id: 'hidden', view: 'photos', icon: 'hide', label: 'Скрытые', short: 'Скрытые', filters: {hidden: true, kind: ''},
};

export const NAV_ENTRIES: NavEntry[] = [...PRIMARY_NAV, ...CATALOG_NAV, HIDDEN_NAV];

export const navEntry = (id: NavId): NavEntry => NAV_ENTRIES.find(entry => entry.id === id) ?? PRIMARY_NAV[0];

/** Какой пункт подсвечен: у галереи — по отбору (видео, скрытые). */
export function activeNav(view: ViewName, filters: Pick<GalleryFilters, 'kind' | 'hidden'>): NavId {
  if (view === 'photos') {
    if (filters.hidden) return 'hidden';
    return filters.kind === 'video' ? 'video' : 'photos';
  }
  if ((ANALYSIS_VIEWS as readonly string[]).includes(view)) return 'analysis';
  return NAV_ENTRIES.find(entry => entry.view === view)?.id ?? 'photos';
}
