jest.mock('server-only', () => ({}));
const mockAdmin = jest.fn();
jest.mock('../auth/adminGuard', () => ({ isAdminIdentity: (u: unknown) => mockAdmin(u) }));

import { liveAudience, liveAudienceAllows, liveAvatarAccess, liveAvatarAudience } from './liveAudience';

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

describe('the talking avatar\'s own audience (GG 2026-10-31)', () => {
  test('unset or anything but "everyone" keeps the avatar to admins, whatever LIVE_AUDIENCE says', () => {
    for (const v of [undefined, '', 'admins', 'all']) expect(liveAvatarAudience({ LIVE_AVATAR_AUDIENCE: v, LIVE_AUDIENCE: 'everyone' })).toBe('admins');
    expect(liveAvatarAudience({ LIVE_AVATAR_AUDIENCE: ' Everyone ' })).toBe('everyone');
  });

  test('a call open to everyone: a user who is not an admin may not turn the avatar on', async () => {
    expect(await liveAvatarAccess(user, { LIVE_AUDIENCE: 'everyone' })).toEqual({ allowed: false, dailySessions: 0 });
  });

  test('admins keep 30 sessions a day, with or without the setting', async () => {
    mockAdmin.mockResolvedValue(true);
    expect(await liveAvatarAccess(user, {})).toEqual({ allowed: true, dailySessions: 30 });
    expect(await liveAvatarAccess(user, { LIVE_AVATAR_AUDIENCE: 'everyone', LIVE_AVATAR_DAILY_SESSIONS: '1' })).toEqual({ allowed: true, dailySessions: 30 });
  });

  test('opened to everyone: 1 session a day unless LIVE_AVATAR_DAILY_SESSIONS says 1–30', async () => {
    const env = { LIVE_AVATAR_AUDIENCE: 'everyone' };
    expect(await liveAvatarAccess(user, env)).toEqual({ allowed: true, dailySessions: 1 });
    expect(await liveAvatarAccess(user, { ...env, LIVE_AVATAR_DAILY_SESSIONS: '3' })).toEqual({ allowed: true, dailySessions: 3 });
    for (const v of ['0', '-2', '31', 'many', '']) {
      expect(await liveAvatarAccess(user, { ...env, LIVE_AVATAR_DAILY_SESSIONS: v })).toEqual({ allowed: true, dailySessions: 1 });
    }
  });

  test('no user: never', async () => {
    mockAdmin.mockImplementation(async (u: unknown) => !!u && false);
    expect(await liveAvatarAccess(null, {})).toEqual({ allowed: false, dailySessions: 0 });
  });
});
