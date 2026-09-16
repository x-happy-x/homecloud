import type {StateCreator} from 'zustand';
import {readLocal, writeLocal} from '../../lib/storage';
import type {Store} from '../index';

export type TrainingTab = 'review' | 'batch' | 'models';

const BATCH_KEY = 'homecloud-router-batch-size';
const PROPAGATE_KEY = 'homecloud-router-propagate';

export interface TrainingSlice {
  training: {
    tab: TrainingTab;
    index: number;
    /**
     * Черновики разметки: путь → выбранные метки. Живут только в памяти и
     * обязаны переживать опрос состояния раз в полторы секунды.
     */
    drafts: Map<string, string[]>;
    /** Сколько снимков класть в пакет для нейросети. */
    batchSize: number;
    /** Применять разметку и к почти одинаковым кадрам. */
    propagate: boolean;
  };
  setTrainingTab(tab: TrainingTab): void;
  setTrainingIndex(index: number): void;
  setDraft(path: string, labels: string[]): void;
  dropDraft(path: string): void;
  setBatchSize(size: number): void;
  setPropagate(propagate: boolean): void;
}

export const createTrainingSlice: StateCreator<Store, [], [], TrainingSlice> = set => ({
  training: {
    tab: 'review',
    index: 0,
    drafts: new Map(),
    batchSize: Number(readLocal(BATCH_KEY)) || 5,
    propagate: readLocal(PROPAGATE_KEY) !== '0',
  },

  setTrainingTab: tab => set(state => ({training: {...state.training, tab}})),
  setTrainingIndex: index => set(state => ({training: {...state.training, index}})),

  setDraft: (path, labels) => set(state => ({
    training: {...state.training, drafts: new Map(state.training.drafts).set(path, labels)},
  })),

  dropDraft: path => set(state => {
    const drafts = new Map(state.training.drafts);
    drafts.delete(path);
    return {training: {...state.training, drafts}};
  }),

  setBatchSize: batchSize => {
    writeLocal(BATCH_KEY, String(batchSize));
    set(state => ({training: {...state.training, batchSize}}));
  },
  setPropagate: propagate => {
    writeLocal(PROPAGATE_KEY, propagate ? '1' : '0');
    set(state => ({training: {...state.training, propagate}}));
  },
});
