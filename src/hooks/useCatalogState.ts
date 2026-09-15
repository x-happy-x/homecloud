import {useQuery} from '@tanstack/react-query';
import {getState} from '../services/endpoints/catalog';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';

/**
 * Состояние каталога. «Скрывать 18+ совсем» убирает такие лица и из групп,
 * поэтому режим — часть ключа кэша.
 */
export function useCatalogState() {
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  return useQuery({queryKey: qk.state(hideAdult), queryFn: () => getState(hideAdult)});
}
