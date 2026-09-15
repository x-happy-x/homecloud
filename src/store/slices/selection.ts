import type {StateCreator} from 'zustand';
import type {Store} from '../index';

/**
 * Все множества выделения в одном месте: раньше четыре панели действий
 * повторяли один и тот же код «посчитать выбранное, показать полоску, снять
 * выбор», каждая со своим набором.
 */
export interface SelectionSlice {
  selection: {
    groups: Set<string>;
    faces: Set<number>;
    /** Лица, отмеченные прямо в просмотрщике. */
    viewerFaces: Set<number>;
    photos: Set<string>;
    /** Корни, выбранные для сканирования. */
    roots: Set<string>;
    /** Группы дубликатов, которые пользователь решил не трогать. */
    dupSkip: Set<string>;
  };
  toggle(kind: SelectionKind, id: string | number): void;
  select(kind: SelectionKind, ids: Array<string | number>): void;
  clear(kind?: SelectionKind): void;
}

export type SelectionKind = keyof SelectionSlice['selection'];

const empty = (): SelectionSlice['selection'] => ({
  groups: new Set(),
  faces: new Set(),
  viewerFaces: new Set(),
  photos: new Set(),
  roots: new Set(),
  dupSkip: new Set(),
});

export const createSelectionSlice: StateCreator<Store, [], [], SelectionSlice> = set => ({
  selection: empty(),

  // Множество заменяется целиком, иначе подписка на отдельную плитку не сработает.
  toggle: (kind, id) => set(state => {
    const next = new Set(state.selection[kind] as Set<string | number>);
    next.has(id) ? next.delete(id) : next.add(id);
    return {selection: {...state.selection, [kind]: next}};
  }),

  select: (kind, ids) => set(state => ({
    selection: {...state.selection, [kind]: new Set(ids)},
  })),

  clear: kind => set(state => kind
    ? {selection: {...state.selection, [kind]: new Set()}}
    : {selection: empty()}),
});
