import {describe, expect, test} from 'vitest';
import {labelStep, scrubberYears} from './YearScrubber';

describe('шкала лет', () => {
  test('год — по первой его группе, в порядке галереи', () => {
    const groups = [{key: '2026-09'}, {key: '2026-08'}, {key: '2024-12'}, {key: '~none'}, {key: '2019-01'}];
    expect(scrubberYears(groups)).toEqual([
      {year: '2026', key: '2026-09'},
      {year: '2024', key: '2024-12'},
      {year: '2019', key: '2019-01'},
    ]);
  });

  test('дни и годы тоже дают год', () => {
    expect(scrubberYears([{key: '2020-05-17'}, {key: '2018'}]).map(item => item.year)).toEqual(['2020', '2018']);
  });

  test('подписей не больше четырнадцати', () => {
    expect(labelStep(10)).toBe(1);
    expect(labelStep(14)).toBe(1);
    expect(labelStep(24)).toBe(2);
    expect(labelStep(40)).toBe(3);
  });
});
