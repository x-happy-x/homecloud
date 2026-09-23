import type {StateCreator} from 'zustand';
import type {RouteState, ViewName} from '../../app/routes';
import {emptyRoute} from '../../app/routes';
import type {Store} from '../index';

/** Фильтры галереи — они же содержимое ссылки, поэтому лежат одним объектом. */
export type GalleryFilters = Omit<RouteState, 'view' | 'photo' | 'group' | 'highlight' | 'section'>;

/** Группа, из которой открыт снимок: просмотрщик листает внутри неё. */
export interface PhotoScope {
  groupBy: string;
  group: string;
  order: string;
}

export interface GallerySlice {
  view: ViewName;
  filters: GalleryFilters;
  /** Снимок и группа, открытые по ссылке. */
  routePhoto: string;
  routeGroup: string;
  /** Открытая автоматическая подборка. */
  routeHighlight: string;
  /** Раздел настроек из ссылки. */
  routeSection: string;
  photoScope: PhotoScope | null;
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
  /** Открыть снимок из группы (scope) или из сплошной сетки (null). */
  openPhoto(path: string, scope: PhotoScope | null): void;
  setRouteGroup(key: string): void;
  setRouteHighlight(key: string): void;
  /** Раздел настроек; с другого экрана — сразу туда. */
  openSettings(section: string): void;
  setRouteSection(section: string): void;
  openSidepage(): void;
  closeSidepage(): void;
  openProcess(paths: string[]): void;
  closeProcess(): void;
  /** Применить разобранную ссылку целиком — вызывается из hashSync. */
  applyRoute(route: RouteState): void;
}

const filtersOf = (route: RouteState): GalleryFilters => {
  const {view: _view, photo: _photo, group: _group, highlight: _highlight, section: _section, ...rest} = route;
  return rest;
};

export const createGallerySlice: StateCreator<Store, [], [], GallerySlice> = set => ({
  view: 'photos',
  filters: filtersOf(emptyRoute()),
  routePhoto: '',
  routeGroup: '',
  routeHighlight: '',
  routeSection: '',
  photoScope: null,
  sidepageOpen: false,
  processPaths: null,

  // Просмотрщик живёт только на фотографиях, карточка группы — на людях и проверке.
  setView: view => set(state => ({
    view,
    routePhoto: view === 'photos' ? state.routePhoto : '',
    routeGroup: view === 'people' || view === 'review' ? state.routeGroup : '',
    routeHighlight: view === 'highlights' ? state.routeHighlight : '',
    routeSection: view === 'settings' ? state.routeSection : '',
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
  openPhoto: (routePhoto, photoScope) => set({routePhoto, photoScope}),
  setRouteGroup: routeGroup => set({routeGroup}),
  setRouteHighlight: routeHighlight => set({routeHighlight}),
  openSettings: routeSection => set({view: 'settings', routeSection, routePhoto: '', routeGroup: ''}),
  setRouteSection: routeSection => set({routeSection}),

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

  // Снимок из ссылки открывается без группы: просмотрщик листает всю галерею.
  applyRoute: route => set(state => ({
    view: route.view,
    filters: filtersOf(route),
    routePhoto: route.photo,
    routeGroup: route.group,
    routeHighlight: route.highlight,
    routeSection: route.section,
    photoScope: route.photo && route.photo === state.routePhoto ? state.photoScope : null,
  })),
});
