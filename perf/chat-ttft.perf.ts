/** @jest-environment node */
/**
 * perf/chat-ttft.perf.ts — the chat route's own time to first token, mock environment (MASTER TASK v3.1 §4.1, §4.4).
 *
 * The real POST /api/chat/gemini runs in-process. Every network dependency is a mock that answers after a FIXED
 * fixture latency (below, overridable by env), so the result is the route's critical path over those latencies: which
 * waits it puts in series and which in parallel. It is NOT a provider or production number, and says so in its note.
 * Nothing leaves this process; no model, database or budget is touched.
 *
 * Each sample is a traced turn (x-myavatar-trace), so the route's own spans (lib/perf/serverTiming) come back in the
 * SSE comment line and are reported beside the client-side TTFT (request sent → first `{text}` frame decoded).
 *
 * Three runs of the same turn: every dependency at its fixture latency (`chat.ttft`), then one of them slow, the waits
 * the route bounds with CONTEXT_DEADLINE_MS: the memory's embedding (`chat.ttft.slow-memory`), and the avatar check's
 * admin-list read on an instance that has not cached it yet (`chat.ttft.cold-admin`, the user has a confirmed email
 * that is not on the static list).
 *
 * Run: npm run perf:mock (or npx jest -c jest.perf.config.cjs perf/chat-ttft.perf.ts). Writes perf-results/chat.json.
 */
jest.mock('server-only', () => ({}));

const ms = (name: string, fallback: number): number => {
  const v = Number(process.env[`PERF_FIXTURE_${name}_MS`]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
/** The fixture latencies, in ms. Chosen to look like network calls, not measured from anything. */
const FIXTURE = {
  rate: ms('RATE', 15),
  auth: ms('AUTH', 60),
  budget: ms('BUDGET', 80),
  profile: ms('PROFILE', 40),
  embed: ms('EMBED', 150),
  rpc: ms('RPC', 50),
  firstToken: ms('FIRST_TOKEN', 400),
};
/** The slow dependency of each slow run, in ms. */
const SLOW = { embed: ms('SLOW_EMBED', 1500), adminList: ms('SLOW_ADMIN_LIST', 800) };
/** What the current run sets: the embedding's latency, and the signed-in user's confirmed email (null: none). */
let mockEmbedMs = FIXTURE.embed;
let mockEmail: string | null = null;
let mockAdminListMs = 0;
const sleep = (n: number) => new Promise<void>((r) => setTimeout(r, n));

jest.mock('../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => {
    await sleep(FIXTURE.auth);
    return {
      supabase: { rpc: jest.fn(async () => { await sleep(FIXTURE.rpc); return { data: [], error: null }; }) },
      user: { id: '6f1c2b3a-1111-4222-8333-444455556666', ...(mockEmail ? { email: mockEmail, email_confirmed_at: '2026-01-01T00:00:00Z' } : {}) },
    };
  }),
  // The panel-granted admin list (lib/auth/adminGuard), read through the service role: empty, after mockAdminListMs.
  createServiceRoleClient: jest.fn(() => ({
    from: () => ({ select: async () => { await sleep(mockAdminListMs); return { data: [], error: null }; } }),
  })),
}));
jest.mock('../lib/ai/google/chatStream', () => ({
  streamGeminiChat: jest.fn(async (input: { onFrame: (f: unknown) => void | Promise<void> }) => {
    await sleep(FIXTURE.firstToken);
    await input.onFrame({ meta: { provider: 'gemini', model: 'gemini-fixture' } });
    await input.onFrame({ text: 'Hello' });
    return { ok: true, model: 'gemini-fixture', text: 'Hello', sources: [], attempts: [{ model: 'gemini-fixture' }] };
  }),
  unbookedAttempts: () => [],
}));
jest.mock('../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../lib/services/billing/chatBudget');
  return {
    ...actual,
    chatBudgetRefusal: jest.fn(async () => { await sleep(FIXTURE.budget); return null; }),
    bookChatUsage: jest.fn(async () => undefined),
  };
});
jest.mock('../lib/api/rate-limit', () => {
  // The real module arms an un-unref'd sweep timer; load it with that timer unref'd (as route.test.ts does).
  const realSetInterval = global.setInterval;
  global.setInterval = ((handler: () => void, n?: number) => realSetInterval(handler, n).unref()) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../lib/api/rate-limit');
    return {
      ...actual,
      checkRateLimit: jest.fn(async () => { await sleep(FIXTURE.rate); return null; }),
      checkRateLimitByKey: jest.fn(async () => { await sleep(FIXTURE.rate); return null; }),
      refundRateLimitByKey: jest.fn(async () => undefined),
    };
  } finally {
    global.setInterval = realSetInterval;
  }
});
jest.mock('../lib/memory/embed', () => ({ embed: jest.fn(async () => { await sleep(mockEmbedMs); return [0.1, 0.2, 0.3]; }) }));
jest.mock('../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => { await sleep(FIXTURE.profile); return []; }),
  buildProfilePreamble: jest.fn(() => null),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));
jest.mock('../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/chat/gemini/route';
import { invalidateAdminAllowlist } from '../lib/auth/adminGuard';
import { decodeFrames } from '../lib/chat/sse';
import { parseServerTiming } from '../lib/perf/serverTiming';
import { MIN_P95_SAMPLES, summarize, writeResults } from './stats';

const SAMPLES = Math.max(1, Number(process.env.PERF_SAMPLES) || MIN_P95_SAMPLES);

async function oneTurn(): Promise<{ ttft: number; done: number; spans: Record<string, number> }> {
  const started = performance.now();
  const res = await POST(
    new NextRequest('https://myavatar.ge/api/chat/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json', referer: 'https://myavatar.ge/en/dashboard', 'x-myavatar-trace': randomBytes(8).toString('hex') },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, how are you today?' }], mode: 'fast', language: 'en' }),
    }),
  );
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let ttft = Number.NaN;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
    if (Number.isNaN(ttft) && decodeFrames(body).some((f) => f !== 'DONE' && 'text' in f && f.text)) ttft = performance.now() - started;
  }
  const doneAt = performance.now() - started;
  const comment = body.split('\n\n').find((e) => e.startsWith(': server-timing '));
  return { ttft, done: doneAt, spans: parseServerTiming(comment) as Record<string, number> };
}

/** SAMPLES turns, after one warm-up turn that is not counted; `before` runs ahead of every turn. */
async function turns(before: () => void = () => {}): Promise<Array<Awaited<ReturnType<typeof oneTurn>>>> {
  before();
  await oneTurn();
  const runs = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    before();
    runs.push(await oneTurn());
  }
  expect(runs.every((r) => Number.isFinite(r.ttft))).toBe(true);
  return runs;
}

test(`chat TTFT over fixture latencies (${SAMPLES} samples per run)`, async () => {
  const normal = await turns();
  mockEmbedMs = SLOW.embed;
  const slowMemory = await turns();
  mockEmbedMs = FIXTURE.embed;
  mockEmail = 'bench-user@example.com';
  mockAdminListMs = SLOW.adminList;
  const coldAdmin = await turns(() => invalidateAdminAllowlist());

  const fixture = Object.entries(FIXTURE).map(([k, v]) => `${k} ${v}`).join(', ');
  const base = {
    environment: 'mock' as const,
    network: 'in-process (no network)',
    cache: 'warm' as const,
    unit: 'ms' as const,
    note: 'Route critical path over fixed fixture latencies; not a provider or production number.',
  };
  const payload = `1 short user turn, Fast, signed in; fixture ms: ${fixture}`;
  const ttft = (runs: typeof normal) => runs.map((r) => r.ttft);
  const spans = (runs: typeof normal) => runs.map((r) => r.spans);
  writeResults('chat', [
    summarize({ ...base, payload, interaction: 'chat.ttft' }, ttft(normal), spans(normal)),
    summarize({ ...base, payload, interaction: 'chat.done' }, normal.map((r) => r.done)),
    summarize({ ...base, payload: `${payload}; embed ${SLOW.embed}`, interaction: 'chat.ttft.slow-memory' }, ttft(slowMemory), spans(slowMemory)),
    summarize(
      { ...base, payload: `${payload}; admin list read ${SLOW.adminList} on every turn (not cached)`, interaction: 'chat.ttft.cold-admin' },
      ttft(coldAdmin),
      spans(coldAdmin),
    ),
  ]);
}, 600_000);
