import {describe, expect, test} from 'vitest';
import {ANALYSIS_VIEWS} from '../../app/routes';
import {ANALYSIS_TABS, analysisTabStates} from './tabs';

describe('вкладки анализа', () => {
  test('порядок задан и совпадает с набором экранов', () => {
    expect(ANALYSIS_TABS.map(tab => tab.view)).toEqual([...ANALYSIS_VIEWS]);
    expect(ANALYSIS_TABS.map(tab => tab.label))
      .toEqual(['Проверка', 'Обучение', 'Сканирование', 'Дубликаты']);
  });

  test('неизвестное и нулевое — без числа', () => {
    const empty = analysisTabStates({});
    for (const view of ANALYSIS_VIEWS) expect(empty[view].count).toBeUndefined();
    expect(analysisTabStates({review: 0, pending: 0, duplicates: 0, devices: []}).scan)
      .toEqual({count: undefined, running: false});
  });

  test('числа берутся из того, что уже посчитано', () => {
    const state = analysisTabStates({
      review: 12,
      pending: 340,
      duplicates: 7,
      devices: [{online: true}, {online: true, job: {active: true}}, {online: false}],
    });
    expect(state.review.count).toBe(12);
    expect(state.training.count).toBe(340);
    expect(state.duplicates.count).toBe(7);
    expect(state.scan).toEqual({count: 2, running: true});
  });
});
