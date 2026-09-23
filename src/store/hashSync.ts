import {buildHash, historyMode, parseHash, VIEW_TITLES, type RouteState} from '../app/routes';
import {useStore} from './index';
import type {Store} from './index';

/**
 * Пока мы сами переписываем адрес, ответное событие hashchange надо
 * пропустить, иначе разбор ссылки затрёт то, что только что изменил
 * пользователь. В старом коде за это отвечал флаг ui.applyingRoute.
 */
let applying = false;

export const routeOf = (state: Store): RouteState => ({
  view: state.view,
  ...state.filters,
  photo: state.routePhoto,
  group: state.routeGroup,
  highlight: state.routeHighlight,
  section: state.routeSection,
});

const sameRoute = (a: RouteState, b: RouteState): boolean => buildHash(a) === buildHash(b);

/** Возвращает функцию отписки — её зовёт эффект в Providers. */
export function startHashSync(): () => void {
  const applyFromLocation = () => {
    if (applying) return;
    const route = parseHash(window.location.hash);
    applying = true;
    try {
      useStore.getState().applyRoute(route);
    } finally {
      applying = false;
    }
  };

  const unsubscribe = useStore.subscribe(routeOf, (next, previous) => {
    if (applying || sameRoute(next, previous)) return;
    document.title = `${VIEW_TITLES[next.view]} · HomeCloud`;
    // Отметка overlay говорит окну, что закрыть его можно шагом назад.
    const overlay = Boolean(next.photo || next.group);
    applying = true;
    try {
      if (historyMode(next, previous) === 'push') {
        window.history.pushState({overlay}, '', buildHash(next));
      } else {
        window.history.replaceState({...(window.history.state ?? {}), overlay}, '', buildHash(next));
      }
    } finally {
      applying = false;
    }
  }, {equalityFn: sameRoute});

  window.addEventListener('hashchange', applyFromLocation);
  window.addEventListener('popstate', applyFromLocation);
  applyFromLocation();

  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', applyFromLocation);
    window.removeEventListener('popstate', applyFromLocation);
  };
}
