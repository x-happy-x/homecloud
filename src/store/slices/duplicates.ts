import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type DupKind = 'all' | 'exact' | 'similar';
export type DupSort = 'size' | 'count';

/** Что показывает список групп — это же часть ключа кэша. */
export interface DupFilters {
  kind: DupKind;
  sort: DupSort;
  /** Прятать группы мелких файлов: иконки и картинки интерфейса. */
  hideSmall: boolean;
}

export interface DuplicatesSlice {
  duplicates: {
    /** Искать и похожие, не только точные копии. */
    similar: boolean;
    /** Группа → путь снимка, который решено оставить. */
    keep: Record<string, string>;
    filters: DupFilters;
  };
  setDupSimilar(similar: boolean): void;
  setDupKeep(group: string, path: string): void;
  setDupFilters(part: Partial<DupFilters>): void;
  resetDupChoices(): void;
}

export const createDuplicatesSlice: StateCreator<Store, [], [], DuplicatesSlice> = set => ({
  duplicates: {similar: false, keep: {}, filters: {kind: 'all', sort: 'size', hideSmall: true}},

  setDupSimilar: similar => set(state => ({duplicates: {...state.duplicates, similar}})),

  setDupKeep: (group, path) => set(state => ({
    duplicates: {...state.duplicates, keep: {...state.duplicates.keep, [group]: path}},
  })),

  setDupFilters: part => set(state => ({
    duplicates: {...state.duplicates, filters: {...state.duplicates.filters, ...part}},
  })),

  resetDupChoices: () => set(state => ({duplicates: {...state.duplicates, keep: {}}})),
});
