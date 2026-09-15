import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type ScanFeature =
  | 'faces' | 'visual' | 'ocr' | 'caption' | 'adult' | 'speech' | 'diarize' | 'authenticity';

export const DEFAULT_FEATURES: Record<ScanFeature, boolean> = {
  faces: true, visual: true, ocr: false, caption: false,
  adult: false, speech: false, diarize: false, authenticity: false,
};

/** Этапы, которые предлагает окно задания на устройстве. */
export const SCAN_DIALOG_FEATURES: ScanFeature[] = ['faces', 'visual', 'ocr', 'caption', 'adult'];

export interface ScanSlice {
  scan: {
    /** Устройство, для которого открыто окно задания; null — окно закрыто. */
    deviceId: string | null;
    browsePath: string;
    /** Развёрнутые узлы дерева «что найдено». */
    treeOpen: Set<string>;
    /** Отдельные файлы, взятые из прошлого запуска. */
    selectedPaths: string[];
    features: Record<ScanFeature, boolean>;
    force: boolean;
    visualModel: string;
  };
  /** Открыть окно задания: всё с чистого листа, этапы — по возможностям устройства. */
  openScan(deviceId: string, capabilities: Record<string, boolean>, visualModel: string): void;
  closeScan(): void;
  setBrowsePath(path: string): void;
  toggleTreeNode(path: string): void;
  openTreeNodes(paths: string[]): void;
  setSelectedPaths(paths: string[]): void;
  setFeatures(features: Record<ScanFeature, boolean>): void;
  setScanForce(force: boolean): void;
  setScanVisualModel(model: string): void;
}

export const createScanSlice: StateCreator<Store, [], [], ScanSlice> = set => {
  const patch = (part: Partial<ScanSlice['scan']>) =>
    set(state => ({scan: {...state.scan, ...part}}));

  return {
    scan: {
      deviceId: null, browsePath: '', treeOpen: new Set(), selectedPaths: [],
      features: {...DEFAULT_FEATURES}, force: false, visualModel: '',
    },

    openScan: (deviceId, capabilities, visualModel) => set(state => {
      const features = {...DEFAULT_FEATURES};
      for (const key of Object.keys(features) as ScanFeature[]) {
        if (!capabilities[key]) features[key] = false;
      }
      return {
        scan: {
          deviceId, browsePath: '', treeOpen: new Set(), selectedPaths: [],
          features, force: false, visualModel,
        },
        selection: {...state.selection, roots: new Set()},
      };
    }),

    closeScan: () => patch({deviceId: null}),
    setBrowsePath: browsePath => patch({browsePath}),

    toggleTreeNode: path => set(state => {
      const treeOpen = new Set(state.scan.treeOpen);
      treeOpen.has(path) ? treeOpen.delete(path) : treeOpen.add(path);
      return {scan: {...state.scan, treeOpen}};
    }),

    openTreeNodes: paths => set(state => ({
      scan: {...state.scan, treeOpen: new Set([...state.scan.treeOpen, ...paths])},
    })),

    setSelectedPaths: selectedPaths => patch({selectedPaths}),
    setFeatures: features => patch({features}),
    setScanForce: force => patch({force}),
    setScanVisualModel: visualModel => patch({visualModel}),
  };
};
