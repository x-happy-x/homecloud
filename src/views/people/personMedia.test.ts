import {describe, expect, test} from 'vitest';
import type {GroupFace} from '../../types/api';
import {boxShare, buildMedia, byYear, newestFirst, summary, yearOf} from './personMedia';

const at = (year: number, month = 6) => Date.UTC(year, month - 1, 15) / 1000;

const face = (id: number, path: string, extra: Partial<GroupFace> = {}): GroupFace => ({
  id, path, filename: path.split('/').pop() ?? path, kind: path.endsWith('.mp4') ? 'video' : 'photo',
  frame_time: null, thumbnail: `/t/${id}`, original: `/o/${id}`, confidence: 0.5, ...extra,
});

describe('buildMedia', () => {
  test('каждый файл один раз, моменты ролика по времени, лучшее лицо по уверенности', () => {
    const faces = [
      face(1, 'a/v.mp4', {frame_time: 30, taken: at(2024), confidence: 0.4}),
      face(2, 'a/p.jpg', {taken: at(2025)}),
      face(3, 'a/v.mp4', {frame_time: 5, taken: at(2024), confidence: 0.9}),
      face(4, 'a/v.mp4', {frame_time: 12, taken: at(2024), confidence: 0.1}),
    ];
    const media = buildMedia(faces);
    expect(media.map(item => item.path)).toEqual(['a/p.jpg', 'a/v.mp4']);
    const video = media[1];
    expect(video.faces.map(item => item.id)).toEqual([3, 4, 1]);
    expect(video.indexes).toEqual([2, 3, 0]);
    expect(video.best.id).toBe(3);
    expect(video.bestIndex).toBe(2);
  });
});

describe('годы и порядок', () => {
  test('свежие сверху, без даты в конце', () => {
    const items = [{taken: null}, {taken: at(2020)}, {taken: at(2023)}];
    expect(newestFirst(items).map(item => yearOf(item.taken))).toEqual([2023, 2020, null]);
    const sections = byYear(newestFirst(items), item => item.taken);
    expect(sections.map(section => section.year)).toEqual([2023, 2020, null]);
  });

  test('сводка: снимки и ролики по файлам, годы', () => {
    const faces = [face(1, 'v.mp4', {taken: at(2019)}), face(2, 'v.mp4', {taken: at(2019)}),
      face(3, 'p.jpg', {taken: at(2024)}), face(4, 'q.jpg')];
    expect(summary(faces)).toEqual({photos: 2, videos: 1, from: 2019, to: 2024});
  });
});

describe('boxShare', () => {
  test('рамка в долях кадра, без размеров — нет', () => {
    expect(boxShare(face(1, 'p.jpg', {box: [100, 50, 300, 250], width: 1000, height: 500})))
      .toEqual({left: 0.1, top: 0.1, width: 0.2, height: 0.4});
    expect(boxShare(face(1, 'p.jpg', {box: [1, 1, 2, 2]}))).toBeNull();
  });
});
