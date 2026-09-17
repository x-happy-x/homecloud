import {describe, expect, test} from 'vitest';
import type {GroupFace} from '../../types/api';
import {buildStacks, videoStart} from './stacks';

const face = (id: number, extra: Partial<GroupFace> = {}): GroupFace => ({
  id, filename: `${id}.jpg`, path: `/p/${id}.jpg`, kind: 'photo', frame_time: null,
  thumbnail: '', original: '', confidence: 1, stack: id, stack_size: 1, ...extra,
});

describe('стопки лиц', () => {
  test('стопка встаёт на место первого лица, наверху — лицо, выбранное сервером', () => {
    const stacks = buildStacks([
      face(1, {stack: 3, stack_size: 2}),
      face(2),
      face(3, {stack: 3, stack_size: 2}),
    ]);
    expect(stacks.map(stack => stack.id)).toEqual([3, 2]);
    expect(stacks[0].top.id).toBe(3);
    expect(stacks[0].topIndex).toBe(2);
    expect(stacks[0].members.map(member => member.index)).toEqual([0, 2]);
  });

  test('кадры одного ролика идут по времени', () => {
    const clip = {kind: 'video' as const, path: '/v/a.mp4', stack: 5};
    const stacks = buildStacks([
      face(4, {...clip, track_start: 30, frame_time: 31}),
      face(5, {...clip, track_start: 2, frame_time: 4}),
      face(6, {...clip, track_start: null, frame_time: 12}),
    ]);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].video).toBe(true);
    expect(stacks[0].members.map(member => member.face.id)).toEqual([5, 6, 4]);
  });

  test('старый ответ без стопок — каждое лицо само по себе', () => {
    const stacks = buildStacks([face(1, {stack: undefined}), face(2, {stack: undefined})]);
    expect(stacks.map(stack => stack.members.length)).toEqual([1, 1]);
  });
});

describe('с какой секунды открывать ролик', () => {
  test('с начала трека с небольшим запасом, не раньше нуля', () => {
    expect(videoStart(face(1, {kind: 'video', track_start: 12, frame_time: 14}))).toBe(11.5);
    expect(videoStart(face(1, {kind: 'video', track_start: 0.2, frame_time: 1}))).toBe(0);
    expect(videoStart(face(1, {kind: 'video', frame_time: 8}))).toBe(7.5);
  });

  test('у фотографии и у лица без времени момента нет', () => {
    expect(videoStart(face(1))).toBeNull();
    expect(videoStart(face(1, {kind: 'video'}))).toBeNull();
    expect(videoStart(undefined)).toBeNull();
  });
});
