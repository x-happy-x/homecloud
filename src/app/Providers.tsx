import {useEffect, useLayoutEffect, type ReactNode} from 'react';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '../services/queryClient';
import {useStore} from '../store';
import {startHashSync} from '../store/hashSync';

/** Всё, что живёт выше экранов: кэш запросов, синхронизация с адресом и тема. */
export function Providers({children}: {children: ReactNode}) {
  const theme = useStore(state => state.prefs.theme);

  // startHashSync возвращает отписку: в StrictMode эффект выполняется дважды,
  // и без неё слушатели hashchange удвоились бы.
  useEffect(() => startHashSync(), []);

  // До отрисовки — иначе при ручной теме страница мигнула бы системной.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }, [theme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
