import { createHash } from 'node:crypto';
import { redisGetString, redisSetIfNotExists, redisSetString } from '@/lib/platform/redis';

type IdempotentRunOptions<T> = {
  key: string;
  ttlSeconds?: number;
  inFlightTtlSeconds?: number;
  execute: () => Promise<T>;
};

export type IdempotentRunResult<T> = {
  key: string;
  replayed: boolean;
  value: T;
};

function resultKey(key: string): string {
  return `idem:result:${key}`;
}

function lockKey(key: string): string {
  return `idem:lock:${key}`;
}

export function hashIdempotencyKey(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function markIdempotentDuplicate(key: string, ttlSeconds = 3600): Promise<boolean> {
  return redisSetIfNotExists(`idem:seen:${key}`, '1', ttlSeconds);
}

export async function runIdempotent<T>(options: IdempotentRunOptions<T>): Promise<IdempotentRunResult<T>> {
  const ttlSeconds = options.ttlSeconds ?? 3600;
  const inFlightTtlSeconds = options.inFlightTtlSeconds ?? 60;

  const cached = await redisGetString(resultKey(options.key));
  if (cached) {
    return {
      key: options.key,
      replayed: true,
      value: JSON.parse(cached) as T,
    };
  }

  const lockAcquired = await redisSetIfNotExists(lockKey(options.key), '1', inFlightTtlSeconds);
  if (!lockAcquired) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const replay = await redisGetString(resultKey(options.key));
      if (replay) {
        return {
          key: options.key,
          replayed: true,
          value: JSON.parse(replay) as T,
        };
      }
    }
  }

  const value = await options.execute();
  await redisSetString(resultKey(options.key), JSON.stringify(value), ttlSeconds);
  return {
    key: options.key,
    replayed: false,
    value,
  };
}
