/** @jest-environment jsdom */
/**
 * The browser's model pick and what a picker may offer: per service, in two memories (the Create panels / Studio β); storage
 * that throws degrades to this page; the request names a model its route can run, always; and a row a tap cannot choose
 * says why. MyAvatar v32: Higgsfield (Studio β) models are no longer in the catalogue, so a remembered one is no pick at all
 * and no picker lists one.
 */
import { act, renderHook } from '@testing-library/react';
import {
  __resetModelPickMemory, effectivePick, getModelPick, higgsfieldPicked, imageModelField, modelPickKey, pickerRows, setModelPick, useModelPick,
  type CatalogueStatus,
} from './modelPick';

beforeEach(() => { window.localStorage.clear(); __resetModelPickMemory(); });

describe('the stored pick', () => {
  test('per service and per surface; the default is not stored; a foreign or unknown id is no pick at all', () => {
    expect(getModelPick('image')).toBeNull();
    setModelPick('image', 'nb/pro');
    expect(window.localStorage.getItem('myavatar:model:image')).toBe('nb/pro');
    expect(getModelPick('image')).toBe('nb/pro');
    expect(getModelPick('image', 'studio')).toBeNull(); // Studio β remembers its own
    setModelPick('image', 'nb/v2', 'studio');
    expect(window.localStorage.getItem(modelPickKey('image', 'studio'))).toBe('nb/v2');
    expect(getModelPick('image')).toBe('nb/pro');
    // A retired Higgsfield model is not a catalogue model any more: it is not stored, and a stale stored one reads as none.
    setModelPick('image', 'hf/soul-2', 'studio');
    expect(window.localStorage.getItem(modelPickKey('image', 'studio'))).toBe('nb/v2');
    window.localStorage.setItem(modelPickKey('image', 'studio'), 'hf/soul-2');
    expect(getModelPick('image', 'studio')).toBeNull();

    setModelPick('image', 'nb/auto');
    expect(window.localStorage.getItem('myavatar:model:image')).toBeNull();
    setModelPick('image', 'google/veo-3.1'); // another service's model is not an image pick
    setModelPick('image', 'evil');
    expect(getModelPick('image')).toBeNull();
    window.localStorage.setItem('myavatar:model:video', 'nb/pro'); // hand-edited storage
    expect(getModelPick('video')).toBeNull();
  });

  test('⚠️ storage that throws (private mode, quota, blocked) never throws here — the pick holds for this page', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      expect(getModelPick('video')).toBeNull();
      expect(() => setModelPick('video', 'google/veo-3.1-lite')).not.toThrow();
      const { result } = renderHook(() => useModelPick('video'));
      expect(result.current[0]).toBe('google/veo-3.1-lite');
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  test('the hook follows every pick, including one made by another view of the same service', () => {
    const { result } = renderHook(() => useModelPick('image'));
    expect(result.current[0]).toBeNull();
    act(() => { setModelPick('image', 'nb/v2'); });
    expect(result.current[0]).toBe('nb/v2');
    act(() => { result.current[1]('nb/pro'); });
    expect(result.current[0]).toBe('nb/pro');
  });
});

describe('the image request always names the picked model', () => {
  test('the Google pick (Auto by default) — so the server quotes and renders exactly what the screen says', () => {
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
    setModelPick('image', 'nb/pro');
    expect(imageModelField()).toEqual({ model: 'nb/pro' });
    expect(higgsfieldPicked('image')).toBe(false);
  });

  test('a Higgsfield pick remembered from before v32 is no pick: the request names Auto (what the picker shows), never the retired id', () => {
    setModelPick('image', 'hf/soul-2'); // refused: not a catalogue model
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
    window.localStorage.setItem('myavatar:model:image', 'hf/soul-2'); // stored by an older build
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
    expect(higgsfieldPicked('image')).toBe(false); // the composer runs the Google route itself
    window.localStorage.setItem('myavatar:model:image', 'google/veo-3.1'); // a hand-edited foreign id is no pick at all
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
  });
});

describe('the rows a picker offers', () => {
  const ids = (rows: ReturnType<typeof pickerRows>) => rows.map((r) => [r.entry.id, r.selectable, r.block]);

  test('the Video panel: its three Veo models, open — and nothing else (no Studio β row is listed under v32)', () => {
    const rows = pickerRows('video', { runners: ['film'], status: null });
    expect(ids(rows)).toEqual([
      ['google/veo-3.1-lite', true, null], ['google/veo-3.1-fast', true, null], ['google/veo-3.1', true, null],
    ]);
  });

  test('a stale server answer that still names Higgsfield models cannot add a row: only the Veo rows, each as the server says', () => {
    const status: CatalogueStatus = {
      'google/veo-3.1-lite': { available: true, reason: null },
      'google/veo-3.1-fast': { available: true, reason: null },
      'google/veo-3.1': { available: true, reason: null },
      'hf/kling-3-std-t2v': { available: true, reason: null },
      'hf/kling-3-pro-t2v': { available: false, reason: 'not_enabled' },
      'hf/seedance-2.5-t2v': { available: false, reason: 'studio_off' },
    };
    const rows = pickerRows('video', { runners: ['film'], status });
    expect(rows.map((r) => r.entry.id)).toEqual(['google/veo-3.1-lite', 'google/veo-3.1-fast', 'google/veo-3.1']);
    expect(rows.every((r) => r.selectable && r.block === null)).toBe(true);
    expect(rows.some((r) => r.entry.provider === 'higgsfield')).toBe(false);
  });

  test('a film route without a renderer: its own rows close too, and the pick falls back to the first open one or the default', () => {
    const status: CatalogueStatus = {
      'google/veo-3.1-lite': { available: false, reason: 'not_configured' },
      'google/veo-3.1-fast': { available: false, reason: 'not_configured' },
      'google/veo-3.1': { available: false, reason: 'not_configured' },
    };
    const rows = pickerRows('video', { runners: ['film'], status });
    expect(rows.every((r) => !r.selectable)).toBe(true);
    expect(effectivePick('video', 'google/veo-3.1', rows)).toBe('google/veo-3.1-fast');
  });

  test('Studio β lists only its own models — none under v32, whether or not the server has answered', () => {
    for (const service of ['image', 'video', 'motion'] as const) {
      expect(pickerRows(service, { runners: ['studio'], status: null, include: 'runnable' })).toEqual([]);
    }
    const known = pickerRows('video', { runners: ['studio'], status: { 'hf/kling-3-std-t2v': { available: true, reason: null } }, include: 'runnable' });
    expect(known).toEqual([]);
  });

  test('the effective pick: the stored one if a tap could choose it now, else the default', () => {
    const rows = pickerRows('image', { runners: ['image'], status: null });
    expect(effectivePick('image', 'nb/pro', rows)).toBe('nb/pro');
    expect(effectivePick('image', 'hf/soul-2', rows)).toBe('nb/auto');
    expect(effectivePick('image', null, rows)).toBe('nb/auto');
  });
});
