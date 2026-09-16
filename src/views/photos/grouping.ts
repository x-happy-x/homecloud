import type {PhotoGroup} from '../../types/api';
import {baseName, TYPE_LABELS} from './gallery';

/** По чему делить галерею. `none` — одна сплошная сетка, как раньше. */
export type GroupBy = 'none' | 'year' | 'month' | 'day' | 'folder' | 'album' | 'person' | 'type' | 'kind';
export type GroupOrder = 'new' | 'old' | 'name' | 'count';

export interface Grouping {
  by: GroupBy;
  order: GroupOrder;
}

/** Свёрнутость групп одного вида: общее правило и группы-исключения из него. */
export interface CollapseRule {
  collapsed: boolean;
  except: string[];
}

export const GROUP_NONE = '~none';

export const GROUP_OPTIONS: Array<{by: GroupBy; label: string; short: string}> = [
  {by: 'none', label: 'Без группировки', short: 'Без групп'},
  {by: 'day', label: 'По дням', short: 'Дни'},
  {by: 'month', label: 'По месяцам', short: 'Месяцы'},
  {by: 'year', label: 'По годам', short: 'Годы'},
  {by: 'folder', label: 'По папкам', short: 'Папки'},
  {by: 'album', label: 'По альбомам', short: 'Альбомы'},
  {by: 'person', label: 'По людям', short: 'Люди'},
  {by: 'type', label: 'По содержимому', short: 'Содержимое'},
  {by: 'kind', label: 'Фото и видео', short: 'Фото и видео'},
];

export const ORDER_OPTIONS: Array<{order: GroupOrder; label: string}> = [
  {order: 'new', label: 'Сначала новые'},
  {order: 'old', label: 'Сначала старые'},
  {order: 'name', label: 'По названию'},
  {order: 'count', label: 'Сначала большие'},
];

export const isDated = (by: GroupBy): boolean => by === 'year' || by === 'month' || by === 'day';

const GROUP_BY_SET = new Set<string>(GROUP_OPTIONS.map(option => option.by));
const ORDER_SET = new Set<string>(ORDER_OPTIONS.map(option => option.order));

/** Порядок, который виду группы подходит сам по себе. */
export const defaultOrder = (by: GroupBy): GroupOrder => (isDated(by) || by === 'none' ? 'new' : 'name');

/** По месяцам, свежие сверху — как в галерее телефона. */
export const DEFAULT_GROUPING: Grouping = {by: 'month', order: 'new'};

/** Сохранённая группировка: в хранилище может лежать что угодно. */
export function parseGrouping(raw: unknown): Grouping {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const by = typeof value.by === 'string' && GROUP_BY_SET.has(value.by) ? value.by as GroupBy : DEFAULT_GROUPING.by;
  const order = typeof value.order === 'string' && ORDER_SET.has(value.order)
    ? value.order as GroupOrder
    : defaultOrder(by);
  // «По названию» у дат — то же, что «сначала новые»; не держим два одинаковых пункта.
  return {by, order: isDated(by) && order === 'name' ? 'new' : order};
}

/**
 * Папок и альбомов бывают тысячи — их удобнее видеть оглавлением и раскрывать
 * нужное. Даты и виды снимков листают подряд, поэтому они раскрыты.
 */
export const collapsedByDefault = (by: GroupBy): boolean =>
  by === 'folder' || by === 'album' || by === 'person';

export function isCollapsed(rules: Record<string, CollapseRule>, by: GroupBy, key: string): boolean {
  const rule = rules[by] ?? {collapsed: collapsedByDefault(by), except: []};
  return rule.collapsed !== rule.except.includes(key);
}

export function toggleCollapse(rules: Record<string, CollapseRule>, by: GroupBy, key: string): Record<string, CollapseRule> {
  const rule = rules[by] ?? {collapsed: collapsedByDefault(by), except: []};
  const except = rule.except.includes(key) ? rule.except.filter(item => item !== key) : [...rule.except, key];
  return {...rules, [by]: {collapsed: rule.collapsed, except}};
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь',
  'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября',
  'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const NONE_TITLES: Record<GroupBy, string> = {
  none: '', year: 'Без даты', month: 'Без даты', day: 'Без даты', folder: 'Без папки',
  album: 'Без альбома', person: 'Без людей', type: 'Не разобрано', kind: '',
};

const KIND_TITLES: Record<string, string> = {photo: 'Фотографии', video: 'Видео'};

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Заголовок группы. `now` — чтобы «Сегодня» и год без повторов проверялись в тестах. */
export function groupHeading(by: GroupBy, group: Pick<PhotoGroup, 'key' | 'label'>, now = new Date()): string {
  const {key} = group;
  if (key === GROUP_NONE) return NONE_TITLES[by] || 'Прочее';
  switch (by) {
    case 'year':
      return key;
    case 'month': {
      const [year, month] = key.split('-').map(Number);
      const name = MONTHS[month - 1] ?? key;
      return year === now.getFullYear() ? name : `${name} ${year}`;
    }
    case 'day': {
      const [year, month, day] = key.split('-').map(Number);
      if (key === dayKey(now)) return 'Сегодня';
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (key === dayKey(yesterday)) return 'Вчера';
      const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
      const tail = year === now.getFullYear() ? '' : ` ${year}`;
      return `${day} ${MONTHS_OF[month - 1] ?? ''}${tail}, ${weekday}`;
    }
    case 'folder':
      return baseName(key);
    case 'album':
      return group.label || key;
    case 'type':
      return TYPE_LABELS[key] || key;
    case 'kind':
      return KIND_TITLES[key] || key;
    default:
      return group.label || key;
  }
}

const monthYear = (stamp: number): string => {
  const date = new Date(stamp);
  return `${MONTHS[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
};

/** Подзаголовок: для недатированных групп — промежуток времени, для папки — путь. */
export function groupNote(by: GroupBy, group: Pick<PhotoGroup, 'key' | 'newest' | 'oldest'>): string {
  if (by === 'folder' && group.key !== GROUP_NONE) return group.key;
  if (isDated(by) || !group.newest || !group.oldest) return '';
  const from = monthYear(group.oldest);
  const to = monthYear(group.newest);
  return from === to ? from : `${from} — ${to}`;
}
