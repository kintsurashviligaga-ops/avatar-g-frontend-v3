/** @jest-environment node */
import { runAccountDeletion, PERSONAL_TABLES, FINANCIAL_TABLES, accountDeleteV2Enabled, type DeletionDeps } from './accountDeletion';
import { isChatPurgeDue, chatPurgeCutoff } from './chatRetention';

const UID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

function deps(over: Partial<DeletionDeps> = {}) {
  const calls: string[] = [];
  const d: DeletionDeps = {
    listUserFiles: jest.fn(async (b: string, uid: string) => [`${uid}/a.png`, `${uid}/b.png`, `someone-else/c.png`]),
    removeFiles: jest.fn(async (b: string, p: string[]) => { calls.push(`rm:${b}:${p.join(',')}`); return {}; }),
    deleteRows: jest.fn(async (t: string) => { calls.push(`rows:${t}`); return {}; }),
    softDeleteAuthUser: jest.fn(async () => { calls.push('auth'); return {}; }),
    ...over,
  };
  return { d, calls };
}

test('no financial table is ever deleted (ledger and BOG history stay for accounting)', () => {
  const personal = PERSONAL_TABLES.map((t) => t.table);
  for (const f of FINANCIAL_TABLES) expect(personal).not.toContain(f);
});

test('files, then personal rows, then the soft auth delete last; only the user\'s own prefix is removed', async () => {
  const { d, calls } = deps();
  const r = await runAccountDeletion(UID, d);
  expect(r.ok).toBe(true);
  expect(calls.join('\n')).not.toContain('someone-else');
  expect(calls[calls.length - 1]).toBe('auth');
  expect(calls.findIndex((c) => c.startsWith('rows:'))).toBeGreaterThan(calls.findLastIndex((c) => c.startsWith('rm:')));
  expect(d.softDeleteAuthUser).toHaveBeenCalledWith(UID);
});

test('a returned {error} is reported (not swallowed) and deletion still finishes', async () => {
  const { d } = deps({
    deleteRows: jest.fn(async (t: string) => (t === 'jobs' ? { error: { message: 'relation does not exist' } } : {})),
    listUserFiles: jest.fn(async () => null),
  });
  const r = await runAccountDeletion(UID, d);
  expect(r.ok).toBe(true);
  expect(r.problems).toEqual(expect.arrayContaining([
    { step: 'rows', target: 'jobs', reason: 'relation does not exist' },
    expect.objectContaining({ step: 'storage', reason: 'list_failed' }),
  ]));
});

test('the auth step failing fails the request; a bad id touches nothing', async () => {
  const { d } = deps({ softDeleteAuthUser: jest.fn(async () => ({ error: { message: 'boom' } })) });
  expect((await runAccountDeletion(UID, d)).ok).toBe(false);
  const { d: d2 } = deps();
  expect((await runAccountDeletion('../x', d2)).ok).toBe(false);
  expect(d2.deleteRows).not.toHaveBeenCalled();
});

test('flag is off unless set to on', () => {
  expect(accountDeleteV2Enabled({})).toBe(false);
  expect(accountDeleteV2Enabled({ ACCOUNT_DELETE_V2: 'on' })).toBe(true);
});

test('chat purge: only after 365 days without a sign-in, never on an unknown date', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  expect(isChatPurgeDue('2025-11-12T23:59:59Z', now)).toBe(true);
  expect(isChatPurgeDue('2025-11-14T00:00:00Z', now)).toBe(false);
  expect(isChatPurgeDue(null, now)).toBe(false);
  expect(isChatPurgeDue('not a date', now)).toBe(false);
  expect(chatPurgeCutoff(now).toISOString()).toBe('2025-11-13T00:00:00.000Z');
});
