/** @jest-environment node */
/**
 * The Deep Research billing saga against the REAL store (over an in-memory database), a ledger with the real semantics
 * and a scripted provider. These tests ARE the money rules: reserve before the provider; nothing starts when the reserve
 * did not succeed; one POST; refunds from the ledger, once; owner-only cancel; the sweeper settles exactly once.
 */
jest.mock('server-only', () => ({}));

import { researchCredits } from './pricing';
import { makeHarness, T0, type Harness } from './testing/fakes';
import { POLL_EVERY_MS, MIN_POLL_GAP_MS, NOT_FOUND_GRACE_MS, RESERVING_STUCK_MS, RESERVED_STUCK_MS, SUBMITTING_STUCK_MS } from './service';
import type { StartOutcome } from './interactionsClient';

const PRICE = researchCredits();
const U = 'u1';
const req = (over: Record<string, unknown> = {}) => ({ userId: U, prompt: 'Compare the wine export markets', locale: 'en' as const, confirmedCredits: PRICE, requestId: 'req-1', ...over });

const completedAnswer = (text = '# Wine markets\n\n## Findings\n\nBody.\n') => ({
  id: 'interaction-1',
  status: 'completed',
  steps: [
    { type: 'thought', summary: [{ type: 'text', text: 'Writing' }] },
    { type: 'model_output', content: [{ type: 'text', text, annotations: [{ type: 'url_citation', url: 'https://example.org/a', title: 'Source A' }, { type: 'url_citation', url: 'https://example.org/b', title: 'Source B' }] }] },
  ],
  usage: { total_input_tokens: 1000, total_output_tokens: 500 },
});

async function started(h: Harness, over: Record<string, unknown> = {}) {
  const r = await h.service.start(req(over));
  if (!r.ok) throw new Error(`start failed: ${r.code}`);
  return r.job;
}

describe('start — the price the user saw is the price charged', () => {
  test('no confirmation, or a different number, is refused before anything is written, charged or sent', async () => {
    const h = makeHarness();
    expect(await h.service.start(req({ confirmedCredits: undefined }))).toEqual({ ok: false, code: 'confirmation_required', credits: PRICE });
    expect(await h.service.start(req({ confirmedCredits: null }))).toMatchObject({ ok: false, code: 'confirmation_required' });
    expect(await h.service.start(req({ confirmedCredits: PRICE - 1 }))).toEqual({ ok: false, code: 'price_changed', credits: PRICE });
    expect(await h.service.start(req({ confirmedCredits: PRICE + 1 }))).toMatchObject({ code: 'price_changed' });
    expect(h.db.writes()).toEqual([]);
    expect(h.ledger.calls).toEqual([]);
    expect(h.client.startCalls).toEqual([]);
  });
});

describe('start — reserve BEFORE the provider, and never call the provider when the reserve failed', () => {
  test('happy path: exactly the price is taken first, then ONE provider POST, then the job is running', async () => {
    const h = makeHarness();
    const order: string[] = [];
    h.client.onStart = () => order.push(`provider:balance=${h.ledger.balance}`);
    const job = await started(h);
    expect(order).toEqual([`provider:balance=${1_000 - PRICE}`]); // the debit had landed when the provider was called
    expect(h.ledger.calls).toEqual([`deduct:${PRICE}:research:${job.id}`]);
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.client.startCalls[0]!.agent).toBe('deep-research-preview-04-2026');
    expect(h.client.startCalls[0]!.input).toContain('Compare the wine export markets');
    expect(job).toMatchObject({ status: 'running', provider_interaction_id: 'interaction-1', charge_credits: PRICE, charge_ref: `research:${job.id}`, counted: true });
    expect(h.ledger.balance).toBe(1_000 - PRICE);
  });

  test('insufficient credits: the provider is never called, the job stops counting, no refund is needed', async () => {
    const h = makeHarness({ balance: PRICE - 1 });
    const r = await h.service.start(req());
    expect(r).toEqual({ ok: false, code: 'insufficient_credits', credits: PRICE });
    expect(h.client.startCalls).toEqual([]);
    expect(h.jobs()[0]).toMatchObject({ status: 'failed', error_code: 'insufficient_credits', counted: false });
    expect(h.ledger.balance).toBe(PRICE - 1);
  });

  test.each([['skipped'], ['error']] as const)('a ledger answer of "%s" fails CLOSED — the provider is never called', async (mode) => {
    const h = makeHarness();
    h.ledger.nextDeduct = mode;
    const r = await h.service.start(req());
    expect(r).toMatchObject({ ok: false, code: 'billing_unavailable' });
    expect(h.client.startCalls).toEqual([]);
    expect(h.ledger.balance).toBe(1_000);
    expect(h.jobs()[0]).toMatchObject({ status: 'failed', counted: false });
  });

  test('a debit that COMMITTED but whose answer was lost is paid back from the ledger, and the provider is never called', async () => {
    const h = makeHarness();
    h.ledger.nextDeduct = 'commit-then-throw';
    const r = await h.service.start(req());
    expect(r).toMatchObject({ ok: false, code: 'billing_unavailable' });
    expect(h.client.startCalls).toEqual([]);
    expect(h.ledger.balance).toBe(1_000); // taken, then refunded — net zero
  });

  test('an unreadable store fails closed: nothing is charged or sent', async () => {
    const h = makeHarness();
    h.db.failNext('research_jobs', 'insert');
    expect(await h.service.start(req())).toMatchObject({ ok: false, code: 'unavailable' });
    expect(h.ledger.calls).toEqual([]);
    expect(h.client.startCalls).toEqual([]);

    const h2 = makeHarness();
    // the cap counts cannot be read → no debit, no provider call
    h2.db.failNext('research_jobs', 'select');
    h2.db.failNext('research_jobs', 'select');
    h2.db.failNext('research_jobs', 'select');
    const r = await h2.service.start(req({ requestId: undefined }));
    expect(r).toMatchObject({ ok: false, code: 'unavailable' });
    expect(h2.ledger.calls).toEqual([]);
    expect(h2.client.startCalls).toEqual([]);
  });
});

describe('start — a provider failure is refunded in full; one POST, never a retry', () => {
  test.each([
    [{ ok: false, failure: 'provider_rejected', ambiguous: false, status: 400, detail: 'HTTP 400: bad' }, 'provider_rejected', 'provider_rejected'],
    [{ ok: false, failure: 'provider_rate_limited', ambiguous: false, status: 429, detail: 'HTTP 429' }, 'provider_rate_limited', 'provider_rate_limited'],
    [{ ok: false, failure: 'provider_unfunded', ambiguous: false, status: 402, detail: 'HTTP 402: billing' }, 'provider_unfunded', 'provider_unfunded'],
    [{ ok: false, failure: 'not_configured', ambiguous: false, detail: 'no key' }, 'provider_unavailable', 'provider_unavailable'],
  ] as Array<[StartOutcome, string, string]>)('%j → refunded, job failed as %s', async (outcome, code, failure) => {
    const h = makeHarness();
    h.client.startScript = [outcome];
    const r = await h.service.start(req());
    expect(r).toMatchObject({ ok: false, code, providerFailure: failure });
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.ledger.balance).toBe(1_000);
    expect(h.jobs()[0]).toMatchObject({ status: 'failed', error_code: code, refund_state: 'done', refunded_credits: PRICE });
  });

  test('an AMBIGUOUS start (timeout / 5xx / no id) refunds, alerts, and is never re-sent', async () => {
    const h = makeHarness();
    h.client.startScript = [{ ok: false, failure: 'provider_unavailable', ambiguous: true, detail: 'timeout' }];
    const r = await h.service.start(req());
    expect(r).toMatchObject({ ok: false, code: 'submit_ambiguous', providerFailure: 'provider_unavailable' });
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.ledger.balance).toBe(1_000);
    expect(h.alerts.map((a) => a.marker)).toContain('research_submit_ambiguous');
    // and a sweep later does not send it again
    h.clock.ms += SUBMITTING_STUCK_MS + 60_000;
    await h.service.sweep();
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.ledger.refunded(h.jobs()[0]!.charge_ref)).toBe(PRICE);
  });

  test('the provider text never reaches the caller: the result carries only a class code', async () => {
    const h = makeHarness();
    h.client.startScript = [{ ok: false, failure: 'provider_unfunded', ambiguous: false, status: 402, detail: 'HTTP 402: Visit https://console.cloud.google.com/billing to add credit' }];
    const r = await h.service.start(req());
    expect(JSON.stringify(r)).not.toMatch(/google|billing|console|http/i);
  });

  test('a refund that cannot land stays pending (retried by the sweeper) — and then lands exactly once', async () => {
    const h = makeHarness();
    h.client.startScript = [{ ok: false, failure: 'provider_rejected', ambiguous: false, status: 400, detail: 'x' }];
    h.ledger.failRefunds = 1;
    await h.service.start(req());
    expect(h.jobs()[0]).toMatchObject({ status: 'failed', refund_state: 'pending' });
    expect(h.ledger.balance).toBe(1_000 - PRICE);
    expect(h.alerts.map((a) => a.marker)).toContain('research_refund_failed');
    const rep = await h.service.sweep();
    expect(rep.refundsRetried).toBe(1);
    expect(h.ledger.balance).toBe(1_000);
    expect(h.jobs()[0]).toMatchObject({ refund_state: 'done', refunded_credits: PRICE });
    await h.service.sweep();
    expect(h.ledger.balance).toBe(1_000); // a second sweep refunds nothing more
  });
});

describe('start — the caps (counted after the row exists; fail closed)', () => {
  test('too many active jobs: refused with no debit, and the refused job stops counting', async () => {
    const h = makeHarness({ limits: { maxActive: 2 } });
    await started(h, { requestId: 'a' });
    await started(h, { requestId: 'b' });
    const r = await h.service.start(req({ requestId: 'c' }));
    expect(r).toEqual({ ok: false, code: 'too_many_active' });
    expect(h.client.startCalls).toHaveLength(2);
    expect(h.ledger.balance).toBe(1_000 - 2 * PRICE);
    expect(h.jobs().find((j) => j.client_request_id === 'c')).toMatchObject({ status: 'failed', counted: false });
  });

  test('per-account daily cap counts finished jobs too (a cancel loop cannot dodge it)', async () => {
    const h = makeHarness({ limits: { userDaily: 2, maxActive: 3 } });
    const a = await started(h, { requestId: 'a' });
    await h.service.cancel(a.id, U);
    await started(h, { requestId: 'b' });
    const r = await h.service.start(req({ requestId: 'c' }));
    expect(r).toEqual({ ok: false, code: 'daily_limit' });
    expect(h.client.startCalls).toHaveLength(2);
  });

  test('another account is not affected by this one\'s daily cap', async () => {
    const h = makeHarness({ limits: { userDaily: 1, maxActive: 3 } });
    await started(h, { requestId: 'a' });
    expect(await h.service.start(req({ requestId: 'b' }))).toMatchObject({ code: 'daily_limit' });
    expect((await h.service.start(req({ userId: 'u2', requestId: 'c' }))).ok).toBe(true);
  });

  test('the GLOBAL daily cap refuses when the platform has started enough', async () => {
    const h = makeHarness({ limits: { globalDaily: 2, userDaily: 20, maxActive: 3 } });
    await started(h, { requestId: 'a' });
    await started(h, { userId: 'u2', requestId: 'b' });
    expect(await h.service.start(req({ userId: 'u3', requestId: 'c' }))).toEqual({ ok: false, code: 'capacity_reached' });
    expect(h.client.startCalls).toHaveLength(2);
  });

  test('RESEARCH_DAILY_CAP=0 (the kill switch) and RESEARCH_ENABLED off both stop everything before a write', async () => {
    const closed = makeHarness({ limits: { globalDaily: 0 } });
    expect(await closed.service.start(req())).toEqual({ ok: false, code: 'unavailable' });
    expect(closed.db.writes()).toEqual([]);
    const off = makeHarness({ limits: { enabled: false } });
    expect(await off.service.start(req())).toEqual({ ok: false, code: 'unavailable' });
    expect(off.db.writes()).toEqual([]);
  });

  test('yesterday\'s jobs do not count toward today\'s cap', async () => {
    const h = makeHarness({ limits: { userDaily: 1, maxActive: 3 } });
    const a = await started(h, { requestId: 'a' });
    await h.service.cancel(a.id, U);
    h.clock.ms += 24 * 60 * 60_000;
    expect((await h.service.start(req({ requestId: 'b' }))).ok).toBe(true);
  });
});

describe('start — idempotency: a replay never charges or sends twice', () => {
  test('the same request id returns the same job: ONE debit, ONE provider call', async () => {
    const h = makeHarness();
    const first = await h.service.start(req());
    const second = await h.service.start(req());
    expect(first.ok && second.ok && first.job.id === second.job.id).toBe(true);
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(h.ledger.calls.filter((c) => c.startsWith('deduct'))).toHaveLength(1);
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.jobs()).toHaveLength(1);
  });

  test('two CONCURRENT starts with one key: one debit, one provider call, both get the job', async () => {
    const h = makeHarness();
    const [a, b] = await Promise.all([h.service.start(req()), h.service.start(req())]);
    expect(a.ok && b.ok).toBe(true);
    expect(h.jobs()).toHaveLength(1);
    expect(h.ledger.calls.filter((c) => c.startsWith('deduct'))).toHaveLength(1);
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.ledger.balance).toBe(1_000 - PRICE);
  });

  test('a replay of a request that FAILED returns that failed job — it is not retried for free', async () => {
    const h = makeHarness();
    h.client.startScript = [{ ok: false, failure: 'provider_rejected', ambiguous: false, status: 400, detail: 'x' }];
    await h.service.start(req());
    const again = await h.service.start(req());
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(again.ok && again.job.status).toBe('failed');
    expect(h.client.startCalls).toHaveLength(1);
  });
});

describe('start — the user\'s own documents', () => {
  test('are folded into the input, recorded as metadata only, and a stranger\'s file is refused before any write', async () => {
    const h = makeHarness();
    h.files.add(U, { id: 'f1', name: 'brief.pdf', text: 'Clause one is important.' });
    h.files.add('someone-else', { id: 'f2', name: 'secret.txt', text: 'not yours' });
    const job = await started(h, { fileIds: ['f1'] });
    expect(h.client.startCalls[0]!.input).toContain('Clause one is important.');
    expect(h.client.startCalls[0]!.input).toContain('[Document 1: brief.pdf]');
    expect(job.context_files).toEqual([{ id: 'f1', name: 'brief.pdf', chars: 'Clause one is important.'.length }]);
    expect(JSON.stringify(job.context_files)).not.toContain('important');

    const h2 = makeHarness();
    h2.files.add('someone-else', { id: 'f2', name: 'secret.txt', text: 'not yours' });
    expect(await h2.service.start(req({ fileIds: ['f2'] }))).toEqual({ ok: false, code: 'invalid_file' });
    expect(h2.db.writes()).toEqual([]);
    expect(h2.ledger.calls).toEqual([]);
  });
});

describe('polling and settlement', () => {
  async function running(h: Harness) {
    const job = await started(h);
    h.clock.ms += POLL_EVERY_MS + 1_000;
    return job;
  }

  test('a completed run stores the report, its sources and a title, and files ONE notification', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs(completedAnswer());
    const done = await h.service.advance(job);
    expect(done).toMatchObject({ status: 'completed', title: 'Wine markets', sources_count: 2, incomplete: false, error_code: null });
    expect(done.report_md).toContain('## Findings');
    expect(done.sources).toEqual([{ url: 'https://example.org/a', title: 'Source A' }, { url: 'https://example.org/b', title: 'Source B' }]);
    expect(h.notified).toEqual([{ id: job.id, outcome: 'completed' }]);
    expect(h.ledger.balance).toBe(1_000 - PRICE); // charged, not refunded
  });

  test('two pollers at once settle it once: one completion, one notification (the compare-and-set)', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs(completedAnswer());
    await Promise.all([h.service.advance(job, { force: true }), h.service.advance(job, { force: true })]);
    expect(h.jobs()[0]!.status).toBe('completed');
    expect(h.notified).toHaveLength(1);
  });

  test('the provider is not hammered: two reads inside MIN_POLL_GAP poll once', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'in_progress', steps: [{ type: 'google_search_call', arguments: { queries: ['q'] } }] });
    await h.service.advance(job);
    await h.service.advance(h.job(job.id));
    expect(h.client.pollCalls).toHaveLength(1);
    h.clock.ms += MIN_POLL_GAP_MS + 1;
    await h.service.advance(h.job(job.id));
    expect(h.client.pollCalls).toHaveLength(2);
  });

  test('in progress: the thinking summary is stored as progress and the job keeps running', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'in_progress', steps: [{ type: 'thought', summary: [{ type: 'text', text: '**Reading** the agency statistics' }] }, { type: 'google_search_call', arguments: { queries: ['wine exports 2025'] } }] });
    const after = await h.service.advance(job);
    expect(after.status).toBe('running');
    expect(h.job(job.id).progress).toMatchObject({ summary: 'Reading the agency statistics', searches: 1, lastQuery: 'wine exports 2025' });
    expect(Date.parse(h.job(job.id).next_poll_at)).toBeGreaterThan(h.clock.ms);
  });

  test('a provider FAILURE refunds from the ledger exactly once and files one failure notice', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'failed', errors: [{ code: 'x', message: 'quota exceeded' }] });
    const failed = await h.service.advance(job);
    expect(failed).toMatchObject({ status: 'failed', error_code: 'provider_failed', refund_state: 'done', refunded_credits: PRICE });
    expect(h.ledger.balance).toBe(1_000);
    expect(h.notified).toEqual([{ id: job.id, outcome: 'failed' }]);
    h.clock.ms += POLL_EVERY_MS;
    await h.service.advance(h.job(job.id), { force: true });
    await h.service.sweep();
    expect(h.ledger.balance).toBe(1_000);
    expect(h.notified).toHaveLength(1);
  });

  test('"completed" with no report is a failure that refunds (the user never pays for an empty answer)', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'completed', steps: [{ type: 'thought', summary: [{ type: 'text', text: 'hmm' }] }] });
    const r = await h.service.advance(job);
    expect(r).toMatchObject({ status: 'failed', error_code: 'empty_report', refund_state: 'done' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('"incomplete" with a partial report is delivered and flagged; with none it is refunded', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'incomplete', steps: [{ type: 'model_output', content: [{ type: 'text', text: '# Partial\n\nCut off' }] }] });
    expect(await h.service.advance(job)).toMatchObject({ status: 'completed', incomplete: true });

    const h2 = makeHarness();
    const j2 = await running(h2);
    h2.client.pollsAs({ status: 'incomplete', steps: [] });
    expect(await h2.service.advance(j2)).toMatchObject({ status: 'failed', error_code: 'empty_report', refund_state: 'done' });
  });

  test('cancelled by the provider on its own → failed + refunded; requires_action → provider cancel + refund', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'cancelled' });
    expect(await h.service.advance(job)).toMatchObject({ status: 'failed', error_code: 'provider_canceled', refund_state: 'done' });

    const h2 = makeHarness();
    const j2 = await running(h2);
    h2.client.pollsAs({ status: 'requires_action' });
    expect(await h2.service.advance(j2)).toMatchObject({ status: 'failed', error_code: 'requires_action', refund_state: 'done' });
    expect(h2.client.cancelCalls).toEqual(['interaction-1']);
  });

  test('a transient poll miss changes nothing but a counter; a 404 inside the grace window is waited out, after it the job is lost + refunded', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollScript = [{ ok: false, kind: 'transient', status: 503, detail: 'x' }];
    const after = await h.service.advance(job);
    expect(after.status).toBe('running');
    expect(h.job(job.id).poll_failures).toBe(1);

    h.client.pollScript = [{ ok: false, kind: 'not_found', status: 404, detail: 'gone' }];
    h.clock.ms += MIN_POLL_GAP_MS + 1;
    await h.service.advance(h.job(job.id));
    expect(h.job(job.id).status).toBe('running'); // still inside NOT_FOUND_GRACE_MS of the start

    h.clock.ms += NOT_FOUND_GRACE_MS;
    await h.service.advance(h.job(job.id));
    expect(h.job(job.id)).toMatchObject({ status: 'failed', error_code: 'provider_lost', refund_state: 'done' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('past its deadline a still-running job is cancelled at the provider and refunded as a timeout', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.clock.ms += 62 * 60_000;
    h.client.pollsAs({ status: 'in_progress' });
    const r = await h.service.advance(job);
    expect(r).toMatchObject({ status: 'failed', error_code: 'timeout', refund_state: 'done' });
    expect(h.client.cancelCalls).toEqual(['interaction-1']);
    expect(h.ledger.balance).toBe(1_000);
    expect(h.notified).toEqual([{ id: job.id, outcome: 'failed' }]);
  });

  test('an unknown provider status never completes a job', async () => {
    const h = makeHarness();
    const job = await running(h);
    h.client.pollsAs({ status: 'wat', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'looks like a report' }] }] });
    expect((await h.service.advance(job)).status).toBe('running');
  });
});

describe('compare-and-set — only the racer that wins a transition owns what follows', () => {
  test('a LATE failure (stale view of a running job) cannot overwrite a job that already completed, and refunds nothing', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.clock.ms += POLL_EVERY_MS + 1_000;
    h.client.pollsAs(completedAnswer());
    await h.service.advance(job); // `job` is now a stale view: it still says 'running'
    const lost = await h.service.failAndRefund(job, 'failed', 'timeout', 'late', ['running']);
    expect(lost).toBeNull();
    expect(h.job(job.id)).toMatchObject({ status: 'completed', error_code: null, refund_state: null });
    expect(h.ledger.balance).toBe(1_000 - PRICE);
    expect(h.ledger.refunded(job.charge_ref)).toBe(0);
  });

  test('a job whose notice was already filed is not notified again', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.db.rows('research_jobs')[0]!.notified_at = new Date(T0).toISOString();
    h.clock.ms += POLL_EVERY_MS + 1_000;
    h.client.pollsAs(completedAnswer());
    expect((await h.service.advance(job)).status).toBe('completed');
    expect(h.notified).toEqual([]);
  });
});

describe('cancel — owner only, refunded, idempotent', () => {
  test('a running job: the provider is told, its own state confirms, the credits come back once', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.client.pollsAs({ status: 'cancelled' });
    const r = await h.service.cancel(job.id, U);
    expect(r.ok && r.job).toMatchObject({ status: 'canceled', error_code: 'user_canceled', refund_state: 'done', cancel_requested: true });
    expect(h.client.cancelCalls).toEqual(['interaction-1']);
    expect(h.ledger.balance).toBe(1_000);
    const again = await h.service.cancel(job.id, U);
    expect(again.ok && again.job.status).toBe('canceled');
    expect(h.client.cancelCalls).toHaveLength(1);
    expect(h.ledger.balance).toBe(1_000);
  });

  test('someone else\'s job is "not found" — the provider is never touched', async () => {
    const h = makeHarness();
    const job = await started(h);
    expect(await h.service.cancel(job.id, 'attacker')).toEqual({ ok: false, code: 'not_found' });
    expect(await h.service.cancel('00000000-0000-4000-8000-ffffffffffff', U)).toEqual({ ok: false, code: 'not_found' });
    expect(h.client.cancelCalls).toEqual([]);
    expect(h.jobs()[0]!.status).toBe('running');
  });

  test('a reserved (not yet sent) job is cancelled and refunded with no provider call', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.db.rows('research_jobs')[0]!.status = 'reserved';
    h.db.rows('research_jobs')[0]!.provider_interaction_id = null;
    const r = await h.service.cancel(job.id, U);
    expect(r.ok && r.job).toMatchObject({ status: 'canceled', refund_state: 'done' });
    expect(h.client.cancelCalls).toEqual([]);
    expect(h.ledger.balance).toBe(1_000);
  });

  test('while reserving / submitting it is "too early" — nothing changes', async () => {
    for (const status of ['reserving', 'submitting'] as const) {
      const h = makeHarness();
      const job = await started(h);
      h.db.rows('research_jobs')[0]!.status = status;
      expect(await h.service.cancel(job.id, U)).toEqual({ ok: false, code: 'too_early' });
      expect(h.ledger.balance).toBe(1_000 - PRICE);
    }
  });

  test('if the provider cannot confirm, the intent is recorded and the credits are NOT refunded yet; the sweeper retries the cancel', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.client.cancelScript = [{ ok: false, kind: 'transient', status: 503, detail: 'x' }, { ok: true, parsed: { ...require('./parse').parseInteraction({ status: 'cancelled' }) } }];
    const r = await h.service.cancel(job.id, U);
    expect(r.ok && r.job.status).toBe('running');
    expect(h.job(job.id).cancel_requested).toBe(true);
    expect(h.ledger.balance).toBe(1_000 - PRICE);
    // next sweep: the job is still in progress at the provider → the cancel is retried
    h.clock.ms += POLL_EVERY_MS + 1_000;
    h.client.pollsAs({ status: 'in_progress' }, { status: 'cancelled' });
    await h.service.sweep();
    expect(h.client.cancelCalls.length).toBeGreaterThanOrEqual(2);
    h.clock.ms += POLL_EVERY_MS + 1_000;
    await h.service.sweep();
    expect(h.job(job.id)).toMatchObject({ status: 'canceled', refund_state: 'done' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('if the run FINISHED while the user pressed cancel, they get the report they paid for — and no refund', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.client.cancelScript = [{ ok: false, kind: 'not_running', status: 400, detail: 'already completed' }];
    h.client.pollsAs(completedAnswer());
    const r = await h.service.cancel(job.id, U);
    expect(r.ok && r.job).toMatchObject({ status: 'completed' });
    expect(h.ledger.balance).toBe(1_000 - PRICE);
  });
});

describe('the sweeper — every path a crash can leave, settled exactly once', () => {
  test('a job stuck in `reserving` WITH a committed debit is refunded and closed (counted: false)', async () => {
    const h = makeHarness();
    const job = await started(h);
    // crash after the debit, before the CAS to reserved: put the row back
    Object.assign(h.db.rows('research_jobs')[0]!, { status: 'reserving', provider_interaction_id: null, provider_started_at: null });
    h.clock.ms += RESERVING_STUCK_MS + 1_000;
    const rep = await h.service.sweep();
    expect(rep.stuckReserving).toBe(1);
    expect(h.job(job.id)).toMatchObject({ status: 'failed', error_code: 'stuck', counted: false, refund_state: 'done' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('a job stuck in `reserving` WITHOUT a debit is closed with nothing to refund', async () => {
    const h = makeHarness();
    h.ledger.nextDeduct = 'skipped';
    await h.service.start(req());
    Object.assign(h.db.rows('research_jobs')[0]!, { status: 'reserving', counted: true, refund_state: null });
    h.clock.ms += RESERVING_STUCK_MS + 1_000;
    await h.service.sweep();
    expect(h.jobs()[0]).toMatchObject({ status: 'failed', refund_state: 'nothing_to_refund' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('a charged-but-unsent (`reserved`) job is RESUMED: ONE provider POST, then running', async () => {
    const h = makeHarness();
    const job = await started(h);
    Object.assign(h.db.rows('research_jobs')[0]!, { status: 'reserved', provider_interaction_id: null, provider_started_at: null });
    h.client.startCalls.length = 0;
    h.clock.ms += RESERVED_STUCK_MS + 1_000;
    const rep = await h.service.sweep();
    expect(rep.resumed).toBe(1);
    expect(h.client.startCalls).toHaveLength(1);
    expect(h.job(job.id)).toMatchObject({ status: 'running', provider_interaction_id: 'interaction-1' });
    // a second, overlapping sweep does not send it again
    h.clock.ms += RESERVED_STUCK_MS + 1_000;
    await h.service.sweep();
    expect(h.client.startCalls).toHaveLength(1);
  });

  test('a resumed job whose attached document was deleted is refunded, not run without it', async () => {
    const h = makeHarness();
    h.files.add(U, { id: 'f1', name: 'brief.pdf', text: 'text' });
    const job = await started(h, { fileIds: ['f1'] });
    Object.assign(h.db.rows('research_jobs')[0]!, { status: 'reserved', provider_interaction_id: null });
    h.files.files.delete('f1');
    h.client.startCalls.length = 0;
    h.clock.ms += RESERVED_STUCK_MS + 1_000;
    await h.service.sweep();
    expect(h.client.startCalls).toEqual([]);
    expect(h.job(job.id)).toMatchObject({ status: 'failed', error_code: 'context_missing', refund_state: 'done' });
    expect(h.ledger.balance).toBe(1_000);
  });

  test('a job stuck mid-POST (`submitting`) is ambiguous: refunded, alerted, NEVER re-sent', async () => {
    const h = makeHarness();
    const job = await started(h);
    Object.assign(h.db.rows('research_jobs')[0]!, { status: 'submitting', provider_interaction_id: null });
    h.client.startCalls.length = 0;
    h.clock.ms += SUBMITTING_STUCK_MS + 1_000;
    const rep = await h.service.sweep();
    expect(rep.stuckSubmitting).toBe(1);
    expect(h.client.startCalls).toEqual([]);
    expect(h.job(job.id)).toMatchObject({ status: 'failed', error_code: 'submit_ambiguous', refund_state: 'done' });
    expect(h.alerts.map((a) => a.marker)).toContain('research_submit_ambiguous');
    expect(h.ledger.balance).toBe(1_000);
  });

  test('due running jobs are polled and settled; two overlapping sweeps still settle ONCE (one notification, one charge)', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.clock.ms += POLL_EVERY_MS + 1_000;
    h.client.pollsAs(completedAnswer());
    const [a, b] = await Promise.all([h.service.sweep(), h.service.sweep()]);
    expect(a.polled + b.polled).toBeGreaterThanOrEqual(1);
    expect(h.job(job.id).status).toBe('completed');
    expect(h.notified).toHaveLength(1);
    expect(h.ledger.balance).toBe(1_000 - PRICE);
    expect(h.ledger.refunded(job.charge_ref)).toBe(0);
  });

  test('a job that is not due yet is left alone', async () => {
    const h = makeHarness();
    await started(h);
    const rep = await h.service.sweep();
    expect(rep.polled).toBe(0);
    expect(h.client.pollCalls).toEqual([]);
  });

  test('one broken job does not stop the sweep (errors are counted, the rest proceed)', async () => {
    const h = makeHarness({ limits: { maxActive: 3 } });
    const a = await started(h, { requestId: 'a' });
    const b = await started(h, { requestId: 'b' });
    h.clock.ms += POLL_EVERY_MS + 1_000;
    let n = 0;
    h.client.poll = async () => {
      if (++n === 1) throw new Error('boom');
      return { ok: true as const, parsed: require('./parse').parseInteraction(completedAnswer()) };
    };
    const rep = await h.service.sweep();
    expect(rep.errors).toBe(1);
    const statuses = [h.job(a.id).status, h.job(b.id).status].sort();
    expect(statuses).toEqual(['completed', 'running']);
  });
});

describe('refresh — the read-through poll never throws into a page', () => {
  test('returns the stored job when the provider read fails', async () => {
    const h = makeHarness();
    const job = await started(h);
    h.clock.ms += POLL_EVERY_MS + 1_000;
    h.client.poll = async () => { throw new Error('socket hang up'); };
    const r = await h.service.refresh(job);
    expect(r.status).toBe('running');
  });
  test('a non-running job is returned as is, with no provider call', async () => {
    const h = makeHarness();
    const job = await started(h);
    await h.service.cancel(job.id, U);
    h.client.pollCalls.length = 0;
    await h.service.refresh(h.job(job.id));
    expect(h.client.pollCalls).toEqual([]);
  });
});

test('the harness clock starts where the tests expect (guards the fixtures above)', () => {
  expect(T0).toBe(Date.UTC(2026, 9, 2, 12, 0, 0));
});
