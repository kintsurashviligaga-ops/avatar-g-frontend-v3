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
const sleep = (n: number) => new Promise<void>((r) => setTimeout(r, n));

jest.mock('../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => {
    await sleep(FIXTURE.auth);
    return {
      supabase: { rpc: jest.fn(async () => { await sleep(FIXTURE.rpc); return { data: [], error: null }; }) },
      user: { id: '6f1c2b3a-1111-4222-8333-444455556666' },
    };
  }),
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
jest.mock('../lib/memory/embed', () => ({ embed: jest.fn(async () => { await sleep(FIXTURE.embed); return [0.1, 0.2, 0.3]; }) }));
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

test(`chat TTFT over fixture latencies (${SAMPLES} samples)`, async () => {
  await oneTurn(); // warm the module graph; not counted
  const runs = [];
  for (let i = 0; i < SAMPLES; i += 1) runs.push(await oneTurn());
  expect(runs.every((r) => Number.isFinite(r.ttft))).toBe(true);

  const fixture = Object.entries(FIXTURE).map(([k, v]) => `${k} ${v}`).join(', ');
  const base = {
    environment: 'mock' as const,
    payload: `1 short user turn, Fast, signed in; fixture ms: ${fixture}`,
    network: 'in-process (no network)',
    cache: 'warm' as const,
    unit: 'ms' as const,
    note: 'Route critical path over fixed fixture latencies; not a provider or production number.',
  };
  writeResults('chat', [
    summarize({ ...base, interaction: 'chat.ttft' }, runs.map((r) => r.ttft), runs.map((r) => r.spans)),
    summarize({ ...base, interaction: 'chat.done' }, runs.map((r) => r.done)),
  ]);
}, 120_000);
