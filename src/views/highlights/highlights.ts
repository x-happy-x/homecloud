import type {Highlight, HighlightReasons} from '../../services/endpoints/highlights';

export const KIND_LABELS: Record<string, string> = {
  month: 'Месяц',
  year: 'Год',
  event: 'Событие',
  'on-this-day': 'В этот день',
};

export const KIND_FILTERS: Array<[string, string]> = [
  ['', 'Все'],
  ['on-this-day', 'В этот день'],
  ['event', 'События'],
  ['month', 'Месяцы'],
  ['year', 'Годы'],
];

/**
 * Порядок показа: «в этот день» наверху (она про сегодня), дальше свежие
 * периоды. Сервер отдаёт по началу периода, но «в этот день» у него — годы
 * назад, и без подъёма она терялась бы в конце списка.
 */
export function sortHighlights(groups: Highlight[]): Highlight[] {
  const rank = (group: Highlight) => (group.kind === 'on-this-day' ? 0 : 1);
  return [...groups].sort((a, b) =>
    rank(a) - rank(b)
    || (b.period_start ?? '').localeCompare(a.period_start ?? '')
    || b.score - a.score);
}

/**
 * Главная подборка на общем виде: «в этот день», если есть, иначе самое
 * свежее событие — оно живее месяца или года. Список уже отсортирован.
 */
export function featuredHighlight(groups: Highlight[]): Highlight | null {
  return groups.find(group => group.kind === 'on-this-day')
    ?? groups.find(group => group.kind === 'event')
    ?? groups[0]
    ?? null;
}

export interface HighlightSection {
  kind: string;
  title: string;
  groups: Highlight[];
}

const SECTION_ORDER: Array<[string, string]> = [
  ['on-this-day', 'Ещё в этот день'],
  ['event', 'События'],
  ['month', 'Месяцы'],
  ['year', 'Годы'],
];

/** Ленты общего вида: по одной на вид подборки, пустые не показываются. */
export function highlightSections(groups: Highlight[]): HighlightSection[] {
  const known = new Set(SECTION_ORDER.map(([kind]) => kind));
  const sections = SECTION_ORDER.map(([kind, title]) => ({
    kind, title, groups: groups.filter(group => group.kind === kind),
  }));
  const other = groups.filter(group => !known.has(group.kind));
  if (other.length) sections.push({kind: '', title: 'Другие', groups: other});
  return sections.filter(section => section.groups.length > 0);
}

/**
 * Крупная плитка в мозаике открытой подборки: первая и дальше каждая седьмая.
 * В короткой подборке крупных нет — там и так всё видно.
 */
export function isFeatureTile(index: number, total: number): boolean {
  return total >= 5 && index % 7 === 0;
}

const TIME_SOURCES: Record<string, string> = {
  exif: 'время из EXIF',
  'exif-datetime': 'время из EXIF (правка)',
  filename: 'время из имени файла',
  'epoch-name': 'метка времени в имени',
  'filename-date': 'дата из имени файла',
  mtime: 'время изменения файла',
};

const share = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(value * 100)}`;

/** Короткое объяснение выбора для подсказки над снимком. */
export function explainReasons(reasons: HighlightReasons): string {
  const lines = [
    `Оценка ${share(reasons.base)}: вид ${share(reasons.visual)}, техника ${share(reasons.technical)}`,
  ];
  if (reasons.personal > 0.05) lines.push(`Люди в кадре: ${share(reasons.personal)}`);
  if (reasons.series > 0) lines.push(`Лучший из ${reasons.series + 1} похожих кадров`);
  if (reasons.redundancy > 0.05) lines.push(`Похожесть на уже взятые: ${share(reasons.redundancy)}`);
  lines.push(`Выбран ${reasons.pick}-м · ${TIME_SOURCES[reasons.time_source] ?? reasons.time_source}`);
  return lines.join('\n');
}
