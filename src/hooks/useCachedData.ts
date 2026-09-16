import {useSyncExternalStore} from 'react';
import {queryClient} from '../services/queryClient';

/**
 * Данные кэша без своего запроса. Счётчики вкладок «Обучение» и «Дубликаты»
 * известны, только когда вкладку уже открывали, — до того их просто нет.
 */
export function useCachedData<T>(key: readonly unknown[]): T | undefined {
  return useSyncExternalStore(
    notify => queryClient.getQueryCache().subscribe(notify),
    () => queryClient.getQueryData<T>(key),
  );
}
