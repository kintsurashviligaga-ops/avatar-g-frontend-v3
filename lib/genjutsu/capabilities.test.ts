/** @jest-environment node */
/**
 * Which VFX ops are OPEN. The rule under test: a flag alone never opens an op — the engine behind it must be configured
 * and the Veo scene is on (the studio's own primary engine). Motion and swap run on Higgsfield, which is not an allowed
 * provider, so they are closed by a constant no flag can lift.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => null) }));
jest.mock('../providers/higgsfield/adapter', () => ({ createHiggsfieldAdapter: jest.fn(() => null) }));

import { isModelEnabled } from '../providers/registry';
import { ALLOWED_ENGINE_PROVIDERS, engineAllowed } from './engines';
import { DEFAULT_PROBES, SWAP_MODEL_ID, motionModelId, opStatuses, publicOpStatuses, type Probes } from './capabilities';

const probes = (over: Partial<Probes> = {}): Probes => ({ veoReady: () => true, hfReady: () => true, modelEnabled: () => true, ...over });
const env = (e: Record<string, string> = {}) => e as unknown as NodeJS.ProcessEnv;

test('scene is ON by default when Veo is configured, and a one-variable kill switch turns it off', () => {
  expect(opStatuses(env(), probes()).scene).toEqual({ op: 'scene', open: true, reason: 'ok' });
  for (const off of ['0', 'false', 'off', 'no']) expect(opStatuses(env({ GENJUTSU_SCENE_ENABLED: off }), probes()).scene.reason).toBe('flag_off');
  expect(opStatuses(env({ GENJUTSU_SCENE_ENABLED: '1' }), probes()).scene.open).toBe(true);
});

test('scene stays locked when no Veo transport is configured — the flag is not the engine', () => {
  expect(opStatuses(env(), probes({ veoReady: () => false })).scene).toEqual({ op: 'scene', open: false, reason: 'engine_not_configured' });
});

test('motion and swap are CLOSED whatever the flags say: Higgsfield / Kling is not an allowed provider (owner, A1)', () => {
  expect(ALLOWED_ENGINE_PROVIDERS).toEqual(['veo']);
  expect([engineAllowed('scene'), engineAllowed('motion'), engineAllowed('swap')]).toEqual([true, false, false]);
  const s = opStatuses(env(), probes());
  expect(s.motion).toEqual({ op: 'motion', open: false, reason: 'engine_forbidden' });
  expect(s.swap).toEqual({ op: 'swap', open: false, reason: 'engine_forbidden' });

  // Every flag on, Higgsfield configured, the model registered: still closed — no environment variable reopens them.
  const on = env({ GENJUTSU_MOTION_ENABLED: 'true', GENJUTSU_SWAP_ENABLED: '1', STUDIO_V2: '1' });
  for (const p of [probes(), probes({ modelEnabled: (id, e) => isModelEnabled(id, e) })]) {
    expect(opStatuses(on, p).motion).toEqual({ op: 'motion', open: false, reason: 'engine_forbidden' });
    expect(opStatuses(on, p).swap).toEqual({ op: 'swap', open: false, reason: 'engine_forbidden' });
  }
  // …and the swap model is still not in the registry, so lifting the gate alone would not open swap either.
  expect(isModelEnabled(SWAP_MODEL_ID, on)).toBe(false);
});

test('the wire view is coarse: open | soon — never which provider key is missing', () => {
  const view = publicOpStatuses(env({ GENJUTSU_MOTION_ENABLED: '1' }), probes({ hfReady: () => false }));
  expect(view).toEqual({
    scene: { open: true, state: 'open' },
    motion: { open: false, state: 'soon' },
    swap: { open: false, state: 'soon' },
  });
  expect(JSON.stringify(view)).not.toMatch(/engine|flag|configured|missing/);
});

test('the motion model: Pro quality → the Pro model; an env override only if it looks like a registry id', () => {
  expect(motionModelId('standard', env())).toBe('hf/kling-3-motion-std');
  expect(motionModelId('pro', env())).toBe('hf/kling-3-motion-pro');
  expect(motionModelId('standard', env({ GENJUTSU_MOTION_MODEL: 'hf/genjutsu-motion' }))).toBe('hf/genjutsu-motion');
  expect(motionModelId('standard', env({ GENJUTSU_MOTION_MODEL: 'evil/../model' }))).toBe('hf/kling-3-motion-std');
  expect(motionModelId('pro', env({ GENJUTSU_MOTION_MODEL: 'hf/genjutsu-motion' }))).toBe('hf/kling-3-motion-pro');
});

test('the real probes are wired to the real engines (unconfigured in a test process → everything shut)', () => {
  expect(DEFAULT_PROBES.veoReady()).toBe(false);
  expect(DEFAULT_PROBES.hfReady(env())).toBe(false);
});
