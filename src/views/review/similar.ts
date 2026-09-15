/** Насколько модель уверена, что это один и тот же человек. */
export type SimilarTone = 'same' | 'close' | 'kin' | 'far';

/**
 * Пороги подобраны на реальном архиве. Важно помнить, что модель отвечает на
 * вопрос «один ли это человек», а не «родственники ли»: у разных людей
 * значения близки к нулю даже при сильном семейном сходстве.
 */
export const similarTone = (score: number): SimilarTone =>
  score >= 0.62 ? 'same' : score >= 0.5 ? 'close' : score >= 0.38 ? 'kin' : 'far';

export interface SimilarGroup {
  key: string;
  title: string;
  count: number;
  kind?: 'person' | 'auto' | string;
  name?: string | null;
  bigfam_id?: number | null;
  avatar?: string | null;
}

export interface SimilarPair {
  a: SimilarGroup;
  b: SimilarGroup;
  score: number;
  verdict: string;
}

/**
 * Куда вливать при объединении: в того, у кого уже есть имя, а если имя есть
 * у обоих — в того, где лиц больше. Две безымянные группы сливать не во что.
 */
export function mergeTarget(first: SimilarGroup, second: SimilarGroup): SimilarGroup | null {
  const named = [first, second].filter(item => item.kind === 'person');
  if (!named.length) return null;
  if (named.length === 2) return first.count >= second.count ? first : second;
  return named[0];
}
