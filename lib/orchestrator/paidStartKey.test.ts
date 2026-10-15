/** @jest-environment node */
/**
 * claimPaidStartKey — the duplicate guard of a step that TAKES MONEY (a paid film start). Unlike claimIdempotencyKey it asks
 * the shared DATABASE first (durable, one row for every instance), Redis only when the database cannot answer, and says
 * 'unavailable' when neither can, so the caller can refuse rather than charge blind. The database path on a real Postgres:
 * lib/chat/filmBilling.pg.test.ts.
 */
jest.mock('server-only', () => ({}));

const mockStoreClaim = jest.fn();
jest.mock('./idempotencyStore', () => ({
  storeClaim: (...a: unknown[]) => mockStoreClaim(...a),
  storeRelease: jest.fn(async () => undefined),
}));
const mockSet = jest.fn();
jest.mock('../platform/upstash', () => ({ createUpstashRedis: () => ({ set: (...a: unknown[]) => mockSet(...a), del: jest.fn() }) }));

const ENV = { ...process.env };
function load(withRedis: boolean) {
  process.env = { ...ENV };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  if (withRedis) Object.assign(process.env, { KV_REST_API_URL: 'https://redis.local.test', KV_REST_API_TOKEN: 'local-only' });
  else { delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; }
  let mod!: typeof import('./idempotency');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./idempotency');
  });
  return mod;
}
beforeEach(() => { mockStoreClaim.mockReset(); mockSet.mockReset(); });
afterAll(() => { process.env = ENV; });

describe('the database answers first', () => {
  test.each(['claimed', 'held'] as const)('database says %s → that is the answer; Redis is not consulted', async (answer) => {
    mockStoreClaim.mockResolvedValue(answer);
    const { claimPaidStartKey } = load(true);
    expect(await claimPaidStartKey('u1', 'film-start:k', 3600)).toBe(answer);
    expect(mockStoreClaim).toHaveBeenCalledWith('u1', 'film-start:k', 3600);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('the database cannot answer → Redis, SET NX with the same window', () => {
  test.each([['OK', 'claimed'], [null, 'held']] as const)('Redis answers %s → %s', async (reply, answer) => {
    mockStoreClaim.mockResolvedValue('unavailable');
    mockSet.mockResolvedValue(reply);
    const { claimPaidStartKey } = load(true);
    expect(await claimPaidStartKey('u1', 'film-start:k', 330)).toBe(answer);
    expect(mockSet).toHaveBeenCalledWith('idem:u1:film-start:k', '1', { nx: true, ex: 330 });
  });

  test('Redis timing out / refusing too → unavailable (never a silent "go ahead")', async () => {
    mockStoreClaim.mockResolvedValue('unavailable');
    mockSet.mockRejectedValue(new Error('ETIMEDOUT'));
    const { claimPaidStartKey } = load(true);
    expect(await claimPaidStartKey('u1', 'film-start:k', 330)).toBe('unavailable');
  });

  test('no Redis configured and no database → unavailable', async () => {
    mockStoreClaim.mockResolvedValue('unavailable');
    const { claimPaidStartKey } = load(false);
    expect(await claimPaidStartKey('u1', 'film-start:k', 330)).toBe('unavailable');
  });
});

describe('the older guard is unchanged for everything that is not a paid start', () => {
  test('claimIdempotencyKey still fails OPEN when neither store answers', async () => {
    mockStoreClaim.mockResolvedValue('unavailable');
    const { claimIdempotencyKey } = load(false);
    expect(await claimIdempotencyKey('u1', 'assemble:k', 60)).toBe(true);
  });
});
