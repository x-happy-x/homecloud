import type {StateCreator} from 'zustand';
import {readLocal, writeLocal} from '../../lib/storage';
import type {Store} from '../index';

export type DupKind = 'all' | 'exact' | 'similar';
export type DupSort = 'size' | 'count';
/** Лента — снимки группы в строку; сетки — группы плитками по 4 или 6 кадров. */
export type DupLayout = 'row' | 'grid4' | 'grid6';

const LAYOUT_KEY = 'homecloud-dup-layout';
const savedLayout = (): DupLayout => {
  const value = readLocal(LAYOUT_KEY);
  return value === 'grid4' || value === 'grid6' ? value : 'row';
};

/** Что показывает список групп — это же часть ключа кэша. */
export interface DupFilters {
  kind: DupKind;
  sort: DupSort;
  /** Прятать группы мелких файлов: иконки и картинки интерфейса. */
  hideSmall: boolean;
  /**
   * Одна папка из сводки, без вложенных: показываем группы с копией в ней и
   * удаляем только её копии. Пусто — вся библиотека.
   */
  folder: string;
}

export interface DuplicatesSlice {
  duplicates: {
    /** Искать и похожие, не только точные копии. */
    similar: boolean;
    /** Группа → путь снимка, который решено оставить. */
    keep: Record<string, string>;
    filters: DupFilters;
    layout: DupLayout;
  };
  setDupSimilar(similar: boolean): void;
  setDupKeep(group: string, path: string): void;
  setDupFilters(part: Partial<DupFilters>): void;
  setDupLayout(layout: DupLayout): void;
  resetDupChoices(): void;
}

export const createDuplicatesSlice: StateCreator<Store, [], [], DuplicatesSlice> = set => ({
  duplicates: {similar: false, keep: {}, filters: {kind: 'all', sort: 'size', hideSmall: true, folder: ''}, layout: savedLayout()},

  setDupSimilar: similar => set(state => ({duplicates: {...state.duplicates, similar}})),

  setDupKeep: (group, path) => set(state => ({
    duplicates: {...state.duplicates, keep: {...state.duplicates.keep, [group]: path}},
  })),

  setDupFilters: part => set(state => ({
    duplicates: {...state.duplicates, filters: {...state.duplicates.filters, ...part}},
  })),

  setDupLayout: layout => {
    writeLocal(LAYOUT_KEY, layout);
    set(state => ({duplicates: {...state.duplicates, layout}}));
  },

  resetDupChoices: () => set(state => ({duplicates: {...state.duplicates, keep: {}}})),
});
