/**
 * Ключи кэша. Всё, что влияет на ответ, обязано быть частью ключа — иначе
 * после переключения режима 18+ на «скрывать совсем» отдаётся старый ответ,
 * в котором такие кадры ещё есть.
 */
export const qk = {
  session: () => ['session'] as const,
  kin: () => ['kin'] as const,

  state: (hideAdult: boolean) => ['state', {hideAdult}] as const,
  group: (key: string, hideAdult: boolean) => ['group', key, {hideAdult}] as const,
  photos: (params: Record<string, unknown>) => ['photos', params] as const,
  photo: (path: string) => ['photo', path] as const,
  /** Под «photos», чтобы сбрасывался вместе со снимками после любой правки. */
  photoGroups: (params: Record<string, unknown>) => ['photos', 'groups', params] as const,
  /**
   * Снимок кадра лица. Отдельный ключ: пропавший с диска снимок здесь
   * подменяется заглушкой из кадра, и в общую карточку снимка ей не место.
   */
  facePhoto: (path: string) => ['face-photo', path] as const,
  speech: (path: string) => ['speech', path] as const,
  /** Метаданные файла не меняются от правок каталога — отдельный ключ, не под «photos». */
  photoMetadata: (path: string) => ['photo-metadata', path] as const,
  videoPeopleHint: (path: string) => ['video-people', path] as const,
  /** Что внутри ролика (ffprobe на ядре) и задание обработки видео. */
  videoProbe: (path: string) => ['video-probe', path] as const,
  videoJob: (id: string) => ['video-job', id] as const,

  folders: (path: string) => ['folders', path] as const,
  albums: () => ['albums'] as const,
  settings: () => ['settings'] as const,

  similar: (key: string) => ['similar', key] as const,
  similarPairs: (namedOnly: boolean) => ['similar-pairs', {namedOnly}] as const,
  faceSuggestions: () => ['face-suggestions'] as const,
  /** Под «group»: любая правка имён сбрасывает их вместе с карточками групп. */
  personCandidates: (key: string, hideAdult: boolean) => ['group', 'candidates', key, {hideAdult}] as const,
  /** Под «group», чтобы сбрасывался вместе с карточками после правок лиц. */
  personCompanions: (key: string, hideAdult: boolean) => ['group', 'companions', key, {hideAdult}] as const,
  compare: (a: string, b: string) => ['compare', a, b] as const,

  /** Ядра — компьютеры, которые считают. */
  devices: () => ['devices'] as const,
  /** Доступность источников для плиток и просмотрщика (лёгкий ответ хаба). */
  sourceHealth: () => ['source-health'] as const,
  /** Окружения и модели одного ядра. */
  coreComponents: (id: string) => ['core-components', id] as const,
  /** Задание, разделённое между ядрами. */
  parallel: () => ['parallel'] as const,
  /** Источники — где лежат оригиналы. */
  sources: () => ['sources'] as const,
  /** Что хранит хаб по каждому источнику. */
  storage: () => ['storage'] as const,
  imports: () => ['imports'] as const,
  browse: (sourceId: string, path: string) => ['browse', sourceId, path] as const,
  tree: (path?: string) => (path === undefined ? (['tree'] as const) : (['tree', path] as const)),
  scanHistory: () => ['scan-history'] as const,

  duplicates: (similar: boolean, filters: Record<string, unknown>) => ['duplicates', {similar, ...filters}] as const,
  duplicatesStatus: () => ['duplicates-status'] as const,

  highlights: (kind: string, hideAdult: boolean) => ['highlights', {kind, hideAdult}] as const,
  /** Под «highlights», чтобы пересборка сбрасывала и открытую подборку. */
  highlight: (key: string, hideAdult: boolean) => ['highlights', 'one', key, {hideAdult}] as const,
  highlightsStatus: () => ['highlights-status'] as const,
  reclusterStatus: () => ['recluster-status'] as const,

  routerSummary: () => ['router-summary'] as const,
  routerStatus: () => ['router-status'] as const,
  routerReview: (hideAdult: boolean) => ['router-review', {hideAdult}] as const,
  routerBatches: () => ['router-batches'] as const,
  routerTaggers: () => ['router-taggers'] as const,
} as const;
