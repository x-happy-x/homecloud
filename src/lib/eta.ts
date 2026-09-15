import type {Device} from '../services/endpoints/backends';
import {formatNumber, roughDuration} from './format';
import {jobWork, videoWeight} from './jobs';
import {KEYS, readLocalJson, writeLocalJson} from './storage';

export interface ProfileStore {
  read(): Record<string, number>;
  write(profiles: Record<string, number>): void;
}

const localProfiles: ProfileStore = {
  read: () => readLocalJson<Record<string, number>>(KEYS.etaProfiles, {}),
  write: profiles => writeLocalJson(KEYS.etaProfiles, profiles),
};

/**
 * Запомненные скорости: секунд на снимок для этапа на устройстве и
 * длительность кластеризации на похожем объёме лиц. Живут в браузере и
 * уточняются скользящим средним после каждого замера.
 */
export class EtaBook {
  private readonly profiles: Record<string, number>;

  constructor(private readonly store: ProfileStore = localProfiles) {
    this.profiles = store.read();
  }

  get(key: string): number | undefined {
    return this.profiles[key];
  }

  /** Прежнее значение весит keep, новый замер — остальное. */
  learn(key: string, observed: number, keep: number): number {
    const old = this.profiles[key];
    this.profiles[key] = old ? old * keep + observed * (1 - keep) : observed;
    this.store.write(this.profiles);
    return this.profiles[key];
  }
}

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|avi|mkv|webm|3gp|mts|m2ts)$/i;
const PHASE_ORDER = ['inventory', 'faces', 'visual', 'ocr', 'adult', 'caption'];
/** Секунд на снимок до первых замеров. */
const PHASE_SECONDS: Record<string, number> = {
  inventory: .003, faces: .09, visual: .07, ocr: .8, adult: .16, caption: 20,
};
/** Опрос идёт раз в полторы секунды, а оценку дёргают баннер, карточка и уведомление. */
const CACHE_MS = 500;

interface Timing {
  signature: string;
  observedAt: number;
  initialDone: number;
  cachedAt: number;
  cached: string;
}

/** «Осталось примерно …» для задания на устройстве, с учётом следующих этапов. */
export class DeviceEta {
  private readonly timings = new Map<string, Timing>();

  constructor(private readonly book: EtaBook) {}

  estimate(device: Device, now = Date.now()): string {
    const job = device.job;
    if (!job?.active || !job.phase || job.phase === 'complete') return '';
    const signature = `${job.pid ?? ''}:${job.phase}:${job.phase_started_at || job.started_at || ''}`;
    let timing = this.timings.get(device.id);
    if (!timing || timing.signature !== signature) {
      timing = {signature, observedAt: now, initialDone: jobWork(job).done, cachedAt: 0, cached: ''};
      this.timings.set(device.id, timing);
    }
    if (now - timing.cachedAt < CACHE_MS) return timing.cached;

    const work = jobWork(job);
    const serverStart = Number(job.phase_started_at || job.started_at || 0) * 1000;
    // Бэкенд не сказал, когда начал, — считаем от момента, когда мы это увидели.
    const startedAt = serverStart > 0 ? serverStart : timing.observedAt;
    const initialDone = serverStart > 0 ? 0 : timing.initialDone;
    const elapsed = Math.max(0, (now - startedAt) / 1000);
    const measured = Math.max(0, work.done - initialDone);
    const key = `${device.id}:${job.phase}`;
    let rate = Number(this.book.get(key) || PHASE_SECONDS[job.phase] || .2);
    if (elapsed >= 4 && measured >= 2) {
      rate = this.book.learn(key, Math.min(3600, elapsed / measured), .72);
    }
    let seconds = Math.max(0, work.total - work.done) * rate;

    const features = job.features ?? {};
    const currentIndex = PHASE_ORDER.indexOf(job.phase);
    const explicitVideos = (job.paths ?? []).filter(path => VIDEO_EXTENSIONS.test(path)).length;
    const scopeTotal = Number(job.inventory?.total || job.paths?.length || job.total || 0);
    const scopeVideos = work.videoTotal || explicitVideos;
    if (currentIndex >= 0 && scopeTotal) {
      for (const phase of PHASE_ORDER.slice(currentIndex + 1)) {
        const needed = phase === 'visual'
          ? features.visual || features.ocr || features.caption
          : Boolean(features[phase]);
        if (!needed) continue;
        const units = scopeTotal + scopeVideos * (videoWeight(phase) - 1);
        seconds += units * Number(this.book.get(`${device.id}:${phase}`) || PHASE_SECONDS[phase]);
      }
    }

    const videoNote = scopeVideos
      ? ` · учтено видео: ${formatNumber(scopeVideos)} × до ${videoWeight(job.phase, job)} кадров`
      : '';
    timing.cachedAt = now;
    timing.cached = `Осталось примерно ${roughDuration(seconds)}${videoNote}`;
    return timing.cached;
  }
}

export const etaBook = new EtaBook();
export const deviceEta = new DeviceEta(etaBook);
