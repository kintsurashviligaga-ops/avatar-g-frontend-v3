/** @jest-environment node */
/**
 * The concurrency gate. The Lua script itself runs inside Redis; here a fake evaluates the SAME semantics
 * (expire leases → re-acquire own slot → add while under the limit) so the contract the saga relies on is
 * pinned, and the fail-open behaviour is proven.
 */
import { ACQUIRE_LUA, concurrencyLimit, createRedisSemaphore, type SemaphoreRedis } from './semaphore';

function fakeRedis(): SemaphoreRedis & { set: Map<string, number> } {
  const set = new Map<string, number>();
  return {
    set,
    async eval(script, _keys, args) {
      expect(script).toBe(ACQUIRE_LUA);
      const [now, lease, limit, member] = [Number(args[0]), Number(args[1]), Number(args[2]), String(args[3])];
      for (const [m, exp] of set) if (exp <= now) set.delete(m);
      if (set.has(member)) { set.set(member, now + lease); return 1; }
      if (set.size < limit) { set.set(member, now + lease); return 1; }
      return 0;
    },
    async zrem(_key, ...members) { members.forEach((m) => set.delete(m)); return members.length; },
  };
}

describe('createRedisSemaphore', () => {
  test('admits up to the limit; re-acquiring your own slot is free; release frees it', async () => {
    let now = 1_000;
    const redis = fakeRedis();
    const s = createRedisSemaphore(redis, { limit: 2, now: () => now });
    expect(await s.acquire('a', 60_000)).toBe(true);
    expect(await s.acquire('b', 60_000)).toBe(true);
    expect(await s.acquire('c', 60_000)).toBe(false);
    expect(await s.acquire('a', 60_000)).toBe(true); // own slot, lease refreshed
    await s.release('a');
    expect(await s.acquire('c', 60_000)).toBe(true);
  });

  test('a crashed holder frees its slot when the lease expires — the gate can never wedge shut', async () => {
    let now = 1_000;
    const s = createRedisSemaphore(fakeRedis(), { limit: 1, now: () => now });
    expect(await s.acquire('crashed', 5_000)).toBe(true);
    expect(await s.acquire('next', 5_000)).toBe(false);
    now += 5_001;
    expect(await s.acquire('next', 5_000)).toBe(true);
  });

  test('no Redis, or Redis erroring → fail OPEN (the provider’s own 400 still parks the job)', async () => {
    expect(await createRedisSemaphore(null).acquire('x', 1_000)).toBe(true);
    const broken: SemaphoreRedis = { eval: async () => { throw new Error('down'); }, zrem: async () => { throw new Error('down'); } };
    const s = createRedisSemaphore(broken);
    expect(await s.acquire('x', 1_000)).toBe(true);
    await expect(s.release('x')).resolves.toBeUndefined();
  });

  test('limit comes from HF_MAX_CONCURRENCY, default 4 (the documented example)', () => {
    expect(concurrencyLimit({} as NodeJS.ProcessEnv)).toBe(4);
    expect(concurrencyLimit({ HF_MAX_CONCURRENCY: '8' } as NodeJS.ProcessEnv)).toBe(8);
    expect(concurrencyLimit({ HF_MAX_CONCURRENCY: 'x' } as NodeJS.ProcessEnv)).toBe(4);
  });
});
