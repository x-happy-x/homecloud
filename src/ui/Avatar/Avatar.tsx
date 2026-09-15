import {useEffect, useState} from 'react';

export interface AvatarProps {
  /**
   * Цепочка источников по убыванию предпочтения: портрет из картотеки →
   * закреплённый кадр → первое найденное лицо. Когда всё отвалилось,
   * остаётся буква.
   */
  srcs: Array<string | null | undefined>;
  /** Имя, из которого берётся буква-заглушка. */
  name?: string | null;
  className?: string;
  letterClassName?: string;
}

export function Avatar({srcs, name, className, letterClassName = 'person-letter'}: AvatarProps) {
  const sources = srcs.filter((src): src is string => Boolean(src));
  const [index, setIndex] = useState(0);

  // Сменился человек — начинаем цепочку заново.
  useEffect(() => setIndex(0), [sources.join('|')]);

  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (index >= sources.length) {
    return <span className={letterClassName} aria-hidden="true">{letter}</span>;
  }
  return (
    <img
      className={className}
      src={sources[index]}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIndex(current => current + 1)}
    />
  );
}
