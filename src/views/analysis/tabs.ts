import type {AnalysisView} from '../../app/routes';
import type {IconName} from '../../ui/Icon/Icon';

export interface AnalysisTabSpec {
  view: AnalysisView;
  icon: IconName;
  label: string;
  /** Строка под названием: что именно на этом экране. */
  note: string;
}

/** Порядок вкладок внутри «Анализа». */
export const ANALYSIS_TABS: AnalysisTabSpec[] = [
  {view: 'review', icon: 'review', label: 'Проверка', note: 'Шум и спорные группы лиц'},
  {view: 'training', icon: 'training', label: 'Обучение', note: 'Разметка и версии модели'},
  {view: 'scan', icon: 'scan', label: 'Сканирование', note: 'Задания и ход по ядрам'},
  {view: 'duplicates', icon: 'duplicates', label: 'Дубликаты', note: 'Повторы и лишние копии'},
];

/** Устройство глазами навигации: в сети ли оно и занято ли работой. */
export interface DeviceFact {
  online?: boolean;
  job?: {active?: boolean};
}

export interface AnalysisFacts {
  /** Непроверенные группы лиц. */
  review?: number;
  /** Очередь разметки роутера. */
  pending?: number;
  devices?: DeviceFact[];
  /** Найденные группы дубликатов. */
  duplicates?: number;
}

export interface AnalysisTabState {
  /** Не задан — считать нечего или ещё не посчитано; прочерк не рисуем. */
  count?: number;
  running: boolean;
}

/**
 * Счётчики вкладок. Число появляется, только когда оно известно и не ноль:
 * до первого открытия экрана его данных просто нет, и раньше на этом месте в
 * навигации висел прочерк.
 */
export function analysisTabStates(facts: AnalysisFacts): Record<AnalysisView, AnalysisTabState> {
  const devices = facts.devices;
  const online = devices?.filter(device => device.online).length;
  return {
    review: {count: facts.review || undefined, running: false},
    training: {count: facts.pending || undefined, running: false},
    scan: {
      count: online || undefined,
      running: devices?.some(device => device.job?.active) ?? false,
    },
    duplicates: {count: facts.duplicates || undefined, running: false},
  };
}
