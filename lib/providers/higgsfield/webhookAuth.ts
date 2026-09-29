/**
 * Authenticating Higgsfield's webhook calls.
 *
 * Higgsfield signs nothing: it POSTs the envelope to whatever `hf_webhook` URL the submission carried. So the
 * URL itself is the credential — it carries OUR job id and an HMAC of it under HF_WEBHOOK_SECRET:
 *
 *   https://myavatar.ge/api/webhooks/higgsfield?job=<uuid>&sig=<hmac>
 *
 * That gives two properties the billing saga depends on:
 *   1. a forged "completed" / "failed" for someone else's job cannot be delivered — the sig will not verify;
 *   2. the job id arrives even when the submit POST timed out and we never learned the request_id — the
 *      webhook reconciles an ambiguous submission instead of the job being lost (no re-POST ever needed).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'hf-webhook:v1:';
const MIN_SECRET_LENGTH = 16;

function secretFrom(env: NodeJS.ProcessEnv): string | null {
  const s = (env.HF_WEBHOOK_SECRET ?? '').trim();
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

export function signJobId(jobId: string, secret: string): string {
  return createHmac('sha256', secret).update(PURPOSE + jobId).digest('base64url');
}

/** Constant-time check. False for a missing secret, a missing sig, or any mismatch. */
export function verifyJobSignature(jobId: string, sig: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const secret = secretFrom(env);
  if (!secret || !jobId || !sig) return false;
  const expected = Buffer.from(signJobId(jobId, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The public HTTPS origin Higgsfield can reach. Preview deployments behind Vercel auth are NOT reachable. */
export function webhookBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const raw of [env.HF_WEBHOOK_BASE_URL, env.NEXT_PUBLIC_APP_URL, env.PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL, env.SITE_URL]) {
    const v = (raw ?? '').trim().replace(/\/+$/, '');
    if (v.startsWith('https://')) return v;
  }
  return null;
}

/**
 * The hf_webhook URL for a job, or null when webhooks cannot be used here (no secret / no public origin) —
 * the saga then relies on status polling alone, which is slower but correct.
 */
export function webhookUrlForJob(jobId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = secretFrom(env);
  const base = webhookBaseUrl(env);
  if (!secret || !base) return null;
  return `${base}/api/webhooks/higgsfield?job=${encodeURIComponent(jobId)}&sig=${signJobId(jobId, secret)}`;
}
