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

  folders: (path: string) => ['folders', path] as const,
  albums: () => ['albums'] as const,
  settings: () => ['settings'] as const,

  similar: (key: string) => ['similar', key] as const,
  similarPairs: (namedOnly: boolean) => ['similar-pairs', {namedOnly}] as const,
  faceSuggestions: () => ['face-suggestions'] as const,
  compare: (a: string, b: string) => ['compare', a, b] as const,

  devices: () => ['devices'] as const,
  browse: (deviceId: string, path: string) => ['browse', deviceId, path] as const,
  tree: (deviceId: string, path?: string) =>
    path === undefined ? (['tree', deviceId] as const) : (['tree', deviceId, path] as const),
  scanHistory: (deviceId: string) => ['scan-history', deviceId] as const,

  duplicates: (similar: boolean, filters: Record<string, unknown>) => ['duplicates', {similar, ...filters}] as const,
  duplicatesStatus: () => ['duplicates-status'] as const,
  reclusterStatus: () => ['recluster-status'] as const,

  routerSummary: () => ['router-summary'] as const,
  routerStatus: () => ['router-status'] as const,
  routerReview: (hideAdult: boolean) => ['router-review', {hideAdult}] as const,
  routerBatches: () => ['router-batches'] as const,
  routerTaggers: () => ['router-taggers'] as const,
} as const;
