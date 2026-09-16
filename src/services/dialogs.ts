import {create} from 'zustand';

export interface AppDialogRequest {
  id: number;
  kind: 'confirm' | 'prompt' | 'progress';
  title: string;
  message: string;
  initialValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  progress?: number | null;
  resolve(value: string | boolean | null): void;
}

export const useAppDialogs = create<{queue: AppDialogRequest[]}>(() => ({queue: []}));
let sequence = 0;

function enqueue(request: Omit<AppDialogRequest, 'id'>) {
  const id = ++sequence;
  useAppDialogs.setState(state => ({queue: [...state.queue, {...request, id}]}));
  return id;
}

/** Закрытие привязано к id: запоздалое событие close не закроет следующее окно. */
export function closeAppDialog(id: number, value: string | boolean | null = null) {
  const request = useAppDialogs.getState().queue.find(item => item.id === id);
  if (!request) return;
  useAppDialogs.setState(state => ({queue: state.queue.filter(item => item.id !== id)}));
  request.resolve(value);
}

export function confirmAction(message: string, options: {title?: string; confirmLabel?: string; danger?: boolean} = {}): Promise<boolean> {
  return new Promise(resolve => enqueue({
    kind: 'confirm', title: options.title ?? 'Подтверждение', message, ...options,
    resolve: value => resolve(value === true),
  }));
}

export function promptText(message: string, initialValue = ''): Promise<string | null> {
  return new Promise(resolve => enqueue({
    kind: 'prompt', title: initialValue ? 'Переименовать альбом' : 'Новый альбом', message, initialValue,
    confirmLabel: 'Сохранить', resolve: value => resolve(typeof value === 'string' ? value : null),
  }));
}

export function showProgressDialog(title: string, message: string) {
  const controller = new AbortController();
  const id = enqueue({kind: 'progress', title, message, progress: null,
    resolve: value => { if (value !== true) controller.abort(); },
  });
  return {
    signal: controller.signal,
    update(message: string, progress: number | null) {
      useAppDialogs.setState(state => ({queue: state.queue.map(item =>
        item.id === id ? {...item, message, progress} : item)}));
    },
    close: () => closeAppDialog(id, true),
  };
}
