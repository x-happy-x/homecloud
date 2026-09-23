import {useMemo, type ComponentProps, type ReactNode} from 'react';
import {useMutation} from '@tanstack/react-query';
import {REVIEW_KINDS} from '../components/people/PersonCard';
import {useCatalogState} from '../hooks/useCatalogState';
import {startDuplicatesScan, stopDuplicatesScan} from '../services/endpoints/jobs';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import {AnalysisLayout} from '../views/analysis/AnalysisLayout';
import {DuplicatesView} from '../views/duplicates/DuplicatesView';
import {HighlightsView} from '../views/highlights/HighlightsView';
import {PeopleView} from '../views/people/PeopleView';
import {PhotosView} from '../views/photos/PhotosView';
import {ReviewView} from '../views/review/ReviewView';
import {ScanView} from '../views/scan/ScanView';
import {SettingsView} from '../views/settings/SettingsView';
import {TrainingView} from '../views/training/TrainingView';
import {isAnalysisView} from './routes';
import type {PollingStatus} from './usePollingStatus';

type RouterJob = ComponentProps<typeof TrainingView>['job'];

export interface ViewOutletProps {
  status: PollingStatus;
  onOpenGroup(key: string): void;
}

/** Текущий экран. Рисуется ровно один — остальные не держат ни разметку, ни запросы. */
export function ViewOutlet({status, onOpenGroup}: ViewOutletProps) {
  const view = useStore(state => state.view);
  const similar = useStore(state => state.duplicates.similar);
  const toast = useStore(state => state.toast);
  const state = useCatalogState().data;

  const reviewGroups = useMemo(
    () => (state?.groups ?? []).filter(group => REVIEW_KINDS.has(group.kind)),
    [state],
  );

  const refreshDuplicates = () => queryClient.invalidateQueries({queryKey: qk.duplicatesStatus()});
  const scanDuplicates = useMutation({
    mutationFn: () => startDuplicatesScan(similar),
    onSuccess: () => {
      toast('Поиск дубликатов запущен');
      void refreshDuplicates();
    },
  });
  const stopDuplicates = useMutation({
    mutationFn: stopDuplicatesScan,
    onSuccess: () => void refreshDuplicates(),
  });

  const screen = (): ReactNode => {
    switch (view) {
      case 'people':
        return <PeopleView onOpenGroup={onOpenGroup} />;
      case 'photos':
        return <PhotosView />;
      case 'highlights':
        return <HighlightsView />;
      case 'review':
        return <ReviewView groups={reviewGroups} onOpenGroup={onOpenGroup} />;
      case 'training':
        return <TrainingView job={status.router as RouterJob} />;
      case 'scan':
        return <ScanView devices={status.devices} />;
      case 'duplicates':
        return (
          <DuplicatesView
            status={status.duplicates}
            onScan={() => scanDuplicates.mutate()}
            onStop={() => stopDuplicates.mutate()}
          />
        );
      case 'settings':
        return <SettingsView excluded={state?.stats.excluded ?? 0} devices={status.devices} />;
    }
  };

  // Четыре экрана обслуживания живут под общим заголовком «Анализ» с вкладками.
  return isAnalysisView(view)
    ? <AnalysisLayout view={view} devices={status.devices}>{screen()}</AnalysisLayout>
    : screen();
}
