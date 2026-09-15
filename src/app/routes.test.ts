import {describe, expect, test} from 'vitest';
import {buildHash, emptyRoute, parseHash, type RouteState} from './routes';

const route = (part: Partial<RouteState>): RouteState => ({...emptyRoute(), ...part});

// Пути Windows: обратная косая собрана из кода символа, чтобы её нельзя было
// случайно потерять при правке файла.
const BS = String.fromCharCode(92);
const winRoot = `D:${BS}`;
const winFolder = `D:${BS}Фото${BS}2019`;
const winPhoto = `${winFolder}${BS}IMG_1.jpg`;

describe('buildHash', () => {
  test('пустой маршрут — только экран', () => {
    expect(buildHash(route({view: 'people'}))).toBe('#/people');
  });

  test('фильтры галереи попадают в ссылку только на экране фотографий', () => {
    const filters = {people: ['Хамис'], contentType: 'portrait', album: 4, hidden: true};
    expect(buildHash(route({view: 'photos', ...filters})))
      .toBe('#/photos?person=%D0%A5%D0%B0%D0%BC%D0%B8%D1%81&type=portrait&album=4&hidden=1');
    // На «Настройках» те же поля в ссылку не уезжают.
    expect(buildHash(route({view: 'settings', ...filters}))).toBe('#/settings');
  });

  test('группа — только там, где карточку человека можно открыть', () => {
    expect(buildHash(route({view: 'people', group: 'person:7'}))).toBe('#/people?group=person%3A7');
    expect(buildHash(route({view: 'review', group: 'person:7'}))).toBe('#/review?group=person%3A7');
    expect(buildHash(route({view: 'scan', group: 'person:7'}))).toBe('#/scan');
  });

  test('поиск — только на людях и фотографиях', () => {
    expect(buildHash(route({view: 'people', query: 'зайнаб'}))).toContain('q=');
    expect(buildHash(route({view: 'duplicates', query: 'зайнаб'}))).toBe('#/duplicates');
  });

  test('folder_deep пишется только когда выключен', () => {
    expect(buildHash(route({view: 'photos', folder: winRoot, folderDeep: true})))
      .toBe('#/photos?folder=D%3A%5C');
    expect(buildHash(route({view: 'photos', folder: winRoot, folderDeep: false})))
      .toBe('#/photos?folder=D%3A%5C&folder_deep=0');
  });
});

describe('parseHash', () => {
  test('неизвестный экран — люди', () => {
    expect(parseHash('#/nonsense').view).toBe('people');
    expect(parseHash('').view).toBe('people');
    expect(parseHash('#').view).toBe('people');
  });

  test('несколько людей', () => {
    expect(parseHash('#/photos?person=A&person=B').people).toEqual(['A', 'B']);
  });

  test('folderDeep по умолчанию включён', () => {
    expect(parseHash('#/photos?folder=D%3A%5C').folderDeep).toBe(true);
    expect(parseHash('#/photos?folder=D%3A%5C&folder_deep=0').folderDeep).toBe(false);
  });
});

describe('разбор и сборка обратимы', () => {
  const cases: RouteState[] = [
    route({view: 'people'}),
    route({view: 'people', query: 'зайнаб', group: 'auto:12'}),
    route({
      view: 'photos', people: ['Хамис', 'Пётр'], contentType: 'portrait', kind: 'video',
      showBlurry: true, showAdult: true, folder: winFolder, folderDeep: false,
      album: 12, hidden: true, photo: winPhoto, query: 'море',
    }),
    route({view: 'duplicates'}),
  ];
  test.each(cases.map(c => [buildHash(c), c] as const))('%s', (hash, original) => {
    expect(buildHash(parseHash(hash))).toBe(hash);
  });
});
