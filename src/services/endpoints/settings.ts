import {api, post} from '../api';

type SettingsValues = Record<string, string | number | boolean>;

export interface SettingsResponse {
  settings: SettingsValues;
  /** Только в ответе на чтение. */
  defaults?: SettingsValues;
  visual_models?: Array<{id: string; name?: string; note?: string; installed?: boolean}>;
  excluded?: number | null;
}

export const getSettings = () => api<SettingsResponse>('/api/settings');
// Бэкенд ждёт настройки вложенными в поле settings, а не россыпью.
export const saveSettings = (settings: Record<string, unknown>) =>
  post<SettingsResponse>('/api/settings', {settings});
