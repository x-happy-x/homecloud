import {api, post, query} from '../api';

/*
 * Хаб HomeCloud: ядра (компьютеры с видеокартой, которые считают) и
 * источники (где лежат оригиналы). Всё посчитанное — лица, превью, описания —
 * живёт на хабе, поэтому галерея работает и без включённых ядер.
 */

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

/** Старый каталог, который ядро держало у себя до хаба. */
export interface LegacyCatalog {
  path: string;
  bytes: number;
  photos?: number;
  faces?: number;
  people?: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  drives: DeviceDrive[];
  visual_model: string;
  visual_models: VisualModel[];
  capabilities: Record<string, boolean>;
  /** core — ядро при хабе; без него — старый бэкенд со своим каталогом. */
  role?: string;
  version?: string;
  legacy?: LegacyCatalog | null;
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
  /** Текущий этап: inventory, thumbs, faces, visual… */
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
  /** Папки задания — ключи источников: «netcraze:/HDD/photo», «pc-x:D:\Фото». */
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

/** SSH до устройства: им хаб ставит, обновляет и запускает ядро. */
export interface DeviceSsh {
  user: string;
  host: string;
  port: number;
  hasPassword?: boolean;
}

/** Установка, обновление или запуск ядра по SSH — идёт на хабе в фоне. */
export interface InstallState {
  status: 'running' | 'completed' | 'error' | string;
  action: 'install' | 'update' | 'start' | 'key' | string;
  step: string;
  log: string[];
  error: string;
  started_at: number;
  finished_at: number | null;
}

/** Ядро — компьютер с видеокартой. */
export interface Device {
  id: string;
  name: string;
  url: string;
  host?: string;
  port?: number;
  online: boolean;
  primary?: boolean;
  installDir?: string;
  version?: string;
  /** Версия ядра отстаёт от пакета на хабе. */
  outdated?: boolean;
  /** Отвечает старый бэкенд со своим каталогом: ядро ещё не установлено. */
  legacy?: boolean;
  /** Старый каталог устройства уже перенесён в общий. */
  legacyMerged?: boolean;
  /** Нет или null — SSH не настроен. */
  ssh?: DeviceSsh | null;
  error?: string;
  device?: DeviceInfo;
  job?: DeviceJob;
  install?: InstallState | null;
}

export interface CorePackage {
  version: string;
  file: string;
  sha256?: string;
  built_at?: string;
}

export interface CoresOverview {
  cores: Device[];
  /** Текущий пакет ядра на хабе: его ставят и им обновляют. */
  package: CorePackage | null;
  /** Открытый ключ хаба — его кладут в authorized_keys устройства. */
  publicKey: string;
}

export const getCores = () => api<CoresOverview>('/api/cores');
export const getDevices = () => getCores().then(data => data.cores ?? []);

export const saveCore = (payload: {
  id: string; name: string; host: string; port?: string; primary: boolean; installDir?: string;
  /** Пусто — не менять; sshClear — убрать SSH совсем. */
  sshUser?: string; sshPort?: string; sshPassword?: string; sshClear?: boolean;
}) => post('/api/cores/save', payload);

export const removeCore = (id: string) => post('/api/cores/remove', {id});

const core = (id: string, tail: string) => `/api/cores/${encodeURIComponent(id)}/${tail}`;

/** Поднимает службу ядра по SSH (start-remote.ps1). */
export const startCoreSsh = (id: string) => post<InstallState>(core(id, 'start'));

/**
 * Ставит ядро на устройство или обновляет его до пакета с хаба; `key` —
 * положить ключ хаба в authorized_keys и забыть пароль SSH.
 */
export const installCore = (id: string, action: 'install' | 'update' | 'key') =>
  post<InstallState>(core(id, 'install'), {action});

/** Окружение (venv) или модель на ядре. */
export interface CoreComponent {
  id: string;
  kind: 'venv' | 'model';
  title: string;
  /** Возможности ядра, которым это нужно: visual, caption, speech… */
  features: string[];
  installed: boolean;
  bytes?: number;
  /** Модель качается с Hugging Face. */
  downloadable?: boolean;
  /** Закрыта лицензией: качается только с hf-token.txt. */
  gated?: boolean;
  note?: string;
  /** Другие ядра в сети, где эта модель уже есть: с них её можно скопировать. */
  peers?: Array<{id: string; name: string}>;
}

/** Установка окружения, загрузка или копия модели — идёт на ядре в фоне, одна за раз. */
export interface ComponentOperation {
  id: string;
  action: 'install' | 'download' | 'copy';
  status: 'running' | 'completed' | 'error' | string;
  started_at: number;
  finished_at: number | null;
  error: string;
  /** Байты копии: сколько пришло из скольких. */
  done: number;
  total: number;
  log: string[];
}

export interface CoreComponents {
  venvs: CoreComponent[];
  models: CoreComponent[];
  operation: ComponentOperation | null;
}

export const getCoreComponents = (id: string) => api<CoreComponents>(core(id, 'components'));

export const startCoreComponent = (id: string, payload: {
  id: string;
  action: 'install' | 'download' | 'copy';
  /** Для copy — id ядра, с которого копировать. */
  from?: string;
}) => post<ComponentOperation>(core(id, 'components/start'), payload);

export const stopCoreComponent = (id: string) => post(core(id, 'components/stop'));

export interface ExportState {
  status: 'idle' | 'running' | 'completed' | 'error' | string;
  step?: string;
  error?: string;
  catalog?: string;
  thumbnails?: string;
}

/** Ядро отправляет свой старый каталог на хаб, чтобы влить его в общий. */
export const exportLegacy = (id: string) => post<ExportState>(core(id, 'export-legacy'));
export const getExportLegacy = (id: string) => api<ExportState>(core(id, 'export-legacy'));

export const startJob = (coreId: string, payload: {
  /** Папки и файлы — ключи источников. */
  roots: string[];
  paths?: string[];
  /** Возможности для снимков. */
  features: Record<string, boolean>;
  /** Возможности для роликов; не задано — тот же набор, что и для снимков. */
  video_features?: Record<string, boolean>;
  force?: boolean;
  visual_model?: string;
}) => post(core(coreId, 'job/start'), payload);

export const stopJob = (coreId: string) => post(core(coreId, 'job/stop'));

/** Доля параллельного задания на одном ядре. */
export interface ParallelPart {
  core: string;
  name: string;
  shard?: {index: number; count: number} | null;
  status: string;
  phase?: string;
  completed?: number;
  total?: number;
}

/**
 * Одно задание на несколько ядер: опись на хозяине источника, пофайловые
 * этапы долями на всех подходящих ядрах, подборки — один раз в конце.
 */
export interface ParallelJob {
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped' | string;
  step?: 'inventory' | 'shards' | 'highlights' | 'done' | string;
  cores?: string[];
  owner?: string;
  /** Ядра, которые не взяли, и почему: «PC-A: занято». */
  skipped?: string[];
  parts?: ParallelPart[];
  error?: string;
  started_at?: number;
  finished_at?: number | null;
}

export const getParallel = () => api<ParallelJob>('/api/hub/parallel');

export const startParallel = (payload: {
  roots: string[];
  features: Record<string, boolean>;
  video_features?: Record<string, boolean>;
  force?: boolean;
  visual_model?: string;
}) => post<ParallelJob>('/api/hub/parallel', payload);

export const stopParallel = () => post<ParallelJob>('/api/hub/parallel/stop');

// ---------- источники ----------

export type SourceType = 'device' | 'smb' | 'sftp' | 'ftp' | 'webdav' | 'local';

export interface SourceStats {
  photos: number;
  videos: number;
  missing: number;
  faces: number;
  named_faces: number;
  thumbs: number;
  thumb_bytes: number;
  analysis: number;
  captions: number;
  face_bytes: number;
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  typeName: string;
  host: string;
  port: number;
  user: string;
  share: string;
  path: string;
  /** У диска устройства — id ядра, на котором он стоит. */
  device: string;
  secure: boolean;
  enabled: boolean;
  /** Папки, которые обычно сканируют. */
  roots: string[];
  hasPassword: boolean;
  /** Ключ корня источника, с него начинается выбор папок. */
  rootKey: string;
  stats: Partial<SourceStats>;
  /** Доступность по последней проверке хаба (раз в пять минут); null — ещё не проверяли. */
  health: SourceHealth | null;
}

export interface SourceHealth {
  online: boolean;
  error: string;
  /** Когда проверено, секунды. */
  checked_at: number;
  /** Сколько заняла проверка, мс; нет — отметка по неудачному чтению. */
  ms?: number;
  /** Отметка не проверкой, а упавшим чтением файла. */
  passive?: boolean;
}

export interface SourcesOverview {
  sources: Source[];
  types: Record<SourceType, string>;
  devices: Array<{id: string; name: string}>;
}

export interface SourcePayload {
  id: string;
  name: string;
  type: SourceType;
  host?: string;
  port?: string | number;
  user?: string;
  /** Пусто — оставить прежний пароль. */
  password?: string;
  clearPassword?: boolean;
  share?: string;
  path?: string;
  device?: string;
  secure?: boolean;
  roots?: string[];
}

export const getSources = () => api<SourcesOverview>('/api/sources');
/** Доступность источника для плиток и просмотрщика: без адресов и ошибок. */
export interface SourceStatus {
  name: string;
  online: boolean;
  /** Когда хаб проверял, секунды; null — ещё не проверял (считается доступным). */
  checked_at: number | null;
}

export const getSourceHealth = () =>
  api<{sources: Record<string, SourceStatus>}>('/api/sources/health');

/** Проверить доступность всех источников сейчас, не дожидаясь фоновой проверки. */
export const checkSources = () => post<SourcesOverview>('/api/sources/health');
export const saveSource = (payload: SourcePayload) => post('/api/sources/save', payload);
/** purge — заодно удалить с хаба всё, что посчитано по этому источнику. */
export const removeSource = (id: string, purge: boolean) => post('/api/sources/remove', {id, purge});
export const testSource = (payload: SourcePayload) =>
  post<{ok: boolean; roots: string[]}>('/api/sources/test', payload);

export interface BrowseResult {
  source: string;
  /** Пусто — корни источника (шары, диски). */
  path: string;
  parent: string | null;
  /** Снимков и роликов прямо в этой папке. */
  media?: number;
  directories: Array<{name?: string; path: string}>;
}

/** Без пути — корни источника; с путём — вложенные папки. */
export const browseSource = (source: string, path: string) =>
  api<BrowseResult>(`/api/sources/browse${query({source, path})}`);

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

export const getTree = (path = '') => api<TreeNode>(`/api/sources/tree${query({path})}`);

export const setExclusions = (payload: {add?: string[]; remove?: string[]}) =>
  post('/api/sources/exclusions', payload);

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

export const getScanHistory = () =>
  api<{runs: ScanRun[]}>('/api/scan/history').then(data => data.runs ?? []);

// Хаб ищет запуск по полю id: с полем run «забыть» ничего не забывало.
export const forgetScanRun = (runId: number) => post('/api/scan/history/forget', {id: runId});

// ---------- данные на хабе по источникам ----------

export interface StorageSource extends SourceStats {
  id: string;
  name: string;
  /** Источник заведён; иначе это данные удалённого или старого источника. */
  known: boolean;
}

export interface StorageOverview {
  sources: StorageSource[];
  catalog_bytes: number;
  disk_free: number;
  disk_total: number;
}

export type StoragePart = 'thumbs' | 'analysis' | 'faces' | 'catalog' | 'previews';

export const getStorage = () => api<StorageOverview>('/api/storage');
export const cleanStorage = (source: string, what: StoragePart[]) =>
  post<StorageOverview & {removed: Record<string, unknown>}>('/api/storage/clean', {source, what});

// ---------- перенос старых каталогов ----------

export interface MergeState {
  status: 'running' | 'completed' | 'error' | string;
  source: string;
  error?: string;
  result?: Record<string, unknown>;
}

export const getImports = () =>
  api<{files: string[]; merges: Record<string, MergeState>}>('/api/imports');
export const mergeImport = (catalog: string, thumbnails: string | undefined, source: string) =>
  post<MergeState>('/api/imports/merge', {catalog, thumbnails, source});
