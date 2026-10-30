jest.mock('server-only', () => ({}));
const mockAdmin = jest.fn();
jest.mock('../auth/adminGuard', () => ({ isAdminIdentity: (u: unknown) => mockAdmin(u) }));

import { liveAudience, liveAudienceAllows } from './liveAudience';

const user = { id: 'u1', email: 'someone@example.com', email_confirmed_at: '2026-10-25T00:00:00Z' };

beforeEach(() => mockAdmin.mockReset().mockResolvedValue(false));

describe('the Live rollout audience', () => {
  test('unset, empty or anything but "everyone" keeps Live to admins', () => {
    for (const v of [undefined, '', 'admins', 'all', 'true', 'every one']) expect(liveAudience({ LIVE_AUDIENCE: v })).toBe('admins');
  });

  test('"everyone" (any case, spaces trimmed) opens it', () => {
    for (const v of ['everyone', ' Everyone ', 'EVERYONE']) expect(liveAudience({ LIVE_AUDIENCE: v })).toBe('everyone');
  });

  test('admins only: the one admin rule decides', async () => {
    expect(await liveAudienceAllows(user, {})).toBe(false);
    expect(mockAdmin).toHaveBeenCalledWith(user);
    mockAdmin.mockResolvedValueOnce(true);
    expect(await liveAudienceAllows(user, {})).toBe(true);
  });

  test('everyone: any signed-in user, without asking the admin rule', async () => {
    expect(await liveAudienceAllows(user, { LIVE_AUDIENCE: 'everyone' })).toBe(true);
    expect(mockAdmin).not.toHaveBeenCalled();
  });
});
