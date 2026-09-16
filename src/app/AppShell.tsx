import {AppDialogs} from '../components/AppDialogs/AppDialogs';
import {useCallback, useEffect, useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import './AppShell.scss';
import {AlbumPickDialog} from '../components/albums/AlbumPickDialog';
import {LoginDialog} from '../components/auth/LoginDialog';
import {Rail} from '../components/nav/Rail';
import {Tabbar} from '../components/nav/Tabbar';
import {Topbar} from '../components/nav/Topbar';
import {NotifPanel} from '../components/notifications/NotifPanel';
import {NotifStack} from '../components/notifications/NotifStack';
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts';
import {getSession} from '../services/endpoints/session';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import type {GroupDetail} from '../types/api';
import {GroupDialog} from '../views/people/GroupDialog';
import {PhotoProcessDialog} from '../views/photos/PhotoProcessDialog';
import {CollectionsPanel} from '../views/photos/panel/CollectionsPanel';
import {Viewer} from '../views/photos/viewer/Viewer';
import type {NavGroupSpec} from './navItems';
import {VIEW_TITLES, type ViewName} from './routes';
import {usePollingStatus} from './usePollingStatus';
import {ViewOutlet} from './ViewOutlet';

/**
 * Поиск есть только там, где он что-то делает: по снимкам и по людям. На
 * «Анализе» и «Настройках» поле исчезает вместе с подсказкой — раньше там
 * стояло «Поиск людей и групп», который ничего не искал.
 */
const SEARCH_PLACEHOLDERS: Partial<Record<ViewName, string>> = {
  photos: 'Поиск по содержимому, тексту или имени файла',
  people: 'Поиск людей и групп',
};

export function AppShell() {
  const view = useStore(state => state.view);
  const setView = useStore(state => state.setView);
  const setQuery = useStore(state => state.setQuery);
  const setSession = useStore(state => state.setSession);
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const openFaces = useStore(state => state.openFaces);
  const notifOpen = useStore(state => state.notifications.panelOpen);
  const closeNotifPanel = useStore(state => state.closeNotifPanel);

  const session = useQuery({queryKey: qk.session(), queryFn: getSession});
  useEffect(() => {
    if (session.data) setSession(session.data);
  }, [session.data, setSession]);

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · HomeCloud`;
  }, [view]);

  const status = usePollingStatus();

  const navigate = useCallback((group: NavGroupSpec) => {
    const state = useStore.getState();
    if (group.views.includes(state.view)) return;
    // Поиск людей и поиск по снимкам — разные вещи: запрос одного экрана не переносим.
    setQuery('');
    setView(group.id === 'analysis' ? state.prefs.analysisTab : group.view);
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
        <Rail view={view} onNavigate={navigate} />
        <div className="main">
          <Topbar searchPlaceholder={SEARCH_PLACEHOLDERS[view] ?? null} />
          <main>
            <ViewOutlet status={status} onOpenGroup={openGroup} />
          </main>
        </div>
      </div>
      <Tabbar view={view} onNavigate={navigate} />

      <CollectionsPanel />
      <NotifPanel />
      <AlbumPickDialog />
      <PhotoProcessDialog />
      <GroupDialog onOpenFace={openFace} />
      <Viewer />
      <LoginDialog />
      <NotifStack />
      <AppDialogs />
    </>
  );
}
