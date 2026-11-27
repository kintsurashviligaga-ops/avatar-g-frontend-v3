/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../orchestrator/storage-adapter', () => ({ ensureBucket: jest.fn() }));

import { isAlreadyExists, workspaceRaceFlags } from './live';
import { dbWorkspaceLock } from './dbLock';

describe('Phase 8.23 switches (off unless exactly 1)', () => {
  it.each([
    [{}, false, false],
    [{ WORKSPACE_CREATE_ONLY: '1' }, true, false],
    [{ WORKSPACE_LOCKS: ' 1 ' }, false, true],
    [{ WORKSPACE_CREATE_ONLY: 'true', WORKSPACE_LOCKS: 'on' }, false, false],
    [{ WORKSPACE_CREATE_ONLY: '1', WORKSPACE_LOCKS: '1' }, true, true],
  ])('%j', (env, createOnly, locks) => {
    expect(workspaceRaceFlags(env)).toEqual({ createOnly, locks });
  });
});

describe('Storage "already exists" answer', () => {
  it.each([
    [{ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, true],
    [{ status: 409, message: 'x' }, true],
    [{ message: 'The resource already exists' }, true],
    [{ statusCode: '500', message: 'internal' }, false],
    [{ statusCode: '403', message: 'new row violates row-level security policy' }, false],
    [null, false],
  ])('%j → %s', (e, want) => expect(isAlreadyExists(e)).toBe(want));
});

describe('dbWorkspaceLock', () => {
  const client = (answer: { data: unknown; error: unknown }) => {
    const rpc = jest.fn().mockResolvedValue(answer);
    return { rpc, lock: dbWorkspaceLock({ client: () => ({ rpc }) }) };
  };

  it('calls the SQL functions with the lease arguments', async () => {
    const { rpc, lock } = client({ data: true, error: null });
    expect(await lock.acquire('u1', 'ws_a', 'holder01', 30)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('workspace_lock_acquire', { p_user: 'u1', p_ws: 'ws_a', p_holder: 'holder01', p_ttl: 30 });
    await lock.release('u1', 'ws_a', 'holder01');
    expect(rpc).toHaveBeenLastCalledWith('workspace_lock_release', { p_user: 'u1', p_ws: 'ws_a', p_holder: 'holder01' });
  });

  it('false is "someone else holds it"', async () => {
    expect(await client({ data: false, error: null }).lock.acquire('u', 'w', 'holder01', 30)).toBe(false);
  });

  it('throws (so the store writes without a lock) when the function is missing or the answer is odd', async () => {
    await expect(client({ data: null, error: { code: '42883', message: 'function does not exist' } }).lock.acquire('u', 'w', 'holder01', 30)).rejects.toThrow('does not exist');
    await expect(client({ data: 'yes', error: null }).lock.acquire('u', 'w', 'holder01', 30)).rejects.toThrow('no boolean');
    await expect(dbWorkspaceLock().acquire('u', 'w', 'holder01', 30)).rejects.toThrow('storage not configured');
  });
});
