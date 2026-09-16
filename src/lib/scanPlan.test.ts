import {describe, expect, test} from 'vitest';
import type {Device, DeviceJob} from '../services/endpoints/backends';
import {EtaBook, type ProfileStore} from './eta';
import {perFileText, planJob, planMeta, plannedKeys} from './scanPlan';

const memory = (): ProfileStore => ({read: () => ({}), write: () => undefined});
const device = (job: Partial<DeviceJob>): Device =>
  ({id: 'pc', name: 'ПК', url: '', online: true, job: {active: true, ...job}});
const NOW = 2_000_000_000_000;
const at = (secondsAgo: number) => NOW / 1000 - secondsAgo;

describe('plannedKeys', () => {
  test('порядок как у device_job.py: 18+ до описаний, речь до рисованных лиц', () => {
    expect(plannedKeys({features: {
      faces: true, visual: true, caption: true, adult: true, speech: true, authenticity: true, diarize: true,
    }})).toEqual(['faces', 'visual', 'adult', 'caption', 'speech', 'authenticity', 'diarize']);
  });

  test('опись отдельным этапом — только если её попросили или лиц нет', () => {
    expect(plannedKeys({features: {faces: true}})).toEqual(['faces']);
    expect(plannedKeys({features: {inventory: true, faces: true}})).toEqual(['inventory', 'faces']);
    expect(plannedKeys({features: {ocr: true}})).toEqual(['inventory', 'visual', 'ocr']);
  });

  test('план от бэкенда важнее догадок', () => {
    expect(plannedKeys({plan: ['visual', 'adult'], features: {faces: true}})).toEqual(['visual', 'adult']);
  });
});

describe('planJob', () => {
  test('пройденные этапы — фактическая длительность, следующие — прогноз по замерам', () => {
    const plan = planJob(device({
      phase: 'adult', total: 100, completed: 50,
      job_started_at: at(1000), phase_started_at: at(110),
      features: {faces: true, adult: true, caption: true}, plan: ['faces', 'adult', 'caption'],
      kinds: {caption: 'videos'},
      videos_total: 20,
      phase_history: {
        faces: {started_at: at(1000), finished_at: at(110), total: 100},
        adult: {started_at: at(110), loaded_at: at(100), completed_at_load: 0, total: 100},
      },
      timings: {'caption:videos': {load: 60, per_file: 30}, 'adult:all': {load: 10, per_file: 2}},
    }), NOW, new EtaBook(memory()))!;

    expect(plan.phases.map(phase => [phase.key, phase.state])).toEqual([
      ['faces', 'done'], ['adult', 'active'], ['caption', 'waiting'],
    ]);
    expect(plan.index).toBe(2);
    expect(plan.phases[0].seconds).toBeCloseTo(890);
    // Сто секунд после загрузки на полсотни файлов — две секунды на файл, осталось пятьдесят.
    expect(plan.phaseRemaining).toBeCloseTo(100);
    // Описание только роликов: загрузка модели плюс двадцать видео по тридцать секунд.
    expect(plan.phases[2].seconds).toBeCloseTo(660);
    expect(plan.remaining).toBeCloseTo(760);
    expect(plan.elapsed).toBeCloseTo(1000);
    expect(plan.fraction).toBeCloseTo(1000 / 1760);
  });

  test('пока модель грузится, в прогноз идёт остаток обычной загрузки', () => {
    const plan = planJob(device({
      phase: 'visual', total: 40, completed: 0, job_started_at: at(5), phase_started_at: at(5),
      features: {visual: true}, plan: ['visual'],
      timings: {'visual:all': {load: 25, per_file: .5}},
    }), NOW, new EtaBook(memory()))!;
    expect(plan.phases[0].loading).toBe(true);
    expect(plan.remaining).toBeCloseTo(20 + 40 * .5);
  });

  test('объём неизвестен — прогноза нет, а не ноль', () => {
    const plan = planJob(device({phase: 'faces', total: 0, completed: 0, features: {faces: true}}), NOW,
      new EtaBook(memory()))!;
    expect(plan.remaining).toBeNull();
    expect(plan.fraction).toBeNull();
    expect(planMeta(plan)).toContain('оцениваю');
  });

  test('без активного задания плана нет', () => {
    expect(planJob(device({active: false}), NOW, new EtaBook(memory()))).toBeNull();
  });
});

test('perFileText', () => {
  expect(perFileText(.345)).toBe('0,35 с');
  expect(perFileText(2.84)).toBe('2,8 с');
  expect(perFileText(80)).toBe('1 мин 20 с');
  expect(perFileText(0)).toBe('');
});
