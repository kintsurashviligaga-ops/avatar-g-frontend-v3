/** @jest-environment node */
/** VALIDATE (M-4): against the REAL lifecycle registry, plus mocked entitlement, audience, switch and allow-list. */
import { LIFECYCLE, lifecycleEntry, lifecycleLevel, type LifecycleRegistry } from '@/lib/capabilities/lifecycle';
import { validatePlan, validateStep, type ValidateContext } from './validate';
import type { EngineTool, Plan, PlanStep } from './types';

const ps = (id: string, tool: EngineTool, params: Record<string, unknown> = {}, estimateCredits = 0): PlanStep => ({ id, tool, title: id, dependsOn: [], params, estimateCredits });

function ctx(over: Partial<ValidateContext> = {}, models: Partial<Record<EngineTool, string>> = {}, now = new Date('2026-11-13T08:00:00Z'), reg: LifecycleRegistry = LIFECYCLE): ValidateContext {
  const modelOf: Record<string, string> = { write: 'gemini-3.8-flash', speech: 'gemini-3.8-flash-tts', image: 'gemini-3.1-flash-image', video: 'gemini-omni-1.2-flash', ...models };
  return {
    modelOf: (t) => modelOf[t] ?? null,
    lifecycleOf: (m) => {
      const e = lifecycleEntry(m, reg);
      return { known: !!e, level: lifecycleLevel(e, now, reg) };
    },
    serviceOn: () => true,
    entitled: () => true,
    inAudience: () => true,
    domainAllowed: (h) => h.endsWith('.gov.ge') || h === 'geostat.ge',
    runCeilingCredits: 300,
    ...over,
  };
}

test('steps on served, healthy models pass', () => {
  const plan: Plan = { title: 't', steps: [ps('w', 'write'), ps('s', 'speech'), ps('i', 'image'), ps('v', 'video'), ps('p', 'pdf')] };
  expect(validatePlan(plan, ctx())).toMatchObject({ ok: true });
});

test('a retired model is capability_unavailable before anything is quoted', () => {
  // gemini-3.6-flash retires 2026-11-19 per config/google-lifecycle.json: inside the 7-day urgent window on 11-13.
  const v = validateStep(ps('w', 'write'), ctx({}, { write: 'gemini-3.6-flash' }));
  expect(v).toMatchObject({ ok: false, code: 'capability_unavailable' });
  expect(v.reason).toMatch(/gemini-3\.6-flash is (urgent|block|retired)/);
  const later = validateStep(ps('w', 'write'), ctx({}, { write: 'gemini-3.6-flash' }, new Date('2026-12-01T00:00:00Z')));
  expect(later.reason).toContain('retired');
});

test('a model the registry does not know is refused; a known one with no published date runs', () => {
  expect(validateStep(ps('w', 'write'), ctx({}, { write: 'gemini-9-imaginary' }))).toMatchObject({ ok: false, code: 'capability_unavailable', reason: expect.stringContaining('not in the lifecycle registry') });
  // gemini-3.1-pro-preview is in the file with no date (OBS source): allowed, the admin page shows it for probing.
  expect(validateStep(ps('w', 'write'), ctx({}, { write: 'gemini-3.1-pro-preview' })).ok).toBe(true);
});

test('switch off → capability_unavailable; not entitled / not in audience → policy_denied', () => {
  expect(validateStep(ps('v', 'video'), ctx({ serviceOn: (t) => t !== 'video' }))).toMatchObject({ code: 'capability_unavailable' });
  expect(validateStep(ps('c', 'code'), ctx({ entitled: (t) => t !== 'code' }))).toMatchObject({ code: 'policy_denied', reason: expect.stringContaining('not open') });
  expect(validateStep(ps('m', 'music'), ctx({ inAudience: () => false }))).toMatchObject({ code: 'policy_denied' });
});

test('research may open only allow-listed https hosts', () => {
  expect(validateStep(ps('r', 'research', { urls: ['https://www.geostat.ge/x'] }), ctx()).ok).toBe(false);
  expect(validateStep(ps('r', 'research', { urls: ['https://geostat.ge/x', 'https://nbg.gov.ge/y'] }), ctx()).ok).toBe(true);
  expect(validateStep(ps('r', 'research', { urls: ['http://geostat.ge'] }), ctx()).reason).toContain('https');
  expect(validateStep(ps('r', 'research', { urls: 'geostat.ge' }), ctx()).ok).toBe(false);
  expect(validateStep(ps('r', 'research', { urls: ['https://evil.example/'] }), ctx()).reason).toContain('evil.example is not on the allow-list');
});

test('a plan over the run ceiling is policy_denied as a whole, even when each step passes', () => {
  const plan: Plan = { title: 't', steps: [ps('a', 'video', {}, 200), ps('b', 'video', {}, 150)] };
  const v = validatePlan(plan, ctx());
  expect(v.ok).toBe(false);
  expect(v.steps.every((s) => s.ok)).toBe(true);
  expect(v.plan).toMatchObject({ code: 'policy_denied', reason: expect.stringContaining('✦350') });
});
