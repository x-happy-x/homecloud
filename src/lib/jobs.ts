import type {DeviceJob} from '../services/endpoints/backends';

export const JOB_LABELS: Record<string, string> = {
  idle: 'Готово к запуску',
  inventory: 'Поиск фотографий',
  faces: 'Распознавание лиц',
  visual: 'Визуальный индекс',
  ocr: 'Распознавание текста',
  caption: 'Описание изображений',
  adult: 'Анализ 18+ и областей',
  speech: 'Расшифровка речи',
  diarize: 'Разделение голосов',
  authenticity: 'Поиск рисованных лиц',
  running: 'Обработка',
  completed: 'Завершено',
  stopped: 'Остановлено',
  interrupted: 'Прервано',
  error: 'Ошибка',
};

export const FEATURE_INFO: Record<string, [string, string]> = {
  faces: ['Лица', 'InsightFace: поиск и группировка людей'],
  visual: ['Визуальный индекс', 'Тип изображения, качество и смысловой поиск'],
  ocr: ['OCR', 'Текст на изображениях, русский и английский'],
  caption: ['Описания', 'WD-теги → подробное локальное JSON-описание через Qwen3-VL'],
  adult: ['Контент 18+', 'NudeNet: области для блюра · WD-tagger: рейтинг и подробные теги'],
  speech: ['Речь', 'Расшифровка сказанного: субтитры и поиск по словам'],
  diarize: ['Кто говорит', 'Разделение голосов по репликам; нужна готовая расшифровка'],
  authenticity: ['Рисованные лица', 'Отсев мультяшных и игровых персонажей от настоящих людей'],
};

interface JobLike extends DeviceJob {
  phase?: string;
  completed?: number;
  videos_total?: number;
  video_track_step?: number;
}

/**
 * Ролик стоит дороже снимка, и насколько именно — зависит от этапа. У лиц
 * постоянного числа кадров больше нет: детектор идёт по всей длине с
 * фиксированным шагом, поэтому цена ролика оценивается по этому шагу —
 * чаще проверяем, дороже ролик.
 */
export function videoWeight(phase: string | undefined, job: JobLike = {} as JobLike): number {
  if (phase !== 'faces') return phase === 'adult' ? 3 : 2;
  const step = Number(job.video_track_step) || 0.5;
  return Math.min(120, Math.max(4, Math.round(20 / step)));
}

export interface JobWork {
  total: number;
  done: number;
  videoTotal: number;
  videoDone: number;
}

/** Объём работы в условных единицах, где ролик весит больше снимка. */
export function jobWork(job: JobLike = {} as JobLike, phase = job.phase): JobWork {
  const totalFiles = Number(job.total || 0);
  const doneFiles = Number(job.completed || 0);
  const videoTotal = Number(job.videos_total || 0);
  const videoDone = Number(job.videos_done || 0);
  const extra = Math.max(0, videoWeight(phase, job) - 1);
  return {
    total: totalFiles + videoTotal * extra,
    done: doneFiles + videoDone * extra,
    videoTotal,
    videoDone,
  };
}

/** Доля от 0 до 1 — ровно то, что ждёт компонент Progress. */
export function jobFraction(job: JobLike = {} as JobLike): number {
  const {done, total} = jobWork(job);
  return total ? Math.min(1, done / total) : 0;
}

type FeatureFlags = Record<string, boolean>;

const SCAN_PHASE_ORDER: Array<{key: string; always?: boolean; flag?: string | ((f: FeatureFlags) => boolean)}> = [
  {key: 'inventory', always: true},
  {key: 'faces', flag: 'faces'},
  {key: 'authenticity', flag: 'authenticity'},
  // Визуальный индекс строится и ради OCR, и ради описаний.
  {key: 'visual', flag: f => Boolean(f.visual || f.ocr || f.caption)},
  {key: 'ocr', flag: 'ocr'},
  {key: 'caption', flag: 'caption'},
  {key: 'adult', flag: 'adult'},
  {key: 'speech', flag: 'speech'},
  {key: 'diarize', flag: 'diarize'},
];

export interface ScanStep {
  key: string;
  title: string;
}

/** Этапы сканирования — только те, что включены в задании. */
export function scanSteps(job: JobLike = {} as JobLike): ScanStep[] {
  const features = (job.features ?? {}) as FeatureFlags;
  return SCAN_PHASE_ORDER
    .filter(item => item.always
      || (typeof item.flag === 'function' ? item.flag(features) : Boolean(features[item.flag!])))
    .map(item => ({key: item.key, title: JOB_LABELS[item.key] || item.key}));
}

export const scanStepIndex = (steps: ScanStep[], phase: string | undefined): number => {
  const index = steps.findIndex(step => step.key === phase);
  return index === -1 ? 1 : index + 1;
};

/** Общая готовность задания: пройденные этапы плюс доля текущего. */
export function scanOverallFraction(steps: ScanStep[], stepIndex: number, job: JobLike): number {
  if (!steps.length) return 0;
  const work = jobWork(job);
  const fraction = work.total ? Math.max(0, Math.min(1, work.done / work.total)) : 0;
  const completed = Math.max(0, stepIndex - 1);
  return (completed + fraction) / steps.length;
}

/**
 * Зависимости этапов: OCR и описания строятся поверх визуального индекса,
 * а описанию ещё нужен анализ 18+ — его теги идут в подсказку модели.
 */
export function withFeatureDeps<T extends Record<string, boolean>>(
  features: T,
  key: string,
  checked: boolean,
): T {
  const next: Record<string, boolean> = {...features, [key]: checked};
  if (checked && (key === 'ocr' || key === 'caption')) next.visual = true;
  if (checked && key === 'caption') next.adult = true;
  return next as T;
}

/**
 * Подпись этапа вместе с видом файлов: «Лица · только фото». Вид приходит в
 * задании картой «фаза → вид»; на прежних бэкендах её нет, и подпись остаётся
 * обычной.
 */
export function phaseLabel(job: JobLike = {} as JobLike): string {
  const phase = job.phase ?? '';
  const title = JOB_LABELS[phase] || JOB_LABELS[job.status ?? ''] || '';
  const kind = job.kinds?.[phase];
  if (!title || !kind || kind === 'all') return title;
  return `${title} · ${kind === 'videos' ? 'только видео' : 'только фото'}`;
}
