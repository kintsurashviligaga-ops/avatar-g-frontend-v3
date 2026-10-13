import { upstashRestEnv } from './upstashEnv';

const KV = { KV_REST_API_URL: 'https://new-store.upstash.test', KV_REST_API_TOKEN: 'kv-token' };
const OLD = { UPSTASH_REDIS_REST_URL: 'https://unresolvable-upstash-host.invalid', UPSTASH_REDIS_REST_TOKEN: 'old-token' };

describe('upstashRestEnv: which Upstash database this deployment talks to', () => {
  it('the Vercel Marketplace pair wins over a hand-entered pair that is still set (Production, 2026-10-13)', () => {
    expect(upstashRestEnv({ ...OLD, ...KV })).toEqual({ url: KV.KV_REST_API_URL, token: KV.KV_REST_API_TOKEN, source: 'KV_REST_API' });
  });

  it('the hand-entered pair answers alone (local development, older deployments)', () => {
    expect(upstashRestEnv({ ...OLD })).toEqual({ url: OLD.UPSTASH_REDIS_REST_URL, token: OLD.UPSTASH_REDIS_REST_TOKEN, source: 'UPSTASH_REDIS_REST' });
  });

  it('never pairs one database\'s URL with another\'s token', () => {
    expect(upstashRestEnv({ ...OLD, KV_REST_API_URL: KV.KV_REST_API_URL })).toEqual({ url: OLD.UPSTASH_REDIS_REST_URL, token: OLD.UPSTASH_REDIS_REST_TOKEN, source: 'UPSTASH_REDIS_REST' });
    expect(upstashRestEnv({ KV_REST_API_URL: KV.KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN: OLD.UPSTASH_REDIS_REST_TOKEN })).toBeNull();
  });

  it('null when neither pair is complete, and empty strings count as unset', () => {
    expect(upstashRestEnv({})).toBeNull();
    expect(upstashRestEnv({ KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: OLD.UPSTASH_REDIS_REST_URL })).toBeNull();
  });
});
