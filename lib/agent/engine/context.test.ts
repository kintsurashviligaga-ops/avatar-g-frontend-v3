/** @jest-environment node */
/** The VALIDATE context (Phase 3.5a): facts → the functions validate.ts asks, against the REAL lifecycle registry. */
import { LIFECYCLE, lifecycleEntry } from '@/lib/capabilities/lifecycle';
import { SWITCHABLE_TOOLS } from '@/lib/server/serviceSwitches';

// Only the switch list is read; its server reads (flags, Supabase) are never called here.
jest.mock('../../server/feature-flags', () => ({}));
jest.mock('../../supabase/server', () => ({}));
import { ADMIN_ONLY_TOOLS, TOOL_MODEL, TOOL_SWITCH, buildValidateContext, type ValidateFacts } from './context';
import { validatePlan, validateStep } from './validate';
import { ENGINE_TOOLS, MEDIA_TOOLS, type EngineTool, type Plan, type PlanStep } from './types';
import { deadlineFor } from './scheduler';

const NOW = new Date('2026-11-13T08:00:00Z');
const ps = (id: string, tool: EngineTool, params: Record<string, unknown> = {}): PlanStep => ({ id, tool, title: id, dependsOn: [], params, estimateCredits: 0 });
const facts = (over: Partial<ValidateFacts> = {}): ValidateFacts => ({
  now: NOW, isAdmin: false, switchedOff: new Set(), runCeilingCredits: 500,
  priceBook: { montage: 10, audio_extract: 2, edit: 5, write: 1, pdf: 1, export: 0, image: 5, video: 20, speech: 1, code: 3, research: 3, music: 25 },
  ...over,
});

describe('the tables', () => {
  test('every tool has a model row and a switch row; every switch named is a real service switch', () => {
    for (const t of ENGINE_TOOLS) {
      expect(t in TOOL_MODEL).toBe(true);
      expect(t in TOOL_SWITCH).toBe(true);
      const sw = TOOL_SWITCH[t];
      if (sw !== null) expect(SWITCHABLE_TOOLS as readonly string[]).toContain(sw);
    }
  });

  test('every default model except Lyria is in the lifecycle registry (Lyria is refused until its row is added)', () => {
    const missing = ENGINE_TOOLS.map((t) => TOOL_MODEL[t]).filter((m): m is string => !!m && !lifecycleEntry(m, LIFECYCLE));
    expect(missing).toEqual(['lyria-3-pro-preview']);
  });

  test("today's three media-run tools call no model, and only montage sits behind a switch", () => {
    expect([TOOL_MODEL.audio_extract, TOOL_MODEL.montage, TOOL_MODEL.edit]).toEqual([null, null, null]);
    expect([TOOL_SWITCH.audio_extract, TOOL_SWITCH.montage, TOOL_SWITCH.edit]).toEqual([null, 'montage', null]);
  });

  test('a montage or an edit makes a media run (30 min deadline); an MP3 extraction alone does not', () => {
    expect([...MEDIA_TOOLS].sort()).toEqual(['edit', 'montage', 'music', 'video']);
    expect(deadlineFor({ title: 't', steps: [ps('a', 'audio_extract')] })).toBe(10 * 60_000);
    expect(deadlineFor({ title: 't', steps: [ps('a', 'audio_extract'), ps('m', 'montage')] })).toBe(30 * 60_000);
  });
});

describe('buildValidateContext', () => {
  test("a media run of today's tools passes for a non-admin", () => {
    const plan: Plan = { title: 't', steps: [ps('sound', 'audio_extract'), ps('clip', 'montage'), ps('cut', 'edit')] };
    expect(validatePlan(plan, buildValidateContext(facts()))).toMatchObject({ ok: true });
  });

  test('a switched-off service refuses its step as capability_unavailable', () => {
    const ctx = buildValidateContext(facts({ switchedOff: new Set(['montage', 'video']) }));
    expect(validateStep(ps('clip', 'montage'), ctx)).toMatchObject({ ok: false, code: 'capability_unavailable', reason: 'montage is switched off' });
    expect(validateStep(ps('v', 'video'), ctx)).toMatchObject({ ok: false, code: 'capability_unavailable' });
    expect(validateStep(ps('cut', 'edit'), ctx)).toMatchObject({ ok: true });
  });

  test('D-08: code and research are admin-only', () => {
    expect([...ADMIN_ONLY_TOOLS].sort()).toEqual(['code', 'research']);
    const user = buildValidateContext(facts());
    const admin = buildValidateContext(facts({ isAdmin: true }));
    expect(validateStep(ps('c', 'code'), user)).toMatchObject({ ok: false, code: 'policy_denied' });
    expect(validateStep(ps('r', 'research', { urls: ['https://geostat.ge/'] }), user)).toMatchObject({ ok: false, code: 'policy_denied' });
    expect(validateStep(ps('c', 'code'), admin)).toMatchObject({ ok: true });
    expect(validateStep(ps('r', 'research', { urls: ['https://geostat.ge/'] }), admin)).toMatchObject({ ok: true });
  });

  test('research links must be public host names (no localhost, IPs or internal names)', () => {
    const admin = buildValidateContext(facts({ isAdmin: true }));
    for (const u of ['https://localhost/x', 'https://10.0.0.1/', 'https://metadata.google.internal/', 'https://intranet/']) {
      expect(validateStep(ps('r', 'research', { urls: [u] }), admin)).toMatchObject({ ok: false, code: 'policy_denied' });
    }
  });

  test('a step on a model the registry marks retired or urgent is refused (3.6 Flash on 11-13), via a model override', () => {
    const ctx = buildValidateContext(facts({ models: { write: 'gemini-3.6-flash' } }));
    expect(validateStep(ps('w', 'write'), ctx)).toMatchObject({ ok: false, code: 'capability_unavailable' });
    expect(validateStep(ps('w', 'write'), buildValidateContext(facts()))).toMatchObject({ ok: true });
  });

  test('music is refused until Lyria is in the registry', () => {
    expect(validateStep(ps('song', 'music'), buildValidateContext(facts()))).toMatchObject({ ok: false, code: 'capability_unavailable', reason: 'lyria-3-pro-preview is not in the lifecycle registry' });
  });

  test('an audience gate closes a rolling-out tool for this user', () => {
    const ctx = buildValidateContext(facts({ audience: { video: false } }));
    expect(validateStep(ps('v', 'video'), ctx)).toMatchObject({ ok: false, code: 'policy_denied' });
    expect(validateStep(ps('i', 'image'), ctx)).toMatchObject({ ok: true });
  });

  test('the ceiling is checked on the price book; a tool with no price row is refused', () => {
    const plan: Plan = { title: 't', steps: [ps('a', 'montage'), ps('b', 'montage'), ps('c', 'edit')] };
    expect(validatePlan(plan, buildValidateContext(facts({ runCeilingCredits: 25 })))).toMatchObject({ ok: true });
    expect(validatePlan(plan, buildValidateContext(facts({ runCeilingCredits: 24 })))).toMatchObject({ ok: false, plan: { code: 'policy_denied' } });
    expect(validatePlan(plan, buildValidateContext(facts({ priceBook: { montage: 10 } })))).toMatchObject({ ok: false, plan: { reason: 'step "c" has no price in the price book' } });
    // A broken ceiling (NaN, negative) refuses everything priced above 0 rather than everything passing.
    expect(validatePlan(plan, buildValidateContext(facts({ runCeilingCredits: Number.NaN })))).toMatchObject({ ok: false });
  });
});
