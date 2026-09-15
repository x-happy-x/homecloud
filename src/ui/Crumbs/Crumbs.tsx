export interface Crumb {
  label: string;
  onClick?(): void;
}

export interface CrumbsProps {
  items: Crumb[];
  className?: string;
}

/** Путь по папкам или альбомам; последний шаг обычно без обработчика. */
export const Crumbs = ({items, className = 'crumbs'}: CrumbsProps) => (
  <div className={className}>
    {items.map((item, index) => (
      <span key={`${item.label}-${index}`}>
        {index > 0 && <i aria-hidden="true">/</i>}
        <button type="button" className="crumb" onClick={item.onClick} disabled={!item.onClick}>
          {item.label}
        </button>
      </span>
    ))}
  </div>
);
