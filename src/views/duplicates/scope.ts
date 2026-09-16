import type {DuplicateGroup} from '../../services/endpoints/jobs';

/**
 * Что удалится из группы. Обычно это все копии, кроме оставляемой, но когда
 * список сужен до одной папки — только её копии: остальные файлы группы лежат
 * в других местах, и убирать их никто не просил. Такие пути сервер присылает
 * отдельным полем, вместе с их общим весом.
 */
export function doomedPaths(group: DuplicateGroup, keep: string, folder: string): string[] {
  const paths = folder ? group.folder_paths ?? [] : group.paths;
  return paths.filter(path => path !== keep);
}

/** Сколько освободит группа, если оставить keep: сервер считал для своего выбора. */
export function gainOf(group: DuplicateGroup, keep: string, folder: string): number {
  const size = (path: string) => group.photos.find(photo => photo.path === path)?.size ?? 0;
  // В папке удаляются только её копии — по ним же и вес, посчитанный сервером.
  if (folder) {
    const spared = group.folder_paths?.includes(keep) ? size(keep) : 0;
    return Math.max(0, (group.folder_extra ?? 0) - spared);
  }
  if (keep === group.keep) return group.extra;
  return Math.max(0, group.extra + size(group.keep) - size(keep));
}
