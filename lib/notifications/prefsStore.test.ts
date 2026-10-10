/** @jest-environment node */
/**
 * prefsStore — preferences on the account's app_metadata. Pinned: a write sends ONLY `notify_prefs` (GoTrue merges
 * app_metadata by key, so the admin `role` beside it is never touched), the value is normalized first, and every
 * failure degrades to the defaults or null instead of throwing.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('not in tests'); } }));

import { prefsFromUser, readPrefs, writePrefs, PREFS_KEY } from './prefsStore';
import { DEFAULT_PREFS, normalizePrefs } from './preferences';

const admin = (over: Partial<{ getUserById: jest.Mock; updateUserById: jest.Mock }> = {}) => ({
  getUserById: jest.fn(async () => ({ data: { user: { app_metadata: {} } }, error: null })),
  updateUserById: jest.fn(async () => ({ data: {}, error: null })),
  ...over,
});

test('prefsFromUser: saved prefs are normalized; none → defaults with saved:false', () => {
  expect(prefsFromUser({ app_metadata: { [PREFS_KEY]: { events: { reminder: ['call', 'site'] } } } })).toEqual({
    prefs: normalizePrefs({ events: { reminder: ['site', 'call'] } }),
    saved: true,
  });
  expect(prefsFromUser({ app_metadata: { role: 'admin' } })).toEqual({ prefs: normalizePrefs(DEFAULT_PREFS), saved: false });
  expect(prefsFromUser(null).saved).toBe(false);
});

test('writePrefs sends only notify_prefs, normalized — never the role or anything else', async () => {
  const a = admin();
  const stored = await writePrefs('u1', { events: { needs_attention: ['call'] }, role: 'admin' }, a as never);
  expect(a.updateUserById).toHaveBeenCalledTimes(1);
  const [id, attrs] = a.updateUserById.mock.calls[0]!;
  expect(id).toBe('u1');
  expect(Object.keys(attrs)).toEqual(['app_metadata']);
  expect(Object.keys(attrs.app_metadata)).toEqual([PREFS_KEY]);
  expect(attrs.app_metadata[PREFS_KEY].events.needs_attention).toEqual(['site']);
  expect(stored).toEqual(attrs.app_metadata[PREFS_KEY]);
});

test('failures: a write error → null; a read error or throw → defaults', async () => {
  expect(await writePrefs('u1', {}, admin({ updateUserById: jest.fn(async () => ({ error: { message: 'x' } })) }) as never)).toBeNull();
  expect(await writePrefs('u1', {}, admin({ updateUserById: jest.fn(async () => { throw new Error('down'); }) }) as never)).toBeNull();
  expect((await readPrefs('u1', admin({ getUserById: jest.fn(async () => ({ data: null, error: { message: 'x' } })) }) as never)).saved).toBe(false);
  expect((await readPrefs('u1', admin({ getUserById: jest.fn(async () => { throw new Error('down'); }) }) as never)).prefs).toEqual(normalizePrefs(DEFAULT_PREFS));
  const saved = admin({ getUserById: jest.fn(async () => ({ data: { user: { app_metadata: { [PREFS_KEY]: { events: { task_completed: ['site'] } } } } }, error: null })) });
  expect((await readPrefs('u1', saved as never)).prefs.events.task_completed).toEqual(['site']);
});
