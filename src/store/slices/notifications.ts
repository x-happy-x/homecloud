import type {StateCreator} from 'zustand';
import {KEYS, readLocalJson, writeLocalJson} from '../../lib/storage';
import type {Store} from '../index';

export type NotifLevel = 'info' | 'success' | 'error';

export interface JobStep {
  title: string;
  detail?: string;
  state: 'done' | 'active' | 'waiting';
}

export interface NotifData {
  kind: 'toast' | 'job';
  title: string;
  sub?: string;
  level: NotifLevel;
  /** Доля от 0 до 1; null — прогресс без известной доли. */
  progress?: number | null;
  spinning?: boolean;
  steps?: JobStep[];
  canStop?: boolean;
  onStop?: () => void;
}

export interface HistoryEntry {
  kind: 'toast' | 'job';
  title: string;
  level: NotifLevel;
  message?: string;
  at: number;
}

/** Больше трёх карточек в углу — уже стена; остальные ждут очереди. */
const MAX_VISIBLE = 3;
const TOAST_LIFETIME_MS = 5000;
const HISTORY_LIMIT = 50;

export interface NotificationsSlice {
  notifications: {
    history: HistoryEntry[];
    unseen: number;
    panelOpen: boolean;
    /** Идущие сейчас фоновые задачи — секция «Сейчас» в панели. */
    jobs: Map<string, NotifData>;
    /** Развёрнутые списки шагов. */
    expanded: Set<string>;
    /** Карточки в углу: данные, показанные, очередь и закрытые руками. */
    floating: Map<string, NotifData>;
    visible: string[];
    queue: string[];
    dismissed: Set<string>;
  };
  toast(message: string, level?: NotifLevel): void;
  setJob(id: string, data: Omit<NotifData, 'kind'>): void;
  finishJob(id: string, result: {title: string; level: NotifLevel; message?: string}): void;
  dismissFloating(id: string): void;
  toggleJobExpanded(id: string): void;
  openNotifPanel(): void;
  closeNotifPanel(): void;
  clearHistory(): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const createNotificationsSlice: StateCreator<Store, [], [], NotificationsSlice> =
  (set, get) => {
    const patch = (part: Partial<NotificationsSlice['notifications']>) =>
      set(state => ({notifications: {...state.notifications, ...part}}));

    const pushHistory = (entry: Omit<HistoryEntry, 'at'>) => {
      const current = get().notifications;
      const history = [...current.history, {...entry, at: Date.now()}].slice(-HISTORY_LIMIT);
      writeLocalJson(KEYS.taskHistory, history);
      patch({history, unseen: current.panelOpen ? current.unseen : current.unseen + 1});
    };

    /** Та же очередь, что и в старом стеке: показываем до трёх, лишнее ждёт. */
    const showFloating = (id: string, data: NotifData) => {
      const current = get().notifications;
      const floating = new Map(current.floating).set(id, data);
      if (current.dismissed.has(id)) { patch({floating}); return; }
      if (current.visible.includes(id) || current.queue.includes(id)) { patch({floating}); return; }
      if (current.visible.length < MAX_VISIBLE) {
        patch({floating, visible: [...current.visible, id]});
        if (data.kind === 'toast') {
          clearTimeout(timers.get(id));
          timers.set(id, setTimeout(() => get().dismissFloating(id), TOAST_LIFETIME_MS));
        }
      } else {
        patch({floating, queue: [...current.queue, id]});
      }
    };

    return {
      notifications: {
        history: readLocalJson<HistoryEntry[]>(KEYS.taskHistory, []),
        unseen: 0,
        panelOpen: false,
        jobs: new Map(),
        expanded: new Set(),
        floating: new Map(),
        visible: [],
        queue: [],
        dismissed: new Set(),
      },

      toast: (message, level = 'info') => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        pushHistory({kind: 'toast', title: message, level});
        showFloating(id, {kind: 'toast', title: message, level, steps: []});
      },

      setJob: (id, data) => {
        const jobs = new Map(get().notifications.jobs).set(id, {...data, kind: 'job'});
        patch({jobs});
        showFloating(id, {...data, kind: 'job'});
      },

      // Задача кончилась, но карточка в углу остаётся: пользователь закрывает
      // её сам, когда заметил результат — это его прямая просьба.
      finishJob: (id, {title, level, message}) => {
        const current = get().notifications;
        const jobs = new Map(current.jobs);
        jobs.delete(id);
        const expanded = new Set(current.expanded);
        expanded.delete(id);
        patch({jobs, expanded});
        pushHistory({kind: 'job', title, level, message});
        showFloating(id, {kind: 'job', title, sub: message, level, steps: [], canStop: false});
      },

      dismissFloating: id => {
        clearTimeout(timers.get(id));
        timers.delete(id);
        const current = get().notifications;
        const queue = current.queue.filter(item => item !== id);
        const visible = current.visible.filter(item => item !== id);
        const dismissed = new Set(current.dismissed).add(id);
        // Освободилось место — поднимаем следующего из очереди.
        while (visible.length < MAX_VISIBLE && queue.length) {
          const next = queue.shift()!;
          if (dismissed.has(next) || !current.floating.has(next)) continue;
          visible.push(next);
          const data = current.floating.get(next)!;
          if (data.kind === 'toast') {
            timers.set(next, setTimeout(() => get().dismissFloating(next), TOAST_LIFETIME_MS));
          }
        }
        patch({queue, visible, dismissed});
      },

      toggleJobExpanded: id => set(state => {
        const expanded = new Set(state.notifications.expanded);
        expanded.has(id) ? expanded.delete(id) : expanded.add(id);
        return {notifications: {...state.notifications, expanded}};
      }),

      openNotifPanel: () => patch({panelOpen: true, unseen: 0}),
      closeNotifPanel: () => patch({panelOpen: false}),

      clearHistory: () => {
        writeLocalJson(KEYS.taskHistory, []);
        patch({history: []});
      },
    };
  };
