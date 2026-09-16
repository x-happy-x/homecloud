import {getDuplicates, type DuplicateGroup} from '../../services/endpoints/jobs';
import type {DupFilters} from '../../store/slices/duplicates';

/** Сначала собираем весь список: удаление во время пагинации сдвинуло бы страницы. */
export async function loadAllDuplicates(similar: boolean, filters: DupFilters): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const page = await getDuplicates(similar, filters, limit, offset);
    groups.push(...page.groups);
    offset += limit;
    if (offset >= page.total) return groups;
  }
}
