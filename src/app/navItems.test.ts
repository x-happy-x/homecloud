import {describe, expect, test} from 'vitest';
import {NAV_GROUPS, navGroupOf} from './navItems';
import {VIEWS} from './routes';

describe('пункты навигации', () => {
  test('их четыре, порядок задан', () => {
    expect(NAV_GROUPS.map(group => group.label))
      .toEqual(['Фотографии', 'Люди', 'Анализ', 'Настройки']);
  });

  test('каждый экран принадлежит ровно одному пункту', () => {
    for (const view of VIEWS) {
      expect(NAV_GROUPS.filter(group => group.views.includes(view))).toHaveLength(1);
    }
  });

  test('четыре экрана обслуживания собраны в «Анализ»', () => {
    for (const view of ['review', 'training', 'scan', 'duplicates'] as const) {
      expect(navGroupOf(view).id).toBe('analysis');
    }
    expect(navGroupOf('photos').id).toBe('photos');
    expect(navGroupOf('settings').id).toBe('settings');
  });
});
