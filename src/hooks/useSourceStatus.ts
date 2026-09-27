import {useQuery} from '@tanstack/react-query';
import {getSourceHealth, type SourceStatus} from '../services/endpoints/backends';
import {qk} from '../services/queryKeys';

/**
 * Доступен ли источник файла — по последней проверке хаба (раз в пять
 * минут). Каждая плитка подписана только на свой источник (select), поэтому
 * смена статуса одного источника не перерисовывает остальные сотни плиток.
 * У локального бэкенда без хаба адреса нет — тогда статуса просто нет.
 */
export function useSourceStatus(source: string | null | undefined): SourceStatus | null {
  return useQuery({
    queryKey: qk.sourceHealth(),
    queryFn: getSourceHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    enabled: Boolean(source),
    select: data => (source ? data.sources[source] ?? null : null),
  }).data ?? null;
}

/** Источник недоступен по последней проверке. */
export const isOffline = (status: SourceStatus | null): boolean => Boolean(status && !status.online);

/** «в 12:34» — когда хаб проверял источник. */
export function checkedAt(status: SourceStatus | null): string {
  if (!status?.checked_at) return '';
  return `в ${new Date(status.checked_at * 1000).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}`;
}
