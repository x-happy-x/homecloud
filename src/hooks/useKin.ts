import {useQuery} from '@tanstack/react-query';
import {getKin} from '../services/endpoints/session';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import type {KinPerson} from '../types/api';

/**
 * Люди картотеки. Картотека может быть недоступна — тогда подсказок имён
 * просто нет, ошибки на экране это не заслуживает.
 */
export function useKin() {
  const signedIn = useStore(state => Boolean(state.session.user));
  return useQuery({
    enabled: signedIn,
    queryKey: qk.kin(),
    queryFn: () => getKin().catch((error: Error) => {
      console.warn('Картотека недоступна:', error.message);
      return [] as KinPerson[];
    }),
    staleTime: Infinity,
  });
}
