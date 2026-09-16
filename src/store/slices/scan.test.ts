import {describe, expect, test} from 'vitest';
import {anyFeature, initialFeatures, KIND_FEATURES} from './scan';

describe('наборы этапов по видам файлов', () => {
  test('речь и голоса бывают только у видео, остальное — у обоих видов', () => {
    expect(KIND_FEATURES.photos).not.toContain('speech');
    expect(KIND_FEATURES.photos).not.toContain('diarize');
    expect(KIND_FEATURES.videos).toContain('speech');
    expect(KIND_FEATURES.videos).toContain('authenticity');
  });

  test('чужой для вида этап выключен, даже если устройство его умеет', () => {
    const photos = initialFeatures('photos', {faces: true, speech: true, diarize: true});
    expect(photos.faces).toBe(true);
    expect(photos.speech).toBe(false);
    expect(photos.diarize).toBe(false);
  });

  test('без списка возможностей включено то, что включено по умолчанию', () => {
    expect(initialFeatures('photos')).toMatchObject({faces: true, visual: true, ocr: false});
  });

  test('с возможностями устройства недоступное остаётся выключенным', () => {
    const weak = initialFeatures('photos', {faces: true});
    expect(weak.faces).toBe(true);
    expect(weak.visual).toBe(false);
  });

  test('anyFeature видит выбор в любом из двух наборов', () => {
    const empty = {photos: initialFeatures('photos', {}), videos: initialFeatures('videos', {})};
    expect(anyFeature(empty)).toBe(false);
    expect(anyFeature({...empty, videos: {...empty.videos, speech: true}})).toBe(true);
    expect(anyFeature({...empty, photos: {...empty.photos, faces: true}})).toBe(true);
  });
});
