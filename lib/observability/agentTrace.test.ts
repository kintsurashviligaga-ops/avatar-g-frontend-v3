/** @jest-environment node */
/**
 * recordTrace answers whether the row landed (MASTER TASK v3.1, audit F-05). supabase-js RETURNS an insert error rather
 * than throwing, and that answer used to be ignored, so a refused spend row looked written and the budget guard never
 * saw the money. It still never throws: the user-facing flow must not depend on a trace.
 */
jest.mock('server-only', () => ({}));

const mockInsert = jest.fn();
const mockRpc = jest.fn();
let mockNoClient = false;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockNoClient) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    return { from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }), rpc: (...a: unknown[]) => mockRpc(...a) };
  },
}));
jest.mock('../env/previewIsolation', () => ({ paidWritesBlockedOnPreview: () => false }));

// eslint-disable-next-line import/first
import { recordTrace, type AgentTraceRow } from './agentTrace';

const USER = '11111111-2222-4333-8444-555555555555';
const row: AgentTraceRow = { userId: USER, agentId: 'v2-chat', workerKind: 'gemini', action: 'generate', costWholesaleGel: 0.27 };

let warn: jest.SpyInstance;
beforeEach(() => {
  mockNoClient = false;
  mockInsert.mockReset().mockResolvedValue({ data: null, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

test('a written row answers true', async () => {
  await expect(recordTrace(row)).resolves.toBe(true);
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER, agent_id: 'v2-chat', cost_wholesale_gel: 0.27 }));
  expect(warn).not.toHaveBeenCalled();
});

test('an insert that ANSWERS an error is a row that did not land', async () => {
  mockInsert.mockResolvedValue({ data: null, error: { message: 'insert or update on table violates foreign key constraint' } });
  await expect(recordTrace(row)).resolves.toBe(false);
  expect(warn).toHaveBeenCalledWith('[agentTrace] insert rejected:', 'insert or update on table violates foreign key constraint');
});

test('an insert that throws, or no service-role client, answers false and never throws', async () => {
  mockInsert.mockRejectedValue(new Error('fetch failed'));
  await expect(recordTrace(row)).resolves.toBe(false);
  mockNoClient = true;
  await expect(recordTrace(row)).resolves.toBe(false);
});

test('the debit pass still runs after a landed row, and its own failure does not change the answer', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'insufficient balance' } });
  await expect(recordTrace({ ...row, costRetailGel: 1, deduct: true, deductRef: 'ref-1' })).resolves.toBe(true);
  expect(mockRpc).toHaveBeenCalledWith('debit_wallet_gel', { p_user_id: USER, p_amount: 1, p_ref: 'ref-1' });
});
