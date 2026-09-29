/* eslint-disable no-console */
/**
 * Higgsfield SDK example — Seedance 2.5 text-to-video, the setup the Higgsfield console asks for:
 * official `@higgsfield/client` v2, `subscribe()`, wait for completion, print the video URL.
 *
 *   npm run hf:credentials   # once: enter the key LOCALLY (hidden input) → .env.local HF_CREDENTIALS
 *   npm run hf:example       # ⚠️ BILLABLE: one 5 s, 720p, 16:9 generation
 *
 * Credentials are loaded at runtime from HF_CREDENTIALS="key-id:key-secret" (.env.local, gitignored) and are
 * never printed, logged or committed. Server-side only — the v2 client refuses to run in a browser.
 *
 * Two deliberate settings on top of the docs example:
 *   - maxRetries: 0. The SDK wraps the generation POST in retryWithBackoff (default 3 retries on a timeout or
 *     5xx). Submissions have no idempotency key, so a retried POST after a timeout can generate — and bill —
 *     twice. One POST, and a failure is reported instead of repeated.
 *   - Only `completed` WITH a video URL counts as success. failed / nsfw / canceled, a polling timeout, or a
 *     completed response without a URL all exit non-zero with the reason; nothing claims success it did not see.
 *
 * The production path does not use the SDK (lib/providers/higgsfield/client.ts, see docs/REPORT_PHASE_1.md);
 * this script exists to verify the account and the model the way Higgsfield documents it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHiggsfieldClient } from '@higgsfield/client/v2';

const MODEL = 'bytedance/seedance-2.5/text-to-video';
const INPUT = {
  prompt: 'A cinematic scene at sunset',
  duration: 5,
  resolution: '720p',
  aspect_ratio: '16:9',
} as const;

/** Load .env.local into process.env without printing anything from it. */
function loadEnvLocal(): void {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function credentialsFromEnv(): string | null {
  const single = (process.env.HF_CREDENTIALS ?? '').trim();
  if (/^[^:\s]+:\S+$/.test(single)) return single;
  const id = (process.env.HF_API_KEY_ID ?? '').trim();
  const secret = (process.env.HF_API_KEY_SECRET ?? '').trim();
  return id && secret ? `${id}:${secret}` : null;
}

async function main(): Promise<number> {
  loadEnvLocal();
  const credentials = credentialsFromEnv();
  if (!credentials) {
    console.error('Blocked: HF_CREDENTIALS ("key-id:key-secret") is not set.');
    console.error('Only a key ID is configured — the key SECRET is missing. Run `npm run hf:credentials` and paste the secret locally.');
    return 2;
  }

  const client = createHiggsfieldClient({
    credentials,
    maxRetries: 0, // never re-send the generation POST (see header)
    timeout: 60_000,
    pollInterval: 3_000,
    maxPollTime: 15 * 60_000,
  });

  console.log(`Submitting ${MODEL} — "${INPUT.prompt}", ${INPUT.duration}s, ${INPUT.resolution}, ${INPUT.aspect_ratio} (billable)…`);
  const started = Date.now();
  let result;
  try {
    result = await client.subscribe(MODEL, { input: INPUT, withPolling: true });
  } catch (e) {
    const err = e as { name?: string; statusCode?: number; status?: number };
    const status = err.statusCode ?? err.status;
    console.error(`Not completed: ${err.name ?? 'Error'}${status ? ` (HTTP ${status})` : ''}.`);
    if (err.name === 'TimeoutError') {
      console.error('The request may still be running at Higgsfield — check the console before submitting again (a resubmit is billed again).');
    } else if (status === 401) {
      console.error('Higgsfield rejected the credentials — check the key ID and secret.');
    } else if (status === 403) {
      console.error('The Higgsfield account has no credits left — top up in console.higgsfield.ai.');
    }
    return 1;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const status = String(result.status);
  const url = result.video?.url;
  if (status === 'completed' && url) {
    console.log(`Completed in ${seconds}s · request ${result.request_id}`);
    console.log(url);
    return 0;
  }
  const reason =
    status === 'nsfw' ? 'rejected by content moderation (not charged)'
      : status === 'failed' ? 'generation failed (not charged)'
        : status === 'canceled' ? 'canceled'
          : status === 'completed' ? 'reported completed but returned no video URL'
            : `ended in unexpected status "${status}"`;
  console.error(`Not completed: ${reason} · request ${result.request_id} · after ${seconds}s`);
  return 1;
}

main().then((code) => process.exit(code), (e) => {
  console.error('Unexpected error:', e instanceof Error ? e.name : 'unknown');
  process.exit(1);
});
