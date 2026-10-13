/**
 * lib/platform/upstashEnv.ts — which Upstash database this deployment talks to. No imports, so edge code can use it too.
 *
 * Two pairs of variables can name one. The Vercel Marketplace store (Vercel → Storage → Upstash for Redis) writes
 * KV_REST_API_URL / KV_REST_API_TOKEN; an older pair entered by hand is UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
 * The Marketplace pair wins: Production's hand-entered host stopped resolving in 2026-09 (`getaddrinfo ENOTFOUND`), and its
 * replacement is a Marketplace store (owner, 2026-10-13), so the dead pair must not shadow it while it is still set.
 * URL and token always come from the same pair: a token of one database never goes to the URL of another.
 */
export type UpstashRestEnv = { url: string; token: string; source: 'KV_REST_API' | 'UPSTASH_REDIS_REST' };

export function upstashRestEnv(env: Record<string, string | undefined> = process.env): UpstashRestEnv | null {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN, source: 'KV_REST_API' };
  }
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, source: 'UPSTASH_REDIS_REST' };
  }
  return null;
}
