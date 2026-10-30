/** @jest-environment node */
/**
 * mintCallSession — the Gemini Live session for one WhatsApp call. Under MASTER TASK v3.1 there is no Live minter (the
 * Developer API ephemeral token is refused, Vertex AI Live needs a relay), so the production path answers
 * `live_transport_unavailable` before memory, budget or any I/O. With a minter (mocked), the server-built phone lock is
 * what gets minted, and a refusal is a failed call, never a weaker token.
 */
jest.mock('server-only', () => ({}));

import { liveCallSessionDeps, mintCallSession, type CallSessionDeps } from './liveSession';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const ticket = { userId: 'user-1', locale: 'ka' as const, exp: NOW + 10 * 60_000 };

function deps(over: Partial<CallSessionDeps> = {}) {
  const mint = jest.fn(async () => new Response(JSON.stringify({ name: 'auth_tokens/call-1' }), { status: 200 }));
  const d: CallSessionDeps = {
    minter: () => ({ mint }),
    memory: jest.fn(async () => 'MEMORY'),
    budgetAllows: jest.fn(async () => true),
    now: () => NOW,
    env: {} as NodeJS.ProcessEnv,
    ...over,
  };
  return { d, mint };
}

test('production deps: no Live minter, so the call fails closed before memory, budget or any request', async () => {
  const realFetch = global.fetch;
  const net = jest.fn();
  global.fetch = net as unknown as typeof fetch;
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'AQ.test-ai-studio-key'; // present on purpose: it must change nothing
  try {
    const real = liveCallSessionDeps();
    const memory = jest.fn(real.memory);
    const budgetAllows = jest.fn(real.budgetAllows);
    expect(await mintCallSession({ ...real, memory, budgetAllows }, ticket, null)).toEqual({
      ok: false,
      error: 'live_transport_unavailable',
    });
    expect(memory).not.toHaveBeenCalled();
    expect(budgetAllows).not.toHaveBeenCalled();
    expect(net).not.toHaveBeenCalled();
  } finally {
    global.fetch = realFetch;
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('with a minter: the server-built phone lock is minted once, bounded by the ticket', async () => {
  const { d, mint } = deps();
  const s = await mintCallSession(d, ticket, null);
  expect(s).toMatchObject({ ok: true, token: 'auth_tokens/call-1', expiresAt: new Date(ticket.exp).toISOString() });
  expect(mint).toHaveBeenCalledTimes(1);
  const [request, timeoutMs] = mint.mock.calls[0] as unknown as [{ uses: number; bidiGenerateContentSetup: { systemInstruction?: { parts: Array<{ text: string }> } } }, number];
  expect(request.uses).toBe(1);
  expect(request.bidiGenerateContentSetup.systemInstruction?.parts[0]?.text).toContain('MEMORY');
  expect(timeoutMs).toBe(10_000);
});

test('a budget refusal mints nothing', async () => {
  const { d, mint } = deps({ budgetAllows: jest.fn(async () => false) });
  expect(await mintCallSession(d, ticket, null)).toEqual({ ok: false, error: 'budget_exhausted' });
  expect(mint).not.toHaveBeenCalled();
});

test('a refused lock is a failed call, never a weaker token', async () => {
  const mint = jest.fn(async () => new Response('bad', { status: 400 }));
  const { d } = deps({ minter: () => ({ mint }) });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await mintCallSession(d, ticket, null)).toEqual({ ok: false, error: 'live_token_unavailable' });
  expect(mint).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('[WhatsApp.Calls] live_mint_refused', { status: 400 });
  warn.mockRestore();
});

test('a Live relay minter: the bridge cannot open the relay yet, so the call fails closed without minting', async () => {
  const mint = jest.fn();
  const { d } = deps({ minter: () => ({ mint, wsUrl: 'wss://relay.example/v1/live' }) });
  expect(await mintCallSession(d, ticket, null)).toEqual({ ok: false, error: 'live_transport_unavailable' });
  expect(d.memory).not.toHaveBeenCalled();
  expect(mint).not.toHaveBeenCalled();
});
