import {describe, expect, test} from 'vitest';
import {
  GROUP_NONE, groupHeading, groupNote, isCollapsed, parseGrouping, toggleCollapse,
} from './grouping';

const BS = String.fromCharCode(92);
const now = new Date(2026, 8, 16, 12);
const group = (key: string, label = '') => ({key, label});

describe('parseGrouping', () => {
  test('по умолчанию — месяцы, свежие сверху', () => {
    expect(parseGrouping(null)).toEqual({by: 'month', order: 'new'});
    expect(parseGrouping({by: 'nonsense', order: 'nonsense'})).toEqual({by: 'month', order: 'new'});
  });

  test('у нового вида свой порядок', () => {
    expect(parseGrouping({by: 'folder'})).toEqual({by: 'folder', order: 'name'});
    expect(parseGrouping({by: 'folder', order: 'count'})).toEqual({by: 'folder', order: 'count'});
  });

  test('«по названию» у дат превращается в «сначала новые»', () => {
    expect(parseGrouping({by: 'day', order: 'name'})).toEqual({by: 'day', order: 'new'});
  });
});

describe('свёрнутость', () => {
  test('папки свёрнуты, даты раскрыты', () => {
    expect(isCollapsed({}, 'folder', 'D:')).toBe(true);
    expect(isCollapsed({}, 'month', '2026-09')).toBe(false);
  });

  test('щелчок переворачивает одну группу, «все» сбрасывает исключения', () => {
    let rules = toggleCollapse({}, 'month', '2026-09');
    expect(isCollapsed(rules, 'month', '2026-09')).toBe(true);
    expect(isCollapsed(rules, 'month', '2026-08')).toBe(false);
    rules = toggleCollapse(rules, 'month', '2026-09');
    expect(isCollapsed(rules, 'month', '2026-09')).toBe(false);

    rules = {...rules, month: {collapsed: true, except: []}};
    rules = toggleCollapse(rules, 'month', '2026-08');
    expect(isCollapsed(rules, 'month', '2026-08')).toBe(false);
    expect(isCollapsed(rules, 'month', '2026-07')).toBe(true);
  });
});

describe('groupHeading', () => {
  test('даты', () => {
    expect(groupHeading('year', group('2024'), now)).toBe('2024');
    expect(groupHeading('month', group('2026-09'), now)).toBe('Сентябрь');
    expect(groupHeading('month', group('2024-02'), now)).toBe('Февраль 2024');
    expect(groupHeading('day', group('2026-09-16'), now)).toBe('Сегодня');
    expect(groupHeading('day', group('2026-09-15'), now)).toBe('Вчера');
    expect(groupHeading('day', group('2026-09-01'), now)).toBe('1 сентября, вт');
    expect(groupHeading('day', group('2024-02-29'), now)).toBe('29 февраля 2024, чт');
  });

  test('вчера через границу месяца', () => {
    expect(groupHeading('day', group('2026-08-31'), new Date(2026, 8, 1, 9))).toBe('Вчера');
  });

  test('остальное', () => {
    expect(groupHeading('folder', group(`D:${BS}Фото${BS}Море`), now)).toBe('Море');
    expect(groupHeading('album', group('4', 'Семья / Лето'), now)).toBe('Семья / Лето');
    expect(groupHeading('person', group('Хамис', 'Хамис'), now)).toBe('Хамис');
    expect(groupHeading('type', group('screenshot'), now)).toBe('Скриншоты');
    expect(groupHeading('kind', group('video'), now)).toBe('Видео');
  });

  test('снимки без признака', () => {
    expect(groupHeading('album', group(GROUP_NONE), now)).toBe('Без альбома');
    expect(groupHeading('person', group(GROUP_NONE), now)).toBe('Без людей');
    expect(groupHeading('month', group(GROUP_NONE), now)).toBe('Без даты');
  });
});

describe('groupNote', () => {
  const stamp = (year: number, month: number) => new Date(year, month - 1, 10).getTime();

  test('у папки — путь, у дат — ничего', () => {
    expect(groupNote('folder', {key: `D:${BS}Фото`, newest: 1, oldest: 1})).toBe(`D:${BS}Фото`);
    expect(groupNote('month', {key: '2026-09', newest: stamp(2026, 9), oldest: stamp(2026, 9)})).toBe('');
  });

  test('промежуток времени у альбома', () => {
    expect(groupNote('album', {key: '1', newest: stamp(2024, 9), oldest: stamp(2021, 3)}))
      .toBe('март 2021 — сентябрь 2024');
    expect(groupNote('person', {key: 'A', newest: stamp(2024, 9), oldest: stamp(2024, 9)})).toBe('сентябрь 2024');
    expect(groupNote('person', {key: 'A', newest: null, oldest: null})).toBe('');
  });
});
