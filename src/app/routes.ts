export const VIEWS = [
  'people', 'photos', 'review', 'training', 'scan', 'duplicates', 'settings',
] as const;

export type ViewName = (typeof VIEWS)[number];

const VIEW_SET = new Set<string>(VIEWS);

export const isView = (value: string): value is ViewName => VIEW_SET.has(value);

/**
 * Экраны раздела «Анализ». В навигации у них один пункт на всех, но каждый
 * остаётся отдельным экраном: прежние ссылки вида #/scan продолжают работать,
 * а опрос дубликатов и обучения по-прежнему включается только на своём экране.
 */
export const ANALYSIS_VIEWS = ['review', 'training', 'scan', 'duplicates'] as const;

export type AnalysisView = (typeof ANALYSIS_VIEWS)[number];

const ANALYSIS_SET = new Set<string>(ANALYSIS_VIEWS);

export const isAnalysisView = (view: string): view is AnalysisView => ANALYSIS_SET.has(view);

export const VIEW_TITLES: Record<ViewName, string> = {
  people: 'Люди',
  photos: 'Фотографии',
  review: 'Проверка',
  training: 'Обучение',
  scan: 'Сканирование',
  duplicates: 'Дубликаты',
  settings: 'Настройки',
};

/** Всё, что переживает перезагрузку страницы и попадает в ссылку. */
export interface RouteState {
  view: ViewName;
  query: string;
  people: string[];
  contentType: string;
  kind: string;
  showBlurry: boolean;
  showAdult: boolean;
  folder: string;
  folderDeep: boolean;
  folderExclude: string;
  album: number;
  hidden: boolean;
  /** Открытый в просмотрщике снимок. */
  photo: string;
  /** Открытая карточка группы лиц. */
  group: string;
}

export const emptyRoute = (): RouteState => ({
  view: 'photos',
  query: '',
  people: [],
  contentType: '',
  kind: '',
  showBlurry: false,
  showAdult: false,
  folder: '',
  folderDeep: true,
  folderExclude: '',
  album: 0,
  hidden: false,
  photo: '',
  group: '',
});

/**
 * Фильтры галереи в ссылку попадают только на экране фотографий, а группа —
 * только там, где карточку человека вообще можно открыть. Иначе ссылка
 * «Настройки» тащила бы за собой чужие фильтры.
 */
export function buildHash(route: RouteState): string {
  const params = new URLSearchParams();
  if (route.query && (route.view === 'people' || route.view === 'photos')) {
    params.set('q', route.query);
  }
  if (route.view === 'photos') {
    route.people.forEach(name => params.append('person', name));
    if (route.contentType) params.set('type', route.contentType);
    if (route.showBlurry) params.set('blurry', '1');
    if (route.showAdult) params.set('adult', '1');
    if (route.kind) params.set('kind', route.kind);
    if (route.folder) {
      params.set('folder', route.folder);
      if (!route.folderDeep) params.set('folder_deep', '0');
    }
    if (route.folderExclude) params.set('exclude_folder', route.folderExclude);
    if (route.album) params.set('album', String(route.album));
    if (route.hidden) params.set('hidden', '1');
    if (route.photo) params.set('photo', route.photo);
  }
  if (route.group && (route.view === 'people' || route.view === 'review')) {
    params.set('group', route.group);
  }
  const serialized = params.toString();
  return `#/${route.view}${serialized ? `?${serialized}` : ''}`;
}

export function parseHash(hash: string): RouteState {
  const match = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash || '');
  const name = match?.[1] ?? '';
  const params = new URLSearchParams(match?.[2] || '');
  return {
    view: isView(name) ? name : 'photos',
    query: params.get('q') || '',
    people: params.getAll('person').filter(Boolean),
    contentType: params.get('type') || '',
    kind: params.get('kind') || '',
    showBlurry: params.get('blurry') === '1',
    showAdult: params.get('adult') === '1',
    folder: params.get('folder') || '',
    folderDeep: params.get('folder_deep') !== '0',
    folderExclude: params.get('exclude_folder') || '',
    album: Number(params.get('album') || 0),
    hidden: params.get('hidden') === '1',
    photo: params.get('photo') || '',
    group: params.get('group') || '',
  };
}

/**
 * Открытие просмотрщика или карточки группы — отдельный шаг истории: Esc
 * уходит назад, и адрес не расходится с экраном. Смена экрана — тоже шаг;
 * правка фильтров и листание снимков внутри просмотрщика — нет, иначе
 * «назад» превращается в отмену каждого щелчка.
 */
export function historyMode(next: RouteState, previous: RouteState): 'push' | 'replace' {
  if (next.view !== previous.view) return 'push';
  if ((next.photo && !previous.photo) || (next.group && !previous.group)) return 'push';
  return 'replace';
}
