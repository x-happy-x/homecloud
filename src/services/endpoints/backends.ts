import {api, post, query} from '../api';

export interface DeviceDrive {
  path: string;
  name: string;
  free?: number;
  total?: number;
}

export interface VisualModel {
  id: string;
  name: string;
  note?: string;
  installed?: boolean;
}

export interface DeviceInfo {
  id: string;
  name: string;
  drives: DeviceDrive[];
  visual_model: string;
  visual_models: VisualModel[];
  capabilities: Record<string, boolean>;
}

/** Итог описи: сколько нашли и что изменилось с прошлого раза. */
export interface InventorySummary {
  total: number;
  new: number;
  changed: number;
  missing: number;
  known?: number;
  excluded?: number;
}

export interface DeviceJob {
  active: boolean;
  status?: string;
  /** Остановка запрошена, этап дорабатывает текущий файл. */
  stop_requested?: boolean;
  /** Файлов этапа, пропущенных из-за ошибок. */
  errors?: number;
  /** Текущий этап: inventory, faces, visual… */
  phase?: string;
  error?: string;
  total?: number;
  completed?: number;
  /** Пока список файлов не собран, total неизвестен — есть только найденное. */
  found?: number;
  current?: string;
  videos_done?: number;
  videos_total?: number;
  video_track_step?: number;
  /** Секунды эпохи. */
  started_at?: number;
  job_started_at?: number;
  /** Последняя запись файла прогресса, секунды эпохи. */
  updated_at?: number;
  /** Конец задания, ISO. */
  finished_at?: string;
  phase_started_at?: number;
  /** Этапы задания в порядке выполнения (новые бэкенды). */
  plan?: string[];
  /** Пройденные и текущий этапы: начало, загрузка модели, конец, счётчики. */
  phase_history?: Record<string, import('../../lib/scanPlan').PhaseHistory>;
  /** Замеры прошлых запусков по ключу «этап:вид». */
  timings?: Record<string, import('../../lib/scanPlan').PhaseTiming>;
  pid?: number;
  roots?: string[];
  paths?: string[];
  features?: Record<string, boolean>;
  /** Вид файлов у каждой фазы: all, photos или videos. */
  kinds?: Record<string, string>;
  inventory?: InventorySummary;
  catalog?: Record<string, number>;
  catalog_photos?: number;
  catalog_faces?: number;
  catalog_videos?: number;
  catalog_indexed?: number;
  catalog_ocr?: number;
  catalog_captioned?: number;
  catalog_adult_analyzed?: number;
}

/** Куда и как подключиться по SSH, чтобы поднять backend.ps1 на выключенной машине. */
export interface DeviceSsh {
  user: string;
  host: string;
  port: number;
}

export interface Device {
  id: string;
  name: string;
  url: string;
  online: boolean;
  primary?: boolean;
  hasToken?: boolean;
  /** Нет или null — SSH-запуск не настроен. */
  ssh?: DeviceSsh | null;
  error?: string;
  device?: DeviceInfo;
  job?: DeviceJob;
}

export const getDevices = () =>
  api<{backends: Device[]}>('/api/backends').then(data => data.backends ?? []);

export const saveBackend = (payload: {
  id: string; name: string; url: string; token: string; primary: boolean;
  /** Пусто — не менять (как и token); sshClear — убрать SSH-запуск совсем. */
  sshUser?: string; sshHost?: string; sshPort?: string; sshCommand?: string; sshClear?: boolean;
}) => post('/api/backends/save', payload);

export const removeBackend = (id: string) => post('/api/backends/remove', {id});

const device = (id: string, tail: string) => `/api/backends/${encodeURIComponent(id)}/${tail}`;

/** Запускает backend.ps1 на устройстве по SSH; возвращается после того, как ssh отработал. */
export const startBackendSsh = (id: string) => post<{ok: boolean; output?: string}>(device(id, 'ssh-start'));

/** Без пути — список дисков; с путём — вложенные папки. */
export const browseDevice = (id: string, path: string) =>
  api<{path: string; parent: string | null; directories: Array<{name?: string; path: string}>}>(
    device(id, `browse${query({path})}`));

export interface TreeCounts {
  files?: number;
  subtree?: number;
  new?: number;
  changed?: number;
  missing?: number;
  excluded?: number;
}

export interface TreeDirectory extends TreeCounts {
  path: string;
  name: string;
  off: boolean;
}

export interface TreeFile {
  path: string;
  name?: string;
  state?: string;
  off: boolean;
}

export interface TreeNode {
  path: string;
  parent: string | null;
  /** Только у корня дерева: источники прошлых описей. */
  roots?: Array<TreeCounts & {path: string}>;
  directories: TreeDirectory[];
  files: TreeFile[];
  truncated?: boolean;
}

export const getTree = (id: string, path = '') => api<TreeNode>(device(id, `tree${query({path})}`));

export const setExclusions = (id: string, payload: {add?: string[]; remove?: string[]}) =>
  post(device(id, 'exclusions'), payload);

export const startJob = (id: string, payload: {
  roots: string[];
  paths?: string[];
  /** Возможности для снимков. */
  features: Record<string, boolean>;
  /** Возможности для роликов; не задано — тот же набор, что и для снимков. */
  video_features?: Record<string, boolean>;
  force?: boolean;
  visual_model?: string;
}) => post(device(id, 'job/start'), payload);

export const stopJob = (id: string) => post(device(id, 'job/stop'));

export interface ScanRun {
  id: number;
  roots: string[];
  paths: string[];
  last_run_at: string | number;
  /** Этапы, дошедшие до конца. */
  done: string[];
  status: string;
  photos: number;
}

export const getScanHistory = (id: string) =>
  api<{runs: ScanRun[]}>(device(id, 'history')).then(data => data.runs ?? []);

// Бэкенд ищет запуск по полю id: с полем run «забыть» ничего не забывало.
export const forgetScanRun = (id: string, runId: number) =>
  post(device(id, 'history/forget'), {id: runId});
