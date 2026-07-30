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
import { chatBudgetAllows, bookChatUsage, BUDGET_EXHAUSTED_MESSAGE } from './chatBudget';

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

describe('the refusal message', () => {
  it('is bilingual — the user base is Georgian-first', () => {
    expect(BUDGET_EXHAUSTED_MESSAGE).toMatch(/ბიუჯეტი/);
    expect(BUDGET_EXHAUSTED_MESSAGE).toMatch(/budget/i);
  });
});
