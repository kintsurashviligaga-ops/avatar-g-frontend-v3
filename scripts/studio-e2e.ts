/**
 * ⚠️ BILLABLE. One real generation through the studio's money path, against PRODUCTION services:
 * our registry → Higgsfield estimate → GEL price → the ledger debit → the ONE submit → webhook / cron →
 * outputs copied into our storage → filed in the Library → a signed URL a user would get.
 *
 * It spends real Higgsfield money (Soul 2 ≈ $0.004) and debits the chosen account's credits by the quoted
 * price (Soul 2 = 1 credit = 0.10 ₾). A failed job is refunded by the saga like any other.
 *
 * It does NOT sweep other jobs by default: progress comes from the production webhook and the per-minute
 * production cron, exactly as for a user. `--sweep` runs the saga's sweep locally if those are not arriving.
 *
 *   npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/studio-e2e.ts --email you@example.com --yes-spend
 *        [--model hf/soul-2] [--prompt "…"] [--wait-min 10] [--sweep] [--out <dir>]
 *
 * Follow an EXISTING job instead (spends nothing — watch it finish, then print the same evidence):
 *   npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/studio-e2e.ts --job <uuid> [--wait-min 5]
 */
import { loadEnvConfig } from '@next/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

loadEnvConfig(process.cwd());

type Args = { email: string; model: string; prompt: string; waitMin: number; sweep: boolean; out: string; yes: boolean; job: string };

function parseArgs(argv: string[]): Args {
  const get = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    email: (get('--email') ?? '').trim().toLowerCase(),
    model: get('--model') ?? 'hf/soul-2',
    prompt: get('--prompt') ?? 'მზის ჩასვლა თბილისის ძველ უბანზე, ფოტორეალისტური კადრი, თბილი სინათლე',
    waitMin: Number(get('--wait-min') ?? 10),
    sweep: argv.includes('--sweep'),
    out: get('--out') ?? join(tmpdir(), 'studio-e2e'),
    yes: argv.includes('--yes-spend'),
    job: (get('--job') ?? '').trim(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`);

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.job && !a.email) throw new Error('--email is required (the account to charge), or --job <id> to follow one');
  if (!a.job && !a.yes) throw new Error('refusing to spend without --yes-spend');

  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  const { getStudioRuntime } = await import('@/lib/studio/runtime');
  const { publicJob } = await import('@/lib/studio/saga');
  const { TERMINAL_JOB_STATUSES } = await import('@/lib/studio/store');

  const sb = createServiceRoleClient();
  const rt = getStudioRuntime();
  if (!sb || !rt) throw new Error('studio runtime not configured (Supabase service role / Higgsfield credentials)');

  const existing = a.job ? await rt.store.get(a.job) : null;
  if (a.job && !existing) throw new Error('no such job');

  // The account, by email — never printed beyond what identifies it to its owner.
  let userId: string | null = existing?.user_id ?? null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    userId = data.users.find((u) => (u.email ?? '').toLowerCase() === a.email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error('no account with that email');
  const balance = async () => {
    const { data } = await sb.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    return Number((data as { credits_balance?: number } | null)?.credits_balance ?? NaN);
  };
  const before = await balance();
  log(`account ${userId.slice(0, 8)}… balance ${before} credits`);

  let first: import('@/lib/studio/store').StudioJob;
  let expected: number | null = null;
  if (existing) {
    first = existing;
    log(`following job ${existing.id} (${existing.status}, ${existing.charge_credits} credits)`);
  } else {
    // 1. Price.
    const params = { prompt: a.prompt };
    const q = await rt.saga.quote(a.model, params);
    if (!q.ok) throw new Error(`quote refused: ${q.code} ${JSON.stringify(q.issues ?? [])}`);
    log(`quote ${a.model}: ${q.price.credits} credits = ${q.price.gel.toFixed(2)} ₾ (provider usd ${q.estimate.usd ?? 'described'})`);

    // 2. Confirm at exactly that price → reserve → submit.
    const c = await rt.saga.create({ userId, modelId: a.model, params, confirmedGel: q.price.gel, promptOriginal: a.prompt });
    if (!c.ok) throw new Error(`create refused: ${c.code}`);
    first = c.job;
    expected = -q.price.credits;
    log(`job ${first.id} → ${first.status} (request ${first.provider_request_id ?? '—'})`);
  }
  const id = first.id;

  // 3. Progress: the production webhook / cron move it; finalize on read like GET /api/generate/:id does.
  const deadline = Date.now() + a.waitMin * 60_000;
  let job = first;
  let last = '';
  let lastSweep = 0;
  while (!TERMINAL_JOB_STATUSES.has(job.status) && Date.now() < deadline) {
    await sleep(4_000);
    job = (await rt.store.get(id)) ?? job;
    if (job.status !== last) { log(`status ${job.status}`); last = job.status; }
    if (job.status === 'finalizing') job = await rt.saga.finalize(job);
    if (a.sweep && Date.now() - lastSweep > 20_000) { lastSweep = Date.now(); const r = await rt.saga.sweep({ maxDrain: 1 }); log(`sweep ${JSON.stringify(r)}`); }
  }
  log(`final status ${job.status}${job.error_code ? ` (${job.error_code})` : ''}`);

  // 4. Evidence.
  const { data: events, error: evErr } = await sb.from('provider_webhook_events').select('status, received_at').eq('job_id', id).order('received_at');
  if (evErr) log(`webhook events query failed: ${evErr.message}`);
  const { data: ledger } = await sb.from('credit_ledger').select('delta, metadata').eq('user_id', userId).like('metadata->>ref', `${first.charge_ref}%`);
  const { data: lib } = await sb.from('generation_jobs').select('id, service_type, status').eq('id', `studio_${id}`).maybeSingle();
  const after = await balance();
  const urls = job.status === 'completed' ? await rt.signOutputs(job.output_urls) : [];

  let saved: string | null = null;
  if (urls[0]) {
    const res = await fetch(urls[0]);
    const type = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(a.out, { recursive: true });
    saved = join(a.out, `${id}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('mp4') ? 'mp4' : 'jpg'}`);
    writeFileSync(saved, buf);
    log(`output: HTTP ${res.status} ${type} ${buf.length} bytes → ${saved}`);
  }

  const summary = {
    job: publicJob(job, urls.map(() => '(signed)')),
    balance: existing ? { now: after } : { before, after, delta: after - before, expected },
    ledger: (ledger ?? []).map((r) => ({ delta: (r as { delta: number }).delta, ref: (r as { metadata?: { ref?: string } }).metadata?.ref })),
    webhookEvents: events ?? [],
    library: lib ?? null,
    storedOutputs: job.output_urls.length,
    saved,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (job.status !== 'completed') process.exitCode = 2;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
