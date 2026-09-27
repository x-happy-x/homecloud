import {api, post, query} from '../api';

/** Сведения о ролике от ffprobe на ядре. */
export interface VideoProbe {
  container: string;
  duration: number;
  size: number;
  bitrate: number;
  video: {codec: string; profile: string; width: number; height: number; pix_fmt: string;
    fps: number; rotation: number} | null;
  audio: Array<{codec: string; channels: number; language: string}>;
  subtitles: number;
  /** Сыграет ли браузер как есть. */
  browser: boolean;
  /** Какое ядро смотрело файл. */
  core: string;
}

export type VideoOp = 'replace' | 'trim' | 'compress' | 'rotate' | 'frame' | 'audio';

export interface VideoJob {
  id: string;
  op: VideoOp;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  error: string;
  params: Record<string, number>;
  /** replace — новый ключ ролика; остальное — имя и размер файла. */
  result: {name?: string; size?: number; old?: string; new?: string} | null;
  core: string;
  /** Ссылка на готовый файл, если операция отдаёт файл. */
  download: string;
}

export const probeVideo = (path: string) =>
  api<VideoProbe>(`/api/media/probe${query({path})}`);

export const startVideoJob = (path: string, op: VideoOp, params: Record<string, number> = {}) =>
  post<VideoJob>('/api/media/start', {path, op, params});

export const getVideoJob = (id: string) =>
  api<VideoJob>(`/api/media/jobs/${encodeURIComponent(id)}`);

export const cancelVideoJob = (id: string) =>
  post<VideoJob>(`/api/media/jobs/${encodeURIComponent(id)}/cancel`);
