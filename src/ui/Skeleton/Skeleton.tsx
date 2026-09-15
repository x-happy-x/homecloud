export interface SkeletonProps {
  count: number;
  variant?: 'tile' | 'photo';
}

/** Заглушки на время загрузки — чтобы сетка не прыгала, когда придут данные. */
export const Skeleton = ({count, variant = 'tile'}: SkeletonProps) => (
  <>
    {Array.from({length: count}, (_, index) => (
      <div key={index} className={`skeleton ${variant}`} />
    ))}
  </>
);
