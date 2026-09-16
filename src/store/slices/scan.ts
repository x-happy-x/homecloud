import type {StateCreator} from 'zustand';
import type {Store} from '../index';

export type ScanFeature =
  | 'faces' | 'visual' | 'ocr' | 'caption' | 'adult' | 'speech' | 'diarize' | 'authenticity';

/** Снимки и ролики обрабатываются порознь: ролик стоит в разы дороже. */
export type MediaKind = 'photos' | 'videos';

export type FeatureFlags = Record<ScanFeature, boolean>;

export const MEDIA_KINDS: MediaKind[] = ['photos', 'videos'];

export const KIND_TITLES: Record<MediaKind, string> = {
  photos: 'Фотографии',
  videos: 'Видео',
};

export const KIND_NOTES: Record<MediaKind, string> = {
  photos: 'Этапы для снимков',
  videos: 'Ролик дороже снимка: этапы для него выбираются отдельно',
};

const NO_FEATURES: FeatureFlags = {
  faces: false, visual: false, ocr: false, caption: false,
  adult: false, speech: false, diarize: false, authenticity: false,
};

/** Что отмечено, когда окно только открылось. */
export const DEFAULT_FEATURES: FeatureFlags = {
  ...NO_FEATURES, faces: true, visual: true,
};

/**
 * Что имеет смысл для каждого вида файлов: речь и разделение голосов бывают
 * только в видео. Остальные этапы умеют и то и другое — у ролика они берут
 * кадры, поэтому и стоят дороже.
 */
export const KIND_FEATURES: Record<MediaKind, ScanFeature[]> = {
  photos: ['faces', 'visual', 'ocr', 'caption', 'adult', 'authenticity'],
  videos: ['faces', 'visual', 'ocr', 'caption', 'adult', 'speech', 'diarize', 'authenticity'],
};

/**
 * Начальный набор для вида файлов. Возможности устройства не заданы — значит
 * спрашивать нечего (обработка выбранных снимков идёт на основном).
 */
export function initialFeatures(
  kind: MediaKind,
  capabilities?: Record<string, boolean>,
): FeatureFlags {
  const flags = {...NO_FEATURES};
  for (const key of KIND_FEATURES[kind]) {
    flags[key] = DEFAULT_FEATURES[key] && (!capabilities || Boolean(capabilities[key]));
  }
  return flags;
}

/** Есть ли вообще что запускать: хоть один этап хоть для одного вида. */
export const anyFeature = (features: Record<MediaKind, FeatureFlags>): boolean =>
  MEDIA_KINDS.some(kind => Object.values(features[kind]).some(Boolean));

export interface ScanSlice {
  scan: {
    /** Устройство, для которого открыто окно задания; null — окно закрыто. */
    deviceId: string | null;
    browsePath: string;
    /** Развёрнутые узлы дерева «что найдено». */
    treeOpen: Set<string>;
    /** Отдельные файлы, взятые из прошлого запуска. */
    selectedPaths: string[];
    features: Record<MediaKind, FeatureFlags>;
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
  setFeatures(kind: MediaKind, features: FeatureFlags): void;
  setScanForce(force: boolean): void;
  setScanVisualModel(model: string): void;
}

export const createScanSlice: StateCreator<Store, [], [], ScanSlice> = set => {
  const patch = (part: Partial<ScanSlice['scan']>) =>
    set(state => ({scan: {...state.scan, ...part}}));

  return {
    scan: {
      deviceId: null, browsePath: '', treeOpen: new Set(), selectedPaths: [],
      features: {photos: initialFeatures('photos'), videos: initialFeatures('videos')},
      force: false, visualModel: '',
    },

    openScan: (deviceId, capabilities, visualModel) => set(state => ({
      scan: {
        deviceId, browsePath: '', treeOpen: new Set(), selectedPaths: [],
        features: {
          photos: initialFeatures('photos', capabilities),
          videos: initialFeatures('videos', capabilities),
        },
        force: false, visualModel,
      },
      selection: {...state.selection, roots: new Set()},
    })),

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

    setFeatures: (kind, features) => set(state => ({
      scan: {...state.scan, features: {...state.scan.features, [kind]: features}},
    })),

    setScanForce: force => patch({force}),
    setScanVisualModel: visualModel => patch({visualModel}),
  };
};
