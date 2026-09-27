import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import './FitName.scss';
import {nameVariants} from '../../lib/format';

export interface FitNameProps {
  name: string | null | undefined;
  kin?: {first?: string; last?: string; middle?: string} | null;
  className?: string;
}

let canvas: HTMLCanvasElement | null = null;

/** Ширина строки тем же шрифтом, что у элемента, — без перерисовки страницы. */
function textWidth(text: string, style: CSSStyleDeclaration): number {
  canvas ??= document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = parseFloat(style.letterSpacing) || 0;
  return context.measureText(text).width + spacing * text.length;
}

/**
 * ФИО в одну строку: полностью, если влезает; иначе отчество инициалом,
 * потом и фамилия инициалом; не влезло и так — многоточие. Полное имя — в
 * подсказке. Пересчитывается при смене ширины и когда догрузится шрифт.
 */
export function FitName({name, kin, className}: FitNameProps) {
  const variants = useMemo(() => nameVariants(name, kin), [name, kin?.first, kin?.last, kin?.middle]);
  const ref = useRef<HTMLSpanElement>(null);
  const [pick, setPick] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const width = node.clientWidth;
      if (!width) return;
      const style = getComputedStyle(node);
      const index = variants.findIndex(variant => textWidth(variant, style) <= width + 0.5);
      setPick(index < 0 ? variants.length - 1 : index);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts?.ready.then(measure);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [variants]);

  return (
    <span ref={ref} className={['fit-name', className].filter(Boolean).join(' ')} title={variants[0]}>
      {variants[Math.min(pick, variants.length - 1)]}
    </span>
  );
}
