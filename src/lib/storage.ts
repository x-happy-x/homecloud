/**
 * Обёртка над localStorage: в приватном окне или при запрете на данные сайта
 * обращение бросает, и из-за этого раньше падал весь разбор настроек.
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Настройка не сохранится до перезагрузки — это не повод ронять интерфейс.
  }
}

export function readLocalJson<T>(key: string, fallback: T): T {
  const raw = readLocal(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const writeLocalJson = (key: string, value: unknown): void =>
  writeLocal(key, JSON.stringify(value));

/** Ключи, которые уже лежат в браузерах пользователей — менять нельзя. */
export const KEYS = {
  taskHistory: 'homecloud-task-history',
  sidepageTab: 'homecloud-sidepage-tab',
  analysisTab: 'homecloud-analysis-tab',
  adultMode: 'homecloud-adult-mode',
  zoom: 'homecloud-zoom',
  etaProfiles: 'homecloud-eta-profiles',
  theme: 'theme',
} as const;
