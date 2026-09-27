import type {Highlight, HighlightReasons} from '../../services/endpoints/highlights';

export const KIND_LABELS: Record<string, string> = {
  month: 'Месяц',
  year: 'Год',
  event: 'Событие',
  trip: 'Поездка',
  theme: 'Тема',
  place: 'Место',
  'on-this-day': 'В этот день',
};

export const KIND_FILTERS: Array<[string, string]> = [
  ['', 'Все'],
  ['on-this-day', 'В этот день'],
  ['theme', 'Темы'],
  ['trip', 'Поездки'],
  ['event', 'События'],
  ['place', 'Места'],
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
    ?? groups.find(group => group.kind === 'trip')
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
  ['theme', 'Темы'],
  ['trip', 'Поездки'],
  ['event', 'События'],
  ['place', 'Места'],
  ['month', 'Месяцы'],
  ['year', 'Годы'],
];

/** Подборка темы за один год («Котики · 2023»), а не за всё время. */
const isYearTheme = (group: Highlight) => group.kind === 'theme' && group.key.split(':').length > 2;

/**
 * Темы и места — не по дате, а по величине: сначала темы за всё время,
 * крупные вперёд, потом те же темы по годам.
 */
function sizeOrder(groups: Highlight[]): Highlight[] {
  return [...groups].sort((a, b) =>
    Number(isYearTheme(a)) - Number(isYearTheme(b))
    || b.photo_count - a.photo_count
    || b.score - a.score);
}

/** Ленты общего вида: по одной на вид подборки, пустые не показываются. */
export function highlightSections(groups: Highlight[]): HighlightSection[] {
  const known = new Set(SECTION_ORDER.map(([kind]) => kind));
  const sections = SECTION_ORDER.map(([kind, title]) => {
    const members = groups.filter(group => group.kind === kind);
    return {kind, title, groups: kind === 'theme' || kind === 'place' ? sizeOrder(members) : members};
  });
  const other = groups.filter(group => !known.has(group.kind));
  if (other.length) sections.push({kind: '', title: 'Другие', groups: other});
  return sections.filter(section => section.groups.length > 0);
}

/**
 * Лента на главной: главная подборка, дальше по одной свежей поездке и теме,
 * затем остальное по порядку — чтобы в пяти карточках было разное, а не пять
 * месяцев подряд.
 */
export function stripHighlights(groups: Highlight[], count: number): Highlight[] {
  const featured = featuredHighlight(groups);
  if (!featured) return [];
  const picked: Highlight[] = [featured];
  const add = (group: Highlight | undefined) => {
    if (group && !picked.includes(group)) picked.push(group);
  };
  add(groups.find(group => group.kind === 'trip'));
  add(sizeOrder(groups.filter(group => group.kind === 'theme' && !isYearTheme(group)))[0]);
  add(groups.find(group => group.kind === 'event'));
  for (const group of groups) {
    if (picked.length >= count) break;
    if (!isYearTheme(group)) add(group);
  }
  return picked.slice(0, count);
}

/** Подпись над названием карточки: у поездки и места — страна, у темы — «Тема». */
export function cardLabel(group: Highlight): string {
  if (group.kind === 'on-this-day' || group.kind === 'trip' || group.kind === 'place') {
    return group.subtitle || KIND_LABELS[group.kind] || '';
  }
  return KIND_LABELS[group.kind] ?? group.subtitle;
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
