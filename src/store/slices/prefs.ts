import type {StateCreator} from 'zustand';
import {isAnalysisView, type AnalysisView} from '../../app/routes';
import {KEYS, readLocal, readLocalJson, writeLocal, writeLocalJson} from '../../lib/storage';
import type {AdultMode, ZoomLevel} from '../../types/domain';
import {
  defaultOrder, parseGrouping, toggleCollapse,
  type CollapseRule, type GroupBy, type GroupOrder, type Grouping,
} from '../../views/photos/grouping';
import type {Store} from '../index';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type SidepageTab = 'people' | 'folders' | 'albums' | 'filters';

export interface PrefsSlice {
  prefs: {
    adultMode: AdultMode;
    zoom: ZoomLevel;
    theme: ThemeMode;
    sidepageTab: SidepageTab;
    /** Вкладка «Анализа», на которую возвращает пункт навигации. */
    analysisTab: AnalysisView;
    similarNamedOnly: boolean;
    /** Как делить галерею на группы. */
    grouping: Grouping;
    /** Свёрнутые группы — по виду группировки. */
    collapsed: Record<string, CollapseRule>;
  };
  setAdultMode(mode: AdultMode): void;
  setZoom(zoom: ZoomLevel): void;
  setTheme(theme: ThemeMode): void;
  setSidepageTab(tab: SidepageTab): void;
  setAnalysisTab(tab: AnalysisView): void;
  setSimilarNamedOnly(only: boolean): void;
  setGroupBy(by: GroupBy): void;
  setGroupOrder(order: GroupOrder): void;
  toggleGroup(by: GroupBy, key: string): void;
  /** Свернуть или развернуть все группы текущего вида. */
  setAllGroups(by: GroupBy, collapsed: boolean): void;
}

const savedTheme = (): ThemeMode => {
  const value = readLocal(KEYS.theme);
  return value === 'light' || value === 'dark' ? value : 'auto';
};

// В хранилище может лежать имя экрана, которого уже нет.
const savedAnalysisTab = (): AnalysisView => {
  const value = readLocal(KEYS.analysisTab) ?? '';
  return isAnalysisView(value) ? value : 'review';
};

const savedCollapsed = (): Record<string, CollapseRule> => {
  const value = readLocalJson<Record<string, CollapseRule>>(KEYS.galleryCollapsed, {});
  const rules: Record<string, CollapseRule> = {};
  for (const [by, rule] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (rule && typeof rule.collapsed === 'boolean' && Array.isArray(rule.except)) {
      rules[by] = {collapsed: rule.collapsed, except: rule.except.filter(key => typeof key === 'string')};
    }
  }
  return rules;
};

export const createPrefsSlice: StateCreator<Store, [], [], PrefsSlice> = (set, get) => {
  const patch = (part: Partial<PrefsSlice['prefs']>) =>
    set(state => ({prefs: {...state.prefs, ...part}}));
  const saveGrouping = (grouping: Grouping) => {
    writeLocalJson(KEYS.galleryGrouping, grouping);
    patch({grouping});
  };
  const saveCollapsed = (collapsed: Record<string, CollapseRule>) => {
    writeLocalJson(KEYS.galleryCollapsed, collapsed);
    patch({collapsed});
  };

  return {
    prefs: {
      adultMode: (readLocal(KEYS.adultMode) as AdultMode) || 'explicit',
      zoom: (readLocal(KEYS.zoom) as ZoomLevel) || 'medium',
      theme: savedTheme(),
      sidepageTab: (readLocal(KEYS.sidepageTab) as SidepageTab) || 'people',
      analysisTab: savedAnalysisTab(),
      similarNamedOnly: false,
      grouping: parseGrouping(readLocalJson(KEYS.galleryGrouping, null)),
      collapsed: savedCollapsed(),
    },

    setAdultMode: mode => { writeLocal(KEYS.adultMode, mode); patch({adultMode: mode}); },
    setZoom: zoom => { writeLocal(KEYS.zoom, zoom); patch({zoom}); },
    setTheme: theme => { writeLocal(KEYS.theme, theme); patch({theme}); },
    setSidepageTab: tab => { writeLocal(KEYS.sidepageTab, tab); patch({sidepageTab: tab}); },
    setAnalysisTab: tab => { writeLocal(KEYS.analysisTab, tab); patch({analysisTab: tab}); },
    setSimilarNamedOnly: only => patch({similarNamedOnly: only}),
    // У нового вида свой естественный порядок: папки по названию, дни — свежие сверху.
    setGroupBy: by => saveGrouping(parseGrouping({by, order: defaultOrder(by)})),
    setGroupOrder: order => saveGrouping(parseGrouping({...get().prefs.grouping, order})),
    toggleGroup: (by, key) => saveCollapsed(toggleCollapse(get().prefs.collapsed, by, key)),
    setAllGroups: (by, collapsed) => saveCollapsed({...get().prefs.collapsed, [by]: {collapsed, except: []}}),
  };
};
