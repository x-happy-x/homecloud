import {useEffect, useMemo, useState} from 'react';
import './YearScrubber.scss';
import type {PhotoGroup} from '../../types/api';
import {GROUP_NONE} from './grouping';

/** Больше подписей не влезает по высоте — лишние годы остаются чёрточками. */
const MAX_LABELS = 14;
/** Высота липкой верхней панели: группа под ней считается ушедшей. */
const TOP_OFFSET = 96;

export interface ScrubberYear {
  year: string;
  /** Первая группа года — к ней прокручивает щелчок. */
  key: string;
}

/** Годы по группам дат в порядке галереи (ключи 2024, 2024-05, 2024-05-17). */
export function scrubberYears(groups: Pick<PhotoGroup, 'key'>[]): ScrubberYear[] {
  const years: ScrubberYear[] = [];
  const seen = new Set<string>();
  for (const {key} of groups) {
    if (key === GROUP_NONE || !/^\d{4}/.test(key)) continue;
    const year = key.slice(0, 4);
    if (seen.has(year)) continue;
    seen.add(year);
    years.push({year, key});
  }
  return years;
}

/** Каждый какой год подписывать, чтобы подписей было не больше MAX_LABELS. */
export const labelStep = (count: number): number => Math.max(1, Math.ceil(count / MAX_LABELS));

const groupNode = (key: string) =>
  document.querySelector<HTMLElement>(`.gallery-group[data-group="${CSS.escape(key)}"]`);

/**
 * Шкала лет справа от галереи с группами по датам: щелчок прокручивает к году,
 * текущий год подсвечен по тому, какая группа сейчас под верхней панелью.
 */
export function YearScrubber({groups}: {groups: Pick<PhotoGroup, 'key'>[]}) {
  const years = useMemo(() => scrubberYears(groups), [groups]);
  const [current, setCurrent] = useState('');

  useEffect(() => {
    if (years.length < 2) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let found = years[0].year;
      for (const node of document.querySelectorAll<HTMLElement>('.gallery-group[data-group]')) {
        if (node.getBoundingClientRect().top > TOP_OFFSET + 8) break;
        const key = node.dataset.group ?? '';
        if (/^\d{4}/.test(key)) found = key.slice(0, 4);
      }
      setCurrent(found);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [years]);

  if (years.length < 2) return null;
  const step = labelStep(years.length);

  const jump = (key: string) => {
    const node = groupNode(key);
    if (!node) return;
    window.scrollTo({top: window.scrollY + node.getBoundingClientRect().top - TOP_OFFSET, behavior: 'smooth'});
  };

  return (
    <nav className="year-scrubber" aria-label="Годы">
      {years.map((item, index) => {
        const labelled = index % step === 0 || item.year === current;
        return (
          <button
            key={item.year}
            type="button"
            className={`${labelled ? 'labelled' : ''}${item.year === current ? ' current' : ''}`}
            title={item.year}
            aria-label={item.year}
            aria-current={item.year === current ? 'true' : undefined}
            onClick={() => jump(item.key)}
          >
            {labelled && <span>{item.year}</span>}
          </button>
        );
      })}
    </nav>
  );
}
