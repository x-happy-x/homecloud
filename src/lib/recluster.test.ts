import {describe, expect, test} from 'vitest';
import type {ReclusterStatus} from '../services/endpoints/jobs';
import {EtaBook} from './eta';
import {learnClusterTiming, reclusterFraction, reclusterStepDetail, reclusterSub} from './recluster';

const job = (part: Partial<ReclusterStatus>): ReclusterStatus => ({
  status: 'running', step: '', step_index: 1, steps_total: 4, done: 0, total: 0,
  faces_total: 0, message: '', error: '', started_at: 0, step_started_at: 0, steps: [], ...part,
});
const book = () => new EtaBook({read: () => ({}), write: () => {}});

describe('reclusterFraction', () => {
  test('пройденные шаги плюс доля текущего', () => {
    expect(reclusterFraction(job({step_index: 2, done: 50, total: 100}))).toBeCloseTo(.375);
    expect(reclusterFraction(job({step_index: 2}))).toBeCloseTo(.25);
  });
  test('шаг без счётчика, но с отметкой готовности', () => {
    expect(reclusterFraction(job({step_index: 3, done: 1}))).toBeCloseTo(.75);
  });
  test('без шагов — ноль', () => {
    expect(reclusterFraction(job({steps_total: 0}))).toBe(0);
  });
});

describe('reclusterStepDetail', () => {
  test('кластеризация: лица и время, а после замера — обычная длительность', () => {
    const eta = book();
    const clustering = job({step: 'cluster', faces_total: 12345, step_started_at: 1000});
    expect(reclusterStepDetail(clustering, 1065, eta)).toBe('12 345 лиц · идёт 1 мин 5 с');
    eta.learn('recluster:cluster:12', 300, .6);
    expect(reclusterStepDetail(clustering, 1065, eta)).toBe('12 345 лиц · идёт 1 мин 5 с · обычно ~5 мин');
  });
  test('шаг по файлам: счётчик, прошедшее и оставшееся время', () => {
    expect(reclusterStepDetail(job({step: 'embed', total: 100, done: 25, step_started_at: 1000}), 1010, book()))
      .toBe('25 / 100 файлов · прошло 10 с · осталось ~30 с');
  });
});

test('длительность кластеризации запоминается при смене шага', () => {
  const eta = book();
  learnClusterTiming(
    job({step: 'cluster', step_started_at: 100, faces_total: 12000}),
    job({step: 'save', step_started_at: 160}),
    eta,
  );
  expect(eta.get('recluster:cluster:12')).toBe(60);
});

test('подпись: шаг и общее время только пока идёт', () => {
  const running = job({message: 'Кластеризую лица', step_index: 3, started_at: 1000});
  expect(reclusterSub(running, 1125)).toBe('Кластеризую лица · шаг 3 из 4 · всего прошло 2 мин 5 с');
  expect(reclusterSub(job({status: 'completed', message: 'Готово'}), 1125)).toBe('Готово');
});
