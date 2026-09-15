import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react';
import {useQuery} from '@tanstack/react-query';
import './AppShell.scss';
import {AlbumPickDialog} from '../components/albums/AlbumPickDialog';
import {LoginDialog} from '../components/auth/LoginDialog';
import {Rail} from '../components/nav/Rail';
import {Tabbar} from '../components/nav/Tabbar';
import {Topbar} from '../components/nav/Topbar';
import {NotifPanel} from '../components/notifications/NotifPanel';
import {NotifStack} from '../components/notifications/NotifStack';
import {useCatalogState} from '../hooks/useCatalogState';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts';
import {getSession} from '../services/endpoints/session';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import type {GroupDetail} from '../types/api';
import {GroupDialog} from '../views/people/GroupDialog';
import {PhotoProcessDialog} from '../views/photos/PhotoProcessDialog';
import {CollectionsPanel} from '../views/photos/panel/CollectionsPanel';
import {Viewer} from '../views/photos/viewer/Viewer';
import {ProcessingBanner} from '../views/scan/ProcessingBanner';
import {VIEW_TITLES, type ViewName} from './routes';
import {usePollingStatus} from './usePollingStatus';
import {ViewOutlet} from './ViewOutlet';

/**
 * Данные кэша без своего запроса. Счётчики вкладок «Обучение» и «Дубликаты»
 * известны, только когда вкладку уже открывали, — до того в них прочерк.
 */
function useCachedData<T>(key: readonly unknown[]): T | undefined {
  return useSyncExternalStore(
    notify => queryClient.getQueryCache().subscribe(notify),
    () => queryClient.getQueryData<T>(key),
  );
}

export function AppShell() {
  const view = useStore(state => state.view);
  const setView = useStore(state => state.setView);
  const setQuery = useStore(state => state.setQuery);
  const setSession = useStore(state => state.setSession);
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const openFaces = useStore(state => state.openFaces);
  const notifOpen = useStore(state => state.notifications.panelOpen);
  const closeNotifPanel = useStore(state => state.closeNotifPanel);
  const similar = useStore(state => state.duplicates.similar);

  const session = useQuery({queryKey: qk.session(), queryFn: getSession});
  useEffect(() => {
    if (session.data) setSession(session.data);
  }, [session.data, setSession]);

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · HomeCloud`;
  }, [view]);

  const status = usePollingStatus();
  const stats = useCatalogState().data?.stats;
  const routerSummary = useCachedData<{pending?: number}>(qk.routerSummary());
  const duplicatePages = useCachedData<{pages: Array<{total: number}>}>(qk.duplicates(similar));

  const counts = useMemo(() => {
    const devices = status.devices;
    const running = devices?.filter(device => device.job?.active).length ?? 0;
    return {
      people: stats ? stats.people || stats.groups : 0,
      photos: stats?.photos ?? 0,
      review: stats?.review ?? 0,
      training: routerSummary ? routerSummary.pending ?? 0 : '—',
      scan: !devices ? '—' : running ? `${running} ↻` : devices.filter(device => device.online).length,
      duplicates: duplicatePages?.pages[0]?.total || '—',
      // Так было и в прежней вёрстке: у «Настроек» счётчик видео.
      settings: stats?.videos ?? 0,
    };
  }, [stats, status.devices, routerSummary, duplicatePages]);

  const navigate = useCallback((next: ViewName) => {
    if (next === useStore.getState().view) return;
    // Поиск людей и поиск по снимкам — разные вещи: запрос одного экрана не переносим.
    setQuery('');
    setView(next);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, [setQuery, setView]);

  const openGroup = useCallback((key: string) => setRouteGroup(key), [setRouteGroup]);
  const openFace = useCallback((group: GroupDetail, index: number) => openFaces(group, index), [openFaces]);

  const shortcuts = useMemo(() => ({
    'mod+k': (event: KeyboardEvent) => {
      event.preventDefault();
      document.getElementById('searchInput')?.focus();
    },
    ...(notifOpen ? {Escape: closeNotifPanel} : {}),
  }), [notifOpen, closeNotifPanel]);
  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <div className="layout">
        <Rail view={view} counts={counts} onNavigate={navigate} />
        <div className="main">
          <Topbar
            searchPlaceholder={view === 'photos'
              ? 'Поиск по содержимому, тексту или имени файла'
              : 'Поиск людей и групп'}
          />
          <main>
            <ProcessingBanner devices={status.devices} />
            <ViewOutlet status={status} onOpenGroup={openGroup} />
          </main>
        </div>
      </div>
      <Tabbar view={view} counts={counts} onNavigate={navigate} />

      <CollectionsPanel />
      <NotifPanel />
      <AlbumPickDialog />
      <PhotoProcessDialog />
      <GroupDialog onOpenFace={openFace} />
      <Viewer />
      <LoginDialog />
      <NotifStack />
    </>
  );
}
