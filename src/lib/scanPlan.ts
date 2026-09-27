import type {Device, DeviceJob} from '../services/endpoints/backends';
import {etaBook, type EtaBook} from './eta';
import {roughDuration} from './format';
import {JOB_LABELS, videoWeight} from './jobs';

/**
 * План и прогноз задания на устройстве. Бэкенд присылает план этапов в
 * порядке выполнения, историю пройденных этапов (когда начался, когда
 * загрузилась модель, сколько файлов) и замеры прошлых запусков: сколько
 * этап грузит модель и сколько тратит на файл. Из этого складывается
 * «сколько осталось» для всего задания, а не только для текущего этапа.
 */

export type PhaseState = 'done' | 'active' | 'waiting' | 'failed' | 'skipped';

export interface PhaseHistory {
  started_at?: number;
  loaded_at?: number;
  finished_at?: number;
  completed?: number;
  completed_at_load?: number;
  total?: number;
  videos_total?: number;
  status?: string;
}

export interface PhaseTiming {
  load?: number;
  per_file?: number;
  runs?: number;
}

export interface PlannedPhase {
  key: string;
  title: string;
  /** «только видео» / «только фото» — или пусто. */
  kind: string;
  state: PhaseState;
  /** Пройденный — сколько шёл; ожидающий — сколько примерно займёт. */
  seconds: number | null;
  /** Только у текущего. */
  completed?: number;
  total?: number;
  /** Модель ещё грузится или список файлов ещё собирается. */
  loading?: boolean;
  /** Секунд на файл, которыми считаем. */
  perFile?: number;
}

export interface JobPlan {
  phases: PlannedPhase[];
  /** Номер текущего этапа, с единицы. */
  index: number;
  /** Секунд с начала задания. */
  elapsed: number;
  /** Секунд до конца всего задания; null — оценить нечем. */
  remaining: number | null;
  /** До конца текущего этапа. */
  phaseRemaining: number | null;
  /** Готовность по времени: прошедшее к прошедшему плюс оставшемуся. */
  fraction: number | null;
}

/**
 * Порядок, в котором device_job.py выполняет этапы. Опись идёт отдельным
 * этапом, только если её попросили или лица не запускаются — лица сами
 * обходят папки.
 */
const ORDER = [
  'inventory', 'thumbs', 'faces', 'visual', 'ocr', 'adult', 'caption', 'speech', 'authenticity', 'diarize',
  'curation', 'highlights',
];
const ANALYSIS = ['visual', 'ocr', 'caption', 'adult', 'speech', 'diarize', 'authenticity', 'curation'];
/** Речь и голоса бывают только у роликов. */
const VIDEO_ONLY = new Set(['speech', 'diarize']);

export function plannedKeys(job: Pick<DeviceJob, 'features' | 'plan'>): string[] {
  if (job.plan?.length) return job.plan;
  const f = job.features ?? {};
  return ORDER.filter(key => {
    if (key === 'inventory') return Boolean(f.inventory || (!f.faces && ANALYSIS.some(name => f[name])));
    if (key === 'visual') return Boolean(f.visual || f.ocr || f.caption);
    return Boolean(f[key]);
  });
}

/** До первых замеров: секунд на снимок и на загрузку модели. */
const PER_FILE: Record<string, number> = {
  inventory: .003, thumbs: .05, faces: .09, visual: .07, ocr: .8, adult: .16, caption: 20,
  speech: 25, authenticity: .05, diarize: 20, curation: .01, highlights: 0,
};
const LOAD: Record<string, number> = {
  inventory: 0, thumbs: 1, faces: 8, visual: 25, ocr: 15, adult: 20, caption: 60,
  speech: 30, authenticity: 10, diarize: 30, curation: 2, highlights: 2,
};

const KIND_LABELS: Record<string, string> = {videos: 'только видео', photos: 'только фото'};

const kindOf = (job: DeviceJob, key: string): string => job.kinds?.[key] || 'all';

/**
 * Объём, увиденный за время задания. Бэкенд без истории этапов забывает счётчики
 * прошлого этапа, как только начинается следующий, — помним их сами.
 */
const seenScope = new Map<string, {files: number; videos: number}>();

/** Сколько файлов попадёт в этап: берём самое полное, что уже известно о задании. */
function scope(job: DeviceJob) {
  const measured = measuredScope(job);
  const key = `${job.pid ?? ''}:${job.job_started_at ?? job.started_at ?? ''}`;
  const seen = seenScope.get(key) ?? {files: 0, videos: 0};
  const merged = {files: Math.max(seen.files, measured.files), videos: Math.max(seen.videos, measured.videos)};
  if (seenScope.size > 20) seenScope.clear();
  seenScope.set(key, merged);
  return merged;
}

function measuredScope(job: DeviceJob) {
  const history = Object.values(job.phase_history ?? {});
  const files = Math.max(
    0,
    Number(job.inventory?.total || 0),
    ...history.map(item => Number(item.total || 0)),
    Number(job.total || 0),
    job.paths?.length ?? 0,
  );
  // У этапа только по роликам все его файлы — ролики.
  const videoPhase = (key: string) => VIDEO_ONLY.has(key) || job.kinds?.[key] === 'videos';
  const videos = Math.max(
    0,
    Number(job.videos_total || 0),
    job.phase && videoPhase(job.phase) ? Number(job.total || 0) : 0,
    ...history.map(item => Number(item.videos_total || 0)),
    ...Object.entries(job.phase_history ?? {})
      .filter(([key]) => videoPhase(key))
      .map(([, item]) => Number(item.total || 0)),
  );
  return {files, videos: Math.min(videos, files || videos)};
}

function unitsFor(job: DeviceJob, key: string): number {
  const {files, videos} = scope(job);
  const kind = VIDEO_ONLY.has(key) ? 'videos' : kindOf(job, key);
  if (kind === 'videos') return videos || 0;
  if (kind === 'photos') return Math.max(0, files - videos);
  return files;
}

/** Скорость этапа: замер бэкенда, затем запомненное браузером, затем умолчание. */
function timingFor(job: DeviceJob, deviceId: string, key: string, book: EtaBook) {
  const kind = VIDEO_ONLY.has(key) ? 'videos' : kindOf(job, key);
  const server = job.timings?.[`${key}:${kindOf(job, key)}`];
  const local = book.get(`${deviceId}:${key}:${kind}`);
  const fallback = kind === 'videos' && !VIDEO_ONLY.has(key)
    ? PER_FILE[key] * videoWeight(key, job) : PER_FILE[key] ?? .2;
  return {
    perFile: server?.per_file ?? local ?? fallback,
    load: server?.load ?? LOAD[key] ?? 10,
    measured: server?.per_file !== undefined || local !== undefined,
  };
}

/** Живую скорость запоминаем не чаще раза в десять секунд на этап. */
const learnedAt = new Map<string, number>();

export function planJob(device: Device, now = Date.now(), book: EtaBook = etaBook): JobPlan | null {
  const job = device.job;
  if (!job?.active) return null;
  const nowSeconds = now / 1000;
  const keys = plannedKeys(job);
  const current = job.phase && keys.includes(job.phase) ? job.phase : keys[0];
  const currentIndex = Math.max(0, keys.indexOf(current ?? ''));
  const history = job.phase_history ?? {};
  const jobStarted = Number(job.job_started_at || job.started_at || 0);
  const elapsed = jobStarted ? Math.max(0, nowSeconds - jobStarted) : 0;

  let remaining = 0;
  let known = true;
  let phaseRemaining: number | null = null;

  const phases = keys.map((key, index): PlannedPhase => {
    const base = {key, title: JOB_LABELS[key] || key, kind: KIND_LABELS[kindOf(job, key)] ?? ''};
    const record = history[key];
    const timing = timingFor(job, device.id, key, book);

    if (index < currentIndex) {
      const seconds = record?.started_at && record.finished_at ? record.finished_at - record.started_at : null;
      return {...base, state: 'done', seconds};
    }

    if (index > currentIndex) {
      const units = unitsFor(job, key);
      if (!units && !scope(job).files) known = false;
      const seconds = timing.load + units * timing.perFile;
      remaining += seconds;
      return {...base, state: 'waiting', seconds, perFile: timing.perFile};
    }

    // Текущий этап.
    const total = Number(job.total || 0);
    const completed = Number(job.completed || 0);
    const phaseStarted = Number(job.phase_started_at || record?.started_at || jobStarted || nowSeconds);
    const phaseElapsed = Math.max(0, nowSeconds - phaseStarted);
    const loading = completed === 0;
    let perFile = timing.perFile;
    let seconds: number;
    if (loading) {
      const units = total || unitsFor(job, key);
      if (!units) known = false;
      seconds = Math.max(0, timing.load - phaseElapsed) + units * perFile;
    } else {
      // Живая скорость: от загрузки модели (или от её типичной длительности) до сейчас.
      const loadedAt = record?.loaded_at ?? phaseStarted + Math.min(timing.load, phaseElapsed * .5);
      const sinceLoad = Math.max(0, nowSeconds - loadedAt);
      const counted = completed - Number(record?.completed_at_load ?? 0);
      if (counted >= 2 && sinceLoad >= 5) {
        const live = sinceLoad / counted;
        // Чем больше файлов прошло, тем больше веры живому замеру.
        const trust = timing.measured ? Math.min(1, counted / 30) : 1;
        perFile = timing.perFile * (1 - trust) + live * trust;
        const learnKey = `${device.id}:${key}:${VIDEO_ONLY.has(key) ? 'videos' : kindOf(job, key)}`;
        if (now - (learnedAt.get(learnKey) ?? 0) > 10_000 && counted >= 5) {
          learnedAt.set(learnKey, now);
          book.learn(learnKey, live, .8);
        }
      }
      seconds = Math.max(0, (total || completed) - completed) * perFile;
    }
    phaseRemaining = seconds;
    remaining += seconds;
    return {...base, state: 'active', seconds: phaseElapsed, completed, total, loading, perFile};
  });

  const total = known ? remaining : null;
  return {
    phases,
    index: currentIndex + 1,
    elapsed,
    remaining: total,
    phaseRemaining,
    fraction: total === null || elapsed + total <= 0 ? null : Math.min(.999, elapsed / (elapsed + total)),
  };
}

/** «0,35 с», «2,8 с», «1 мин 20 с» на файл. */
export function perFileText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 10) return `${seconds.toLocaleString('ru-RU', {maximumFractionDigits: seconds < 1 ? 2 : 1})} с`;
  if (seconds < 60) return `${Math.round(seconds)} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`;
}

/** Строка под полосой: сколько идёт всё задание и сколько ему осталось. */
export function planMeta(plan: JobPlan): string {
  const parts = [`Идёт ${roughDuration(plan.elapsed) || 'меньше минуты'}`];
  parts.push(plan.remaining === null ? 'оцениваю, сколько осталось' : `осталось ≈ ${roughDuration(plan.remaining)}`);
  return parts.join(' · ');
}

export interface LastRun {
  status: 'completed' | 'stopped' | 'error' | 'interrupted' | string;
  phases: PlannedPhase[];
  /** Сколько шло всё задание, секунд; null — бэкенд не сказал. */
  duration: number | null;
  /** Секунды эпохи. */
  finishedAt: number | null;
}

/**
 * Прошлое задание в виде того же пайплайна: пройденные этапы, этап, на котором
 * остановились или упали, и не дошедшие до очереди.
 */
export function lastRun(job: DeviceJob | undefined): LastRun | null {
  if (!job || job.active || !job.status || job.status === 'idle') return null;
  const keys = plannedKeys(job);
  if (!keys.length) return null;
  const history = job.phase_history ?? {};
  const completed = job.status === 'completed' || job.phase === 'complete';
  const stopIndex = completed ? keys.length : Math.max(0, keys.indexOf(job.phase ?? ''));
  const phases = keys.map((key, index): PlannedPhase => {
    const record = history[key];
    const seconds = record?.started_at && record.finished_at ? record.finished_at - record.started_at : null;
    const base = {key, title: JOB_LABELS[key] || key, kind: KIND_LABELS[kindOf(job, key)] ?? '', seconds,
      total: record?.total, completed: record?.completed};
    if (index < stopIndex) return {...base, state: 'done'};
    if (index === stopIndex) return {...base, state: job.status === 'error' ? 'failed' : 'skipped'};
    return {...base, state: 'skipped', seconds: null};
  });
  const started = Number(job.job_started_at || job.started_at || 0);
  const finishedIso = job.finished_at;
  const finishedAt = finishedIso ? Date.parse(finishedIso) / 1000 : Number(job.updated_at || 0) || null;
  return {
    status: job.status,
    phases,
    duration: started && finishedAt ? Math.max(0, finishedAt - started) : null,
    finishedAt,
  };
}

/** Этапы описи: упало на них — продолжать без описи нельзя. */
const INVENTORY_PHASES = new Set(['inventory', 'thumbs']);
/** Статусы, после которых предлагаем продолжить. */
const RESUMABLE = new Set(['error', 'interrupted', 'stopped']);

export interface ResumePlan {
  roots: string[];
  paths: string[];
  features: Record<string, boolean>;
  video_features: Record<string, boolean>;
  /** Не обходить источник заново: опись уже прошла. */
  resume: boolean;
  /** С какого этапа продолжим — подпись для кнопки. */
  from: string;
}

/**
 * Как продолжить упавшее или прерванное задание с того же места: те же папки
 * и возможности без этапов, дошедших до конца. Этапы сами пропускают уже
 * посчитанные файлы, так что начатый этап продолжится, а не начнётся заново.
 */
export function resumePlan(job: DeviceJob | undefined): ResumePlan | null {
  if (!job || job.active || !RESUMABLE.has(job.status ?? '')) return null;
  const roots = job.roots ?? [];
  const paths = job.paths ?? [];
  if (!roots.length && !paths.length) return null;
  const last = lastRun(job);
  if (!last) return null;
  const stop = last.phases.find(phase => phase.state !== 'done');
  if (!stop) return null;
  const done = new Set(last.phases.filter(phase => phase.state === 'done').map(phase => phase.key));
  const features: Record<string, boolean> = {};
  const videoFeatures: Record<string, boolean> = {};
  for (const [name, on] of Object.entries(job.features ?? {})) {
    if (!on || name === 'inventory' || done.has(name)) continue;
    const kind = job.kinds?.[name] ?? 'all';
    features[name] = kind !== 'videos';
    videoFeatures[name] = kind !== 'photos';
  }
  const resume = !INVENTORY_PHASES.has(stop.key);
  // Осталась только служебная доделка (копии, перенос) — продолжать нечего.
  if (resume && !Object.keys(features).length) return null;
  return {roots, paths, features, video_features: videoFeatures, resume, from: stop.title};
}
