/**
 * lib/video/director/testing/fixtures.ts — storyboards for the director tests: valid by default (Veo-legal lengths,
 * one locked frame, contiguous orders, a matching total), so each test changes only the field it is about.
 */
import type { ConsistencyLock, Shot, Storyboard } from '../types';

export const HERO_REF = 'https://cdn.example.com/refs/hero.png';
export const VILLAIN_REF = 'https://cdn.example.com/refs/villain.png';

export function makeShot(over: Partial<Shot> & Pick<Shot, 'id' | 'order'>): Shot {
  return {
    description: `Shot ${over.order}`,
    prompt: `A lighthouse keeper climbs the stairs, shot ${over.order}.`,
    durationSeconds: 8,
    aspectRatio: '16:9',
    quality: 'fast',
    ...over,
  };
}

export function makeStoryboard(shots: Shot[], lock: Partial<ConsistencyLock> = {}, over: Partial<Storyboard> = {}): Storyboard {
  return {
    id: 'sb-1',
    title: 'The lighthouse',
    totalDurationSeconds: shots.reduce((sum, s) => sum + s.durationSeconds, 0),
    shots,
    consistencyLock: { aspectRatio: '16:9', enforceAcrossShots: true, ...lock },
    createdAt: '2026-10-08T10:00:00.000Z',
    createdBy: 'user',
    approvedByUser: true,
    ...over,
  };
}

/** Three valid shots in order 1…3. */
export function threeShots(over: Partial<Shot> = {}): Shot[] {
  return [makeShot({ id: 'a', order: 1, ...over }), makeShot({ id: 'b', order: 2, ...over }), makeShot({ id: 'c', order: 3, ...over })];
}
