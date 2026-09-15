import type {IconName} from '../ui/Icon/Icon';
import type {ViewName} from './routes';

export interface NavItemSpec {
  view: ViewName;
  icon: IconName;
  label: string;
  /** Короткая подпись для нижней панели на телефоне. */
  short: string;
  /** Счётчик просится в глаза: непроверенные группы лиц. */
  attention?: boolean;
}

/**
 * Один список на боковую панель и на нижнюю: раньше это была одинаковая
 * разметка в двух местах, а счётчики синхронизировались через data-mirror.
 */
export const NAV_ITEMS: NavItemSpec[] = [
  {view: 'people', icon: 'people', label: 'Люди', short: 'Люди'},
  {view: 'photos', icon: 'photos', label: 'Фотографии', short: 'Фото'},
  {view: 'review', icon: 'review', label: 'Проверка', short: 'Проверка', attention: true},
  {view: 'training', icon: 'training', label: 'Обучение', short: 'Обучение'},
  {view: 'scan', icon: 'scan', label: 'Сканирование', short: 'Скан'},
  {view: 'duplicates', icon: 'duplicates', label: 'Дубликаты', short: 'Копии'},
  {view: 'settings', icon: 'settings', label: 'Настройки', short: 'Настройки'},
];
