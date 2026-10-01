/** @jest-environment node */
/**
 * chatBudget — the gate in front of every LLM surface (7 routes + llmText's 14 internal callers).
 * The properties that matter are the failure modes: it must refuse when the budget says so, and it must
 * NEVER be the reason chat goes down.
 */

const canProceed = jest.fn();
const recordUsage = jest.fn();

jest.mock('./BillingGuard', () => ({
  canProceed: (...a: unknown[]) => canProceed(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));

// eslint-disable-next-line import/first
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE, UNSPECIFIED_CHAT_MODEL } from './chatBudget';

beforeEach(() => { canProceed.mockReset(); recordUsage.mockReset().mockResolvedValue(undefined); });

describe('chatBudgetAllows', () => {
  it('allows a turn inside the budget', async () => {
    canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
    await expect(chatBudgetAllows('hello there')).resolves.toBe(true);
  });

  it('refuses when the budget says no', async () => {
    canProceed.mockResolvedValue({ allowed: false, reason: 'daily_limit' });
    await expect(chatBudgetAllows('hello there')).resolves.toBe(false);
  });

  it('FAILS OPEN when the guard throws — chat must not go down with the ledger', async () => {
    canProceed.mockRejectedValue(new Error('supabase unreachable'));
    await expect(chatBudgetAllows('hello')).resolves.toBe(true);
  });

  it('estimates from the outbound text plus a reply allowance', async () => {
    canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
    await chatBudgetAllows('x'.repeat(400)); // ~100 input tokens
    const est = canProceed.mock.calls[0]![0] as { inputTokens: number; outputTokens: number; service: string };
    expect(est.service).toBe('chat');
    expect(est.inputTokens).toBe(100);
    expect(est.outputTokens).toBe(800); // the reply we have not seen yet is still budgeted for
  });
});

describe('bookChatUsage', () => {
  it('derives output tokens from the streamed CHARACTER count', async () => {
    // The regression this pins: passing the count through approximateTokens() stringified the number
    // ("1600" → 1 token) and under-booked every reply by ~200×.
    await bookChatUsage('x'.repeat(400), 1600);
    const booked = recordUsage.mock.calls[0]![0] as { inputTokens: number; outputTokens: number };
    expect(booked.inputTokens).toBe(100);
    expect(booked.outputTokens).toBe(400); // 1600 chars / 4
  });

  it('never throws, whatever the ledger does', async () => {
    recordUsage.mockRejectedValue(new Error('ledger down'));
    await expect(bookChatUsage('hi', 40)).resolves.toBeUndefined();
  });

  it('treats a junk char count as zero output rather than NaN', async () => {
    await bookChatUsage('hi', Number.NaN);
    expect((recordUsage.mock.calls[0]![0] as { outputTokens: number }).outputTokens).toBe(0);
  });
});

describe('chatBudgetAllows — pricing of the pre-check', () => {
  it('prices an UNSPECIFIED model at the flat Master Task rate (as strict as before per-model pricing)', async () => {
    canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
    await chatBudgetAllows('x'.repeat(400)); // 100 in + 800 reply allowance
    const est = canProceed.mock.calls[0]![0] as { model: string; estimatedCost: number };
    expect(est.model).toBe(UNSPECIFIED_CHAT_MODEL);
    expect(est.estimatedCost).toBeCloseTo((100 * 1.5 + 800 * 9) / 1e6, 6);
  });

  it('prices a NAMED model at its family rate', async () => {
    canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
    await chatBudgetAllows('x'.repeat(400), 'gemini-2.5-flash');
    const est = canProceed.mock.calls[0]![0] as { estimatedCost: number };
    expect(est.estimatedCost).toBeCloseTo((100 * 0.3 + 800 * 2.5) / 1e6, 6);
  });
});

describe('bookChatUsage — the real-usage (object) shape', () => {
  const USER = '3f2b8c1e-9a4d-4e6f-8b21-0c5d7e9f1a2b';
  type Booked = { model: string; inputTokens: number; outputTokens: number; estimatedCost: number; service: string };
  const booked = () => recordUsage.mock.calls[0]![0] as Booked;
  const meta = () => recordUsage.mock.calls[0]![1] as { userId: string | null };

  it('books provider-reported tokens at the SERVING model\'s rate, attributed to the user', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 10_000, outputTokens: 2_000, userId: USER });
    expect(booked()).toMatchObject({ service: 'chat', model: 'gemini-2.5-flash', inputTokens: 10_000, outputTokens: 2_000 });
    expect(booked().estimatedCost).toBeCloseTo((10_000 * 0.3 + 2_000 * 2.5) / 1e6, 6); // $0.008
    expect(meta().userId).toBe(USER);
  });

  it('prices the same usage differently per model family', async () => {
    const cost = async (model: string) => {
      recordUsage.mockClear();
      await bookChatUsage({ model, inputTokens: 1_000_000, outputTokens: 1_000_000 });
      return booked().estimatedCost;
    };
    expect(await cost('gemini-2.5-flash-lite')).toBeCloseTo(0.1 + 0.4, 6);
    expect(await cost('gemini-2.5-flash')).toBeCloseTo(0.3 + 2.5, 6);
    expect(await cost('gemini-2.5-pro')).toBeCloseTo(2.5 + 15, 6); // 1M prompt tokens > 200k → long-context rates
    expect(await cost('gemini-3.8-flash')).toBeCloseTo(1.5 + 7.5, 6); // 3.6–3.8 Flash: the 2027 list price
    expect(await cost('gemini-3.5-flash')).toBeCloseTo(1.5 + 9, 6);
    expect(await cost('gemini-2.5-flash-native-audio-latest')).toBeCloseTo(3 + 12, 6);
    expect(await cost('mystery-model')).toBeCloseTo(1.5 + 9, 6); // unknown id → the old flat rate
  });

  it('adds Google Search grounding: per QUERY on Gemini 3+, per PROMPT on 2.5', async () => {
    await bookChatUsage({ model: 'gemini-3.8-flash', inputTokens: 0, outputTokens: 0, chars: 0, groundingQueries: 3 });
    expect(booked().estimatedCost).toBeCloseTo(3 * 0.014, 6);
    recordUsage.mockClear();
    await bookChatUsage({ model: 'gemini-2.5-flash', groundingQueries: 3 });
    expect(booked().estimatedCost).toBeCloseTo(0.035, 6); // one grounded prompt, however many queries
  });

  it('falls back to CHARACTER counts when the stream reported no usage', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash', chars: 1600, inputChars: 400 });
    expect(booked()).toMatchObject({ inputTokens: 100, outputTokens: 400 });
  });

  it('does not let a reported ZERO make a delivered reply free', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 500, outputTokens: 0, chars: 1600 });
    expect(booked()).toMatchObject({ inputTokens: 500, outputTokens: 400 });
  });

  it('books a total beyond input + output as OUTPUT (raw REST usage leaves thinking out of candidates)', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 200, totalTokens: 1700 });
    expect(booked()).toMatchObject({ inputTokens: 1000, outputTokens: 700 });
  });

  it('books a lone total (a Live usage frame) at the output rate', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash-native-audio-latest', totalTokens: 1000 });
    expect(booked()).toMatchObject({ inputTokens: 0, outputTokens: 1000 });
    expect(booked().estimatedCost).toBeCloseTo((1000 * 12) / 1e6, 6);
  });

  it('bills context-cache hits at the cached rate, clamped to the prompt size', async () => {
    await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 1000, cachedInputTokens: 800, outputTokens: 0 });
    expect(booked().estimatedCost).toBeCloseTo((200 * 0.3 + 800 * 0.03) / 1e6, 6);
    recordUsage.mockClear();
    await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 1000, cachedInputTokens: 99_999, outputTokens: 0 });
    expect(booked().estimatedCost).toBeCloseTo((1000 * 0.03) / 1e6, 6);
  });

  it('drops a non-UUID user id rather than letting the FK reject the whole spend row', async () => {
    for (const userId of ['guest', '', '   ', 'x'.repeat(36), null, undefined]) {
      recordUsage.mockClear();
      await bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 10, outputTokens: 10, userId });
      expect(recordUsage).toHaveBeenCalledTimes(1); // the spend is still booked…
      expect(meta().userId).toBeNull(); // …just unattributed
    }
  });

  it('ignores junk counts (strings, NaN, negatives) instead of booking NaN', async () => {
    await bookChatUsage({
      model: 'gemini-2.5-flash',
      inputTokens: Number.NaN,
      outputTokens: -5,
      chars: '1600' as unknown as number,
      groundingQueries: Number.POSITIVE_INFINITY,
    });
    expect(booked()).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    expect(Number.isFinite(booked().estimatedCost)).toBe(true);
    expect(booked().estimatedCost).toBe(0);
  });

  it('labels a missing / garbage model as unspecified (flat rate), never throws', async () => {
    await bookChatUsage({ model: '', inputTokens: 1000, outputTokens: 0 });
    expect(booked().model).toBe(UNSPECIFIED_CHAT_MODEL);
    expect(booked().estimatedCost).toBeCloseTo((1000 * 1.5) / 1e6, 6);
    recordUsage.mockClear();
    await expect(bookChatUsage(null as unknown as string, 10)).resolves.toBeUndefined();
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('never throws, whatever the ledger does', async () => {
    recordUsage.mockRejectedValue(new Error('ledger down'));
    await expect(bookChatUsage({ model: 'gemini-2.5-flash', inputTokens: 1, outputTokens: 1, userId: USER })).resolves.toBeUndefined();
  });
});

describe('bookChatUsage — the legacy (inputText, outputChars, model) shape keeps its meaning', () => {
  it('books at the named model\'s rate, with no user attribution', async () => {
    await bookChatUsage('x'.repeat(400), 1600, 'gemini-2.5-flash');
    const est = recordUsage.mock.calls[0]![0] as { model: string; estimatedCost: number };
    expect(est.model).toBe('gemini-2.5-flash');
    expect(est.estimatedCost).toBeCloseTo((100 * 0.3 + 400 * 2.5) / 1e6, 6);
    expect((recordUsage.mock.calls[0]![1] as { userId: unknown }).userId).toBeNull();
  });

  it('keeps non-Gemini labels (llmText legs, Haiku) on the flat rate they were always booked at', async () => {
    for (const label of ['deepseek', 'atlas', 'gemini', 'anthropic', 'claude-haiku-4-5']) {
      recordUsage.mockClear();
      await bookChatUsage('x'.repeat(400), 1600, label);
      expect((recordUsage.mock.calls[0]![0] as { estimatedCost: number }).estimatedCost).toBeCloseTo((100 * 1.5 + 400 * 9) / 1e6, 6);
    }
  });
});

describe('the refusal message', () => {
  it('is bilingual — the user base is Georgian-first', () => {
    expect(BUDGET_EXHAUSTED_MESSAGE).toMatch(/ბიუჯეტი/);
    expect(BUDGET_EXHAUSTED_MESSAGE).toMatch(/budget/i);
  });
});
