import { Redis } from '@upstash/redis';

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

const memoryStore = new Map<string, MemoryEntry>();
let redisClient: Redis | null = null;

function memoryGet(key: string): string | null {
  const item = memoryStore.get(key);
  if (!item) return null;
  if (Date.now() >= item.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export function getRedisRuntimeKind(): 'redis' | 'memory' {
  return getRedisClient() ? 'redis' : 'memory';
}

export async function redisGetString(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (redis) {
    const value = await redis.get<string>(key);
    return value ?? null;
  }

  return memoryGet(key);
}

export async function redisSetString(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }

  memorySet(key, value, ttlSeconds);
}

export async function redisSetIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    const result = await redis.set(key, value, { ex: ttlSeconds, nx: true });
    return result === 'OK';
  }

  if (memoryGet(key) !== null) {
    return false;
  }

  memorySet(key, value, ttlSeconds);
  return true;
}

export async function redisDelete(key: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }

  memoryStore.delete(key);
}
