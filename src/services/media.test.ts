import {expect, test} from 'vitest';
import {photoMediaUrl} from './media';
import type {AdultMode, AdultRating, Photo} from '../types/domain';

const photo = (rating: AdultRating | null): Photo =>
  ({path: 'p', preview: '/media/photo?path=p', adult_rating: rating});

// Таблица «режим × оценка → хвост адреса». Её пишут прежде правки кода:
// именно она решает, замылен кадр или показан как есть.
const table: Array<[AdultMode, AdultRating | null, string]> = [
  // Показывать как есть — не замыливаем никогда.
  ['show', 'explicit', ''],
  ['show', null, ''],
  // Скрывать совсем: такие кадры отсеиваются раньше, оставшиеся не мылим.
  ['hide', 'explicit', ''],
  // Безопасное и «слегка пикантное» не мылится ни в одном режиме.
  ['explicit', 'safe', ''],
  ['explicit', 'sensitive', ''],
  ['regions', 'sensitive', ''],
  ['full', 'safe', ''],
  ['strict', 'safe', ''],
  ['strict', 'sensitive', ''],
  // Откровенное — по выбранному режиму.
  ['explicit', 'explicit', '&blur=explicit'],
  ['regions', 'explicit', '&blur=regions'],
  ['full', 'explicit', '&blur=full'],
  ['explicit', 'questionable', '&blur=explicit'],
  // В строгом режиме уже проверенное откровенное мылится как «интимное».
  ['strict', 'explicit', '&blur=explicit'],
  // Непроверенное закрывается целиком только в строгом режиме.
  ['explicit', null, ''],
  ['explicit', 'unknown', ''],
  ['strict', null, '&blur=full'],
  ['strict', 'unknown', '&blur=full'],
];

test('photoMediaUrl: режим 18+ × оценка', () => {
  for (const [mode, rating, tail] of table) {
    expect(photoMediaUrl(photo(rating), mode), `режим ${mode}, оценка ${rating}`)
      .toBe(`/media/photo?path=p${tail}`);
  }
});

test('photoMediaUrl: размер дописывается перед блюром', () => {
  expect(photoMediaUrl(photo('explicit'), 'explicit', 380))
    .toBe('/media/photo?path=p&size=380&blur=explicit');
  expect(photoMediaUrl(photo('safe'), 'explicit', 380))
    .toBe('/media/photo?path=p&size=380');
});
