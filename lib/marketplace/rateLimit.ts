const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();

export function softRateLimit(key: string, limit = 40, windowMs = 60_000) {
  const now = Date.now();
  const bucket = RATE_BUCKET.get(key);

  if (!bucket || bucket.resetAt <= now) {
    RATE_BUCKET.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  RATE_BUCKET.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.count) };
}

export function getRequestKey(ip: string | null | undefined, action: string) {
  return `${ip || 'unknown'}:${action}`;
}
