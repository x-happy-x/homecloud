import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type SettingsValues = Record<string, string | number | boolean>;

export interface SettingsSlice {
  settings: {
    /**
     * Черновик формы настроек. Раньше состоянием была сама разметка: одна
     * функция вычитывала значения из DOM, другая соскребала их обратно.
     */
    draft: SettingsValues;
    dirty: boolean;
  };
  loadSettingsDraft(values: SettingsValues): void;
  setSetting(key: string, value: string | number | boolean): void;
  markSettingsSaved(): void;
}

export const createSettingsSlice: StateCreator<Store, [], [], SettingsSlice> = set => ({
  settings: {draft: {}, dirty: false},

  loadSettingsDraft: values => set({settings: {draft: {...values}, dirty: false}}),

  setSetting: (key, value) => set(state => ({
    settings: {draft: {...state.settings.draft, [key]: value}, dirty: true},
  })),

  markSettingsSaved: () => set(state => ({settings: {...state.settings, dirty: false}})),
});
