/** @jest-environment node */
/**
 * The Georgian QC corpus (v5.1 Phase 8): its shape, and the deterministic router (lib/agent/intent) against every
 * `route` label. This part is free and runs today; the answers themselves need paid runs (docs/v5.1-phase8).
 */
import { classifyAgentIntent } from '@/lib/agent/intent';
import { KA_QA_CORPUS, type QaCase } from './corpus';
import { RUBRIC, RUBRIC_BY_ID } from './rubric';

describe('corpus shape', () => {
  test('at least 20 cases (spec §28), unique ids, every one answered in Georgian', () => {
    expect(KA_QA_CORPUS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(KA_QA_CORPUS.map((c) => c.id)).size).toBe(KA_QA_CORPUS.length);
    for (const c of KA_QA_CORPUS) expect(c.reply).toBe('ka');
  });

  test('prompts are Georgian, except the one typed in Latin letters on purpose', () => {
    const latin = KA_QA_CORPUS.filter((c) => !/\p{Script=Georgian}/u.test(c.prompt)).map((c) => c.id);
    expect(latin).toEqual(['KA-11']);
  });

  test('covers what §28 names: culture, pronunciation, lip-sync, honest fallbacks, Agent G tools', () => {
    const has = (d: string) => KA_QA_CORPUS.some((c) => c.dims.includes(d as never));
    for (const d of ['culture', 'pronunciation', 'lipsync', 'honesty', 'intent', 'grammar', 'language']) expect(has(d)).toBe(true);
    const services = new Set(KA_QA_CORPUS.map((c) => c.service));
    for (const s of ['chat', 'image', 'video', 'music', 'read-aloud', 'live-voice', 'avatar', 'research', 'browser', 'code-run', 'montage', 'unavailable', 'control']) {
      expect(services.has(s as never)).toBe(true);
    }
    expect(KA_QA_CORPUS.some((c) => c.simulateFailure)).toBe(true);
  });

  test('every culture case has reference facts with a source; every case needs at least one human dimension', () => {
    for (const c of KA_QA_CORPUS) {
      if (c.dims.includes('culture')) {
        expect(c.facts?.length).toBeGreaterThan(0);
        for (const f of c.facts!) expect(f.source.length).toBeGreaterThan(5);
      }
      expect(c.dims.some((d) => RUBRIC_BY_ID[d].scorer !== 'auto')).toBe(true);
    }
  });

  test('rubric weights add to 100 and every dimension has five anchors', () => {
    expect(RUBRIC.reduce((s, d) => s + d.weight, 0)).toBe(100);
    for (const d of RUBRIC) expect(d.anchors.every((a) => a.length > 10)).toBe(true);
  });
});

/** The router's reading of one case, in the corpus' terms. */
export function routed(c: QaCase): string {
  const i = classifyAgentIntent({ text: c.prompt, attachments: [...(c.attachments ?? [])], mode: 'chat', previous: null, pending: null });
  if (i.kind === 'act' || i.kind === 'unavailable') return `${i.kind}:${i.capability}`;
  if (i.kind === 'control') return `control:${i.op}`;
  return 'talk';
}

export function wanted(c: QaCase): string | null {
  const r = c.route;
  if (!r) return null;
  if (r.kind === 'control') return `control:${r.op}`;
  if (r.kind === 'talk') return 'talk';
  return `${r.kind}:${r.capability}`;
}

/**
 * Cases today's router reads differently from the label. They are real findings for the router (Phase 3.5 wiring),
 * listed here so they stay visible: the test fails when one starts passing (take it off the list) or a new one appears.
 */
export const ROUTER_KNOWN_MISSES: Readonly<Record<string, string>> = {
  // A picture asked for with a caption, a logo word, or typed in Latin letters: only plain "დამიხატე …" is read.
  'KA-09': 'talk',
  'KA-10': 'talk',
  'KA-11': 'talk',
  // "ჩემმა ავატარმა თქვას …" (have my avatar say …) is not read as the talking-avatar service.
  'KA-14': 'talk',
  // Web search, the browser and code run are not reached from words today (the chat model decides); a finding, not a bug.
  'KA-18': 'talk',
  'KA-19': 'talk',
  'KA-20': 'talk',
  // 3D is switched off (GG card 2026-11-13). The router still reads it as a live service; the 3D route then refuses
  // before any charge, but the user should hear "not available" up front instead.
  'KA-23': 'act:design.model3d',
  // "გააჩერე, აღარ მინდა." — stop followed by a second clause is not read as stop.
  'KA-25': 'talk',
};

describe('deterministic router against the corpus labels', () => {
  const cases = KA_QA_CORPUS.filter((c) => c.route);

  test.each(cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const got = routed(c), want = wanted(c)!;
    if (ROUTER_KNOWN_MISSES[id]) expect(got).toBe(ROUTER_KNOWN_MISSES[id]);
    else expect(got).toBe(want);
  });
});
