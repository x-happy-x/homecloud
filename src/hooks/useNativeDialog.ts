import {useEffect, type RefObject} from 'react';

export interface NativeDialogOptions {
  /**
   * Esc закрывает окно сам, но у просмотрщика и карточки группы адрес
   * должен остаться согласованным, поэтому они закрываются через историю.
   */
  closeThroughHistory?: boolean;
  closeOnBackdrop?: boolean;
  onClose(): void;
}

/**
 * Управление нативным <dialog>. Атрибут open ставить нельзя: тогда окно
 * будет немодальным, без подложки и без ловушки фокуса.
 */
export function useNativeDialog(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  {closeThroughHistory = false, closeOnBackdrop = true, onClose}: NativeDialogOptions,
): void {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [ref, open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const cancel = (event: Event) => {
      if (!closeThroughHistory) return;
      event.preventDefault();
      // Окно, открытое прямо по ссылке, своего шага в истории не имеет:
      // назад увело бы со страницы, поэтому такое закрываем как обычно.
      if ((history.state as {overlay?: boolean} | null)?.overlay) history.back();
      else onClose();
    };
    const closed = () => onClose();
    // Клик мимо содержимого: цель события — сам <dialog>, а не его начинка.
    const backdrop = (event: MouseEvent) => {
      if (closeOnBackdrop && event.target === dialog) onClose();
    };

    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('close', closed);
    dialog.addEventListener('click', backdrop);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('close', closed);
      dialog.removeEventListener('click', backdrop);
    };
  }, [ref, closeThroughHistory, closeOnBackdrop, onClose]);
}
