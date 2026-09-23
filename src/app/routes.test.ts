import {describe, expect, test} from 'vitest';
import {buildHash, emptyRoute, historyMode, parseHash, type RouteState} from './routes';

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

  test('исключённая папка пишется в ссылку', () => {
    expect(buildHash(route({view: 'photos', folderExclude: winFolder})))
      .toBe('#/photos?exclude_folder=D%3A%5C%D0%A4%D0%BE%D1%82%D0%BE%5C2019');
  });
});

describe('настройки', () => {
  test('раздел — в ссылке и только на экране настроек', () => {
    expect(buildHash(route({view: 'settings', section: 'cores'}))).toBe('#/settings?s=cores');
    expect(buildHash(route({view: 'scan', section: 'cores'}))).toBe('#/scan');
    expect(parseHash('#/settings?s=sources').section).toBe('sources');
  });
});

describe('подборки', () => {
  test('открытая подборка — в ссылке и только на своём экране', () => {
    expect(buildHash(route({view: 'highlights', highlight: 'month:2019-12'})))
      .toBe('#/highlights?h=month%3A2019-12');
    expect(buildHash(route({view: 'photos', highlight: 'month:2019-12'}))).toBe('#/photos');
    expect(parseHash('#/highlights?h=event%3A20191218-121931').highlight).toBe('event:20191218-121931');
  });

  test('открыть подборку — шаг истории, закрыть — нет', () => {
    const list = route({view: 'highlights'});
    const open = route({view: 'highlights', highlight: 'year:2019'});
    expect(historyMode(open, list)).toBe('push');
    expect(historyMode(list, open)).toBe('replace');
  });
});

describe('parseHash', () => {
  test('неизвестный экран — фотографии', () => {
    expect(parseHash('#/nonsense').view).toBe('photos');
    expect(parseHash('').view).toBe('photos');
    expect(parseHash('#').view).toBe('photos');
  });

  test('несколько людей', () => {
    expect(parseHash('#/photos?person=A&person=B').people).toEqual(['A', 'B']);
  });

  test('точная ссылка из BiGFaM сохраняет id человека и снимок', () => {
    const hash = '#/photos?bigfam_id=p-17&photo=D%3A%5Cphoto.jpg';
    const parsed = parseHash(hash);
    expect(parsed.bigfamId).toBe('p-17');
    expect(parsed.photo).toBe(`D:${BS}photo.jpg`);
    expect(buildHash(parsed)).toBe(hash);
  });

  test('folderDeep по умолчанию включён', () => {
    expect(parseHash('#/photos?folder=D%3A%5C').folderDeep).toBe(true);
    expect(parseHash('#/photos?folder=D%3A%5C&folder_deep=0').folderDeep).toBe(false);
  });

  test('exclude_folder разбирается', () => {
    expect(parseHash('#/photos?exclude_folder=D%3A%5Cskip').folderExclude).toBe(`D:${BS}skip`);
  });
});

describe('разбор и сборка обратимы', () => {
  const cases: RouteState[] = [
    route({view: 'people'}),
    route({view: 'people', query: 'зайнаб', group: 'auto:12'}),
    route({
      view: 'photos', people: ['Хамис', 'Пётр'], contentType: 'portrait', kind: 'video',
      showBlurry: true, showAdult: true, folder: winFolder, folderDeep: false,
      folderExclude: `D:${BS}skip`, album: 12, hidden: true, photo: winPhoto, query: 'море',
    }),
    route({view: 'duplicates'}),
  ];
  test.each(cases.map(c => [buildHash(c), c] as const))('%s', (hash, original) => {
    expect(buildHash(parseHash(hash))).toBe(hash);
  });
});

describe('historyMode', () => {
  test('смена экрана — шаг истории', () => {
    expect(historyMode(route({view: 'photos'}), route({view: 'people'}))).toBe('push');
  });
  test('открытие снимка или группы — шаг истории', () => {
    expect(historyMode(route({view: 'photos', photo: 'a'}), route({view: 'photos'}))).toBe('push');
    expect(historyMode(route({group: 'auto:1'}), route({}))).toBe('push');
  });
  test('листание, закрытие и фильтры — без шага', () => {
    expect(historyMode(route({view: 'photos', photo: 'b'}), route({view: 'photos', photo: 'a'}))).toBe('replace');
    expect(historyMode(route({view: 'photos'}), route({view: 'photos', photo: 'a'}))).toBe('replace');
    expect(historyMode(route({query: 'море'}), route({}))).toBe('replace');
  });
});
