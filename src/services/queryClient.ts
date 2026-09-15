import {MutationCache, QueryCache, QueryClient} from '@tanstack/react-query';
import {AuthRequiredError} from './api';
import {store} from '../store';

/**
 * Единственное место, где обрабатывается истёкшая сессия: раньше окно входа
 * поднималось прямо из обёртки над fetch, и любой фоновый опрос мог открыть
 * его поверх работы пользователя.
 */
const handle = (error: unknown) => {
  if (error instanceof AuthRequiredError) {
    store.getState().requireLogin();
    return;
  }
  store.getState().toast(error instanceof Error ? error.message : String(error), 'error');
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({onError: handle}),
  mutationCache: new MutationCache({onError: handle}),
  defaultOptions: {
    queries: {
      // Данные каталога меняются только нашими же действиями, поэтому
      // перезапрос при возврате в окно только зря дёргает бэкенд.
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof AuthRequiredError) && count < 2,
      staleTime: 5_000,
    },
    mutations: {retry: false},
  },
});
