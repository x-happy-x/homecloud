import type {GroupFace} from '../../types/api';
import {faceMoment} from './stacks';

/** Файл, где человек есть: снимок один раз, ролик один раз со всеми моментами. */
export interface MediaItem {
  path: string;
  filename: string;
  kind: 'photo' | 'video';
  taken: number | null;
  /** Лица человека в этом файле; у ролика — по времени. */
  faces: GroupFace[];
  /** Позиции этих лиц в исходном списке группы. */
  indexes: number[];
  /** Лучшее лицо — по нему рамка на плитке и с него открывается просмотр. */
  best: GroupFace;
  bestIndex: number;
}

export type KindFilter = 'all' | 'photo' | 'video';

/** Год снимка по времени съёмки; без даты — null. */
export function yearOf(taken: number | null | undefined): number | null {
  if (!taken) return null;
  const year = new Date(taken * 1000).getFullYear();
  return Number.isFinite(year) ? year : null;
}

/** Свежие сверху, без даты — в конце; при равенстве держим прежний порядок. */
export function newestFirst<T extends {taken?: number | null}>(items: T[]): T[] {
  return items
    .map((item, position) => ({item, position}))
    .sort((a, b) => (b.item.taken ?? -Infinity) - (a.item.taken ?? -Infinity) || a.position - b.position)
    .map(({item}) => item);
}

export const matchesKind = (kind: string, filter: KindFilter): boolean =>
  filter === 'all' || kind === filter;

/** Лица по файлам: каждый снимок и ролик один раз, свежие сверху. */
export function buildMedia(faces: GroupFace[]): MediaItem[] {
  const byPath = new Map<string, MediaItem>();
  faces.forEach((face, index) => {
    let item = byPath.get(face.path);
    if (!item) {
      item = {
        path: face.path, filename: face.filename, kind: face.kind === 'video' ? 'video' : 'photo',
        taken: face.taken ?? null, faces: [], indexes: [], best: face, bestIndex: index,
      };
      byPath.set(face.path, item);
    }
    item.faces.push(face);
    item.indexes.push(index);
    if ((face.confidence || 0) > (item.best.confidence || 0)) {
      item.best = face;
      item.bestIndex = index;
    }
  });
  for (const item of byPath.values()) {
    if (item.kind === 'video') {
      const order = item.faces.map((face, position) => ({face, index: item.indexes[position]}))
        .sort((a, b) => faceMoment(a.face) - faceMoment(b.face));
      item.faces = order.map(entry => entry.face);
      item.indexes = order.map(entry => entry.index);
    }
  }
  return newestFirst([...byPath.values()]);
}

/** Разложить по годам в порядке списка: свежий год первым, «без даты» — последним. */
export function byYear<T>(items: T[], takenOf: (item: T) => number | null | undefined): Array<{year: number | null; items: T[]}> {
  const sections: Array<{year: number | null; items: T[]}> = [];
  const index = new Map<number | null, {year: number | null; items: T[]}>();
  for (const item of items) {
    const year = yearOf(takenOf(item));
    let section = index.get(year);
    if (!section) {
      section = {year, items: []};
      index.set(year, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
}

/** Сводка для шапки: сколько снимков и роликов, за какие годы. */
export function summary(faces: GroupFace[]): {photos: number; videos: number; from: number | null; to: number | null} {
  const kinds = new Map<string, string>();
  let from: number | null = null;
  let to: number | null = null;
  for (const face of faces) {
    kinds.set(face.path, face.kind);
    const year = yearOf(face.taken);
    if (year !== null) {
      from = from === null ? year : Math.min(from, year);
      to = to === null ? year : Math.max(to, year);
    }
  }
  let videos = 0;
  for (const kind of kinds.values()) if (kind === 'video') videos += 1;
  return {photos: kinds.size - videos, videos, from, to};
}

/** Где на кадре лицо, в долях: для рамки на плитке «Медиа». */
export function boxShare(face: GroupFace): {left: number; top: number; width: number; height: number} | null {
  if (!face.box || !face.width || !face.height) return null;
  const [left, top, right, bottom] = face.box;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const share = {
    left: clamp(left / face.width), top: clamp(top / face.height),
    width: clamp((right - left) / face.width), height: clamp((bottom - top) / face.height),
  };
  return share.width > 0 && share.height > 0 ? share : null;
}
