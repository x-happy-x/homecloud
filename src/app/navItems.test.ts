import {describe, expect, test} from 'vitest';
import {activeNav, CATALOG_NAV, HIDDEN_NAV, NAV_ENTRIES, PRIMARY_NAV} from './navItems';
import {ANALYSIS_VIEWS, VIEWS} from './routes';

const plain = {kind: '', hidden: false};

describe('пункты навигации', () => {
  test('сверху то, что смотрят, ниже — каталог; скрытых в списке нет', () => {
    expect(PRIMARY_NAV.map(entry => entry.label)).toEqual(['Фотографии', 'Воспоминания', 'Люди', 'Видео']);
    expect(CATALOG_NAV.map(entry => entry.label)).toEqual(['Анализ', 'Настройки']);
    expect([...PRIMARY_NAV, ...CATALOG_NAV]).not.toContain(HIDDEN_NAV);
  });

  test('у каждого экрана есть подсвеченный пункт', () => {
    for (const view of VIEWS) {
      expect(NAV_ENTRIES.map(entry => entry.id)).toContain(activeNav(view, plain));
    }
    for (const view of ANALYSIS_VIEWS) expect(activeNav(view, plain)).toBe('analysis');
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
