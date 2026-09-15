import type {Photo} from '../types/domain';

/**
 * Кадр, который этап 18+ признал откровенным. `sensitive` сюда не входит
 * намеренно: это «слегка пикантное», его не замыливают.
 */
export const adultFlag = (photo: Pick<Photo, 'adult_rating'>): boolean =>
  Boolean(photo.adult_rating && !['safe', 'unknown', 'sensitive'].includes(photo.adult_rating));

/** Этап 18+ этот кадр ещё не смотрел. */
export const unchecked = (photo: Pick<Photo, 'adult_rating'>): boolean =>
  !photo.adult_rating || photo.adult_rating === 'unknown';
