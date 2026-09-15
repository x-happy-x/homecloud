import type {ReclusterStatus} from '../services/endpoints/jobs';
import type {EtaBook} from './eta';
import {elapsedText, formatNumber} from './format';

/** Общая готовность пересборки: пройденные шаги плюс доля текущего. */
export function reclusterFraction(job: ReclusterStatus): number {
  if (!job.steps_total) return 0;
  const step = job.total ? Math.max(0, Math.min(1, job.done / job.total)) : (job.done ? 1 : 0);
  const completed = Math.max(0, (job.step_index || 1) - 1);
  return (completed + step) / job.steps_total;
}

/**
 * У кластеризации нет счётчика файлов — это один долгий вызов HDBSCAN. Зато
 * можно запомнить, сколько он шёл в прошлый раз на похожем объёме лиц.
 */
export const reclusterEtaKey = (facesTotal: number): string =>
  `recluster:cluster:${Math.round((facesTotal || 0) / 1000)}`;

/** Шаг кластеризации только что сменился следующим — запоминаем его длительность. */
export function learnClusterTiming(
  previous: ReclusterStatus | null,
  job: ReclusterStatus,
  book: EtaBook,
): void {
  if (!previous || previous.step !== 'cluster' || job.step === 'cluster') return;
  if (!previous.step_started_at || !job.step_started_at || !previous.faces_total) return;
  const duration = job.step_started_at - previous.step_started_at;
  if (duration < 1) return;
  book.learn(reclusterEtaKey(previous.faces_total), duration, .6);
}

/** Подробности текущего шага: время на кластеризации, счётчик файлов на остальных. */
export function reclusterStepDetail(job: ReclusterStatus, nowSeconds: number, book: EtaBook): string {
  const elapsed = job.step_started_at ? Math.max(0, nowSeconds - job.step_started_at) : 0;
  if (job.step === 'cluster') {
    const bits = [`${formatNumber(job.faces_total)} лиц`, `идёт ${elapsedText(elapsed)}`];
    const learned = book.get(reclusterEtaKey(job.faces_total));
    if (learned && learned > elapsed + 1) bits.push(`обычно ~${elapsedText(learned)}`);
    return bits.join(' · ');
  }
  if (job.total > 1) {
    const bits = [`${formatNumber(job.done)} / ${formatNumber(job.total)} файлов`];
    if (elapsed > .6) bits.push(`прошло ${elapsedText(elapsed)}`);
    if (job.done > 0 && job.done < job.total && elapsed > .6) {
      const rate = job.done / elapsed;
      if (rate > 0) bits.push(`осталось ~${elapsedText((job.total - job.done) / rate)}`);
    }
    return bits.join(' · ');
  }
  return elapsed > .6 ? `прошло ${elapsedText(elapsed)}` : '';
}

/** Подпись карточки: что делаем, какой шаг и сколько прошло всего. */
export function reclusterSub(job: ReclusterStatus, nowSeconds: number): string {
  if (job.status !== 'running') return job.message || '';
  const overall = job.started_at ? Math.max(0, nowSeconds - job.started_at) : 0;
  return `${job.message || ''} · шаг ${job.step_index} из ${job.steps_total} · всего прошло ${elapsedText(overall)}`;
}
