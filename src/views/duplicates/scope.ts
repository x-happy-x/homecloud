import type {DuplicateGroup} from '../../services/endpoints/jobs';

/** В папке сохраняем её копию, даже если раньше вручную выбрали другую. */
export function keeperOf(group: DuplicateGroup, chosen: string | undefined, folder: string): string {
  const parent = (path: string) => path.replace(/\\/g, '/').slice(0, path.replace(/\\/g, '/').lastIndexOf('/'));
  const candidates = folder
    ? group.paths.filter(path => parent(path) === folder.replace(/\\/g, '/').replace(/\/$/, ''))
    : group.paths;
  return chosen && candidates.includes(chosen) ? chosen : candidates.includes(group.keep) ? group.keep : candidates[0] ?? '';
}

export function doomedPaths(group: DuplicateGroup, keep: string, _folder: string): string[] {
  return group.paths.includes(keep) ? group.paths.filter(path => path !== keep) : [];
}

export function gainOf(group: DuplicateGroup, keep: string, folder: string): number {
  if (!doomedPaths(group, keep, folder).length) return 0;
  const size = (path: string) => group.photos.find(photo => photo.path === path)?.size ?? 0;
  return Math.max(0, group.extra + size(group.keep) - size(keep));
}
