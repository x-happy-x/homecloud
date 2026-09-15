import type {StateCreator} from 'zustand';
import type {RouteState, ViewName} from '../../app/routes';
import {emptyRoute} from '../../app/routes';
import type {Store} from '../index';

/** Фильтры галереи — они же содержимое ссылки, поэтому лежат одним объектом. */
export type GalleryFilters = Omit<RouteState, 'view' | 'photo' | 'group'>;

export interface GallerySlice {
  view: ViewName;
  filters: GalleryFilters;
  /** Снимок и группа, открытые по ссылке. */
  routePhoto: string;
  routeGroup: string;
  /** Панель «Подборки и фильтры». */
  sidepageOpen: boolean;
  /** Снимки, для которых открыто окно обработки; null — окно закрыто. */
  processPaths: string[] | null;

  setView(view: ViewName): void;
  setFilters(part: Partial<GalleryFilters>): void;
  setQuery(query: string): void;
  togglePerson(name: string): void;
  clearFilters(): void;
  /** Галерея одного человека: остальные фильтры остаются, поиск сбрасывается. */
  showPersonPhotos(name: string): void;
  setRoutePhoto(path: string): void;
  setRouteGroup(key: string): void;
  openSidepage(): void;
  closeSidepage(): void;
  openProcess(paths: string[]): void;
  closeProcess(): void;
  /** Применить разобранную ссылку целиком — вызывается из hashSync. */
  applyRoute(route: RouteState): void;
}

const filtersOf = (route: RouteState): GalleryFilters => {
  const {view: _view, photo: _photo, group: _group, ...rest} = route;
  return rest;
};

export const createGallerySlice: StateCreator<Store, [], [], GallerySlice> = set => ({
  view: 'people',
  filters: filtersOf(emptyRoute()),
  routePhoto: '',
  routeGroup: '',
  sidepageOpen: false,
  processPaths: null,

  // Просмотрщик живёт только на фотографиях, карточка группы — на людях и проверке.
  setView: view => set(state => ({
    view,
    routePhoto: view === 'photos' ? state.routePhoto : '',
    routeGroup: view === 'people' || view === 'review' ? state.routeGroup : '',
  })),
  setFilters: part => set(state => ({filters: {...state.filters, ...part}})),
  setQuery: query => set(state => ({filters: {...state.filters, query}})),

  togglePerson: name => set(state => {
    const people = state.filters.people.includes(name)
      ? state.filters.people.filter(item => item !== name)
      : [...state.filters.people, name];
    return {filters: {...state.filters, people}};
  }),

  clearFilters: () => set(state => ({
    filters: {...filtersOf(emptyRoute()), query: state.filters.query},
  })),

  showPersonPhotos: name => set(state => ({
    view: 'photos',
    routePhoto: '',
    routeGroup: '',
    filters: {...state.filters, people: [name], query: ''},
  })),

  setRoutePhoto: routePhoto => set({routePhoto}),
  setRouteGroup: routeGroup => set({routeGroup}),

  // Панель подборок и уведомления выезжают с одного края — открыта одна.
  openSidepage: () => set(state => ({
    sidepageOpen: true,
    notifications: {...state.notifications, panelOpen: false},
  })),
  closeSidepage: () => set({sidepageOpen: false}),

  openProcess: paths => {
    const unique = [...new Set(paths)].filter(Boolean);
    if (unique.length) set({processPaths: unique});
  },
  closeProcess: () => set({processPaths: null}),

  applyRoute: route => set({
    view: route.view,
    filters: filtersOf(route),
    routePhoto: route.photo,
    routeGroup: route.group,
  }),
});
