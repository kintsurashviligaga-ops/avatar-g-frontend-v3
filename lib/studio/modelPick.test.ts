/** @jest-environment jsdom */
/**
 * The browser's model pick and what a picker may offer: per service, in two memories (the Create panels / Studio β); storage
 * that throws degrades to this page; the request names a model its route can run, always; and a row a tap cannot choose
 * says why.
 */
import { act, renderHook } from '@testing-library/react';
import {
  __resetModelPickMemory, effectivePick, getModelPick, imageModelField, modelPickKey, pickerRows, setModelPick, useModelPick,
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
    setModelPick('image', 'hf/soul-2', 'studio');
    expect(window.localStorage.getItem(modelPickKey('image', 'studio'))).toBe('hf/soul-2');
    expect(getModelPick('image')).toBe('nb/pro');

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

describe('the image request always names a model its route can run', () => {
  test('the pick when the image route runs it; otherwise Auto — so the server quotes what renders', () => {
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
    setModelPick('image', 'nb/pro');
    expect(imageModelField()).toEqual({ model: 'nb/pro' });
    window.localStorage.setItem('myavatar:model:image', 'hf/soul-2'); // a Studio β model can never reach the image route
    expect(imageModelField()).toEqual({ model: 'nb/auto' });
  });
});

describe('the rows a picker offers', () => {
  const ids = (rows: ReturnType<typeof pickerRows>) => rows.map((r) => [r.entry.id, r.selectable, r.block]);

  test('the Video panel: its three Veo models open; the Studio β models dimmed — "not enabled" until the server says otherwise', () => {
    const rows = pickerRows('video', { runners: ['film'], status: null });
    expect(ids(rows).slice(0, 3)).toEqual([
      ['google/veo-3.1-lite', true, null], ['google/veo-3.1-fast', true, null], ['google/veo-3.1', true, null],
    ]);
    for (const r of rows.slice(3)) expect([r.entry.wire.runner, r.selectable, r.block]).toEqual(['studio', false, 'not_enabled']);
  });

  test('with the server\'s answer: a model enabled for Studio β says WHERE it runs; one that is not says why', () => {
    const status: CatalogueStatus = {
      'google/veo-3.1-lite': { available: true, reason: null },
      'google/veo-3.1-fast': { available: true, reason: null },
      'google/veo-3.1': { available: true, reason: null },
      'hf/kling-3-std-t2v': { available: true, reason: null },
      'hf/kling-3-pro-t2v': { available: false, reason: 'not_enabled' },
      'hf/seedance-2.5-t2v': { available: false, reason: 'studio_off' },
    };
    const rows = pickerRows('video', { runners: ['film'], status });
    const by = (id: string) => rows.find((r) => r.entry.id === id)!;
    expect(by('hf/kling-3-std-t2v')).toMatchObject({ selectable: false, block: 'elsewhere' });
    expect(by('hf/kling-3-pro-t2v')).toMatchObject({ selectable: false, block: 'not_enabled' });
    expect(by('hf/seedance-2.5-t2v')).toMatchObject({ selectable: false, block: 'studio_off' });
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

  test('Studio β lists only its own models; a Higgsfield row is never open while the server has not answered', () => {
    const unknown = pickerRows('video', { runners: ['studio'], status: null, include: 'runnable' });
    expect(unknown.every((r) => r.entry.wire.runner === 'studio' && !r.selectable && r.block === 'checking')).toBe(true);
    const known = pickerRows('video', { runners: ['studio'], status: { 'hf/kling-3-std-t2v': { available: true, reason: null } }, include: 'runnable' });
    expect(known[0]).toMatchObject({ selectable: true, block: null });
    expect(known[0]!.entry.id).toBe('hf/kling-3-std-t2v');
    expect(known.slice(1).every((r) => r.block === 'not_enabled')).toBe(true);
  });

  test('the effective pick: the stored one if a tap could choose it now, else the default', () => {
    const rows = pickerRows('image', { runners: ['image'], status: null });
    expect(effectivePick('image', 'nb/pro', rows)).toBe('nb/pro');
    expect(effectivePick('image', 'hf/soul-2', rows)).toBe('nb/auto');
    expect(effectivePick('image', null, rows)).toBe('nb/auto');
  });
});
