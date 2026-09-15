import {useMemo} from 'react';
import {useInfiniteQuery, type InfiniteData} from '@tanstack/react-query';
import {useDebouncedValue} from '../../hooks/useDebouncedValue';
import {adultFlag} from '../../lib/adult';
import {getPhotos} from '../../services/endpoints/catalog';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {PhotoCard, PhotosPage} from '../../types/api';
import {galleryParams} from './gallery';

export const PHOTO_PAGE = 200;
/** Поиск по содержимому дорогой — ждём паузы в наборе. */
const SEARCH_DELAY_MS = 450;

/**
 * Снимки галереи по фильтрам из адреса. Раньше это была ручная дозапись
 * плиток в сетку; теперь — постраничный запрос, общий у сетки и просмотрщика.
 */
export function useGallery() {
  const filters = useStore(state => state.filters);
  const enabled = useStore(state => state.view === 'photos' && Boolean(state.session.user));
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const query = useDebouncedValue(filters.query, SEARCH_DELAY_MS);
  const params = useMemo(() => galleryParams(filters, query), [filters, query]);

  const gallery = useInfiniteQuery({
    queryKey: qk.photos(params as Record<string, unknown>),
    queryFn: ({pageParam}) => getPhotos({...params, limit: PHOTO_PAGE, offset: pageParam}),
    initialPageParam: 0,
    // Смещение — по присланному сервером, а не по показанному: «скрывать 18+»
    // режет страницы на клиенте, и прежний счёт пропускал снимки.
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.photos.length, 0);
      return last.photos.length && loaded < last.total ? loaded : undefined;
    },
    enabled,
  });

  const photos = useMemo(() => {
    const all = gallery.data?.pages.flatMap(page => page.photos) ?? [];
    return hideAdult ? all.filter(photo => !adultFlag(photo)) : all;
  }, [gallery.data, hideAdult]);

  return {
    photos,
    total: gallery.data?.pages[0]?.total ?? 0,
    isPending: gallery.isPending,
    hasNextPage: gallery.hasNextPage,
    isFetchingNextPage: gallery.isFetchingNextPage,
    fetchNextPage: gallery.fetchNextPage,
  };
}

/** Свежая карточка снимка — во все загруженные страницы, без перезапроса каждой. */
export function replacePhoto(photo: PhotoCard): void {
  queryClient.setQueryData(qk.photo(photo.path), photo);
  queryClient.setQueriesData<InfiniteData<PhotosPage>>({queryKey: ['photos']}, data => data && {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      photos: page.photos.map(item => (item.path === photo.path ? photo : item)),
    })),
  });
}
