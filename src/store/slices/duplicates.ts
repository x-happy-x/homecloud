import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export interface DuplicatesSlice {
  duplicates: {
    /** Искать и похожие, не только точные копии. */
    similar: boolean;
    /** Группа → путь снимка, который решено оставить. */
    keep: Record<string, string>;
  };
  setDupSimilar(similar: boolean): void;
  setDupKeep(group: string, path: string): void;
  resetDupChoices(): void;
}

export const createDuplicatesSlice: StateCreator<Store, [], [], DuplicatesSlice> = set => ({
  duplicates: {similar: false, keep: {}},

  setDupSimilar: similar => set(state => ({duplicates: {...state.duplicates, similar}})),

  setDupKeep: (group, path) => set(state => ({
    duplicates: {...state.duplicates, keep: {...state.duplicates.keep, [group]: path}},
  })),

  resetDupChoices: () => set(state => ({duplicates: {...state.duplicates, keep: {}}})),
});
