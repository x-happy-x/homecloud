export interface ProgressProps {
  /** Доля от 0 до 1. Не задана — полоса без известной доли. */
  value?: number | null;
  className?: string;
}

/**
 * Одна полоса на все места: раньше их было пять разных реализаций. Ширина
 * ставится через style, то есть через CSSOM — на него, в отличие от
 * встроенного в разметку style="...", политика безопасности не действует.
 */
export function Progress({value, className}: ProgressProps) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const width = known ? `${Math.min(100, Math.max(0, value! * 100))}%` : undefined;
  return (
    <div className={['progress-track', known ? '' : 'indeterminate', className]
      .filter(Boolean).join(' ')}>
      <span style={width ? {width} : undefined} />
    </div>
  );
}
