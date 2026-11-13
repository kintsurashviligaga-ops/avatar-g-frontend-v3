/** @jest-environment node */
/** VALIDATE for media runs (Phase 3.5a): a RunSpec as the engine's plan, and the refusal by step. */
import { checkRunSpec, defaultRunCeiling, planOfSpec } from './runValidate';
import { agentEngineMedia, agentValidateOn, engineMediaFor } from './engineFlags';
import type { RunSpec } from './runSpec';

const SPEC: RunSpec = {
  title: 'Clips to the concert sound',
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: 'u/v.mp4' } },
    { id: 'clip', tool: 'montage', files: ['u/a.mp4', 'u/b.mp4', { step: 'sound' }] },
    { id: 'cut', tool: 'edit', file: { step: 'clip' }, edits: [] },
  ],
};
const PRICE = { audio_extract: 2, montage: 10, edit: 5 } as const;
const facts = (switchedOff: string[] = [], ceiling = 100) => ({
  now: new Date('2026-11-13T08:00:00Z'), isAdmin: false, switchedOff: new Set(switchedOff), priceBook: PRICE, runCeilingCredits: ceiling,
});

test('planOfSpec: one step per spec step, dependsOn = the earlier steps it reads, priced from the list price', () => {
  const plan = planOfSpec(SPEC, (t) => PRICE[t]);
  expect(plan.title).toBe(SPEC.title);
  expect(plan.steps.map((s) => [s.id, s.tool, s.dependsOn, s.estimateCredits])).toEqual([
    ['sound', 'audio_extract', [], 2], ['clip', 'montage', ['sound'], 10], ['cut', 'edit', ['clip'], 5],
  ]);
  expect(plan.steps[1]!.params).toEqual({ files: ['u/a.mp4', 'u/b.mp4', { step: 'sound' }] });
  expect(plan.steps[1]!.params).not.toHaveProperty('id');
});

test('a montage that names the same step twice depends on it once', () => {
  const spec: RunSpec = { steps: [SPEC.steps[0]!, { id: 'clip', tool: 'montage', files: [{ step: 'sound' }, { step: 'sound' }] }] };
  expect(planOfSpec(spec, () => 0).steps[1]!.dependsOn).toEqual(['sound']);
});

test('checkRunSpec: passes, refuses a switched-off step by name, refuses over the ceiling', () => {
  const price = (t: keyof typeof PRICE) => PRICE[t];
  expect(checkRunSpec(SPEC, facts(), price)).toEqual({ ok: true });
  expect(checkRunSpec(SPEC, facts(['montage']), price)).toEqual({ ok: false, error: 'capability_unavailable', message: 'montage is switched off', step: 'clip' });
  expect(checkRunSpec(SPEC, facts([], 16), price)).toEqual({ ok: false, error: 'policy_denied', message: "estimate ✦17 is over this account's ✦16 per run" });
});

test('defaultRunCeiling: every step at the dearest price', () => {
  expect(defaultRunCeiling(6, [2, 10, 5])).toBe(60);
  expect(defaultRunCeiling(6, [])).toBe(0);
});

describe('the flags are off unless set', () => {
  test('AGENT_VALIDATE', () => {
    expect(agentValidateOn({} as NodeJS.ProcessEnv)).toBe(false);
    expect(agentValidateOn({ AGENT_VALIDATE: 'off', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe(false);
    expect(agentValidateOn({ AGENT_VALIDATE: ' ON ' } as NodeJS.ProcessEnv)).toBe(true);
  });
  test('AGENT_ENGINE_MEDIA', () => {
    expect(agentEngineMedia({} as NodeJS.ProcessEnv)).toBe('off');
    expect(agentEngineMedia({ AGENT_ENGINE_MEDIA: 'nonsense', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe('off');
    expect(agentEngineMedia({ AGENT_ENGINE_MEDIA: 'admins' } as NodeJS.ProcessEnv)).toBe('admins');
    expect(agentEngineMedia({ AGENT_ENGINE_MEDIA: 'everyone' } as NodeJS.ProcessEnv)).toBe('everyone');
    expect(engineMediaFor(false, { AGENT_ENGINE_MEDIA: 'admins' } as NodeJS.ProcessEnv)).toBe(false);
    expect(engineMediaFor(true, { AGENT_ENGINE_MEDIA: 'admins' } as NodeJS.ProcessEnv)).toBe(true);
    expect(engineMediaFor(false, { AGENT_ENGINE_MEDIA: 'everyone' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
