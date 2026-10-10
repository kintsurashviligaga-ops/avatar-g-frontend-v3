/** @jest-environment node */
/**
 * The legacy Vapi tool get_job_status (Agent G PART 5, gap S1): it reads service_jobs through the service role, which
 * passes RLS, with a job id the call's model chose. Pinned: it reads only the caller's own job, and a call that belongs
 * to nobody reads nothing.
 */
const mockQueries: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
const mockRow = { current: null as Record<string, unknown> | null };
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const q = { table, eq: [] as Array<[string, unknown]> };
      mockQueries.push(q);
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => { q.eq.push([col, val]); return chain; },
        maybeSingle: async () => ({ data: mockRow.current, error: null }),
      };
      return chain;
    },
  }),
}));
const mockCall = { current: null as Record<string, unknown> | null };
const mockAppended: Array<Record<string, unknown>> = [];
jest.mock('./repository', () => ({
  getVoiceCallByVapiId: async () => mockCall.current,
  appendVoiceCallMetadata: async (_id: string, patch: Record<string, unknown>) => { mockAppended.push(patch); return null; },
  updateVoiceCallById: async () => null,
  updateVoiceCallStatusByVapiId: async () => null,
}));
jest.mock('../logger', () => ({ structuredLog: () => {} }));

import { processVoiceWebhookEvent } from './webhook-processing';

const asks = (jobId: string) => ({ type: 'function.get_job_status', call: { id: 'vapi-1' }, arguments: { job_id: jobId } });
const answered = () => (mockAppended.at(-1)?.tool_results as Array<{ name: string; response: unknown }> | undefined)?.at(-1);

beforeEach(() => { mockQueries.length = 0; mockAppended.length = 0; mockRow.current = null; });

test('reads the job only under the caller\'s own user id', async () => {
  mockCall.current = { id: 'vc-1', user_id: 'user-a', metadata: {} };
  mockRow.current = { id: 'job-1', status: 'running' };
  await processVoiceWebhookEvent(asks('job-1'));
  expect(mockQueries).toEqual([{ table: 'service_jobs', eq: [['id', 'job-1'], ['user_id', 'user-a']] }]);
  expect(answered()).toMatchObject({ name: 'get_job_status', response: { id: 'job-1', status: 'running' } });
});

test('someone else\'s job id finds nothing (the owner filter leaves no row) and the call is told nothing about it', async () => {
  mockCall.current = { id: 'vc-1', user_id: 'user-a', metadata: {} };
  mockRow.current = null; // what the database returns for id = another user's job AND user_id = user-a
  await processVoiceWebhookEvent(asks('job-of-user-b'));
  expect(mockQueries[0]!.eq).toContainEqual(['user_id', 'user-a']);
  expect(answered()).toMatchObject({ name: 'get_job_status', response: null });
});

test('a call that belongs to nobody reads nothing', async () => {
  mockCall.current = { id: 'vc-2', user_id: null, metadata: {} };
  await processVoiceWebhookEvent(asks('job-1'));
  expect(mockQueries).toEqual([]);
  expect(mockAppended).toEqual([]);
});
