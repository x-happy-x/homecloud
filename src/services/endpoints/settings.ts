import {api, post} from '../api';

export interface SettingsResponse {
  settings: Record<string, string | number | boolean>;
  visual_models?: Array<{id: string; title?: string}>;
  excluded?: number;
}

export const getSettings = () => api<SettingsResponse>('/api/settings');
export const saveSettings = (settings: Record<string, unknown>) =>
  post<SettingsResponse>('/api/settings', settings);
