import {describe, expect, test} from 'vitest';
import {
  elapsedText, fileSize, initials, lifeYears, megabytes, percent, plural,
  roughDuration, shortName, timecode, yearOf,
} from './format';

describe('plural', () => {
  const files = (n: number) => plural(n, 'файл', 'файла', 'файлов');
  test.each([
    [1, 'файл'], [2, 'файла'], [4, 'файла'], [5, 'файлов'], [0, 'файлов'],
    [11, 'файлов'], [12, 'файлов'], [14, 'файлов'], [21, 'файл'], [22, 'файла'],
    [25, 'файлов'], [101, 'файл'], [111, 'файлов'], [112, 'файлов'],
  ])('%i → %s', (n, want) => expect(files(n)).toBe(want));
});

describe('shortName', () => {
  test('фамилия имя отчество → имя с инициалами', () => {
    expect(shortName('Магомедшарипова Хамис Магомедовна')).toBe('Хамис М.М.');
  });
  test('только фамилия и имя', () => {
    expect(shortName('Иванов Пётр')).toBe('Пётр И.');
  });
  test('одно слово остаётся как есть', () => {
    expect(shortName('Зайнаб')).toBe('Зайнаб');
  });
  test('пусто → «Без имени»', () => {
    expect(shortName('')).toBe('Без имени');
    expect(shortName(null)).toBe('Без имени');
  });
  test('данные картотеки важнее разбора строки', () => {
    expect(shortName('Кто-то Другой', {first: 'Хамис', last: 'Магомедшарипова', middle: 'Магомедовна'}))
      .toBe('Хамис М.М.');
  });
});

test('initials', () => {
  expect(initials('Магомедшарипова', 'Магомедовна')).toBe('М.М.');
  expect(initials('Иванов', null, undefined)).toBe('И.');
  expect(initials()).toBe('');
});

describe('fileSize подбирает единицу', () => {
  test.each([
    [0, '0 Б'], [900, '900 Б'], [1024, '1 КБ'], [86016, '84 КБ'],
    [1048576, '1.0 МБ'], [5347737, '5.1 МБ'], [1288490188, '1.2 ГБ'],
  ])('%i → %s', (bytes, want) => expect(fileSize(bytes)).toBe(want));
});

test('megabytes всегда в МБ', () => {
  expect(megabytes(86016)).toBe('0.1 МБ');
  expect(megabytes(5347737)).toBe('5.1 МБ');
  expect(megabytes(null)).toBe('0.0 МБ');
});

describe('длительности', () => {
  test('elapsedText — точно', () => {
    expect(elapsedText(0.4)).toBe('<1 с');
    expect(elapsedText(42)).toBe('42 с');
    expect(elapsedText(192)).toBe('3 мин 12 с');
    expect(elapsedText(180)).toBe('3 мин');
    expect(elapsedText(null)).toBe('');
    expect(elapsedText(-1)).toBe('');
  });
  test('roughDuration — грубо', () => {
    expect(roughDuration(0.4)).toBe('1 сек');
    expect(roughDuration(42)).toBe('42 сек');
    expect(roughDuration(192)).toBe('3 мин');
    expect(roughDuration(9600)).toBe('2 ч 40 мин');
    expect(roughDuration(7200)).toBe('2 ч');
    expect(roughDuration(null)).toBe('');
  });
  test('timecode — метка в ролике', () => {
    expect(timecode(247)).toBe('4:07');
    expect(timecode(3753)).toBe('1:02:33');
    expect(timecode(0)).toBe('0:00');
    expect(timecode(-5)).toBe('0:00');
  });
});

test('percent не уходит в минус', () => {
  expect(percent(0.836)).toBe('84%');
  expect(percent(-0.2)).toBe('0%');
  expect(percent(1)).toBe('100%');
});

test('yearOf вытаскивает год из любой даты', () => {
  expect(yearOf('1947-03-02')).toBe('1947');
  expect(yearOf('около 1953 года')).toBe('1953');
  expect(yearOf(null)).toBe('');
});

describe('lifeYears', () => {
  test.each([
    [{birth: '1947-01-01', death: '2019-05-04'}, '1947 — 2019'],
    [{birth: '1947-01-01'}, '1947'],
    [{birth: '1947-01-01', deceased: true}, '1947 — …'],
    [{death: '2019-05-04'}, '† 2019'],
    [{}, ''],
  ])('%o → %s', (kin, want) => expect(lifeYears(kin)).toBe(want));
  test('нет данных — пусто', () => expect(lifeYears(null)).toBe(''));
});
