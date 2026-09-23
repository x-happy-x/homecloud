import type {PhotosParams} from '../../services/endpoints/catalog';
import type {GalleryFilters} from '../../store/slices/gallery';
import type {Album, PhotoCard, PhotoFace} from '../../types/api';

export const TYPE_LABELS: Record<string, string> = {
  photo: 'Фотографии',
  screenshot: 'Скриншоты',
  document: 'Документы',
  graphics: 'Графика',
};

/** Параметры запроса снимков из фильтров галереи — без страницы. */
export function galleryParams(
  filters: GalleryFilters,
  query: string,
): Omit<PhotosParams, 'limit' | 'offset'> {
  return {
    q: query.trim() || undefined,
    person: filters.people,
    type: filters.contentType || undefined,
    kind: filters.kind || undefined,
    blurry: filters.showBlurry,
    adult: filters.showAdult,
    folder: filters.folder || undefined,
    folderDeep: filters.folderDeep,
    folderExclude: filters.folderExclude || undefined,
    album: filters.album || undefined,
    hidden: filters.hidden,
  };
}

export type ContextDrop =
  | {kind: 'person'; name: string}
  | {kind: 'folder' | 'folderExclude' | 'album' | 'type' | 'hidden' | 'kind' | 'blurry' | 'adult'};

export interface ContextChip {
  label: string;
  drop: ContextDrop;
}

export const baseName = (path: string): string =>
  path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

/** Что сейчас показывает галерея — одной строкой, каждое можно снять. */
export function galleryContext(filters: GalleryFilters, albums: Album[] = []): ContextChip[] {
  const chips: ContextChip[] = filters.people.map(name => ({label: name, drop: {kind: 'person', name}}));
  if (filters.folder) chips.push({label: `Папка: ${baseName(filters.folder)}`, drop: {kind: 'folder'}});
  if (filters.folderExclude) {
    chips.push({label: `Кроме папки: ${baseName(filters.folderExclude)}`, drop: {kind: 'folderExclude'}});
  }
  if (filters.album) {
    const album = albums.find(item => item.id === filters.album);
    chips.push({label: `Альбом: ${album ? album.trail : filters.album}`, drop: {kind: 'album'}});
  }
  if (filters.contentType) {
    chips.push({label: TYPE_LABELS[filters.contentType] || filters.contentType, drop: {kind: 'type'}});
  }
  if (filters.hidden) chips.push({label: 'Скрытый альбом', drop: {kind: 'hidden'}});
  if (filters.kind === 'video') chips.push({label: 'Видео', drop: {kind: 'kind'}});
  if (filters.showBlurry) chips.push({label: 'Размытые', drop: {kind: 'blurry'}});
  if (filters.showAdult) chips.push({label: '18+', drop: {kind: 'adult'}});
  return chips;
}

/** Снять один фильтр: какую часть фильтров записать. */
export function dropFilter(filters: GalleryFilters, drop: ContextDrop): Partial<GalleryFilters> {
  switch (drop.kind) {
    case 'person': return {people: filters.people.filter(name => name !== drop.name), bigfamId: ''};
    case 'folder': return {folder: ''};
    case 'folderExclude': return {folderExclude: ''};
    case 'album': return {album: 0};
    case 'type': return {contentType: ''};
    case 'hidden': return {hidden: false};
    case 'kind': return {kind: ''};
    case 'blurry': return {showBlurry: false};
    case 'adult': return {showAdult: false};
  }
}

export interface FolderCrumb {
  name: string;
  path: string;
}

/**
 * Путь снимка по шагам, каждый ведёт в свою папку. Пути строятся так же, как
 * их строит бэкенд (PurePath): корень диска — «D:\», ниже — «D:\Фото». Прежний
 * код давал «D:» и «D:\\Фото», и щелчок по такой крошке не находил папку.
 */
export function folderCrumbs(folder: string, sourceName = ''): FolderCrumb[] {
  // Ключ источника: первая крошка — сам источник («Netcraze», «PC-X · D:»).
  const keyed = /^([a-z0-9][a-z0-9_-]{1,31}):(.*)$/s.exec(folder);
  if (keyed) {
    const [, source, inner] = keyed;
    const nested = folderCrumbs(inner).map(crumb => ({name: crumb.name, path: `${source}:${crumb.path}`}));
    const label = sourceName || source;
    if (/^[A-Za-z]:/.test(inner) && nested.length) {
      return [{name: `${label} · ${nested[0].name}`, path: nested[0].path}, ...nested.slice(1)];
    }
    return [{name: label, path: `${source}:/`}, ...nested];
  }
  const separator = folder.includes('\\') ? '\\' : '/';
  const parts = folder.split(/[\\/]/).filter(Boolean);
  let walked = '';
  return parts.map((part, index) => {
    if (index === 0) {
      walked = /^[A-Za-z]:$/.test(part) ? `${part}${separator}`
        : folder.startsWith(separator) ? `${separator}${part}` : part;
    } else {
      walked = walked.endsWith(separator) ? `${walked}${part}` : `${walked}${separator}${part}`;
    }
    return {name: part, path: walked};
  });
}

/** Человек на снимке: все его появления в кадре. */
export interface PhotoPerson {
  key: string;
  name: string | null;
  bigfam_id: string | null;
  /** По времени появления: первым идёт самое раннее. */
  members: PhotoFace[];
}

/**
 * Люди на снимке. Группа та же, что в разделе «Люди»: в видео человек заходит
 * в кадр не раз, у каждого раза свой трек, но это один кружок, а не карточка
 * на каждое появление.
 */
export function facesByPerson(photo: Pick<PhotoCard, 'faces' | 'people'>): PhotoPerson[] {
  // У старых карточек без лиц есть только имена — показываем хотя бы их.
  const faces: PhotoFace[] = photo.faces.length
    ? photo.faces
    : photo.people.map(person => ({
        id: 0, thumbnail: '', frame_time: null, name: person.name,
        bigfam_id: person.bigfam_id, group: `named:${person.name}`,
      }));
  const people = new Map<string, PhotoPerson>();
  for (const face of faces) {
    const key = face.group || (face.id ? `face:${face.id}` : `named:${face.name}`);
    if (!people.has(key)) people.set(key, {key, name: face.name, bigfam_id: face.bigfam_id, members: []});
    people.get(key)!.members.push(face);
  }
  for (const person of people.values()) {
    person.members.sort((a, b) => (a.frame_time ?? 0) - (b.frame_time ?? 0));
  }
  return [...people.values()];
}

/** «auto:5» → «Группа 6» — та же нумерация, что и в разделе «Люди». */
export function groupTitle(key: string): string {
  const match = /^auto:(-?\d+)/.exec(key);
  return match ? `Группа ${Number(match[1]) + 1}` : 'Без имени';
}

/** «SPEAKER_03» → 3: цифра — якорь для цвета подписи голоса, цветов шесть. */
export const speakerIndex = (speaker: string): number =>
  (Number(String(speaker).match(/\d+/)?.[0]) || 0) % 6;

/** Карточка человека в картотеке. */
export const bigfamPersonUrl = (bigfamUrl: string, id: string): string =>
  `${bigfamUrl.replace(/#.*$/, '').replace(/\/$/, '')}/#/person/${encodeURIComponent(id)}`;
