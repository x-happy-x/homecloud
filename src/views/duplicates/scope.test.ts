import {describe, expect, it} from 'vitest';
import type {DuplicateGroup, DuplicatePhoto} from '../../services/endpoints/jobs';
import {doomedPaths, gainOf, keeperOf} from './scope';

const photo = (path: string, size: number) => ({path, size} as DuplicatePhoto);

/** Группа: keep — первый путь, как её собирает сервер. */
const group = (part: Partial<DuplicateGroup> = {}): DuplicateGroup => ({
  key: 'g', kind: 'exact',
  keep: 'D:/album/one.jpg',
  paths: ['D:/album/one.jpg', 'D:/dump/one.jpg', 'D:/other/one.jpg'],
  count: 3, extra: 300,
  photos: [photo('D:/album/one.jpg', 400), photo('D:/dump/one.jpg', 150), photo('D:/other/one.jpg', 150)],
  ...part,
});

describe('без фильтра по папке', () => {
  it('удаляет всё, кроме оставляемого', () => {
    expect(doomedPaths(group(), 'D:/album/one.jpg', ''))
      .toEqual(['D:/dump/one.jpg', 'D:/other/one.jpg']);
  });

  it('пересчитывает вес, когда оставляют не совет сервера', () => {
    expect(gainOf(group(), 'D:/album/one.jpg', '')).toBe(300);
    // Оставили файл полегче — освободится больше на разницу размеров.
    expect(gainOf(group(), 'D:/dump/one.jpg', '')).toBe(300 + 400 - 150);
  });
});

describe('при выборе папки', () => {
  it('сохраняет копию в папке, игнорируя прежний выбор снаружи', () => {
    const value = group();
    const keep = keeperOf(value, value.keep, 'D:/dump');
    expect(keep).toBe(value.paths[1]);
    expect(doomedPaths(value, keep, 'D:/dump')).toEqual([value.paths[0], value.paths[2]]);
    expect(gainOf(value, keep, 'D:/dump')).toBe(550);
  });

  it('не удаляет группу без копии в выбранной папке', () => {
    const keep = keeperOf(group(), undefined, 'D:/missing');
    expect(doomedPaths(group(), keep, 'D:/missing')).toEqual([]);
  });

  it('сохраняет ручной выбор внутри папки', () => {
    const value = group({paths: ['D:/dump/a.jpg', 'D:/dump/b.jpg', 'D:/other/c.jpg'], keep: 'D:/dump/a.jpg'});
    const keep = keeperOf(value, 'D:/dump/b.jpg', 'D:/dump');
    expect(doomedPaths(value, keep, 'D:/dump')).toEqual(['D:/dump/a.jpg', 'D:/other/c.jpg']);
  });
});
