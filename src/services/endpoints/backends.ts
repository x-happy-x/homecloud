import {api, post, query} from '../api';

export interface DeviceJob {
  active: boolean;
  status?: string;
  message?: string;
  error?: string;
  done?: number;
  total?: number;
  faces_total?: number;
  videos_done?: number;
  step_index?: number;
  steps_total?: number;
  started?: number;
  features?: Record<string, boolean>;
}

export interface Device {
  id: string;
  name: string;
  url: string;
  online: boolean;
  primary?: boolean;
  error?: string;
  job?: DeviceJob;
  device?: {
    drives?: string[];
    capabilities?: Record<string, boolean>;
    catalog?: Record<string, number>;
  };
}

export const getDevices = () =>
  api<{backends: Device[]}>('/api/backends').then(data => data.backends ?? []);

export const saveBackend = (payload: Record<string, unknown>) =>
  post('/api/backends/save', payload);

export const removeBackend = (id: string) => post('/api/backends/remove', {id});

export const browseDevice = (id: string, path: string) =>
  api<{path: string; parent: string | null; folders: Array<{name: string; path: string}>}>(
    `/api/backends/${encodeURIComponent(id)}/browse${query({path})}`);

export const getTree = (id: string, path?: string) =>
  api<Record<string, unknown>>(`/api/backends/${encodeURIComponent(id)}/tree${query({path})}`);

export const setExclusions = (id: string, payload: Record<string, unknown>) =>
  post(`/api/backends/${encodeURIComponent(id)}/exclusions`, payload);

export const startJob = (id: string, payload: Record<string, unknown>) =>
  post(`/api/backends/${encodeURIComponent(id)}/job/start`, payload);

export const stopJob = (id: string) => post(`/api/backends/${encodeURIComponent(id)}/job/stop`);

export const getScanHistory = (id: string) =>
  api<{runs: Array<{id: number; roots: string[]; paths: string[]; at: string}>}>(
    `/api/backends/${encodeURIComponent(id)}/history`);

export const forgetScanRun = (id: string, run: number) =>
  post(`/api/backends/${encodeURIComponent(id)}/history/forget`, {run});
