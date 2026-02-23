import { Redis } from '@upstash/redis';

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const memoryStore = new Map<string, CacheEntry>();

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    const value = await redis.get<T>(key);
    return value ?? null;
  }

  const item = memoryStore.get(key);
  if (!item) return null;
  if (Date.now() >= item.expiresAt) {
    memoryStore.delete(key);
    return null;
  }

  return item.value as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }

  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }
  memoryStore.delete(key);
}

export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    const value = await redis.incr(key);
    if (value === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return value;
  }

  const current = await cacheGet<number>(key);
  const next = (current ?? 0) + 1;
  await cacheSet(key, next, ttlSeconds);
  return next;
}

export function cacheRuntimeKind(): 'redis' | 'memory' {
  return getRedisClient() ? 'redis' : 'memory';
}
