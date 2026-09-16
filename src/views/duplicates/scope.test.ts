import {describe, expect, it} from 'vitest';
import type {DuplicateGroup, DuplicatePhoto} from '../../services/endpoints/jobs';
import {doomedPaths, gainOf} from './scope';

const photo = (path: string, size: number) => ({path, size} as DuplicatePhoto);

/** Группа: keep — первый путь, как её собирает сервер. */
const group = (part: Partial<DuplicateGroup> = {}): DuplicateGroup => ({
  key: 'g', kind: 'exact',
  keep: 'D:\album\one.jpg',
  paths: ['D:\album\one.jpg', 'D:\dump\one.jpg', 'D:\other\one.jpg'],
  count: 3, extra: 300,
  photos: [photo('D:\album\one.jpg', 400), photo('D:\dump\one.jpg', 150), photo('D:\other\one.jpg', 150)],
  ...part,
});

describe('без фильтра по папке', () => {
  it('удаляет всё, кроме оставляемого', () => {
    expect(doomedPaths(group(), 'D:\album\one.jpg', ''))
      .toEqual(['D:\dump\one.jpg', 'D:\other\one.jpg']);
  });

  it('пересчитывает вес, когда оставляют не совет сервера', () => {
    expect(gainOf(group(), 'D:\album\one.jpg', '')).toBe(300);
    // Оставили файл полегче — освободится больше на разницу размеров.
    expect(gainOf(group(), 'D:\dump\one.jpg', '')).toBe(300 + 400 - 150);
  });
});

describe('когда список сужен до папки', () => {
  const scoped = group({folder_paths: ['D:\dump\one.jpg'], folder_extra: 150});

  it('трогает только копии этой папки', () => {
    expect(doomedPaths(scoped, 'D:\album\one.jpg', 'D:\dump')).toEqual(['D:\dump\one.jpg']);
  });

  it('считает вес по ним же, а не по всей группе', () => {
    expect(gainOf(scoped, 'D:\album\one.jpg', 'D:\dump')).toBe(150);
  });

  it('не удаляет копию, которую в этой папке решили оставить', () => {
    const both = group({
      folder_paths: ['D:\dump\one.jpg', 'D:\dump\two.jpg'], folder_extra: 300,
      photos: [...group().photos, photo('D:\dump\two.jpg', 150)],
    });
    expect(doomedPaths(both, 'D:\dump\two.jpg', 'D:\dump')).toEqual(['D:\dump\one.jpg']);
    expect(gainOf(both, 'D:\dump\two.jpg', 'D:\dump')).toBe(150);
  });

  it('на старом бэкенде без folder_paths не удаляет ничего', () => {
    expect(doomedPaths(group(), 'D:\album\one.jpg', 'D:\dump')).toEqual([]);
    expect(gainOf(group(), 'D:\album\one.jpg', 'D:\dump')).toBe(0);
  });
});
