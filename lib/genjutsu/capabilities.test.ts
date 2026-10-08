/** @jest-environment node */
/**
 * Which VFX ops are OPEN. The rule under test: a flag alone never opens an op — the engine behind it must be configured
 * and, for the Higgsfield ops, the model must really exist in the registry. And the honest default: the Veo scene is on
 * (the studio's own primary engine), motion and swap are off.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => null) }));
jest.mock('../providers/higgsfield/adapter', () => ({ createHiggsfieldAdapter: jest.fn(() => null) }));

import { isModelEnabled } from '../providers/registry';
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

test('motion and swap are OFF by default; a flag opens them only when Higgsfield and the model are really there', () => {
  const s = opStatuses(env(), probes());
  expect(s.motion).toEqual({ op: 'motion', open: false, reason: 'flag_off' });
  expect(s.swap).toEqual({ op: 'swap', open: false, reason: 'flag_off' });

  const on = env({ GENJUTSU_MOTION_ENABLED: 'true', GENJUTSU_SWAP_ENABLED: '1' });
  expect(opStatuses(on, probes()).motion.open).toBe(true);
  expect(opStatuses(on, probes({ hfReady: () => false })).motion.reason).toBe('engine_not_configured');
  expect(opStatuses(on, probes({ modelEnabled: () => false })).motion.reason).toBe('engine_missing');
});

test('swap stays locked TODAY even with its flag on: the registry has no object-swap model (this test is the reminder to flip it)', () => {
  const real = probes({ modelEnabled: (id, e) => isModelEnabled(id, e) });
  const on = env({ GENJUTSU_SWAP_ENABLED: '1', GENJUTSU_MOTION_ENABLED: '1' });
  expect(isModelEnabled(SWAP_MODEL_ID, on)).toBe(false);
  expect(opStatuses(on, real).swap).toEqual({ op: 'swap', open: false, reason: 'engine_missing' });
});

test('motion stays locked under MyAvatar v32 even with its flag, Higgsfield "ready" and the model named: Higgsfield is not a permitted provider', () => {
  const real = probes({ modelEnabled: (id, e) => isModelEnabled(id, e) });
  const on = env({ GENJUTSU_MOTION_ENABLED: '1', HF_ENABLED_MODELS: 'hf/kling-3-motion-std,hf/kling-3-motion-pro' });
  // The model is still registered (old jobs stay readable)…
  expect(motionModelId('standard', on)).toBe('hf/kling-3-motion-std');
  // …but the registry refuses it whatever the env says, so the op cannot open.
  expect(isModelEnabled('hf/kling-3-motion-std', on)).toBe(false);
  expect(opStatuses(on, real).motion).toEqual({ op: 'motion', open: false, reason: 'engine_missing' });
  expect(publicOpStatuses(on, real).motion).toEqual({ open: false, state: 'soon' });
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
