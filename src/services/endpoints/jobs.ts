import {api, post} from '../api';

export interface ReclusterStatus {
  active: boolean;
  step?: string;
  step_index?: number;
  steps_total?: number;
  message?: string;
  done?: number;
  total?: number;
  started?: number;
  faces_total?: number;
  error?: string;
}

export const getReclusterStatus = () => api<ReclusterStatus>('/api/recluster/status');
export const startRecluster = () => post('/api/recluster/start');
export const stopRecluster = () => post('/api/recluster/stop');

export interface DuplicatesStatus {
  active: boolean;
  done?: number;
  total?: number;
  current?: string;
  message?: string;
}

export const getDuplicatesStatus = () => api<DuplicatesStatus>('/api/duplicates/status');
export const startDuplicatesScan = (similar: boolean) => post('/api/duplicates/scan', {similar});
export const stopDuplicatesScan = () => post('/api/duplicates/stop');

export const getDuplicates = (similar: boolean, limit: number, offset: number) =>
  api<{groups: Array<Record<string, unknown>>; total: number}>(
    `/api/duplicates?similar=${similar ? 1 : 0}&limit=${limit}&offset=${offset}`);
