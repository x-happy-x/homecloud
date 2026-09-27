export const formatNumber = (value: number | string | null | undefined): string =>
  new Intl.NumberFormat('ru-RU').format(Number(value || 0));

/** Русское склонение по числу: plural(2, 'файл', 'файла', 'файлов'). */
export function plural(value: number, one: string, few: string, many: string): string {
  const n = Math.abs(value) % 100;
  if (n > 10 && n < 20) return many;
  const last = n % 10;
  return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

export const percent = (score: number): string => `${Math.max(0, Math.round(score * 100))}%`;

/**
 * Точная длительность для «идёт 3 мин 12 с» — прогресс задачи, которую
 * пользователь смотрит прямо сейчас.
 */
export function elapsedText(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 1) return '<1 с';
  if (seconds < 60) return `${Math.round(seconds)} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`;
}

/**
 * Грубая длительность для прогноза «осталось примерно 2 ч 40 мин»: секунды в
 * таком прогнозе — ложная точность, поэтому округление крупнее, чем у
 * elapsedText.
 */
export function roughDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total} сек`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч${rest ? ` ${rest} мин` : ''}`;
}

/** Метка времени в ролике: «4:07» или «1:02:33». */
export function timecode(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${ss}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${ss}`;
}

/** Обратное к timecode: «1:23», «1:02:03» или просто секунды. Не разобралось — null. */
export function parseTimecode(value: string): number | null {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some(part => part.trim() === '' || !Number.isFinite(Number(part)))) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Размер одного файла с подходящей единицей: обычное фото не должно
 * показываться как «0.1 МБ».
 */
export function fileSize(bytes: number | null | undefined): string {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1048576) return `${Math.round(value / 1024)} КБ`;
  if (value < 1073741824) return `${(value / 1048576).toFixed(1)} МБ`;
  return `${(value / 1073741824).toFixed(1)} ГБ`;
}

/**
 * Всегда мегабайты — в списке дубликатов размеры сравнивают глазами, и
 * разнобой единиц мешает больше, чем лишние нули.
 */
export const megabytes = (value: number | null | undefined): string =>
  `${(Number(value || 0) / 1048576).toFixed(1)} МБ`;

export const yearOf = (value: unknown): string =>
  (String(value ?? '').match(/\d{4}/) || [''])[0];

export const initials = (...parts: Array<string | null | undefined>): string =>
  parts.filter(Boolean)
    .map(part => `${String(part).trim().charAt(0).toLocaleUpperCase('ru')}.`)
    .join('');

/** «Магомедшарипова Хамис Магомедовна» → «Хамис М.М.»: имя целиком, остальное инициалами. */
export function shortName(
  name: string | null | undefined,
  kin?: {first?: string; last?: string; middle?: string} | null,
): string {
  if (kin && kin.first) return `${kin.first} ${initials(kin.last, kin.middle)}`.trim();
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Без имени';
  const [surname, first, middle] = parts;
  return `${first} ${initials(surname, middle)}`.trim();
}

export function lifeYears(
  kin?: {birth?: string; death?: string; deceased?: boolean} | null,
): string {
  if (!kin) return '';
  const birth = yearOf(kin.birth);
  const death = yearOf(kin.death);
  if (birth && death) return `${birth} — ${death}`;
  if (birth) return kin.deceased ? `${birth} — …` : birth;
  return death ? `† ${death}` : '';
}

export const photoDate = (taken: string | number | null | undefined): string => taken
  ? new Date(taken).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})
  : '';

/** Момент прошлого запуска сканирования: «14 сент., 21:07». */
export const runMoment = (value: string | number | Date): string => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU',
    {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
};
