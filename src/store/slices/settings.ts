import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type SettingsValues = Record<string, string | number | boolean>;

export interface SettingsSlice {
  settings: {
    /**
     * Черновик формы настроек. Раньше состоянием была сама разметка: одна
     * функция вычитывала значения из DOM, другая соскребала их обратно.
     * Что изменено, экран считает сравнением с ответом сервера: флаг
     * «грязно» врал, когда значение возвращали к прежнему руками.
     */
    draft: SettingsValues;
  };
  loadSettingsDraft(values: SettingsValues): void;
  setSetting(key: string, value: string | number | boolean): void;
}

export const createSettingsSlice: StateCreator<Store, [], [], SettingsSlice> = set => ({
  settings: {draft: {}},

  loadSettingsDraft: values => set({settings: {draft: {...values}}}),

  setSetting: (key, value) => set(state => ({
    settings: {draft: {...state.settings.draft, [key]: value}},
  })),
});
