/** @jest-environment node */
/**
 * POST /api/chat/gemini — the product chat route, pinned end to end with every provider mocked.
 *
 *   · a guest is refused (401, generationGate body shape) before any model, budget or memory call;
 *   · frames arrive in the documented order and the legacy {text}/{meta}/[DONE] stay readable by today's client;
 *   · Google-only (the default) never touches Anthropic; the kill switch (AI_GOOGLE_ONLY=0) restores the fallback;
 *   · a provider 402 / quota reads as OUR outage, localized — never the provider's wording;
 *   · a safety stop is a localized notice, never a fallback;
 *   · the budget refusal and the per-user daily cap are delivered in-stream;
 *   · real usage is booked with the user id before the stream closes;
 *   · the history is re-validated server-side (no empty turns reach the model);
 *   · the chat MODE picks the chain and the generation settings server-side — never a client model id — and a spent
 *     Pro allowance downgrades the turn to Fast with the reason in `{meta}`.
 *
 * No network: streamGeminiChat, the Anthropic SDK, Supabase, the embedder, the limiter and the budget guard are mocks.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
const mockRpc = jest.fn(async () => ({ data: [] as unknown[], error: null as unknown }));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { rpc: mockRpc }, user: mockUser })),
}));

jest.mock('../../../../lib/ai/google/chatStream', () => ({
  streamGeminiChat: jest.fn(),
  // Pure helper — the real one, so the route's booking of rotated attempts is exercised as written.
  unbookedAttempts: jest.requireActual('../../../../lib/ai/google/chatStream').unbookedAttempts,
}));

jest.mock('../../../../lib/services/billing/chatBudget', () => {
  const actual = jest.requireActual('../../../../lib/services/billing/chatBudget');
  return { ...actual, chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) };
});

jest.mock('../../../../lib/api/rate-limit', () => {
  // ⚠️ The real module arms its in-memory limiter's 5-minute sweep with a setInterval that is never unref'd, so a
  // single-file jest run passes and then never EXITS (it looks like a hang). Load it with that one timer unref'd.
  const realSetInterval = global.setInterval;
  global.setInterval = ((handler: () => void, ms?: number) => realSetInterval(handler, ms).unref()) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null), checkRateLimitByKey: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});

jest.mock('../../../../lib/memory/embed', () => ({ embed: jest.fn(async () => null) }));

jest.mock('../../../../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => []),
  buildProfilePreamble: jest.fn(() => null),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));

jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

// The fallback's SDKs. The route imports them lazily, only when AI_GOOGLE_ONLY is off.
const mockAnthropicModel = jest.fn((id: string) => ({ provider: 'anthropic', modelId: id }));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn(() => mockAnthropicModel) }));
jest.mock('ai', () => ({ streamText: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { streamGeminiChat, type StreamGeminiChatInput, type StreamGeminiChatResult } from '../../../../lib/ai/google/chatStream';
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from '../../../../lib/services/billing/chatBudget';
import { checkRateLimit, checkRateLimitByKey, chatProUserLimit, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { embed } from '../../../../lib/memory/embed';
import { buildProfilePreamble } from '../../../../lib/chat/userMemory';
import { reportError } from '../../../../lib/observability/report-error';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { decodeFrames, type ChatFrame } from '../../../../lib/chat/sse';
import { DEFAULT_CHAT_MODELS } from '../../../../lib/ai/google/models';

const USER_ID = '6f1c2b3a-1111-4222-8333-444455556666';
const OUR_OUTAGE_KA = '⚠️ AI სერვისი დროებით მიუწვდომელია ჩვენი მხრიდან. სცადე ცოტა ხანში.';
const SAFETY_EN = '⚠️ This request was blocked by safety filters. Please rephrase and try again.';

const mockStream = streamGeminiChat as jest.MockedFunction<typeof streamGeminiChat>;

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://myavatar.ge/api/chat/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'https://myavatar.ge/ka/dashboard', ...headers },
    body: JSON.stringify(body),
  });

const framesOf = async (res: Response) => decodeFrames(await res.text());

const userTurn = (text: string) => ({ messages: [{ role: 'user', content: text }] });

/** A streamGeminiChat stand-in: emits `frames` through onFrame, then resolves with `result`. */
function gemini(frames: ChatFrame[], result: Partial<StreamGeminiChatResult>) {
  return async (input: StreamGeminiChatInput): Promise<StreamGeminiChatResult> => {
    for (const f of frames) await input.onFrame(f);
    return { ok: true, model: 'gemini-3.8-flash', text: '', sources: [], attempts: [{ model: 'gemini-3.8-flash' }], ...result };
  };
}

/** What chatStream emits for a failure with no text: the English public message the route must replace. */
function geminiFailure(code: 'quota' | 'safety' | 'unavailable', extra: Partial<StreamGeminiChatResult> = {}) {
  const retryable = code === 'unavailable';
  return gemini(
    [{ error: { code, retryable, message: 'The AI service is temporarily unavailable on our side.' } }],
    {
      ok: false,
      text: '',
      error: {
        code,
        retryable,
        // The provider's own wording — diagnostic only, it must never reach the browser.
        message: 'You exceeded your current prepayment credits. Please check your plan and billing details. key=AIzaSyFAKEFAKEFAKEFAKEFAKE',
        status: code === 'quota' ? 402 : undefined,
      },
      attempts: [{ model: 'gemini-3.8-flash', code }],
      ...extra,
    },
  );
}

/** A fake ai@6 streamText result for the Anthropic fallback. */
function anthropicStream(parts: Array<Record<string, unknown>>) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p;
    })(),
  };
}

const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER_ID };
  mockRpc.mockImplementation(async () => ({ data: [], error: null }));
  process.env = { ...ENV };
  delete process.env.FILM_ALLOW_ANONYMOUS;
  delete process.env.AI_GOOGLE_ONLY;
  delete process.env.GEMINI_CHAT_MODELS;
  delete process.env.GEMINI_CHAT_PRO_MODELS;
  delete process.env.GEMINI_CHAT_LITE_MODELS;
  delete process.env.CHAT_PRO_DAILY_LIMIT;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_API_KEYS;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  mockStream.mockImplementation(gemini([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }, { text: 'ok' }], { text: 'ok' }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('sign-in', () => {
  test('a guest gets 401 in the generationGate shape, before any model, budget, limiter or memory call', async () => {
    mockUser = null;
    const res = await POST(post(userTurn('გამარჯობა')));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: 'auth_required',
      authRequired: true,
      message: 'ჩატის გამოსაყენებლად შედი ანგარიშზე.',
    });
    expect(mockStream).not.toHaveBeenCalled();
    expect(chatBudgetAllows).not.toHaveBeenCalled();
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(bookChatUsage).not.toHaveBeenCalled();
  });

  test('the 401 message follows the page locale from the referer', async () => {
    mockUser = null;
    const res = await POST(post(userTurn('hi'), { referer: 'https://myavatar.ge/en/dashboard' }));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Sign in to use the chat.');
  });

  test('a user id of "anonymous" is a guest', async () => {
    mockUser = { id: 'anonymous' };
    expect((await POST(post(userTurn('hi')))).status).toBe(401);
  });

  test('FILM_ALLOW_ANONYMOUS=1 re-opens it: capped per IP, no memory lookups, booked with no user', async () => {
    mockUser = null;
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    mockStream.mockImplementation(
      gemini([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }, { text: 'hi' }], { text: 'hi', usage: { inputTokens: 10, outputTokens: 2 } }),
    );
    const res = await POST(post(userTurn('hi')));
    expect(res.status).toBe(200);
    await res.text();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.CHAT_USER);
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(bookChatUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });
});

// ─── Frames ──────────────────────────────────────────────────────────────────

describe('frames', () => {
  test('success: {meta} {text}… {sources} {usage} [DONE], in that order, nothing else', async () => {
    const frames: ChatFrame[] = [
      { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
      { text: 'გამარ' },
      { text: 'ჯობა' },
      { sources: [{ url: 'https://example.ge/a', title: 'A' }] },
      { usage: { model: 'gemini-3.8-flash', inputTokens: 1200, outputTokens: 80, totalTokens: 1280 } },
    ];
    mockStream.mockImplementation(gemini(frames, { text: 'გამარჯობა', usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 } }));
    const res = await POST(post(userTurn('გამარჯობა')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    // The {meta} frame additionally says which mode answered and that it was the mode's primary model.
    expect(await framesOf(res)).toEqual([
      { meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast', fallback: false } },
      ...frames.slice(1),
      'DONE',
    ]);
  });

  test('a mid-answer failure keeps the partial answer: no notice text, one localized {error}, no rotation to Anthropic', async () => {
    process.env.AI_GOOGLE_ONLY = '0';
    mockStream.mockImplementation(
      gemini(
        [
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
          { text: 'ნახევარი' },
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash', partial: true } },
          { error: { code: 'network', retryable: true, message: 'The connection to the AI service was interrupted. Please try again.' } },
        ],
        { ok: false, text: 'ნახევარი', error: { code: 'network', retryable: true, message: 'terminated' }, attempts: [{ model: 'gemini-3.8-flash', code: 'network' }] },
      ),
    );
    const frames = await framesOf(await POST(post(userTurn('მითხარი ამბავი'))));
    expect(frames).toEqual([
      { meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast', fallback: false } },
      { text: 'ნახევარი' },
      { meta: { provider: 'gemini', model: 'gemini-3.8-flash', partial: true, mode: 'fast', fallback: false } },
      { error: { code: 'network', retryable: true, message: '⚠️ კავშირი AI სერვისთან შეწყდა. სცადე თავიდან.' } },
      'DONE',
    ]);
    expect(createAnthropic).not.toHaveBeenCalled();
  });
});

// ─── Provider failures ───────────────────────────────────────────────────────

describe('provider failures', () => {
  test('quota (a provider 402) → an honest "unavailable on our side" notice + {error}, never the provider wording', async () => {
    mockStream.mockImplementation(geminiFailure('quota'));
    const raw = await (await POST(post(userTurn('გამარჯობა')))).text();
    expect(decodeFrames(raw)).toEqual([
      { text: OUR_OUTAGE_KA },
      { error: { code: 'quota', retryable: false, message: OUR_OUTAGE_KA } },
      'DONE',
    ]);
    expect(raw).not.toMatch(/prepay|billing|AIza|Google/i);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ stage: 'gemini-failed', code: 'quota', status: 402 }));
  });

  test('protocol 2 clients get the {error} frame alone, without the legacy notice text', async () => {
    mockStream.mockImplementation(geminiFailure('quota'));
    const frames = await framesOf(await POST(post({ ...userTurn('გამარჯობა'), protocol: 2 })));
    expect(frames).toEqual([{ error: { code: 'quota', retryable: false, message: OUR_OUTAGE_KA } }, 'DONE']);
  });

  test('the notice follows the reply language (a Russian turn gets Russian)', async () => {
    mockStream.mockImplementation(geminiFailure('unavailable'));
    const frames = await framesOf(await POST(post(userTurn('Привет, как дела?'))));
    expect(frames[0]).toEqual({ text: '⚠️ AI-сервис временно недоступен. Попробуйте ещё раз.' });
  });

  test('Google-only (the default) never calls Anthropic, whatever the failure', async () => {
    for (const flag of [undefined, '1', 'true']) {
      if (flag === undefined) delete process.env.AI_GOOGLE_ONLY;
      else process.env.AI_GOOGLE_ONLY = flag;
      mockStream.mockImplementation(geminiFailure('unavailable'));
      const frames = await framesOf(await POST(post(userTurn('hello there'))));
      expect(frames).toContainEqual(expect.objectContaining({ error: expect.objectContaining({ code: 'unavailable' }) }));
    }
    expect(createAnthropic).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  test('AI_GOOGLE_ONLY=0 restores the Anthropic fallback, badged, with the Gemini error dropped, and books it', async () => {
    process.env.AI_GOOGLE_ONLY = '0';
    mockStream.mockImplementation(geminiFailure('quota'));
    (streamText as jest.Mock).mockReturnValue(
      anthropicStream([
        { type: 'text-delta', text: 'Hello ' },
        { type: 'text-delta', text: 'from Haiku' },
        { type: 'finish', totalUsage: { inputTokens: 900, outputTokens: 12, totalTokens: 912 } },
      ]),
    );
    const frames = await framesOf(await POST(post(userTurn('hello there'))));
    expect(frames).toEqual([
      { meta: { provider: 'anthropic', model: 'claude-haiku-4-5', mode: 'fast', fallback: true } },
      { text: 'Hello ' },
      { text: 'from Haiku' },
      { usage: { model: 'claude-haiku-4-5', inputTokens: 900, outputTokens: 12, totalTokens: 912 } },
      'DONE',
    ]);
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'test-anthropic-key' });
    expect(bookChatUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5', inputTokens: 900, outputTokens: 12, userId: USER_ID }),
    );
  });

  test('AI_GOOGLE_ONLY=0 but the fallback is empty → the Gemini failure is reported honestly', async () => {
    process.env.AI_GOOGLE_ONLY = '0';
    mockStream.mockImplementation(geminiFailure('quota'));
    (streamText as jest.Mock).mockReturnValue(anthropicStream([{ type: 'error', error: new Error('overloaded') }]));
    const frames = await framesOf(await POST(post(userTurn('გამარჯობა'))));
    expect(frames).toEqual([{ text: OUR_OUTAGE_KA }, { error: { code: 'quota', retryable: false, message: OUR_OUTAGE_KA } }, 'DONE']);
  });

  test('a safety stop is a localized notice — never re-asked of another vendor, even with the kill switch off', async () => {
    process.env.AI_GOOGLE_ONLY = '0';
    mockStream.mockImplementation(geminiFailure('safety'));
    const frames = await framesOf(await POST(post({ ...userTurn('something'), language: 'en' })));
    expect(frames).toEqual([{ text: SAFETY_EN }, { error: { code: 'safety', retryable: false, message: SAFETY_EN } }, 'DONE']);
    expect(createAnthropic).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});

// ─── Gates ───────────────────────────────────────────────────────────────────

describe('in-stream refusals', () => {
  test('budget exhausted → the old in-stream refusal (+ a budget {error}); the model is never called', async () => {
    (chatBudgetAllows as jest.Mock).mockResolvedValueOnce(false);
    const res = await POST(post(userTurn('გამარჯობა')));
    expect(res.status).toBe(200);
    expect(await framesOf(res)).toEqual([
      { meta: { provider: 'budget', model: 'none' } },
      { text: BUDGET_EXHAUSTED_MESSAGE },
      { error: { code: 'budget', retryable: false, message: BUDGET_EXHAUSTED_MESSAGE } },
      'DONE',
    ]);
    expect(mockStream).not.toHaveBeenCalled();
    expect(bookChatUsage).not.toHaveBeenCalled();
  });

  test('the budget estimate covers the platform prompt and the history, not just the last message', async () => {
    await (await POST(post(userTurn('short')))).text();
    const estimateText = (chatBudgetAllows as jest.Mock).mock.calls[0][0] as string;
    expect(estimateText).toContain('short');
    expect(estimateText).toContain('Agent G');
  });

  test('the per-user daily cap (CHAT_USER, keyed on the user id) refuses in-stream', async () => {
    (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const res = await POST(post(userTurn('გამარჯობა')));
    expect(res.status).toBe(200);
    const notice = '⚠️ ჩატის დღიური ლიმიტი ამოიწურა. სცადე მოგვიანებით.';
    expect(await framesOf(res)).toEqual([
      { text: notice },
      { error: { code: 'rate_limited', retryable: false, message: notice } },
      'DONE',
    ]);
    expect(checkRateLimitByKey).toHaveBeenCalledWith(USER_ID, RATE_LIMITS.CHAT_USER);
    expect(mockStream).not.toHaveBeenCalled();
  });

  test('CHAT_USER is a per-user daily bucket', () => {
    expect(RATE_LIMITS.CHAT_USER).toEqual({ maxRequests: 500, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:chat:user' });
  });

  test('the per-IP burst limit still answers first, with its own 429', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const res = await POST(post(userTurn('hi')));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.READ);
    expect(mockStream).not.toHaveBeenCalled();
  });
});

// ─── Usage ───────────────────────────────────────────────────────────────────

describe('usage booking', () => {
  test('real token usage is booked with the served model, the user id and the grounding queries', async () => {
    mockStream.mockImplementation(
      gemini([{ meta: { provider: 'gemini', model: 'gemini-3.6-flash' } }, { text: 'Hello' }], {
        model: 'gemini-3.6-flash',
        text: 'Hello',
        usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
        groundingQueries: 2,
      }),
    );
    await (await POST(post(userTurn('who won yesterday?')))).text();
    expect(bookChatUsage).toHaveBeenCalledTimes(1);
    expect(bookChatUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.6-flash',
        inputTokens: 1200,
        outputTokens: 80,
        totalTokens: 1280,
        chars: 5,
        userId: USER_ID,
        groundingQueries: 2,
      }),
    );
  });

  test('an EARLIER attempt Google billed before the rotation (a text-less 200) is booked too, against its own model', async () => {
    mockStream.mockImplementation(
      gemini([{ meta: { provider: 'gemini', model: 'gemini-3.6-flash' } }, { text: 'Hello' }], {
        model: 'gemini-3.6-flash',
        text: 'Hello',
        usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
        attempts: [
          { model: 'gemini-3.8-flash', code: 'unavailable', usage: { inputTokens: 1200, outputTokens: 4096 }, groundingQueries: 1 },
          { model: 'gemini-3.6-flash', usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 } },
        ],
      }),
    );
    await (await POST(post(userTurn('explain quantum tunnelling')))).text();
    expect(bookChatUsage).toHaveBeenCalledTimes(2);
    expect(bookChatUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.8-flash', outputTokens: 4096, groundingQueries: 1, userId: USER_ID }));
    expect(bookChatUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.6-flash', outputTokens: 80, userId: USER_ID }));
  });

  test('the booking settles before the stream closes', async () => {
    let booked = false;
    (bookChatUsage as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => setTimeout(() => { booked = true; resolve(); }, 20)),
    );
    mockStream.mockImplementation(gemini([{ text: 'Hi' }], { text: 'Hi', usage: { inputTokens: 5, outputTokens: 1 } }));
    await (await POST(post(userTurn('hi')))).text();
    expect(booked).toBe(true);
  });

  test('a turn that failed mid-answer is still booked (Google billed the tokens)', async () => {
    mockStream.mockImplementation(
      gemini([{ text: 'part' }], { ok: false, text: 'part', error: { code: 'network', retryable: true, message: 'terminated' } }),
    );
    await (await POST(post(userTurn('hi')))).text();
    expect(bookChatUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.8-flash', chars: 4, userId: USER_ID }));
  });

  test('a failure that produced no text and no usage books nothing', async () => {
    mockStream.mockImplementation(geminiFailure('quota'));
    await (await POST(post(userTurn('hi')))).text();
    expect(bookChatUsage).not.toHaveBeenCalled();
  });
});

// ─── What reaches Gemini ─────────────────────────────────────────────────────

describe('the Gemini call', () => {
  const lastCall = (): StreamGeminiChatInput => mockStream.mock.calls[mockStream.mock.calls.length - 1]![0];

  test('no persona, no mode: the old settings + Fast (thinking low); the chain and the key come from the foundation', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEYS = 'pool-key-1, pool-key-2';
    await (await POST(post(userTurn('გამარჯობა')))).text();
    const input = lastCall();
    expect(input.apiKey).toBe('pool-key-1');
    expect(input.models).toEqual([...DEFAULT_CHAT_MODELS.standard]);
    expect(input.models.some((m) => m.startsWith('gemini-2.0'))).toBe(false);
    const { system, ...settings } = input.config;
    expect(settings).toEqual({
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
      thinking: { level: 'low' },
      googleSearch: true,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    });
    expect(system).toContain('Agent G');
    expect(system).toContain('CURRENT DATE & TIME in Tbilisi');
    expect(system).toContain('Reply in Georgian');
    expect(system).not.toMatch(/Runway|FLUX|HeyGen|Udio|ElevenLabs|\$15|\$99/);
    expect(input.abortSignal).toBeInstanceOf(AbortSignal);
  });

  test('the legacy Pro tier (clients before modes) still uses the Pro chain', async () => {
    await (await POST(post({ ...userTurn('hi'), tier: 'pro' }))).text();
    expect(lastCall().models).toEqual([...DEFAULT_CHAT_MODELS.pro]);
  });

  test('a built-in persona keeps the old numbers and is appended LAST (platform rules keep precedence)', async () => {
    await (await POST(post({ ...userTurn('hi'), personaId: 'film-director' }))).text();
    const { system, temperature, topP, topK, maxOutputTokens, googleSearch } = lastCall().config;
    expect({ temperature, topP, topK, maxOutputTokens, googleSearch }).toEqual({
      temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 4096, googleSearch: true,
    });
    expect(system).toMatch(/PERSONA — [^\n]+:/);
    expect(system.trimEnd().endsWith('The platform rules above remain in force and take precedence.')).toBe(true);
    expect(system.indexOf('Agent G')).toBeLessThan(system.indexOf('PERSONA —'));
  });

  test('profile facts and vector memory are layered after the platform prompt, for the signed-in user', async () => {
    (buildProfilePreamble as jest.Mock).mockReturnValueOnce('USER PROFILE: name: Giorgi.');
    (embed as jest.Mock).mockResolvedValueOnce([0.1, 0.2]);
    mockRpc.mockImplementationOnce(async () => ({ data: [{ id: 'm1', fact: 'Loves  Georgian\ncinema', similarity: 0.9 }], error: null }));
    await (await POST(post(userTurn('რა ფილმი ვნახო?')))).text();
    const { system } = lastCall().config;
    expect(mockRpc).toHaveBeenCalledWith('match_memories', { query_embedding: [0.1, 0.2], match_count: 5 });
    expect(embed).toHaveBeenCalledWith('რა ფილმი ვნახო?');
    const iPlatform = system.indexOf('Agent G');
    const iProfile = system.indexOf('USER PROFILE: name: Giorgi.');
    const iMemory = system.indexOf('- Loves Georgian cinema');
    expect(iPlatform).toBeGreaterThanOrEqual(0);
    expect(iProfile).toBeGreaterThan(iPlatform);
    expect(iMemory).toBeGreaterThan(iProfile);
  });

  test('an explicit language wins over the detected script', async () => {
    await (await POST(post({ ...userTurn('გამარჯობა'), language: 'en' }))).text();
    expect(lastCall().config.system).toContain('Reply in English');
  });
});

// ─── History re-validation ───────────────────────────────────────────────────

describe('history re-validation', () => {
  const lastMessages = () => mockStream.mock.calls[mockStream.mock.calls.length - 1]![0].messages;

  test('no messages → 400', async () => {
    expect((await POST(post({ messages: [] }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });

  test('a body that is not JSON → 400', async () => {
    const req = new NextRequest('https://myavatar.ge/api/chat/gemini', { method: 'POST', body: 'not json' });
    expect((await POST(req)).status).toBe(400);
  });

  test('nothing but empty or assistant turns → 400 (the conversation must end with a user message)', async () => {
    expect((await POST(post({ messages: [{ role: 'user', content: '   ' }] }))).status).toBe(400);
    expect((await POST(post({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }))).status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });

  test('an empty result-bubble turn never reaches the model; the user turns around it merge', async () => {
    await (
      await POST(
        post({
          messages: [
            { role: 'user', content: 'make an image of Tbilisi' },
            { role: 'assistant', content: '' },
            { role: 'user', content: 'make it warmer' },
          ],
        }),
      )
    ).text();
    expect(lastMessages()).toEqual([{ role: 'user', content: 'make an image of Tbilisi\n\nmake it warmer' }]);
  });

  test('a leading assistant greeting is dropped; multimodal parts map onto ai@6 parts', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    await (
      await POST(
        post({
          messages: [
            { role: 'assistant', content: 'გამარჯობა! რით დაგეხმარო?' },
            { role: 'user', content: [{ type: 'text', text: 'რა არის ეს?' }, { type: 'image', image: png }] },
          ],
        }),
      )
    ).text();
    expect(lastMessages()).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'რა არის ეს?' }, { type: 'image', image: png, mediaType: 'image/png' }] },
    ]);
  });
});

// ─── Chat modes (the header's model picker) ──────────────────────────────────

describe('chat modes', () => {
  const lastCall = (): StreamGeminiChatInput => mockStream.mock.calls[mockStream.mock.calls.length - 1]![0];
  const metaFrames = (frames: Array<ChatFrame | 'DONE'>) => frames.filter((f): f is Extract<ChatFrame, { meta: unknown }> => f !== 'DONE' && 'meta' in f);
  const PRO_CALL = [USER_ID, RATE_LIMITS.CHAT_PRO_USER] as const;
  const proChecked = () => (checkRateLimitByKey as jest.Mock).mock.calls.some(([, cfg]) => cfg.keyPrefix === RATE_LIMITS.CHAT_PRO_USER.keyPrefix);

  test("mode 'pro' uses the Pro chain, thinks high, keeps the default temperature and raises the output floor", async () => {
    const frames = await framesOf(await POST(post({ ...userTurn('prove it'), mode: 'pro' })));
    const input = lastCall();
    expect(input.models).toEqual([...DEFAULT_CHAT_MODELS.pro]);
    expect(input.models.some((m) => /flash/.test(m))).toBe(false);
    expect(input.config.thinking).toEqual({ level: 'high' });
    expect('temperature' in input.config).toBe(false);
    expect(input.config.maxOutputTokens).toBe(8192);
    // A Pro turn draws on BOTH daily buckets, CHAT_USER first.
    expect((checkRateLimitByKey as jest.Mock).mock.calls).toEqual([[USER_ID, RATE_LIMITS.CHAT_USER], [...PRO_CALL]]);
    // Pre-checked at the Pro rate, not the flat Flash one.
    expect((chatBudgetAllows as jest.Mock).mock.calls[0][1]).toBe('gemini-3.1-pro-preview');
    expect(metaFrames(frames)[0]!.meta).toMatchObject({ mode: 'pro', fallback: false });
    expect(metaFrames(frames)[0]!.meta).not.toHaveProperty('requestedMode');
  });

  test("mode 'thinking' is the Flash chain thinking high, with the reasoning output floor and no temperature", async () => {
    await (await POST(post({ ...userTurn('why?'), mode: 'thinking' }))).text();
    const { models, config } = lastCall();
    expect(models).toEqual([...DEFAULT_CHAT_MODELS.standard]);
    expect(config.thinking).toEqual({ level: 'high' });
    expect(config.maxOutputTokens).toBe(8192);
    expect(config.temperature).toBeUndefined();
    expect(proChecked()).toBe(false); // not a Pro turn — no Pro allowance spent
    expect((chatBudgetAllows as jest.Mock).mock.calls[0][1]).toBe('gemini-3.8-flash');
  });

  test("mode 'lite' is the Flash-Lite chain, thinking low, persona temperature kept", async () => {
    await (await POST(post({ ...userTurn('hi'), mode: 'lite' }))).text();
    const { models, config } = lastCall();
    expect(models).toEqual([...DEFAULT_CHAT_MODELS.lite]);
    expect(config).toMatchObject({ thinking: { level: 'low' }, temperature: 0.7, maxOutputTokens: 4096 });
    expect((chatBudgetAllows as jest.Mock).mock.calls[0][1]).toBe('gemini-3.1-flash-lite');
  });

  test("the mode's thinking replaces the persona's; Fast keeps the persona's temperature, Pro drops it", async () => {
    // strict-coder is temperature 0.2, thinking 'high'.
    await (await POST(post({ ...userTurn('hi'), personaId: 'strict-coder', mode: 'fast' }))).text();
    expect(lastCall().config).toMatchObject({ thinking: { level: 'low' }, temperature: 0.2, maxOutputTokens: 4096 });
    await (await POST(post({ ...userTurn('hi'), personaId: 'strict-coder', mode: 'pro' }))).text();
    const pro = lastCall().config;
    expect(pro).toMatchObject({ thinking: { level: 'high' }, maxOutputTokens: 8192, googleSearch: false });
    expect(pro.temperature).toBeUndefined();
    expect(pro.system).toMatch(/PERSONA — /); // the persona still shapes the answer
  });

  test('a custom persona asking for thinking off cannot reach the API as off — the mode sets it', async () => {
    const customPersona = { name: 'Quiet', directive: 'Answer in one short paragraph.', thinking: 'off', temperature: 0.4 };
    await (await POST(post({ ...userTurn('hi'), personaId: 'custom:quiet', customPersona }))).text();
    // The persona did resolve (its temperature is in force)…
    expect(lastCall().config.temperature).toBe(0.4);
    // …but 'off' is not what reaches chatStream: Fast sets 'low' (and 'off' would be a 400 on 3.8 Flash).
    expect(lastCall().config.thinking).toEqual({ level: 'low' });
  });

  test('the route never forwards a client model id — a mode is resolved against the catalogue, anything else is Fast', async () => {
    const hostile = {
      ...userTurn('hi'),
      mode: 'gemini-3.1-pro-preview',
      model: 'gemini-9-ultra',
      models: ['gemini-9-ultra', '../../v1/files'],
      modelId: 'gemini-9-ultra',
      tier: 'ultra',
    };
    await (await POST(post(hostile))).text();
    expect(lastCall().models).toEqual([...DEFAULT_CHAT_MODELS.standard]);
    expect(proChecked()).toBe(false);
    // …and a valid mode with a model id beside it still gets exactly that mode's own chain.
    await (await POST(post({ ...userTurn('hi'), mode: 'pro', model: 'gemini-9-ultra' }))).text();
    expect(lastCall().models).toEqual([...DEFAULT_CHAT_MODELS.pro]);
    expect(JSON.stringify(mockStream.mock.calls.map(([i]) => ({ models: i.models, config: i.config })))).not.toContain('gemini-9-ultra');
  });

  test('a spent Pro allowance DOWNGRADES to Fast (not a refusal) and says so in every {meta}', async () => {
    const resetSec = Math.ceil(Date.parse('2026-10-01T08:15:00.000Z') / 1000);
    (checkRateLimitByKey as jest.Mock)
      .mockResolvedValueOnce(null) // CHAT_USER
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '3600', 'X-RateLimit-Reset': String(resetSec) } }));
    mockStream.mockImplementation(
      gemini(
        [
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
          { text: 'half' },
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash', partial: true } },
        ],
        { ok: false, text: 'half', error: { code: 'network', retryable: true, message: 'terminated' } },
      ),
    );
    const frames = await framesOf(await POST(post({ ...userTurn('prove it'), mode: 'pro' })));
    const input = lastCall();
    expect(input.models).toEqual([...DEFAULT_CHAT_MODELS.standard]);
    expect(input.config).toMatchObject({ thinking: { level: 'low' }, temperature: 0.7, maxOutputTokens: 4096 });
    expect((chatBudgetAllows as jest.Mock).mock.calls[0][1]).toBe('gemini-3.8-flash');
    const downgrade = { mode: 'fast', fallback: false, requestedMode: 'pro', reason: 'pro_cap', resetAt: '2026-10-01T08:15:00.000Z' };
    expect(metaFrames(frames).map((f) => f.meta)).toEqual([
      { provider: 'gemini', model: 'gemini-3.8-flash', ...downgrade },
      { provider: 'gemini', model: 'gemini-3.8-flash', partial: true, ...downgrade },
    ]);
    expect(frames).toContainEqual({ text: 'half' });
  });

  test('the downgrade reset time falls back to Retry-After, and is left out when the 429 carries neither header', async () => {
    const before = Date.now();
    (checkRateLimitByKey as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }));
    const withRetry = metaFrames(await framesOf(await POST(post({ ...userTurn('hi'), mode: 'pro' }))))[0]!.meta;
    expect(withRetry).toMatchObject({ mode: 'fast', requestedMode: 'pro', reason: 'pro_cap' });
    const at = Date.parse(withRetry.resetAt!);
    expect(at).toBeGreaterThanOrEqual(before + 120_000 - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 120_000 + 1000);

    (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const bare = metaFrames(await framesOf(await POST(post({ ...userTurn('hi'), mode: 'pro' }))))[0]!.meta;
    expect(bare).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast', fallback: false, requestedMode: 'pro', reason: 'pro_cap' });
  });

  test('a spent CHAT_USER cap still refuses first — the Pro allowance is never consulted', async () => {
    (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 429 }));
    const frames = await framesOf(await POST(post({ ...userTurn('hi'), mode: 'pro', protocol: 2 })));
    expect(frames).toEqual([{ error: expect.objectContaining({ code: 'rate_limited', retryable: false }) }, 'DONE']);
    expect(checkRateLimitByKey).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
  });

  test('a guest (FILM_ALLOW_ANONYMOUS) is always Fast: no Pro chain, no Pro allowance lookup', async () => {
    mockUser = null;
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    for (const body of [{ mode: 'pro' }, { mode: 'thinking' }, { tier: 'pro' }, { mode: 'lite' }]) {
      const frames = await framesOf(await POST(post({ ...userTurn('hi'), ...body })));
      expect(lastCall().models).toEqual([...DEFAULT_CHAT_MODELS.standard]);
      expect(lastCall().config.thinking).toEqual({ level: 'low' });
      expect(metaFrames(frames)[0]!.meta).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast', fallback: false });
    }
    expect(checkRateLimitByKey).not.toHaveBeenCalled();
  });

  test('a rotated answer is badged as a fallback of the mode that answered', async () => {
    mockStream.mockImplementation(
      gemini([{ meta: { provider: 'gemini', model: 'gemini-2.5-pro', fallback: true } }, { text: 'ok' }], {
        model: 'gemini-2.5-pro',
        text: 'ok',
        attempts: [{ model: 'gemini-3.1-pro-preview', code: 'unavailable' }, { model: 'gemini-2.5-pro' }],
      }),
    );
    const frames = await framesOf(await POST(post({ ...userTurn('hi'), mode: 'pro' })));
    expect(metaFrames(frames)[0]!.meta).toEqual({ provider: 'gemini', model: 'gemini-2.5-pro', mode: 'pro', fallback: true });
  });

  test('the budget refusal frame is not dressed up as an answer', async () => {
    (chatBudgetAllows as jest.Mock).mockResolvedValueOnce(false);
    const frames = await framesOf(await POST(post({ ...userTurn('hi'), mode: 'pro' })));
    expect(metaFrames(frames)).toEqual([{ meta: { provider: 'budget', model: 'none' } }]);
  });
});

describe('the Pro allowance (CHAT_PRO_USER)', () => {
  test('is a per-user daily bucket of 20 in its own namespace', () => {
    expect(RATE_LIMITS.CHAT_PRO_USER).toEqual({ maxRequests: 20, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:chat:pro:user' });
    expect(chatProUserLimit()).toEqual(RATE_LIMITS.CHAT_PRO_USER);
  });

  test('CHAT_PRO_DAILY_LIMIT overrides the count (0 = Pro off), never the namespace; junk keeps the default', () => {
    for (const [raw, want] of [['50', 50], [' 5 ', 5], ['0', 0], ['10000', 10_000]] as const) {
      process.env.CHAT_PRO_DAILY_LIMIT = raw;
      expect([raw, chatProUserLimit()]).toEqual([raw, { ...RATE_LIMITS.CHAT_PRO_USER, maxRequests: want }]);
    }
    for (const raw of ['', 'abc', '-5', '2.5', '20/day', '10001', '999999', '1e3']) {
      process.env.CHAT_PRO_DAILY_LIMIT = raw;
      expect([raw, chatProUserLimit().maxRequests]).toEqual([raw, 20]);
    }
  });

  test('the route checks the env-adjusted allowance', async () => {
    process.env.CHAT_PRO_DAILY_LIMIT = '3';
    await (await POST(post({ ...userTurn('hi'), mode: 'pro' }))).text();
    expect(checkRateLimitByKey).toHaveBeenLastCalledWith(USER_ID, { ...RATE_LIMITS.CHAT_PRO_USER, maxRequests: 3 });
  });
});
