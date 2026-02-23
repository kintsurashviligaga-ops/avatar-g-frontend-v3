import { cacheIncr } from '@/lib/platform/cache';

export type SlidingWindowCheckInput = {
  namespace: string;
  key: string;
  limit: number;
  windowSeconds: number;
};

export type SlidingWindowResult = {
  allowed: boolean;
  count: number;
  limit: number;
  resetInSeconds: number;
};

export async function checkSlidingWindow(input: SlidingWindowCheckInput): Promise<SlidingWindowResult> {
  const nowBucket = Math.floor(Date.now() / 1000 / input.windowSeconds);
  const bucketKey = `${input.namespace}:${input.key}:${nowBucket}`;
  const count = await cacheIncr(bucketKey, input.windowSeconds + 2);

  return {
    allowed: count <= input.limit,
    count,
    limit: input.limit,
    resetInSeconds: input.windowSeconds,
  };
}
