/** @jest-environment node */
/**
 * The whole Phase 3 lifecycle on mocked data: a request → planner (mocked model) → VALIDATE (real lifecycle registry)
 * → parallel EXECUTE (mocked executors) → delivered. Plus the two refusals that must happen before any spend.
 */
import { LIFECYCLE, lifecycleEntry, lifecycleLevel } from '@/lib/capabilities/lifecycle';
import { prepareRun, runSummary, type EngineTool, type ValidateContext } from './index';
import { simulate } from './simulate';

const NOW = new Date('2026-11-13T08:00:00Z');
function ctx(over: Partial<ValidateContext> = {}): ValidateContext {
  const models: Partial<Record<EngineTool, string>> = { write: 'gemini-3.8-flash', speech: 'gemini-3.8-flash-tts', image: 'gemini-3.1-flash-image' };
  return {
    modelOf: (t) => models[t] ?? null,
    lifecycleOf: (m) => { const e = lifecycleEntry(m); return { known: !!e, level: lifecycleLevel(e, NOW, LIFECYCLE) }; },
    serviceOn: () => true, entitled: () => true, inAudience: () => true,
    domainAllowed: (h) => h === 'geostat.ge' || h === 'nbg.gov.ge',
    runCeilingCredits: 200,
    ...over,
  };
}

const ANSWER = '```json\n' + JSON.stringify({
  title: 'თბილისის და ბათუმის ქირა',
  steps: [
    { id: 'tbilisi', tool: 'research', title: 'თბილისის ქირა', params: { urls: ['https://geostat.ge/rent-tbilisi'] }, estimateCredits: 10 },
    { id: 'batumi', tool: 'research', title: 'ბათუმის ქირა', params: { urls: ['https://geostat.ge/rent-batumi'] }, estimateCredits: 10 },
    { id: 'rates', tool: 'research', title: 'ეროვნული ბანკის კურსი', params: { urls: ['https://nbg.gov.ge/rates'] }, estimateCredits: 10 },
    { id: 'chart', tool: 'code', title: 'შედარების გრაფიკი', dependsOn: ['tbilisi', 'batumi', 'rates'], estimateCredits: 20 },
    { id: 'summary', tool: 'write', title: 'მოკლე შეჯამება', dependsOn: ['tbilisi', 'batumi'], estimateCredits: 2 },
    { id: 'pdf', tool: 'pdf', title: 'ქართული PDF', dependsOn: ['chart', 'summary'], estimateCredits: 5 },
    { id: 'library', tool: 'export', title: 'ბიბლიოთეკაში შენახვა', dependsOn: ['pdf'] },
  ],
}) + '\n```';

const input = { request: 'შეადარე თბილისისა და ბათუმის ქირა, გრაფიკით და PDF-ით', lang: 'ka' as const, tools: ['research', 'code', 'write', 'pdf', 'export'] as EngineTool[] };

test('request → plan → validate → three research steps in parallel → chart and summary → PDF → Library', async () => {
  const prepared = await prepareRun(input, async () => ANSWER, ctx());
  expect(prepared).toMatchObject({ ok: true, source: 'model', estimateCredits: 57, widest: 3 });
  if (!prepared.ok) return;
  expect(prepared.levels).toEqual([['tbilisi', 'batumi', 'rates'], ['chart', 'summary'], ['pdf'], ['library']]);

  const r = simulate(prepared.plan, { steps: { tbilisi: [{ ms: 3_000 }], batumi: [{ ms: 2_000 }], rates: [{ ms: 1_000 }], chart: [{ ms: 4_000 }], summary: [{ ms: 1_000 }] } });
  expect(r.run.status).toBe('completed');
  expect(r.peakParallel).toBe(3);
  expect(r.spans.summary![0]!.start).toBe(3_000); // after tbilisi and batumi, not waiting for rates' dependents
  expect(r.spans.pdf![0]!.start).toBe(7_000); // after chart (3 s + 4 s)
  expect(runSummary(r.run).split('\n')[0]).toBe('თბილისის და ბათუმის ქირა [completed]');
  const types = r.events.map((e) => e.type);
  expect(types[0]).toBe('run.planned');
  expect(types.at(-1)).toBe('run.delivered');
});

test('a step that would open a site off the allow-list is refused before any quote', async () => {
  const bad = ANSWER.replace('https://nbg.gov.ge/rates', 'https://unknown.example/rates');
  const prepared = await prepareRun(input, async () => bad, ctx());
  expect(prepared).toMatchObject({ ok: false, stage: 'validate', refused: [{ stepId: 'rates', code: 'policy_denied' }] });
});

test('code closed to this account (admin-only, D-08) is refused with the step named', async () => {
  const prepared = await prepareRun(input, async () => ANSWER, ctx({ entitled: (t) => t !== 'code' }));
  expect(prepared).toMatchObject({ ok: false, stage: 'validate', refused: [{ stepId: 'chart', code: 'policy_denied' }] });
});

test('a planner that never gives a valid plan is a plan-stage refusal', async () => {
  await expect(prepareRun(input, async () => 'no', ctx())).resolves.toMatchObject({ ok: false, stage: 'plan' });
});
