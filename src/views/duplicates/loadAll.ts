import {getDuplicates, type DuplicateGroup} from '../../services/endpoints/jobs';
import type {DupFilters} from '../../store/slices/duplicates';

/** Сначала собираем весь список: удаление во время пагинации сдвинуло бы страницы. */
export async function loadAllDuplicates(similar: boolean, filters: DupFilters, options: {
  signal?: AbortSignal;
  onProgress?(loaded: number, total: number): void;
} = {}, cross = false): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    options.signal?.throwIfAborted();
    const page = cross
      ? await getDuplicates(similar, filters, limit, offset, options.signal, true)
      : await getDuplicates(similar, filters, limit, offset, options.signal);
    options.signal?.throwIfAborted();
    groups.push(...page.groups);
    offset += limit;
    options.onProgress?.(Math.min(offset, page.total), page.total);
    if (offset >= page.total) return groups;
  }
}
