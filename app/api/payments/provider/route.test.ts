/** @jest-environment node */
/** The retired payment-provider setting answers 410 on both verbs and touches no database. */
jest.mock('../../../../lib/supabase/server', () => {
  throw new Error('the retired route must not import a Supabase client');
});

import { GET, PUT } from './route';

describe('/api/payments/provider (retired)', () => {
  it.each([['GET', GET], ['PUT', PUT]])('%s answers 410 Gone', async (_verb, handler) => {
    const res = handler();
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: string }).error).toBe('gone');
  });
});
