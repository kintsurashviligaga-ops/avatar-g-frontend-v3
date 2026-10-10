/** @jest-environment node */
/**
 * GET / PATCH /api/agent-g/calls — call preferences. The phone is never "connected" while no call path exists, the
 * client cannot set `voice_connected`, and a number is stored in E.164 or refused.
 */
jest.mock('server-only', () => ({}));

const mockUpsert = jest.fn();
const mockPrefsRow = jest.fn(async (): Promise<{ data: Record<string, unknown> | null; error: null }> => ({ data: null, error: null }));
function mockTable(name: string) {
  if (name === 'agent_g_calls') {
    return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
  }
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => mockPrefsRow() }) }),
    upsert: (row: Record<string, unknown>, opts: unknown) => {
      mockUpsert(row, opts);
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
    },
  };
}
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (name: string) => mockTable(name) }),
}));
const mockAuthUser = jest.fn(async (..._a: unknown[]): Promise<{ id: string } | null> => ({ id: 'user-1' }));
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: (...a: unknown[]) => mockAuthUser(...a) }));

import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

const URL_ = 'https://myavatar.ge/api/agent-g/calls';
const patch = (body: unknown) =>
  PATCH(new NextRequest(URL_, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => jest.clearAllMocks());

describe('GET', () => {
  it('a guest sees no provider and calls not ready', async () => {
    mockAuthUser.mockResolvedValueOnce(null);
    const { data } = await (await GET(new NextRequest(URL_))).json();
    expect(data).toMatchObject({ guest: true, provider: 'none', voice_connected: false, phone_calls_ready: false });
  });

  it('an old row saying connected is not shown as connected', async () => {
    mockPrefsRow.mockResolvedValueOnce({ data: { user_id: 'user-1', voice_connected: true }, error: null });
    const { data } = await (await GET(new NextRequest(URL_))).json();
    expect(data).toMatchObject({ guest: false, provider: 'none', voice_connected: false, phone_calls_ready: false });
  });
});

describe('PATCH', () => {
  it('needs a session', async () => {
    mockAuthUser.mockResolvedValueOnce(null);
    expect((await patch({ phone_number: '599123456' })).status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('stores a Georgian mobile in E.164 and drops voice_connected from the body', async () => {
    const res = await patch({ phone_number: '599 12 34 56', voice_connected: true, quiet_hours_enabled: true });
    expect(res.status).toBe(200);
    const [row] = mockUpsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: 'user-1', phone_number: '+995599123456', quiet_hours_enabled: true });
    expect(row).not.toHaveProperty('voice_connected');
  });

  it('keeps an international number in E.164', async () => {
    await patch({ phone_number: '+44 20 7946 0958' });
    expect(mockUpsert.mock.calls[0][0].phone_number).toBe('+442079460958');
  });

  it('refuses something that is not a phone number', async () => {
    expect((await patch({ phone_number: '12' })).status).toBe(400);
    expect((await patch({ phone_number: 'call me' })).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('an empty string or null clears the number', async () => {
    await patch({ phone_number: '' });
    await patch({ phone_number: null });
    expect(mockUpsert.mock.calls.map((c) => c[0].phone_number)).toEqual([null, null]);
  });
});
