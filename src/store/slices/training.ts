import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export interface TrainingSlice {
  training: {
    index: number;
    /**
     * Черновики разметки: путь → выбранные метки. Живут только в памяти и
     * обязаны переживать опрос состояния раз в полторы секунды.
     */
    drafts: Map<string, string[]>;
  };
  setTrainingIndex(index: number): void;
  setDraft(path: string, labels: string[]): void;
  dropDraft(path: string): void;
}

export const createTrainingSlice: StateCreator<Store, [], [], TrainingSlice> = set => ({
  training: {index: 0, drafts: new Map()},

  setTrainingIndex: index => set(state => ({training: {...state.training, index}})),

  setDraft: (path, labels) => set(state => ({
    training: {...state.training, drafts: new Map(state.training.drafts).set(path, labels)},
  })),

  dropDraft: path => set(state => {
    const drafts = new Map(state.training.drafts);
    drafts.delete(path);
    return {training: {...state.training, drafts}};
  }),
});
