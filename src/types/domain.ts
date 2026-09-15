/** Режим показа снимков 18+ — выбирается в настройках, живёт в localStorage. */
export type AdultMode =
  | 'explicit'  // замыливать интимное
  | 'regions'   // замыливать обнажённое
  | 'full'      // замыливать кадр целиком
  | 'strict'    // замыливать ещё и непроверенные
  | 'hide'      // не показывать такие снимки совсем
  | 'show';     // показывать как есть

/** Оценка этапа 18+. `unknown` — этап ещё не смотрел этот кадр. */
export type AdultRating = 'safe' | 'unknown' | 'sensitive' | 'explicit' | 'questionable' | string;

export type PhotoKind = 'photo' | 'video';

export type ZoomLevel = 'small' | 'medium' | 'large';

export interface Photo {
  path: string;
  /** Базовый адрес уменьшенной копии, уже с «?path=…» — размер дописывается сверху. */
  preview: string;
  video?: string;
  kind?: PhotoKind;
  /** Время файла в миллисекундах. */
  taken?: number | null;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  adult_rating?: AdultRating | null;
  blurry?: boolean;
  hidden?: boolean;
}
