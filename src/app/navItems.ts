import type {IconName} from '../ui/Icon/Icon';
import {ANALYSIS_VIEWS, type ViewName} from './routes';

export interface NavGroupSpec {
  id: string;
  /** Экран пункта. У «Анализа» вместо него открывается последняя вкладка. */
  view: ViewName;
  icon: IconName;
  label: string;
  /** Короткая подпись для нижней панели на телефоне. */
  short: string;
  /** Экраны пункта: у «Анализа» их четыре, у остальных — один. */
  views: readonly ViewName[];
}

/**
 * Один список на боковую панель и на нижнюю. Пунктов четыре, а не семь:
 * проверка, обучение, сканирование и дубликаты — это обслуживание каталога,
 * и в навигации им хватает пункта «Анализ» с вкладками внутри.
 */
export const NAV_GROUPS: NavGroupSpec[] = [
  {id: 'photos', view: 'photos', icon: 'photos', label: 'Фотографии', short: 'Фото', views: ['photos']},
  {id: 'people', view: 'people', icon: 'people', label: 'Люди', short: 'Люди', views: ['people']},
  {id: 'analysis', view: 'review', icon: 'analysis', label: 'Анализ', short: 'Анализ', views: ANALYSIS_VIEWS},
  {id: 'settings', view: 'settings', icon: 'settings', label: 'Настройки', short: 'Настройки', views: ['settings']},
];

/** Пункт навигации, которому принадлежит экран. */
export const navGroupOf = (view: ViewName): NavGroupSpec =>
  NAV_GROUPS.find(group => group.views.includes(view)) ?? NAV_GROUPS[0];
