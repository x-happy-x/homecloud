import {useEffect, type ReactNode} from 'react';
import './AnalysisLayout.scss';
import type {AnalysisView} from '../../app/routes';
import {useCachedData} from '../../hooks/useCachedData';
import {useCatalogState} from '../../hooks/useCatalogState';
import type {Device} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {SectionLayout, SectionNav} from '../../ui/SectionNav/SectionNav';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {ANALYSIS_TABS, analysisTabStates} from './tabs';

export interface AnalysisLayoutProps {
  view: AnalysisView;
  /** Список устройств из общего опроса — из него счётчик и точка «идёт работа». */
  devices: Device[] | undefined;
  children: ReactNode;
}

/**
 * Общая обвязка четырёх экранов обслуживания — как у «Настроек»: колонка
 * разделов слева (на телефоне — лента сверху), содержимое справа. В навигации
 * у них один пункт «Анализ».
 */
export function AnalysisLayout({view, devices, children}: AnalysisLayoutProps) {
  const setView = useStore(state => state.setView);
  const setAnalysisTab = useStore(state => state.setAnalysisTab);
  const similar = useStore(state => state.duplicates.similar);
  const dupFilters = useStore(state => state.duplicates.filters);
  const stats = useCatalogState().data?.stats;
  const routerSummary = useCachedData<{pending?: number}>(qk.routerSummary());
  const duplicatePages = useCachedData<{pages: Array<{total: number; summary?: {groups: number}}>}>(
    qk.duplicates(similar, {...dupFilters}));

  // Возврат в «Анализ» открывает раздел, с которого ушли, — в том числе
  // после перезагрузки страницы.
  useEffect(() => setAnalysisTab(view), [view, setAnalysisTab]);

  const states = analysisTabStates({
    review: stats?.review,
    pending: routerSummary?.pending,
    devices,
    duplicates: duplicatePages?.pages[0]?.summary?.groups ?? duplicatePages?.pages[0]?.total,
  });

  return (
    <section className="view active analysis-view">
      <ViewHeader eyebrow="Каталог" title="Анализ" />
      <SectionLayout
        nav={(
          <SectionNav
            label="Разделы анализа"
            active={view}
            items={ANALYSIS_TABS.map(tab => ({
              id: tab.view,
              icon: tab.icon,
              title: tab.label,
              note: tab.note,
              count: states[tab.view].count,
              // Ждут внимания проверка и разметка; ядра и дубликаты — просто число.
              tone: tab.view === 'review' || tab.view === 'training' ? 'attention' : 'quiet',
              running: states[tab.view].running,
            }))}
            onSelect={next => {
              setView(next);
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}
          />
        )}
      >
        {children}
      </SectionLayout>
    </section>
  );
}
