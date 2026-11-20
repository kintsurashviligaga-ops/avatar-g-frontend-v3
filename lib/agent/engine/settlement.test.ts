/** @jest-environment node */
/** Phase 8.10: step 2 of 5 fails — what is refunded, what is skipped, and what the owner is told (mocked executors). */
import { parsePlan } from './plan';
import { simulate } from './simulate';
import { explainRun, reasonText, settlementOf } from './settlement';
import type { Plan, Verifier } from './types';

function plan(steps: Array<[id: string, tool: string, deps?: string[]]>): Plan {
  const r = parsePlan({ title: 't', steps: steps.map(([id, tool, deps]) => ({ id, tool, title: id, dependsOn: deps ?? [] })) });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

// research → image → video → music → export: a chain, so 3-5 depend on 2.
const chain = plan([['research', 'research'], ['image', 'image', ['research']], ['video', 'video', ['image']], ['music', 'music', ['video']], ['export', 'export', ['music']]]);

test('step 2 of 5 fails: 3-5 are skipped and never charged, step 1 is kept, the executor refund is counted, the owner is told in Georgian', () => {
  const r = simulate(chain, {
    steps: {
      research: [{ ms: 500, credits: 0 }],
      // The image executor charged ✦8 and refunded its own miss (both attempts: one retry on a retryable error).
      image: [{ ms: 500, credits: 8, refunded: 8, fail: { error: 'Vertex 503 unavailable', retryable: true } }],
    },
  });
  expect(r.run.status).toBe('partially_completed');
  expect(r.run.steps.map((s) => s.status)).toEqual(['done', 'failed', 'skipped', 'skipped', 'skipped']);
  // Skipped steps never started: no start effect, no charge.
  expect(r.effects.filter((e) => e.type === 'start' && ['video', 'music', 'export'].includes(e.stepId))).toHaveLength(0);

  const m = settlementOf(r.run);
  expect(m).toMatchObject({ charged: 16, returned: 16, kept: 0, owed: 0 });
  const delivered = r.events.find((e) => e.type === 'run.delivered');
  expect(delivered?.data?.credits).toBe(0); // the card no longer shows refunded money as spent

  const ka = explainRun(r.run, 'ka')!;
  expect(ka).toContain('5-დან 2-ე ნაბიჯი („image“) ვერ შესრულდა: სერვისი ახლა გადატვირთულია.');
  expect(ka).toContain('3, 4, 5 ნაბიჯ(ებ)ი არ დაიწყო');
  expect(ka).toContain('არაფერი ჩამოჭრილა');
  expect(ka).toContain('1 ნაბიჯ(ებ)ის შედეგი შენახულია');
  expect(ka).toContain('✦16 დაგიბრუნდა.');
  expect(ka).toContain('სულ ჩამოიჭრა: ✦0.');
  expect(ka).toContain('ჯერ ფასს გაჩვენებ');
  expect(ka).not.toMatch(/503|Vertex/); // never the raw error
});

const rejectVideo: Verifier = (step) => (step.id === 'video' ? { ok: false, error: 'no audio track', retryable: false } : { ok: true });

test('VERIFY rejects a result the executor charged for: with refundRejected the engine asks for that refund', () => {
  const p = plan([['image', 'image'], ['video', 'video', ['image']]]);
  const script = { steps: { image: [{ ms: 500, credits: 8 }], video: [{ ms: 500, credits: 28 }] } };

  const before = simulate(p, script, { verify: rejectVideo });
  expect(before.effects.some((e) => e.type === 'refund')).toBe(false);
  // Phase 3 behaviour: ✦28 charged for a rejected clip and nothing will give it back.
  expect(settlementOf(before.run)).toMatchObject({ kept: 36, owed: 28 });
  expect(explainRun(before.run, 'ka')).toContain('✦28 ჯერ არ დაბრუნებულა');

  const after = simulate(p, script, { verify: rejectVideo, refundRejected: true });
  const refunds = after.effects.filter((e) => e.type === 'refund');
  expect(refunds).toEqual([expect.objectContaining({ stepId: 'video', credits: 28, reason: 'verify: no audio track' })]);
  expect(settlementOf(after.run)).toMatchObject({ kept: 8, returned: 28, owed: 0 });
  const ka = explainRun(after.run, 'ka')!;
  expect(ka).toContain('შედეგმა ხარისხის შემოწმება ვერ გაიარა');
  expect(ka).toContain('✦28 დაგიბრუნდა.');
  expect(ka).toContain('სულ ჩამოიჭრა: ✦8.');
});

test('a completed run says so and what it cost; a running run says nothing yet', () => {
  const p = plan([['a', 'write'], ['b', 'write', ['a']]]);
  const r = simulate(p, { steps: { a: [{ ms: 100, credits: 0 }], b: [{ ms: 100, credits: 0 }] } });
  expect(explainRun(r.run, 'ka')).toBe('ყველა 2 ნაბიჯი შესრულდა. სულ ჩამოიჭრა: ✦0.');
  expect(explainRun({ ...r.run, status: 'running' }, 'ka')).toBeNull();
  expect(explainRun(r.run, 'en')).toBe('All 2 steps are done. Total charged: ✦0.');
});

test('reasons are plain words for every common code, never the raw code', () => {
  for (const code of ['deadline', 'approval_timeout', 'cancelled', 'verify: x', 'tool timeout', '429 rate', 'SAFETY blocked', 'insufficient_credits', 'input_missing', 'weird_code_123']) {
    const t = reasonText(code, 'ka');
    expect(t).toMatch(/[ა-ჰ]/);
    expect(t).not.toContain(code);
  }
});
