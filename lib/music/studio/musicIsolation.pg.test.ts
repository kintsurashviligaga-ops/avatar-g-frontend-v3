/** @jest-environment node */
/**
 * Music Studio v1 against a REAL but throwaway database: Postgres 16 with the Production shape
 * (scripts/lease-isolation/schema.sql) behind a real PostgREST on 127.0.0.1 — the live lease store (generation_jobs,
 * compare-and-set on params->_exec->>v) and the live ledger (deduct_credits / refund_credits / netDebitedForRef).
 * Only the provider, storage and the clock are faked: NO Lyria call is made here. Skipped unless the harness
 * (scripts/lease-isolation/run.sh) provides a local URL; it refuses anything else.
 */
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function serviceJwt(): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const jwt = REST && SECRET ? serviceJwt() : '';
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });

jest.mock('server-only', () => ({}));
const storeErrors: unknown[] = [];
jest.mock('../../observability/report-error', () => ({ reportError: (e: unknown) => { storeErrors.push(e); } }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));
jest.mock('../../agent/media/montageLive', () => ({ audit: async () => undefined, every: () => () => undefined, quoteKey: () => 'k' }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => 'https://local/s', createSignedAssetUrl: async () => 'https://local/s2', parseSupabaseObjectUrl: () => null }));
jest.mock('../../ai/lyriaMusic', () => ({ lyriaRequest: jest.fn(), musicWithinBudget: async () => true, recordMusicUsage: async () => undefined }));

import { liveMusicDeps } from './live';
import { cancelMusic, musicStatus, quoteMusic, startMusic, sweepMusic, workMusic, type MusicDeps } from './engine';
import type { SavedTrack } from './contracts';
import { MusicError } from './errors';

const A = '0e000000-0000-4000-8000-00000000000a'; // seeded in auth.users (schema.sql)
const B = '0e000000-0000-4000-8000-00000000000b';
const START = 100;
const REQ = { v: 1, prompt: 'calm cello over rain', mode: 'instrumental', modelId: 'lyria-3-clip-preview', durationSec: 30, locale: 'en' };

function deps(): MusicDeps & { generated: number } {
  const live = liveMusicDeps();
  const d = live as MusicDeps & { generated: number };
  d.generated = 0;
  d.caps = () => ({ enabled: true, configured: true, transport: 'vertex', preferredTransport: true, models: [{ id: 'lyria-3-clip-preview', label: 'Lyria 3 Clip', durationsSec: [30], exactDuration: false, instrumental: { offered: true, evidence: 'proven' }, vocals: { offered: false, evidence: 'unverified' }, lyricsLanguages: ['ka', 'en', 'ru'], evidence: 't' }], unsupported: [], edits: [] });
  d.generate = async () => { d.generated += 1; return { bytes: Buffer.from('mp3'), mime: 'audio/mpeg', providerRequestId: null, caption: null }; };
  d.save = async (id, userId): Promise<SavedTrack> => ({ bucket: 'renders', path: `music-studio/${userId}/${id}.mp3`, url: 'https://local/s', mime: 'audio/mpeg', bytes: 3, digest: 'd', qc: { durationSec: 30.8, codec: 'mp3', sampleRate: 44100, channels: 2, maxVolumeDb: -1, meanVolumeDb: -14 } });
  return d;
}

async function row(id: string) {
  const { data, error } = await db.from('generation_jobs').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as { status: string; error: string | null; signed_url: string | null; service_type: string; params: { _exec: Record<string, unknown> } };
}
async function balance(user: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', user).single();
  return (data as { credits_balance: number }).credits_balance;
}
async function ledger(user: string): Promise<string[]> {
  const { data } = await db.from('credit_ledger').select('delta,metadata').eq('user_id', user).order('created_at');
  return ((data ?? []) as Array<{ delta: number; metadata: { ref: string } }>).map((l) => `${l.delta} ${l.metadata.ref}`);
}
const flush = () => new Promise((r) => setTimeout(r, 50));

suite('Music Studio v1 on a real Postgres + PostgREST (local, isolated)', () => {
  jest.setTimeout(30_000);

  beforeEach(async () => {
    storeErrors.length = 0;
    await db.from('generation_jobs').delete().in('user_id', [A, B]);
    await db.from('credit_ledger').delete().in('user_id', [A, B]);
    const up = await db.from('profiles').upsert([{ id: A, email: 'ma@local.test', credits_balance: START }, { id: B, email: 'mb@local.test', credits_balance: START }]);
    if (up.error) throw new Error(up.error.message);
  });
  afterEach(() => { expect(storeErrors).toEqual([]); });

  test('quote → confirm → reserve → work → deliver: charged exactly the quote, once; the row is the Library entry', async () => {
    const d = deps();
    const q = await quoteMusic(d, A, REQ);
    expect(await balance(A)).toBe(START); // a quote charges nothing
    await startMusic(d, A, q.plan, q.token, true);
    expect(await balance(A)).toBe(START - q.credits);
    expect((await workMusic(d, q.jobId, 'w1')).outcome).toBe('completed');
    const r = await row(q.jobId);
    expect(r).toMatchObject({ status: 'completed', service_type: 'music', signed_url: 'https://local/s' });
    expect(await ledger(A)).toEqual([`-${q.credits} music-studio-v1:${q.jobId}`]);
  });

  test('a double tap and a retry of one quote: one row, one debit', async () => {
    const d = deps();
    const q = await quoteMusic(d, A, REQ);
    const results = await Promise.allSettled([startMusic(d, A, q.plan, q.token, true), startMusic(d, A, q.plan, q.token, true), startMusic(d, A, q.plan, q.token, true)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(3);
    expect(await ledger(A)).toEqual([`-${q.credits} music-studio-v1:${q.jobId}`]);
    expect(await balance(A)).toBe(START - q.credits);
  });

  test('a provider failure is refunded exactly once, however often settlement and the sweep run', async () => {
    const d = deps();
    d.generate = async () => { throw new MusicError('provider_failed', 'no audio', 502); };
    const q = await quoteMusic(d, A, REQ);
    await startMusic(d, A, q.plan, q.token, true);
    await workMusic(d, q.jobId, 'w1');
    await musicStatus(d, A, q.jobId);
    await sweepMusic(d, 'w2');
    await sweepMusic(d, 'w3');
    expect(await balance(A)).toBe(START);
    expect(await ledger(A)).toEqual([`-${q.credits} music-studio-v1:${q.jobId}`, `${q.credits} music-studio-v1:${q.jobId}:refund`]);
    expect((await row(q.jobId)).params._exec.owe).toBeUndefined();
  });

  test('a worker killed after dispatch: the sweep fails the job, never re-sends it, refunds once', async () => {
    const d = deps();
    d.generate = () => new Promise(() => undefined);
    const q = await quoteMusic(d, A, REQ);
    await startMusic(d, A, q.plan, q.token, true);
    void workMusic(d, q.jobId, 'w1');
    await flush();
    // Its lease lapses (as if 90 s passed with no heartbeat).
    const r = await row(q.jobId);
    await db.from('generation_jobs').update({ params: { ...r.params, _exec: { ...r.params._exec, leaseUntil: Date.now() - 1 } } }).eq('id', q.jobId);
    const d2 = deps();
    await sweepMusic(d2, 'w2');
    expect(d2.generated).toBe(0);
    expect((await row(q.jobId)).error).toMatch(/^provider_outcome_unknown/);
    expect(await balance(A)).toBe(START);
  });

  test('not enough credits: refused, nothing debited, the row failed', async () => {
    await db.from('profiles').update({ credits_balance: 2 }).eq('id', A);
    const d = deps();
    const q = await quoteMusic(d, A, REQ);
    await expect(startMusic(d, A, q.plan, q.token, true)).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(await ledger(A)).toEqual([]);
    expect((await row(q.jobId)).status).toBe('failed');
  });

  test('cancel while queued refunds once; another user can neither read nor cancel the job', async () => {
    const d = deps();
    const q = await quoteMusic(d, A, REQ);
    await startMusic(d, A, q.plan, q.token, true);
    await expect(musicStatus(d, B, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
    await expect(cancelMusic(d, B, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
    await cancelMusic(d, A, q.jobId);
    await sweepMusic(d, 'w2');
    expect(await balance(A)).toBe(START);
    expect(await ledger(A)).toHaveLength(2);
    expect(d.generated).toBe(0);
  });
});
