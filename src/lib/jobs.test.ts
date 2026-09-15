import {describe, expect, test} from 'vitest';
import {jobFraction, jobWork, scanOverallFraction, scanStepIndex, scanSteps, videoWeight} from './jobs';

describe('videoWeight', () => {
  test('лица: цена ролика растёт с частотой проверки кадров', () => {
    expect(videoWeight('faces', {video_track_step: 0.5} as never)).toBe(40);
    expect(videoWeight('faces', {video_track_step: 2} as never)).toBe(10);
    // Границы: не дешевле четырёх снимков и не дороже ста двадцати.
    expect(videoWeight('faces', {video_track_step: 100} as never)).toBe(4);
    expect(videoWeight('faces', {video_track_step: 0.01} as never)).toBe(120);
  });
  test('остальные этапы — постоянная цена', () => {
    expect(videoWeight('adult', {} as never)).toBe(3);
    expect(videoWeight('ocr', {} as never)).toBe(2);
    expect(videoWeight(undefined, {} as never)).toBe(2);
  });
});

test('jobWork считает ролики дороже снимков', () => {
  const job = {total: 100, completed: 50, videos_total: 10, videos_done: 5, phase: 'adult'} as never;
  // Вес ролика 3 — сверх обычного файла он добавляет ещё две единицы.
  expect(jobWork(job)).toEqual({total: 120, done: 60, videoTotal: 10, videoDone: 5});
});

test('jobFraction отдаёт долю, а не проценты', () => {
  expect(jobFraction({total: 200, completed: 50} as never)).toBe(0.25);
  expect(jobFraction({} as never)).toBe(0);
  // Бэкенд иногда досчитывает сверх заявленного — доля не должна превышать единицу.
  expect(jobFraction({total: 10, completed: 12} as never)).toBe(1);
});

describe('этапы сканирования', () => {
  test('опись есть всегда, остальное по заданию', () => {
    expect(scanSteps({features: {}} as never).map(step => step.key)).toEqual(['inventory']);
    expect(scanSteps({features: {faces: true, adult: true}} as never).map(step => step.key))
      .toEqual(['inventory', 'faces', 'adult']);
  });
  test('визуальный индекс включается и ради OCR, и ради описаний', () => {
    expect(scanSteps({features: {ocr: true}} as never).map(step => step.key))
      .toEqual(['inventory', 'visual', 'ocr']);
    expect(scanSteps({features: {caption: true}} as never).map(step => step.key))
      .toEqual(['inventory', 'visual', 'caption']);
  });
  test('неизвестный этап — считаем, что идёт первый', () => {
    const steps = scanSteps({features: {faces: true}} as never);
    expect(scanStepIndex(steps, 'faces')).toBe(2);
    expect(scanStepIndex(steps, 'непонятно')).toBe(1);
  });
});

test('общая готовность: пройденные этапы плюс доля текущего', () => {
  const steps = scanSteps({features: {faces: true, adult: true}} as never);
  expect(steps).toHaveLength(3);
  // Второй этап пройден наполовину → (1 + 0.5) / 3.
  expect(scanOverallFraction(steps, 2, {total: 100, completed: 50} as never)).toBeCloseTo(0.5);
  expect(scanOverallFraction([], 1, {} as never)).toBe(0);
});
