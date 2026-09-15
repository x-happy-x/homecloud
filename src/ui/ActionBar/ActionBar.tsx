import type {ReactNode} from 'react';
import {Button} from '../Button/Button';

export interface ActionBarProps {
  count: number;
  /** Подпись с числом: «7 выбрано», «3 группы». */
  countLabel: string;
  actions: ReactNode;
  /** Не задан — кнопки «Снять выбор» нет: на дубликатах снимать нечего. */
  onClear?(): void;
  /** Панель выделения снимков липнет к верху, а не всплывает снизу. */
  variant?: 'floating' | 'sticky';
}

/**
 * Одна панель выделения на все экраны: раньше «посчитать выбранное, показать
 * полоску, снять выбор» было переписано четыре раза подряд.
 */
export function ActionBar({count, countLabel, actions, onClear, variant = 'floating'}: ActionBarProps) {
  const clear = onClear ? <Button small onClick={onClear}>Снять выбор</Button> : null;
  if (variant === 'sticky') {
    return count > 0 ? (
      <div className="photo-action-bar">
        <strong>{countLabel}</strong>
        {actions}
        {clear}
      </div>
    ) : null;
  }
  return (
    <div className={`action-bar${count > 0 ? ' show' : ''}`} role="region" aria-label="Действия с выбранным">
      <span className="count">{countLabel}</span>
      {actions}
      {clear}
    </div>
  );
}
