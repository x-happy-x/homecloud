import type {StateCreator} from 'zustand';
import {KEYS, readLocal, writeLocal} from '../../lib/storage';
import type {AdultMode, ZoomLevel} from '../../types/domain';
import type {Store} from '../index';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type SidepageTab = 'people' | 'folders' | 'albums' | 'filters';

export interface PrefsSlice {
  prefs: {
    adultMode: AdultMode;
    zoom: ZoomLevel;
    theme: ThemeMode;
    sidepageTab: SidepageTab;
    similarNamedOnly: boolean;
  };
  setAdultMode(mode: AdultMode): void;
  setZoom(zoom: ZoomLevel): void;
  setTheme(theme: ThemeMode): void;
  setSidepageTab(tab: SidepageTab): void;
  setSimilarNamedOnly(only: boolean): void;
}

const savedTheme = (): ThemeMode => {
  const value = readLocal(KEYS.theme);
  return value === 'light' || value === 'dark' ? value : 'auto';
};

export const createPrefsSlice: StateCreator<Store, [], [], PrefsSlice> = set => {
  const patch = (part: Partial<PrefsSlice['prefs']>) =>
    set(state => ({prefs: {...state.prefs, ...part}}));

  return {
    prefs: {
      adultMode: (readLocal(KEYS.adultMode) as AdultMode) || 'explicit',
      zoom: (readLocal(KEYS.zoom) as ZoomLevel) || 'medium',
      theme: savedTheme(),
      sidepageTab: (readLocal(KEYS.sidepageTab) as SidepageTab) || 'people',
      similarNamedOnly: false,
    },

    setAdultMode: mode => { writeLocal(KEYS.adultMode, mode); patch({adultMode: mode}); },
    setZoom: zoom => { writeLocal(KEYS.zoom, zoom); patch({zoom}); },
    setTheme: theme => { writeLocal(KEYS.theme, theme); patch({theme}); },
    setSidepageTab: tab => { writeLocal(KEYS.sidepageTab, tab); patch({sidepageTab: tab}); },
    setSimilarNamedOnly: only => patch({similarNamedOnly: only}),
  };
};
