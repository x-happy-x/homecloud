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

  setView(view: ViewName): void;
  setFilters(part: Partial<GalleryFilters>): void;
  setQuery(query: string): void;
  togglePerson(name: string): void;
  clearFilters(): void;
  setRoutePhoto(path: string): void;
  setRouteGroup(key: string): void;
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

  setView: view => set({view}),
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

  setRoutePhoto: routePhoto => set({routePhoto}),
  setRouteGroup: routeGroup => set({routeGroup}),

  applyRoute: route => set({
    view: route.view,
    filters: filtersOf(route),
    routePhoto: route.photo,
    routeGroup: route.group,
  }),
});
