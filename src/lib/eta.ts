import {KEYS, readLocalJson, writeLocalJson} from './storage';

export interface ProfileStore {
  read(): Record<string, number>;
  write(profiles: Record<string, number>): void;
}

const localProfiles: ProfileStore = {
  read: () => readLocalJson<Record<string, number>>(KEYS.etaProfiles, {}),
  write: profiles => writeLocalJson(KEYS.etaProfiles, profiles),
};

/**
 * Запомненные скорости: секунд на снимок для этапа на устройстве и
 * длительность кластеризации на похожем объёме лиц. Живут в браузере и
 * уточняются скользящим средним после каждого замера.
 */
export class EtaBook {
  private readonly profiles: Record<string, number>;

  constructor(private readonly store: ProfileStore = localProfiles) {
    this.profiles = store.read();
  }

  get(key: string): number | undefined {
    return this.profiles[key];
  }

  /** Прежнее значение весит keep, новый замер — остальное. */
  learn(key: string, observed: number, keep: number): number {
    const old = this.profiles[key];
    this.profiles[key] = old ? old * keep + observed * (1 - keep) : observed;
    this.store.write(this.profiles);
    return this.profiles[key];
  }
}

export const etaBook = new EtaBook();
