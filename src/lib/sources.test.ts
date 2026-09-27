import {describe, expect, test} from 'vitest';
import {insidePath, sourceOf} from './sources';

describe('ключ снимка', () => {
  test('sourceOf — id источника из ключа, у старого пути без префикса — пусто', () => {
    expect(sourceOf('pc-a:F:\\Desktop\\a.mp4')).toBe('pc-a');
    expect(sourceOf('netcraze:/HDD/a.jpg')).toBe('netcraze');
    // Буква диска — не источник: у источника не меньше двух символов.
    expect(sourceOf('D:\\Фото\\a.jpg')).toBe('');
    expect(sourceOf(undefined)).toBe('');
  });

  test('insidePath — путь внутри источника', () => {
    expect(insidePath('pc-a:F:\\Desktop\\a.mp4')).toBe('F:\\Desktop\\a.mp4');
  });
});
