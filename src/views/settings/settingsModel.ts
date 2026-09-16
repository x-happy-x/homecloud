import type {SettingField, SettingValue, SettingsSection} from './settingsSchema';

export type SettingsValues = Record<string, SettingValue>;

/** Список путей или масок хранится в каталоге одной строкой, по пункту в строке. */
export const splitLines = (value: SettingValue | undefined): string[] =>
  String(value ?? '').split('\n').map(line => line.trim()).filter(Boolean);

/**
 * Добавляет пункты в список. Вставленный кусок из нескольких строк
 * раскладывается на пункты; повтор без учёта регистра не добавляется —
 * пути Windows к регистру безразличны.
 */
export function appendLines(value: SettingValue | undefined, added: string): string {
  const lines = splitLines(value);
  const seen = new Set(lines.map(line => line.toLowerCase()));
  for (const line of splitLines(added)) {
    if (seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    lines.push(line);
  }
  return lines.join('\n');
}

export const removeLine = (value: SettingValue | undefined, index: number): string =>
  splitLines(value).filter((_, position) => position !== index).join('\n');

/** Числа сравниваются как числа: 0.6 из черновика и «0.60» из ответа — одно и то же. */
export function sameValue(a: SettingValue | undefined, b: SettingValue | undefined): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'string' || typeof b === 'string') {
    // Для списков неважны пустые строки и пробелы по краям.
    return splitLines(a).join('\n') === splitLines(b).join('\n');
  }
  return a === b;
}

export const changedKeys = (draft: SettingsValues, saved: SettingsValues | undefined): string[] =>
  saved ? Object.keys(draft).filter(key => !sameValue(draft[key], saved[key])) : [];

export const isVisible = (field: SettingField, values: SettingsValues): boolean =>
  !field.showIf || values[field.showIf.key] === field.showIf.equals;

/** Без известного значения по умолчанию сбрасывать не к чему — считаем, что оно и стоит. */
export const isDefault = (fallback: SettingValue | undefined, value: SettingValue | undefined): boolean =>
  fallback === undefined || sameValue(fallback, value);

const normalize = (text: string) => text.toLowerCase().replaceAll('ё', 'е');

const fieldText = (field: SettingField) => [
  field.label, field.hint ?? '',
  ...(field.kind === 'choice' ? field.options.flatMap(option => [option.label, option.note ?? '']) : []),
].join(' ');

/**
 * Поиск по настройкам: разделы с подходящими строками. Если слово нашлось в
 * заголовке раздела — раздел целиком, иначе только совпавшие строки.
 */
export function searchSections(sections: SettingsSection[], query: string): SettingsSection[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return sections;
  const matches = (text: string) => {
    const haystack = normalize(text);
    return words.every(word => haystack.includes(word));
  };
  return sections.flatMap(section => {
    if (matches(`${section.title} ${section.note}`)) return [section];
    const fields = section.fields.filter(field => matches(fieldText(field)));
    return fields.length ? [{...section, fields}] : [];
  });
}
