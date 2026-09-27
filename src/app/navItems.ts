import type {GalleryFilters} from '../store/slices/gallery';
import type {IconName} from '../ui/Icon/Icon';
import type {ViewName} from './routes';

export type NavId =
  | 'photos' | 'highlights' | 'people' | 'video'
  | 'review' | 'scan' | 'duplicates' | 'training' | 'hidden' | 'settings';

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
}

/** То, что смотрят: верх боковой панели. */
export const PRIMARY_NAV: NavEntry[] = [
  {id: 'photos', view: 'photos', icon: 'photos', label: 'Фотографии', short: 'Фото', filters: {kind: '', hidden: false}},
  {id: 'highlights', view: 'highlights', icon: 'highlights', label: 'Воспоминания', short: 'Память'},
  {id: 'people', view: 'people', icon: 'people', label: 'Люди', short: 'Люди'},
  {id: 'video', view: 'photos', icon: 'video', label: 'Видео', short: 'Видео', filters: {kind: 'video', hidden: false}},
];

/**
 * Обслуживание каталога: раньше пряталось за одним пунктом «Анализ» с
 * вкладками, теперь каждый экран — свой пункт в группе «Каталог».
 */
export const CATALOG_NAV: NavEntry[] = [
  {id: 'review', view: 'review', icon: 'review', label: 'Проверка', short: 'Проверка'},
  {id: 'scan', view: 'scan', icon: 'scan', label: 'Сканирование', short: 'Скан'},
  {id: 'duplicates', view: 'duplicates', icon: 'duplicates', label: 'Дубликаты', short: 'Дубли'},
  {id: 'training', view: 'training', icon: 'training', label: 'Обучение', short: 'Обучение'},
  {id: 'hidden', view: 'photos', icon: 'hide', label: 'Скрытые', short: 'Скрытые', filters: {hidden: true, kind: ''}},
  {id: 'settings', view: 'settings', icon: 'settings', label: 'Настройки', short: 'Настройки'},
];

export const NAV_ENTRIES: NavEntry[] = [...PRIMARY_NAV, ...CATALOG_NAV];

export const navEntry = (id: NavId): NavEntry => NAV_ENTRIES.find(entry => entry.id === id) ?? PRIMARY_NAV[0];

/** Какой пункт подсвечен: у галереи — по отбору (видео, скрытые). */
export function activeNav(view: ViewName, filters: Pick<GalleryFilters, 'kind' | 'hidden'>): NavId {
  if (view === 'photos') {
    if (filters.hidden) return 'hidden';
    return filters.kind === 'video' ? 'video' : 'photos';
  }
  return NAV_ENTRIES.find(entry => entry.view === view)?.id ?? 'photos';
}
