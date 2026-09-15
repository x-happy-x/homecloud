import {ICON_PATHS, ICON_RECTS, type IconName} from './paths';

export type {IconName};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

const isRect = (name: IconName): name is keyof typeof ICON_RECTS => name in ICON_RECTS;

export function Icon({name, size, className}: IconProps) {
  const style = size ? {width: size, height: size} : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}>
      {isRect(name)
        ? ICON_RECTS[name].map(([x, y, width, height, rx], index) => (
            <rect key={index} x={x} y={y} width={width} height={height} rx={rx} />
          ))
        : <path d={ICON_PATHS[name as keyof typeof ICON_PATHS]} />}
    </svg>
  );
}
