import {describe, expect, test} from 'vitest';
import {dayKey, shotFacts} from './InfoCards';

describe('сведения о снимке', () => {
  test('день снимка — местная дата ключом группы', () => {
    expect(dayKey(new Date(2025, 6, 14, 23, 50).getTime())).toBe('2025-07-14');
    expect(dayKey(null)).toBe('');
    expect(dayKey('не дата')).toBe('');
  });

  test('параметры съёмки берутся по ключам EXIF', () => {
    const facts = shotFacts([
      {id: 'shot', title: 'Съёмка', items: [
        {key: 'FNumber', label: 'Диафрагма', value: 'f/1.8'},
        {key: 'PhotographicSensitivity', label: 'ISO', value: '64'},
        {key: 'FocalLength', label: 'Фокусное', value: '6,9 мм'},
        {key: 'FocalLengthIn35mmFilm', label: '35 мм', value: '26 мм'},
      ]},
    ]);
    expect(facts.map(fact => fact.value)).toEqual(['f/1.8', '64', '26 мм']);
    expect(shotFacts(undefined)).toEqual([]);
  });
});
