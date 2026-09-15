import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type ScanFeature =
  | 'faces' | 'visual' | 'ocr' | 'caption' | 'adult' | 'speech' | 'diarize' | 'authenticity';

export const DEFAULT_FEATURES: Record<ScanFeature, boolean> = {
  faces: true, visual: true, ocr: false, caption: false,
  adult: false, speech: false, diarize: false, authenticity: false,
};

export interface ScanSlice {
  scan: {
    deviceId: string | null;
    browsePath: string;
    /** Развёрнутые узлы дерева «что найдено». */
    treeOpen: Set<string>;
    selectedPaths: string[];
    features: Record<ScanFeature, boolean>;
    /** Идёт опись: кнопку сбора держим выключенной. */
    inventoryRunning: boolean;
    /** Устройство, чья задача показана в баннере наверху. */
    activeProcessingId: string;
  };
  setScanDevice(id: string | null): void;
  setBrowsePath(path: string): void;
  toggleTreeNode(path: string): void;
  setSelectedPaths(paths: string[]): void;
  toggleFeature(feature: ScanFeature): void;
  setFeatures(features: Partial<Record<ScanFeature, boolean>>): void;
  setInventoryRunning(running: boolean): void;
  setActiveProcessing(id: string): void;
}

export const createScanSlice: StateCreator<Store, [], [], ScanSlice> = set => {
  const patch = (part: Partial<ScanSlice['scan']>) =>
    set(state => ({scan: {...state.scan, ...part}}));

  return {
    scan: {
      deviceId: null, browsePath: '', treeOpen: new Set(), selectedPaths: [],
      features: {...DEFAULT_FEATURES}, inventoryRunning: false, activeProcessingId: '',
    },

    setScanDevice: deviceId => patch({deviceId}),
    setBrowsePath: browsePath => patch({browsePath}),

    toggleTreeNode: path => set(state => {
      const treeOpen = new Set(state.scan.treeOpen);
      treeOpen.has(path) ? treeOpen.delete(path) : treeOpen.add(path);
      return {scan: {...state.scan, treeOpen}};
    }),

    setSelectedPaths: selectedPaths => patch({selectedPaths}),

    toggleFeature: feature => set(state => ({
      scan: {
        ...state.scan,
        features: {...state.scan.features, [feature]: !state.scan.features[feature]},
      },
    })),

    setFeatures: features => set(state => ({
      scan: {...state.scan, features: {...state.scan.features, ...features}},
    })),

    setInventoryRunning: inventoryRunning => patch({inventoryRunning}),
    setActiveProcessing: activeProcessingId => patch({activeProcessingId}),
  };
};
