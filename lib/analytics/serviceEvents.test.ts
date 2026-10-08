/**
 * lib/analytics/serviceEvents — the §50 service funnel by catalog id.
 * Pinned: one event name per step; every service the funnel can name is a real catalog id; a tool maps to its own
 * service (lowest order) and a music-video run to video.music-video; a repeated quote is one event; free text never
 * rides along (an error sentence becomes 'other'); nothing fires without a service.
 */
jest.mock('./track', () => ({ track: jest.fn() }));

import { track } from './track';
import { SERVICE_CATALOG } from '@/lib/catalog/services';
import { ALL_TOOLS } from '@/lib/studio/tools';
import {
  SERVICE_EVENTS,
  __resetServiceEvents,
  serviceForTool,
  trackCategoryViewed,
  trackGenerationCompleted,
  trackGenerationConfirmed,
  trackGenerationFailed,
  trackQuoteShown,
  trackResultSaved,
  trackServiceOpened,
} from './serviceEvents';

const mockTrack = track as jest.MockedFunction<typeof track>;
const ids = new Set(SERVICE_CATALOG.map((s) => s.id));

beforeEach(() => {
  mockTrack.mockClear();
  __resetServiceEvents();
});

it('names each funnel step once', () => {
  const names = Object.values(SERVICE_EVENTS);
  expect(new Set(names).size).toBe(names.length);
  for (const n of names) expect(n).toMatch(/^[a-z_]{3,40}$/);
});

it('maps every studio tool in the catalog to a real catalog id, the tool’s own service first', () => {
  for (const tool of ALL_TOOLS) {
    const id = serviceForTool(tool);
    if (SERVICE_CATALOG.some((s) => s.tool === tool)) expect(ids.has(id as string)).toBe(true);
    else expect(id).toBeNull();
  }
  expect(serviceForTool('video')).toBe('video.generate');
  expect(serviceForTool('video', { videoMode: 'musicvideo' })).toBe('video.music-video');
  expect(serviceForTool('video', { videoMode: 'documentary' })).toBe('video.generate');
  expect(serviceForTool('chat')).toBe('text.write');
  expect(serviceForTool('swap')).toBe('video.character-swap');
  expect(serviceForTool(null)).toBeNull();
});

it('every service id hard-coded in the studio wiring is a catalog id', () => {
  for (const id of ['image.generate', 'image.photoshoot', 'image.interior', 'music.generate', 'video.generate', 'video.vfx',
    'video.product-ad', 'video.character-swap', 'video.remix', 'avatar.talking']) {
    expect(ids.has(id)).toBe(true);
  }
});

it('a quote on screen is one event until the service, price or surface changes', () => {
  trackQuoteShown('image.generate', 12, 'panel');
  trackQuoteShown('image.generate', 12, 'panel');
  trackQuoteShown('image.generate', 24, 'panel');
  trackQuoteShown('image.generate', 0, 'panel');
  trackQuoteShown(null, 12, 'panel');
  expect(mockTrack.mock.calls).toEqual([
    ['service_quote_shown', { service: 'image.generate', credits: 12, surface: 'panel' }],
    ['service_quote_shown', { service: 'image.generate', credits: 24, surface: 'panel' }],
  ]);
});

it('sends ids, counts and short codes only — an error sentence becomes "other"', () => {
  trackCategoryViewed('video', 'sidebar');
  trackServiceOpened('video.generate', 'agent-g', 'video');
  trackGenerationConfirmed('music.generate', 'panel', 30);
  trackGenerationCompleted('music.generate', 30);
  trackGenerationFailed('image.generate', 'insufficient_credits');
  trackGenerationFailed('image.generate', 'The provider said: prompt "my secret plan" rejected');
  trackResultSaved('image.generate', 'result', 'image');
  expect(mockTrack.mock.calls).toEqual([
    ['catalog_category_viewed', { category: 'video', surface: 'sidebar' }],
    ['catalog_service_opened', { service: 'video.generate', surface: 'agent-g', tool: 'video' }],
    ['service_generation_confirmed', { service: 'music.generate', surface: 'panel', credits: 30 }],
    ['service_generation_completed', { service: 'music.generate', credits: 30 }],
    ['service_generation_failed', { service: 'image.generate', reason: 'insufficient_credits' }],
    ['service_generation_failed', { service: 'image.generate', reason: 'other' }],
    ['service_result_saved', { service: 'image.generate', surface: 'result', kind: 'image' }],
  ]);
});

it('nothing fires without a service', () => {
  trackServiceOpened(null, 'sidebar');
  trackGenerationConfirmed(null, 'composer');
  trackGenerationCompleted(null);
  trackGenerationFailed(null, 'x');
  trackResultSaved(null, 'result');
  expect(mockTrack).not.toHaveBeenCalled();
});
