import {describe, expect, test} from 'vitest';
import {emptyRoute} from '../../app/routes';
import type {GalleryFilters} from '../../store/slices/gallery';
import type {PhotoFace} from '../../types/api';
import {
  bigfamPersonUrl, dropFilter, facesByPerson, folderCrumbs, galleryContext, galleryParams,
  groupTitle, speakerIndex,
} from './gallery';

const filters = (part: Partial<GalleryFilters>): GalleryFilters => {
  const {view: _view, photo: _photo, group: _group, ...rest} = emptyRoute();
  return {...rest, ...part};
};

// Обратная косая из кода символа, как в routes.test: её легко потерять при правке.
const BS = String.fromCharCode(92);

describe('galleryParams', () => {
  test('пустые фильтры не попадают в запрос', () => {
    expect(galleryParams(filters({}), '  ')).toEqual({
      q: undefined, person: [], type: undefined, kind: undefined, blurry: false, adult: false,
      folder: undefined, folderDeep: true, folderExclude: undefined, album: undefined, hidden: false,
    });
  });
  test('поиск берётся без пробелов по краям', () => {
    expect(galleryParams(filters({album: 4}), ' море ')).toMatchObject({q: 'море', album: 4});
  });
});

describe('galleryContext и dropFilter', () => {
  const albums = [{id: 4, parent_id: 0, title: 'Лето', depth: 1, trail: 'Отпуск / Лето', photos: 1, total: 1, cover: ''}];
  const current = filters({
    people: ['Хамис', 'Анна'], folder: `D:${BS}Фото${BS}2019`, folderExclude: `D:${BS}Фото${BS}skip`, album: 4, contentType: 'screenshot',
    hidden: true, kind: 'video', showBlurry: true, showAdult: true,
  });

  test('каждый фильтр — отдельный чип с понятной подписью', () => {
    expect(galleryContext(current, albums).map(chip => chip.label)).toEqual([
      'Хамис', 'Анна', 'Папка: 2019', 'Кроме папки: skip', 'Альбом: Отпуск / Лето', 'Скриншоты', 'Скрытый альбом',
      'Видео', 'Размытые', '18+',
    ]);
  });

  test('неизвестный альбом показывается номером', () => {
    expect(galleryContext(filters({album: 9})).map(chip => chip.label)).toEqual(['Альбом: 9']);
  });

  test('снятие чипа убирает ровно свой фильтр', () => {
    const [first, , folder] = galleryContext(current, albums);
    expect(dropFilter(current, first.drop)).toEqual({people: ['Анна'], bigfamId: ''});
    expect(dropFilter(current, folder.drop)).toEqual({folder: ''});
  });
});

describe('folderCrumbs', () => {
  test('Windows: корень диска с разделителем, ниже — без двойных', () => {
    expect(folderCrumbs(`D:${BS}Фото${BS}2019`)).toEqual([
      {name: 'D:', path: `D:${BS}`},
      {name: 'Фото', path: `D:${BS}Фото`},
      {name: '2019', path: `D:${BS}Фото${BS}2019`},
    ]);
  });
  test('POSIX: от корня', () => {
    expect(folderCrumbs('/home/photos')).toEqual([
      {name: 'home', path: '/home'},
      {name: 'photos', path: '/home/photos'},
    ]);
  });
  test('пустой путь — без крошек', () => {
    expect(folderCrumbs('')).toEqual([]);
  });
  test('ключ сетевого источника: первая крошка — источник', () => {
    expect(folderCrumbs('netcraze:/HDD/photo', 'Netcraze')).toEqual([
      {name: 'Netcraze', path: 'netcraze:/'},
      {name: 'HDD', path: 'netcraze:/HDD'},
      {name: 'photo', path: 'netcraze:/HDD/photo'},
    ]);
  });
  test('ключ диска устройства: источник вместе с диском', () => {
    expect(folderCrumbs(`pc-x:D:${BS}Фото`, 'PC-X')).toEqual([
      {name: 'PC-X · D:', path: `pc-x:D:${BS}`},
      {name: 'Фото', path: `pc-x:D:${BS}Фото`},
    ]);
  });
});

describe('facesByPerson', () => {
  const face = (part: Partial<PhotoFace>): PhotoFace =>
    ({id: 1, thumbnail: '', frame_time: null, name: null, bigfam_id: null, group: '', ...part});

  test('появления одного человека — один кружок, по времени', () => {
    const people = facesByPerson({
      faces: [
        face({id: 1, group: 'person:7', name: 'Хамис', frame_time: 30}),
        face({id: 2, group: 'auto:3', frame_time: 5}),
        face({id: 3, group: 'person:7', name: 'Хамис', frame_time: 12}),
      ],
      people: [],
    });
    expect(people.map(person => person.key)).toEqual(['person:7', 'auto:3']);
    expect(people[0].members.map(member => member.id)).toEqual([3, 1]);
  });

  test('без лиц — хотя бы названные люди', () => {
    expect(facesByPerson({faces: [], people: [{name: 'Анна', bigfam_id: 'b1'}]}))
      .toEqual([{key: 'named:Анна', name: 'Анна', bigfam_id: 'b1', members: [expect.objectContaining({name: 'Анна'})]}]);
  });
});

test('groupTitle: автогруппы нумеруются с единицы', () => {
  expect(groupTitle('auto:5')).toBe('Группа 6');
  expect(groupTitle('noise:12')).toBe('Без имени');
});

test('speakerIndex: цифра метки по кругу из шести цветов', () => {
  expect(speakerIndex('SPEAKER_00')).toBe(0);
  expect(speakerIndex('SPEAKER_07')).toBe(1);
  expect(speakerIndex('голос')).toBe(0);
});

test('bigfamPersonUrl: адрес картотеки без хвоста и якоря', () => {
  expect(bigfamPersonUrl('http://h:4173/#/tree', 'p 1')).toBe('http://h:4173/#/person/p%201');
});
