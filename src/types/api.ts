import type {AdultRating, PhotoKind} from './domain';

/** Идентификатор человека в картотеке bigfam — строка, не число. */
export type BigfamId = string;

/** Учётная запись картотеки: вход в HomeCloud общий с ней. */
export interface SessionUser {
  id?: string;
  login: string;
  name?: string;
  /** Роль в HomeCloud: access.homecloud.role из сервиса account. */
  role: 'admin' | 'editor' | 'viewer' | 'none' | string;
  access?: Record<string, {role: string}>;
}

/** Ответ server.js: права и адрес картотеки считает он, а не бэкенд. */
export interface SessionResponse {
  user: SessionUser | null;
  canEdit?: boolean;
  bigfamUrl?: string;
  /** Страница account: имя, пароль, роли. */
  accountUrl?: string;
}

export interface KinPerson {
  id: BigfamId;
  /** Пространство картотеки, где живёт этот человек; main — основное. */
  workspace?: {id: string; name: string; main: boolean};
  /** Человек, к которому привязана текущая учётная запись BiGFaM. */
  isSelf?: boolean;
  name: string;
  first?: string;
  last?: string;
  middle?: string;
  birth?: string;
  death?: string;
  deceased?: boolean;
  sex?: string;
  /** Пусто, если портрета в картотеке нет — тогда и запрашивать нечего. */
  avatar?: string;
  relatives?: {
    parents: KinRelative[];
    siblings: KinRelative[];
    children: KinRelative[];
    spouses: KinRelative[];
  };
}

export interface KinRelative {
  id: BigfamId;
  name: string;
  deceased?: boolean;
  avatar?: string;
}

export type GroupKind = 'person' | 'auto' | 'noise' | 'blurry' | 'excluded';

export interface AlbumStamp {
  id: number;
  title: string;
  trail: string;
}

/** Группа лиц: названный человек, автоматическая гроздь, шум или исключённые. */
export interface Group {
  key: string;
  title: string;
  name: string | null;
  bigfam_id: BigfamId | null;
  kind: GroupKind | string;
  /** Лиц в группе. */
  count: number;
  /** Разных снимков, на которых эти лица. */
  photos: number;
  covers: string[];
  avatar_face: number | null;
  avatar_pinned: boolean;
  avatar: string;
  albums: AlbumStamp[];
  /** В скрытом альбоме людей — такое видит только администратор. */
  hidden: boolean;
}

/** Лицо в карточке группы. */
export interface GroupFace {
  id: number;
  filename: string;
  path: string;
  kind: PhotoKind;
  /** Секунда кадра, если лицо найдено в видео. */
  frame_time: number | null;
  /** Размер исходника, в системе координат которого сохранена рамка лица. */
  width?: number | null;
  height?: number | null;
  /** Промежуток трека в ролике: с какой секунды по какую лицо было в кадре. */
  track_start?: number | null;
  track_stop?: number | null;
  /** Размытость миниатюры: 0 — резко, 1 — мыло; null — не оценена. */
  blur?: number | null;
  thumbnail: string;
  original: string;
  confidence: number;
  /** id верхнего лица стопки похожих кадров; у одиночного лица — его собственный. */
  stack?: number;
  stack_size?: number;
}

/** Карточка группы приходит плоско: сама группа и её лица в одном объекте. */
export interface GroupDetail extends Group {
  faces: GroupFace[];
  /** Сколько стопок получилось из лиц группы. */
  stacks?: number;
}

/** Безымянное лицо, похожее на названного человека, — ждёт подтверждения. */
export interface CandidateFace extends GroupFace {
  score: number;
  /** Группа, где лицо лежит сейчас: `auto:12` или `noise`. */
  group: string;
}

/** Названный человек — кружки в панели подборок и подсказки выбора имени. */
export interface NamedPerson {
  name: string;
  count: number;
  bigfam_id: BigfamId | null;
  avatar: string;
}

export interface CatalogStats {
  faces: number;
  photos: number;
  videos: number;
  /** Снимков, отрезанных правилами путей. */
  excluded: number;
  with_faces: number;
  hidden: number;
  people: number;
  groups: number;
  /** Лиц в шуме и исключённых — счётчик раздела «Проверка». */
  review: number;
}

export interface PeopleAlbum {
  id: number;
  parent_id: number;
  title: string;
  depth: number;
  trail: string;
  /** Групп прямо в альбоме и вместе с вложенными. */
  groups: number;
  total: number;
  member_keys: string[];
  hidden: boolean;
  /** Скрыт сам или лежит внутри скрытого. */
  effectively_hidden?: boolean;
  /** id вложенных альбомов. */
  children?: number[];
  /** Рассчитывается по BiGFaM и не редактируется вручную. */
  automatic?: boolean;
  description?: string;
}

export interface Album {
  id: number;
  parent_id: number;
  title: string;
  depth: number;
  trail: string;
  /** Снимков прямо в альбоме и вместе с вложенными. */
  photos: number;
  total: number;
  /** Путь снимка-обложки; пусто, если альбом пуст. */
  cover: string;
}

export interface Folder {
  name: string;
  path: string;
  photos: number;
  /** Сколько вложенных папок — ноль значит, что открывать нечего. */
  folders: number;
}

/** Лицо на снимке. Группа та же, что в разделе «Люди»: person:N, auto:N или noise:N. */
export interface PhotoFace {
  id: number;
  thumbnail: string;
  frame_time: number | null;
  name: string | null;
  bigfam_id: BigfamId | null;
  group: string;
  /** Рамка лица в координатах оригинала: left, top, right, bottom. */
  box?: [number, number, number, number] | null;
}

export interface RouterLabel {
  id: string;
  title: string;
  group: string;
  score: number;
  verified: boolean;
}

export interface AdultRegion {
  class: string;
  score: number;
}

/** Минимум, по которому рисуется плитка: хватает и дубликатам, и очереди обучения. */
export interface PhotoSummary {
  path: string;
  /** Базовый адрес уменьшенной копии, уже с «?path=…». */
  preview: string;
  filename?: string;
  folder?: string;
  video?: string;
  kind?: PhotoKind;
  /** Время файла в миллисекундах. */
  taken?: number | null;
  /** Источник, где лежит оригинал: id и имя для подписи. */
  source?: string;
  source_name?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  adult_rating?: AdultRating | null;
}

/** Полная карточка снимка — галерея и просмотрщик. */
export interface PhotoCard extends PhotoSummary {
  filename: string;
  folder: string;
  video: string;
  kind: PhotoKind;
  caption: string;
  caption_short: string;
  caption_tags: {ru?: string[]; en?: string[]} | string[];
  ocr_text: string;
  adult_description: string;
  adult_regions: AdultRegion[];
  people: Array<{name: string; bigfam_id: BigfamId | null}>;
  face_count: number;
  faces: PhotoFace[];
  router_labels: RouterLabel[];
  albums: AlbumStamp[];
  speech_text: string;
  hidden_owner: string;
}

export interface PhotosPage {
  photos: PhotoCard[];
  total: number;
}

/** Группа галереи: день, папка, альбом, человек… */
export interface PhotoGroup {
  /** «2024-09», путь папки, id альбома, имя; «~none» — снимки без признака. */
  key: string;
  /** Подпись от сервера: путь альбома, имя человека. */
  label: string;
  count: number;
  /** Самый свежий и самый старый снимок группы, миллисекунды. */
  newest: number | null;
  oldest: number | null;
  /** Несколько первых снимков — обложка свёрнутой группы. */
  covers: Array<{path: string; v: number; adult_rating: AdultRating}>;
}

export interface PhotoGroupsPage {
  by: string;
  order: string;
  groups: PhotoGroup[];
  /** Снимков всего; в группах их может быть больше — снимок бывает в нескольких. */
  total: number;
}
