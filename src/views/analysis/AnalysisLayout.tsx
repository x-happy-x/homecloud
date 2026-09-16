import {useEffect, type ReactNode} from 'react';
import './AnalysisLayout.scss';
import type {AnalysisView} from '../../app/routes';
import {useCachedData} from '../../hooks/useCachedData';
import {useCatalogState} from '../../hooks/useCatalogState';
import type {Device} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {SegmentNav} from '../../ui/SegmentNav/SegmentNav';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {ANALYSIS_TABS, analysisTabStates} from './tabs';

export interface AnalysisLayoutProps {
  view: AnalysisView;
  /** Список устройств из общего опроса — из него счётчик и точка «идёт работа». */
  devices: Device[] | undefined;
  children: ReactNode;
}

/**
 * Общая обвязка четырёх экранов обслуживания: заголовок и вкладки. В навигации
 * у них один пункт, поэтому переключаются они здесь, а не в боковой панели.
 */
export function AnalysisLayout({view, devices, children}: AnalysisLayoutProps) {
  const setView = useStore(state => state.setView);
  const setAnalysisTab = useStore(state => state.setAnalysisTab);
  const similar = useStore(state => state.duplicates.similar);
  const stats = useCatalogState().data?.stats;
  const routerSummary = useCachedData<{pending?: number}>(qk.routerSummary());
  const duplicatePages = useCachedData<{pages: Array<{total: number}>}>(qk.duplicates(similar));

  // Возврат в «Анализ» открывает ту вкладку, с которой ушли, — в том числе
  // после перезагрузки страницы.
  useEffect(() => setAnalysisTab(view), [view, setAnalysisTab]);

  const states = analysisTabStates({
    review: stats?.review,
    pending: routerSummary?.pending,
    devices,
    duplicates: duplicatePages?.pages[0]?.total,
  });

  return (
    <section className="view active">
      <ViewHeader eyebrow="Обслуживание каталога" title="Анализ" />

      <SegmentNav
        label="Разделы анализа"
        active={view}
        items={ANALYSIS_TABS.map(tab => ({
          id: tab.view,
          icon: tab.icon,
          label: tab.label,
          note: tab.note,
          count: states[tab.view].count,
          running: states[tab.view].running,
        }))}
        onSelect={next => {
          setView(next);
          window.scrollTo({top: 0, behavior: 'smooth'});
        }}
      />

      {children}
    </section>
  );
}
