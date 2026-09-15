import {useCallback, useRef, type ReactNode} from 'react';
import {useNativeDialog} from '../../hooks/useNativeDialog';
import {IconButton} from '../IconButton/IconButton';

export interface DialogProps {
  open: boolean;
  onClose(): void;
  /**
   * Просмотрщик и карточка группы закрываются шагом назад по истории, чтобы
   * адрес не разошёлся с тем, что на экране.
   */
  closeThroughHistory?: boolean;
  className?: string;
  children: ReactNode;
}

export function Dialog({open, onClose, closeThroughHistory, className, children}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useNativeDialog(ref, open, {closeThroughHistory, onClose: close});
  return <dialog ref={ref} className={className}>{children}</dialog>;
}

export interface SheetProps {
  title: string;
  eyebrow?: ReactNode;
  note?: ReactNode;
  onClose(): void;
  headActions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Обычная начинка окна: шапка с заголовком и крестиком, тело, подвал. */
export const Sheet = ({
  title, eyebrow, note, onClose, headActions, toolbar, footer, className, children,
}: SheetProps) => (
  <form className={['sheet', className].filter(Boolean).join(' ')} method="dialog">
    <header className="sheet-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {headActions && <div className="sheet-head-actions">{headActions}</div>}
      <IconButton icon="close" label="Закрыть" onClick={onClose} />
    </header>
    {toolbar && <div className="sheet-toolbar">{toolbar}</div>}
    <div className="sheet-body">{children}</div>
    {footer && <div className="form-actions">{footer}</div>}
  </form>
);
