import {describe, expect, test} from 'vitest';
import type {DeviceJob} from '../services/endpoints/backends';
import {resumePlan} from './scanPlan';

const base = {
  active: false, roots: ['pc-x:D:\Фото'], paths: [],
  features: {inventory: true, faces: true, visual: true, adult: true},
  kinds: {faces: 'all', visual: 'photos', adult: 'all'},
  plan: ['inventory', 'thumbs', 'copies', 'faces', 'visual', 'adult', 'propagate'],
} as unknown as DeviceJob;

describe('продолжить задание с того же места', () => {
  test('упало на визуальном индексе: лица и опись не повторяем', () => {
    const plan = resumePlan({...base, status: 'error', phase: 'visual'});
    expect(plan?.resume).toBe(true);
    expect(plan?.from).toBe('Визуальный индекс');
    expect(plan?.features).toEqual({visual: true, adult: true});
    expect(plan?.video_features).toEqual({visual: false, adult: true});
    expect(plan?.roots).toEqual(['pc-x:D:\Фото']);
  });

  test('упало на описи — продолжаем вместе с описью', () => {
    const plan = resumePlan({...base, status: 'interrupted', phase: 'inventory'});
    expect(plan?.resume).toBe(false);
    expect(Object.keys(plan?.features ?? {})).toEqual(['faces', 'visual', 'adult']);
  });

  test('готовое, идущее и пустое задание продолжать нечего', () => {
    expect(resumePlan({...base, status: 'completed', phase: 'complete'})).toBeNull();
    expect(resumePlan({...base, status: 'running', active: true, phase: 'faces'})).toBeNull();
    expect(resumePlan({...base, status: 'error', phase: 'visual', roots: []})).toBeNull();
    expect(resumePlan(undefined)).toBeNull();
  });
});
