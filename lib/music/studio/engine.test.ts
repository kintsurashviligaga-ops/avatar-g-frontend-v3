/**
 * Music Studio v1 engine — quote, confirm, reserve, render, QC, deliver, and every money path, against the in-memory
 * lease store that has the live store's semantics. The provider is FAKED here (no Lyria call is made); real-provider
 * execution is Phase 8 and is not claimed by this file.
 */
import { createHmac } from 'node:crypto';
import { memoryLeaseStore, type MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import { musicCapabilities } from './capabilities';
import { cancelMusic, musicStatus, quoteMusic, settleMusic, startMusic, sweepMusic, workMusic, priceOf, type MusicDeps } from './engine';
import type { MusicOutput, MusicPlan, SavedTrack } from './contracts';
import { MusicError } from './errors';

const USER = 'user-a';
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const OTHER = 'user-b';
/** Vertex AI with Workload Identity, the only Google transport (MASTER TASK v3.1). An AI Studio key configures nothing. */
const ENV = {
  MUSIC_STUDIO_ENABLED: '1',
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
} as unknown as NodeJS.ProcessEnv;

interface Harness {
  deps: MusicDeps;
  store: MemoryLeaseStore;
  clock: { now: number };
  ledger: Map<string, number>;
  refunds: string[];
  generated: string[];
  beats: Array<() => Promise<void>>;
  env: NodeJS.ProcessEnv;
}

function harness(over: Partial<MusicDeps> = {}): Harness {
  const clock = { now: 1_700_000_000_000 };
  const store = memoryLeaseStore(() => clock.now);
  const ledger = new Map<string, number>();
  const refunds: string[] = [];
  const generated: string[] = [];
  const beats: Array<() => Promise<void>> = [];
  let n = 0;
  const env = { ...ENV };
  const saved = (id: string): SavedTrack => ({
    bucket: 'renders', path: `music-studio/${USER}/${id}.mp3`, url: `https://x.supabase.co/sign/${id}?t=1`, mime: 'audio/mpeg', bytes: 1000, digest: 'd',
    qc: { durationSec: 30.8, codec: 'mp3', sampleRate: 44100, channels: 2, maxVolumeDb: -1, meanVolumeDb: -14 },
  });
  const deps: MusicDeps = {
    store,
    caps: () => musicCapabilities(env),
    key: () => 'secret',
    now: () => clock.now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    checkParent: async (id, u) => { const r = store.rows.get(id); return !!r && r.userId === u; },
    withinBudget: async () => true,
    async reserve(u, credits, ref) {
      if (ledger.has(ref)) return { charged: false, reason: 'replay' };
      ledger.set(ref, credits);
      return { charged: true, reason: 'ok' };
    },
    async refund(_u, ref, credits) {
      const taken = ledger.get(ref) ?? 0;
      if (refunds.includes(ref)) return 'nothing';
      if (!taken) return 'nothing';
      refunds.push(ref);
      void credits;
      return 'refunded';
    },
    async generate(plan: MusicPlan, input: string): Promise<MusicOutput> {
      generated.push(input);
      return { bytes: Buffer.from('mp3'), mime: 'audio/mpeg', providerRequestId: null, caption: null };
    },
    save: async (id) => saved(id),
    resign: async (t) => ({ ...t, url: `${t.url}&fresh=1` }),
    every: (_ms, tick) => { beats.push(tick); return () => undefined; },
    audit: async () => undefined,
    maxLivePerUser: 2,
    ...over,
  };
  return { deps, store, clock, ledger, refunds, generated, beats, env };
}

const REQ = { v: 1, prompt: 'ჩელოს მელანქოლიური თემა წვიმაზე', mode: 'instrumental', genre: 'cinematic', tempo: 'slow', modelId: 'lyria-3-clip-preview', durationSec: 30, locale: 'ka' };

async function quoted(h: Harness, req: Record<string, unknown> = REQ, user = USER) {
  return quoteMusic(h.deps, user, req);
}

describe('quote', () => {
  test('a quote states the price the ledger will take, needs confirmation, and shows the exact provider text', async () => {
    const h = harness();
    const q = await quoted(h);
    expect(q.credits).toBe(3); // a track under 60 s in the price book (lib/credits/priceBook music.under60)
    expect(q.credits).toBe(priceOf(q.plan));
    expect(q.requiresConfirmation).toBe(true);
    expect(q.summary.exactDuration).toBe(false);
    expect(q.providerInput).toContain('ჩელოს მელანქოლიური თემა წვიმაზე'); // verbatim, not translated
    expect(q.providerInput).toContain('Instrumental only, no vocals');
    expect(h.ledger.size).toBe(0); // a quote never charges
  });

  test('a song is UNSUPPORTED until vocals are verified — refused before any quote or charge', async () => {
    const h = harness();
    await expect(quoted(h, { ...REQ, mode: 'song', lyrics: 'ლა ლა', lyricsLanguage: 'ka' })).rejects.toMatchObject({ code: 'unsupported' });
    h.env.MUSIC_LYRIA_VOCALS_VERIFIED = '1';
    const q = await quoted(h, { ...REQ, mode: 'song', lyrics: 'ლა ლა', lyricsLanguage: 'ka', vocalGender: 'female' });
    expect(q.providerInput).toContain('Sung in Georgian');
    expect(q.providerInput).toContain('Lyrics:\nლა ლა');
  });

  test('an unoffered length, an unknown model, a disabled studio and a missing engine are refused', async () => {
    const h = harness();
    await expect(quoted(h, { ...REQ, durationSec: 90 })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(quoted(h, { ...REQ, modelId: 'udio' })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(quoted(h, { ...REQ, modelId: 'lyria-3-pro-preview' })).rejects.toMatchObject({ code: 'unsupported' });
    h.env.MUSIC_STUDIO_ENABLED = '0';
    await expect(quoted(h)).rejects.toMatchObject({ code: 'not_enabled' });
    h.env.MUSIC_STUDIO_ENABLED = '1';
    delete h.env.GCP_PROJECT_ID;
    h.env.GEMINI_API_KEY = 'k';
    await expect(quoted(h)).rejects.toMatchObject({ code: 'not_configured' });
  });

  test('lyrics on an instrumental and unknown fields are validation errors', async () => {
    const h = harness();
    await expect(quoted(h, { ...REQ, lyrics: 'x' })).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(quoted(h, { ...REQ, engine: 'udio' })).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('start → work → deliver', () => {
  test('confirm is required; the reservation is exactly the quote; delivery lands in the Library row', async () => {
    const h = harness();
    const q = await quoted(h);
    await expect(startMusic(h.deps, USER, q.plan, q.token, undefined)).rejects.toMatchObject({ code: 'confirmation_required' });
    const s = await startMusic(h.deps, USER, q.plan, q.token, true);
    expect(s.status).toBe('queued');
    expect([...h.ledger.values()]).toEqual([q.credits]);
    const w = await workMusic(h.deps, q.jobId, 'w1');
    expect(w.outcome).toBe('completed');
    const row = h.store.rows.get(q.jobId)!;
    expect(row.status).toBe('completed');
    expect(row.signedUrl).toContain(q.jobId);
    expect(row.result).toMatchObject({ kind: 'music', durationSec: 30.8, credits: 3, modelId: 'lyria-3-clip-preview' });
    expect(h.refunds).toEqual([]);
    const st = await musicStatus(h.deps, USER, q.jobId);
    expect(st.view.status).toBe('completed');
    expect(String(st.view.result?.url)).toContain('fresh=1'); // re-signed on read
  });

  test('a double tap / retry of one quote charges once and renders once', async () => {
    const h = harness();
    const q = await quoted(h);
    const [a, b] = await Promise.all([
      startMusic(h.deps, USER, q.plan, q.token, true),
      startMusic(h.deps, USER, q.plan, q.token, true),
    ]);
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    expect(h.ledger.size).toBe(1);
    const again = await startMusic(h.deps, USER, q.plan, q.token, true);
    expect(again.replay).toBe(true);
    await workMusic(h.deps, q.jobId, 'w1');
    await workMusic(h.deps, q.jobId, 'w2');
    expect(h.generated).toHaveLength(1);
  });

  test('a changed plan, another user, or an expired quote is refused before any charge', async () => {
    const h = harness();
    const q = await quoted(h);
    const changed = { ...q.plan, request: { ...q.plan.request, prompt: 'something else' } };
    await expect(startMusic(h.deps, USER, changed, q.token, true)).rejects.toMatchObject({ code: 'quote_changed' });
    await expect(startMusic(h.deps, OTHER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_invalid' });
    h.clock.now += 31 * 60_000;
    await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_expired' });
    expect(h.ledger.size).toBe(0);
  });

  test('a quote made while Vertex billed another Google Cloud project is refused before any charge (F-06)', async () => {
    const before = process.env.GCP_PROJECT_ID;
    process.env.GCP_PROJECT_ID = ENV.GCP_PROJECT_ID;
    try {
      const h = harness();
      const q = await quoted(h);
      process.env.GCP_PROJECT_ID = 'another-project';
      await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_changed' });
      expect(h.ledger.size).toBe(0);
      expect(h.store.rows.size).toBe(0);
    } finally {
      if (before === undefined) delete process.env.GCP_PROJECT_ID; else process.env.GCP_PROJECT_ID = before;
    }
  });

  test('a v1 quote shown before v2 shipped still starts its job once, at its price, until it expires', async () => {
    const h = harness();
    const q = await quoted(h);
    const claims = JSON.parse(Buffer.from(q.token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const payload = Buffer.from(JSON.stringify({ v: 1, u: claims.u, j: claims.j, f: claims.f, c: claims.c, x: claims.x })).toString('base64url');
    const v1 = `${payload}.${createHmac('sha256', 'secret').update(`agent-g-media-quote:v1:${payload}`).digest('base64url')}`;
    const s = await startMusic(h.deps, USER, q.plan, v1, true);
    expect(s.replay).toBeFalsy();
    expect(h.ledger.get(`music-studio-v1:${q.jobId}`)).toBe(3);
    expect((await startMusic(h.deps, USER, q.plan, v1, true)).replay).toBe(true);
    expect(h.ledger.size).toBe(1);
  });

  test('insufficient credits: refused, row failed, nothing owed', async () => {
    const h = harness({ reserve: async () => ({ charged: false, reason: 'insufficient' }) });
    const q = await quoted(h);
    await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'insufficient_credits', status: 402 });
    const row = h.store.rows.get(q.jobId)!;
    expect(row.status).toBe('failed');
    expect(row.exec?.owe).toBeUndefined();
  });

  test('a budget guard that says no (or cannot answer) stops the job before money moves', async () => {
    const h = harness({ withinBudget: async () => false });
    const q = await quoted(h);
    await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'budget_exhausted' });
    expect(h.ledger.size).toBe(0);
    expect(h.store.rows.get(q.jobId)!.status).toBe('failed');
  });

  test('an ambiguous reservation (ledger error) owes a refund that settlement pays only if a debit exists', async () => {
    const h = harness({ reserve: async (u, c, ref) => { h.ledger.set(ref, c); return { charged: false, reason: 'error' }; } });
    const q = await quoted(h);
    await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'billing_unavailable' });
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
    expect(h.store.rows.get(q.jobId)!.exec?.owe).toBeUndefined();
  });

  test('the per-user live cap refuses a third concurrent job without charging it', async () => {
    const h = harness();
    for (let i = 0; i < 2; i += 1) {
      const q = await quoted(h, { ...REQ, prompt: `p${i}` });
      await startMusic(h.deps, USER, q.plan, q.token, true);
    }
    const q3 = await quoted(h, { ...REQ, prompt: 'p3' });
    await expect(startMusic(h.deps, USER, q3.plan, q3.token, true)).rejects.toMatchObject({ code: 'queue_full' });
    expect(h.ledger.size).toBe(2);
  });
});

describe('failures refund exactly once', () => {
  test('a provider failure fails the job and refunds once, however often settlement runs', async () => {
    const h = harness({ generate: async () => { throw new MusicError('provider_failed', 'no audio', 502); } });
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    const w = await workMusic(h.deps, q.jobId, 'w1');
    expect(w).toMatchObject({ outcome: 'failed', error: 'provider_failed' });
    await settleMusic(h.deps, q.jobId);
    await sweepMusic(h.deps, 'w9');
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
    const st = await musicStatus(h.deps, USER, q.jobId);
    expect(st.view).toMatchObject({ status: 'failed', error: 'provider_failed', settlementPending: false, result: null });
  });

  test('a QC failure (silent / wrong length) is not delivered and is refunded', async () => {
    const h = harness({ save: async () => { throw new MusicError('quality_failed', 'silent', 502); } });
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    await workMusic(h.deps, q.jobId, 'w1');
    const row = h.store.rows.get(q.jobId)!;
    expect(row.status).toBe('failed');
    expect(row.signedUrl).toBeNull();
    expect(h.refunds).toHaveLength(1);
  });

  test('a Storage write failure is not delivered and is refunded once, however often settlement runs', async () => {
    const h = harness({ save: async () => { throw new MusicError('storage_failed', 'The track could not be stored.', 503); } });
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    const w = await workMusic(h.deps, q.jobId, 'w1');
    expect(w).toMatchObject({ outcome: 'failed', error: 'storage_failed' });
    await settleMusic(h.deps, q.jobId);
    await sweepMusic(h.deps, 'w9');
    expect(h.store.rows.get(q.jobId)!.signedUrl).toBeNull();
    expect(h.generated).toHaveLength(1);
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
  });

  test('a quota rejection fails once with one provider call and one refund', async () => {
    let calls = 0;
    const h = harness({ generate: async () => { calls += 1; throw new MusicError('provider_failed', 'quota', 502); } });
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    await workMusic(h.deps, q.jobId, 'w1');
    await workMusic(h.deps, q.jobId, 'w2');
    await sweepMusic(h.deps, 'w9');
    expect(calls).toBe(1);
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
  });

  test('cancel while queued refunds once; the worker then cannot run it', async () => {
    const h = harness();
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    const v = await cancelMusic(h.deps, USER, q.jobId);
    expect(v.status).toBe('cancelled');
    expect(h.refunds).toHaveLength(1);
    expect((await workMusic(h.deps, q.jobId, 'w1')).ran).toBe(false);
    expect(h.generated).toHaveLength(0);
    await expect(cancelMusic(h.deps, USER, q.jobId)).rejects.toMatchObject({ code: 'not_running' });
  });

  test('another user can neither read nor cancel the job', async () => {
    const h = harness();
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    await expect(musicStatus(h.deps, OTHER, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
    await expect(cancelMusic(h.deps, OTHER, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
  });

  test('cancel during the render: the heartbeat stops the worker, the job is refunded, nothing is delivered', async () => {
    let release!: () => void;
    const h = harness({
      generate: (_p, _i, signal) => new Promise((resolve, reject) => {
        release = () => resolve({ bytes: Buffer.from('x'), mime: 'audio/mpeg', providerRequestId: null, caption: null });
        signal.addEventListener('abort', () => reject(new MusicError('cancelled', 'stopped')));
      }),
    });
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    const running = workMusic(h.deps, q.jobId, 'w1');
    await flush();
    await cancelMusic(h.deps, USER, q.jobId);
    await h.beats[0]!(); // the heartbeat sees the cancel and aborts the render
    release();
    const w = await running;
    expect(w.outcome).toBe('lost');
    const row = h.store.rows.get(q.jobId)!;
    expect(row.status).toBe('failed');
    expect(row.signedUrl).toBeNull();
    expect(h.refunds).toHaveLength(1);
  });

  test('crash recovery: a worker that died after dispatch is NOT re-sent; the sweep fails and refunds it once', async () => {
    const h = harness({ generate: () => new Promise(() => undefined) }); // the lambda is killed mid-render
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    void workMusic(h.deps, q.jobId, 'w1');
    await flush();
    h.clock.now += 120_000; // lease lapsed
    h.deps.generate = async (plan, input) => { h.generated.push(input); return { bytes: Buffer.from('x'), mime: 'audio/mpeg', providerRequestId: null, caption: null }; };
    await sweepMusic(h.deps, 'w2');
    expect(h.generated).toHaveLength(0); // never a silent second render
    const row = h.store.rows.get(q.jobId)!;
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/^provider_outcome_unknown/);
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
  });

  test('crash after storing: the retry delivers the stored track without rendering again or refunding', async () => {
    const h = harness();
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    const realComplete = h.store.cas.bind(h.store);
    let block = true;
    h.store.cas = async (id, expect, write) => (block && write.status === 'completed' ? false : realComplete(id, expect, write));
    await workMusic(h.deps, q.jobId, 'w1'); // stored, but the completion write never landed …
    block = false;
    expect(h.store.rows.get(q.jobId)!.params._music).toMatchObject({ dispatch: 'stored' });
    h.clock.now += 120_000; // the first worker's lease lapses
    const w = await workMusic(h.deps, q.jobId, 'w2');
    expect(w.outcome).toBe('completed');
    expect(h.generated).toHaveLength(1); // rendered once, delivered by the retry
    expect(h.refunds).toEqual([]);
    expect(h.store.rows.get(q.jobId)!.status).toBe('completed');
  });

  test('a reservation that throws mid-request leaves no unpaid debit', async () => {
    const h = harness();
    const q = await quoted(h);
    h.deps.reserve = async (u, c, ref) => { h.ledger.set(ref, c); throw new Error('rpc dropped after the debit'); };
    await expect(startMusic(h.deps, USER, q.plan, q.token, true)).rejects.toThrow();
    expect(h.store.rows.get(q.jobId)!.status).toBe('failed');
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
  });

  test('a billing hold abandoned by a killed request is failed by the sweep and its debit refunded', async () => {
    const h = harness();
    const q = await quoted(h);
    h.deps.reserve = async (u, c, ref) => { h.ledger.set(ref, c); return new Promise(() => undefined); }; // lambda killed
    void startMusic(h.deps, USER, q.plan, q.token, true);
    await flush();
    expect(h.store.rows.get(q.jobId)!.exec?.hold).toBe('billing');
    h.clock.now += 121_000; // past HOLD_MS
    await sweepMusic(h.deps, 'w2');
    expect(h.store.rows.get(q.jobId)!.status).toBe('failed');
    expect(h.refunds).toEqual([`music-studio-v1:${q.jobId}`]);
    expect(h.generated).toHaveLength(0);
  });
});

describe('regenerate', () => {
  test('a regenerate quote reuses settings and must name the caller\'s own earlier job', async () => {
    const h = harness();
    const q = await quoted(h);
    await startMusic(h.deps, USER, q.plan, q.token, true);
    await workMusic(h.deps, q.jobId, 'w1');
    const again = await quoted(h, { ...REQ, parentJobId: q.jobId });
    expect(again.jobId).not.toBe(q.jobId);
    expect(again.credits).toBe(q.credits);
    await expect(quoted(h, { ...REQ, parentJobId: q.jobId }, OTHER)).rejects.toMatchObject({ code: 'not_found' });
  });
});
