import {describe, expect, it} from 'vitest';
import {
  appendLines, changedKeys, isDefault, isVisible, removeLine, sameValue, searchSections, splitLines,
} from './settingsModel';
import {SETTINGS_SECTIONS, type SettingField} from './settingsSchema';

describe('списки путей', () => {
  it('раскладывает строку на пункты без пустых строк и пробелов', () => {
    expect(splitLines('  D:\\a \n\n D:\\b\n')).toEqual(['D:\\a', 'D:\\b']);
    expect(splitLines(undefined)).toEqual([]);
  });

  it('добавляет вставленный кусок по строкам и пропускает повторы без учёта регистра', () => {
    expect(appendLines('D:\\Games', 'd:\\games\nD:\\Trash\nD:\\Trash')).toBe('D:\\Games\nD:\\Trash');
  });

  it('убирает пункт по номеру', () => {
    expect(removeLine('a\nb\nc', 1)).toBe('a\nc');
  });
});

describe('изменения', () => {
  it('числа сравниваются как числа, списки — без хвостовых пустых строк', () => {
    expect(sameValue(0.6, '0.60')).toBe(true);
    expect(sameValue('a\nb\n', 'a\nb')).toBe(true);
    expect(sameValue(true, false)).toBe(false);
  });

  it('до загрузки с сервера изменений нет', () => {
    expect(changedKeys({min_side: 10}, undefined)).toEqual([]);
    expect(changedKeys({min_side: 10, max_ratio: 0}, {min_side: 0, max_ratio: 0})).toEqual(['min_side']);
  });
});

describe('строки формы', () => {
  const lmstudio: SettingField = {
    kind: 'text', key: 'caption_lmstudio_url', label: 'Адрес',
    showIf: {key: 'caption_backend', equals: 'lmstudio'},
  };

  it('зависимая строка видна только при нужном значении', () => {
    expect(isVisible(lmstudio, {caption_backend: 'local'})).toBe(false);
    expect(isVisible(lmstudio, {caption_backend: 'lmstudio'})).toBe(true);
  });

  it('без значения по умолчанию кнопка сброса не нужна', () => {
    expect(isDefault(undefined, 'что угодно')).toBe(true);
    expect(isDefault('x', 'y')).toBe(false);
    expect(isDefault(0, '0')).toBe(true);
  });
});

describe('поиск по настройкам', () => {
  it('находит строку внутри раздела и оставляет только её', () => {
    const found = searchSections(SETTINGS_SECTIONS, 'порог');
    expect(found.map(section => section.id)).toEqual(['faces']);
    expect(found[0].fields.map(field => field.key)).toEqual(['face_suggest_threshold']);
  });

  it('по названию раздела отдаёт его целиком, «е» и «ё» не различает', () => {
    const found = searchSections(SETTINGS_SECTIONS, 'скрытый альбом');
    expect(found).toHaveLength(1);
    expect(found[0].fields).toHaveLength(1);
    expect(searchSections(SETTINGS_SECTIONS, 'тема').some(section => section.id === 'theme')).toBe(true);
  });

  it('ищет и по вариантам выбора', () => {
    expect(searchSections(SETTINGS_SECTIONS, 'lm studio').map(section => section.id)).toContain('caption');
  });

  it('ключи настроек не повторяются, у личных есть значение по умолчанию', () => {
    const keys = SETTINGS_SECTIONS.flatMap(section => section.fields.map(field => field.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const section of SETTINGS_SECTIONS.filter(item => item.browser)) {
      for (const field of section.fields) expect(field.default, field.key).not.toBeUndefined();
    }
  });
});
