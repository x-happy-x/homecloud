import {describe, expect, test} from 'vitest';
import {activeNav, CATALOG_NAV, NAV_ENTRIES, PRIMARY_NAV} from './navItems';
import {VIEWS} from './routes';

const plain = {kind: '', hidden: false};

describe('пункты навигации', () => {
  test('сверху то, что смотрят, ниже — каталог', () => {
    expect(PRIMARY_NAV.map(entry => entry.label)).toEqual(['Фотографии', 'Воспоминания', 'Люди', 'Видео']);
    expect(CATALOG_NAV.map(entry => entry.label))
      .toEqual(['Проверка', 'Сканирование', 'Дубликаты', 'Обучение', 'Скрытые', 'Настройки']);
  });

  test('у каждого экрана есть пункт', () => {
    for (const view of VIEWS) {
      expect(NAV_ENTRIES.some(entry => entry.view === view)).toBe(true);
      expect(activeNav(view, plain)).toBe(NAV_ENTRIES.find(entry => entry.view === view)?.id);
    }
  });

  test('галерея подсвечивает пункт по отбору', () => {
    expect(activeNav('photos', plain)).toBe('photos');
    expect(activeNav('photos', {kind: 'video', hidden: false})).toBe('video');
    expect(activeNav('photos', {kind: 'video', hidden: true})).toBe('hidden');
  });

  test('«Фотографии» снимают отбор видео и скрытых', () => {
    expect(PRIMARY_NAV[0].filters).toEqual({kind: '', hidden: false});
  });
});
