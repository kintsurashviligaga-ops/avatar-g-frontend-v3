// Explicitly gated isolated-environment harness. Default: configuration check, zero requests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function configuration(env, mode) {
  assert(['config', 'preflight', 'paid'].includes(mode), 'Unknown mode');
  const required = ['IMAGE_E2E_APP_ORIGIN', 'IMAGE_E2E_SUPABASE_ORIGIN', 'IMAGE_E2E_PROJECT_REF',
    'IMAGE_E2E_ANON_KEY', 'IMAGE_E2E_SERVICE_KEY', 'IMAGE_E2E_USER_A_TOKEN', 'IMAGE_E2E_USER_B_TOKEN'];
  const missing = required.filter(key => !env[key]);
  assert(!missing.length, 'BLOCKED: missing ' + missing.join(', '));
  assert.equal(env.IMAGE_E2E_ENVIRONMENT, 'isolated', 'Use an explicitly provisioned isolated environment');
  const app = new URL(env.IMAGE_E2E_APP_ORIGIN), db = new URL(env.IMAGE_E2E_SUPABASE_ORIGIN);
  for (const url of [app, db]) {
    assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Expected a plain origin');
    assert(!/(^|\.)myavatar\.ge$/i.test(url.hostname), 'Production host forbidden');
    assert(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)), 'HTTPS or loopback required');
  }
  assert.equal(db.hostname, env.IMAGE_E2E_PROJECT_REF + '.supabase.co', 'Project reference must match the isolated database');
  const maxCredits = Number(env.IMAGE_E2E_MAX_CREDITS);
  if (mode === 'paid') {
    assert.equal(env.IMAGE_E2E_PAID_APPROVAL, 'explicit-owner-approval', 'Paid generation requires separate owner approval');
    assert(env.IMAGE_E2E_REPORT, 'A new persistent report path is required before dispatch');
    assert(Number.isSafeInteger(maxCredits) && maxCredits > 0, 'Approved credit cap required');
  }
  return { app: app.origin, db: db.origin, maxCredits, anon: env.IMAGE_E2E_ANON_KEY,
    service: env.IMAGE_E2E_SERVICE_KEY, a: env.IMAGE_E2E_USER_A_TOKEN, b: env.IMAGE_E2E_USER_B_TOKEN };
}

export async function run(env = process.env, mode = 'config', fetchImpl = fetch) {
  const config = configuration(env, mode);
  const report = { mode, status: 'CONFIGURED', checks: [], jobs: [], paidJobsSubmitted: 0 };
  if (mode === 'config') return report;
  if (mode === 'paid') await writeFile(env.IMAGE_E2E_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const check = name => report.checks.push(name);
  // Never log tokens, quote signatures, full provider payloads or signed URLs.
  const request = async (origin, path, headers, body, expected = 200) => {
    const response = await fetchImpl(origin + path, { method: body === undefined ? 'GET' : 'POST',
      redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert((Array.isArray(expected) ? expected : [expected]).includes(response.status), 'Unexpected HTTP status for ' + path.split('?')[0]);
    return response.json();
  };
  const userHeaders = token => ({ apikey: config.anon, Authorization: 'Bearer ' + token });
  const admin = { apikey: config.service, Authorization: 'Bearer ' + config.service };
  const api = (path, body, token = config.a, expected = 200) => request(config.app, path, { Authorization: 'Bearer ' + token }, body, expected);
  const db = path => request(config.db, path, admin);
  const a = await request(config.db, '/auth/v1/user', userHeaders(config.a));
  const b = await request(config.db, '/auth/v1/user', userHeaders(config.b));
  assert(a.id && b.id && a.id !== b.id, 'Two distinct isolated users required');
  const balance = async () => {
    const rows = await db('/rest/v1/profiles?select=credits_balance&id=eq.' + encodeURIComponent(a.id));
    assert.equal(rows.length, 1, 'Seed the isolated user profile first');
    assert.equal(typeof rows[0].credits_balance, 'number');
    return rows[0].credits_balance;
  };
  const bucket = await db('/storage/v1/bucket/renders');
  assert.equal(bucket.public, false, 'An existing private renders bucket is required');
  check('real auth: distinct users; existing private Storage bucket');
  const models = await api('/api/image/models');
  assert.equal(models.userId, a.id, 'Application and database must use the same isolated project');
  const model = models.models.find(item => item.id === 'gemini-3.1-flash-image');
  assert(model, 'Configured Image Studio model unavailable');
  await balance();
  check('real database profile readable; application identity and catalog available');
  if (mode === 'preflight') { report.status = 'PREFLIGHT_PASS_NOT_E2E'; return report; }

  // Two independently quoted jobs: generation, then an owned edit. No retries after ambiguous POSTs.
  const draft = { v: 1, operation: 'generate', originalPrompt: 'A blue ceramic cup on a plain white table.',
    instructions: [], references: [], modelId: model.id, aspectRatio: '1:1', resolution: '1K', count: 1, locale: 'en' };
  let spent = 0;
  for (let index = 0; index < 2; index++) {
    const before = await balance();
    const quote = await api('/api/image/jobs/quote', draft);
    assert(quote.ok && quote.requiresConfirmation && quote.jobId && quote.token && quote.plan);
    assert(Number.isSafeInteger(quote.credits) && quote.credits > 0 && spent + quote.credits <= config.maxCredits, 'Quote exceeds approved credit cap');
    assert.equal(await balance(), before, 'Quoting must not charge');
    const rowsBefore = await db('/rest/v1/generation_jobs?select=id&id=eq.' + quote.jobId);
    assert.equal(rowsBefore.length, 0, 'Quoting must not enqueue');
    const record = { id: quote.jobId, operation: draft.operation, quotedCredits: quote.credits, status: 'submission_attempted' };
    report.jobs.push(record);
    report.paidJobsSubmitted++;
    spent += quote.credits;
    // Persist only nonsecret IDs before dispatch, so an interrupted run can be reconciled without resubmission.
    if (env.IMAGE_E2E_REPORT) await writeFile(env.IMAGE_E2E_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    const confirm = { plan: quote.plan, token: quote.token, confirmed: true };
    const starts = await Promise.all([api('/api/image/jobs', confirm, config.a, [200, 202]), api('/api/image/jobs', confirm, config.a, [200, 202])]);
    assert(starts.every(start => start.jobId === quote.jobId));
    const deadline = Date.now() + 300_000;
    let job;
    while (Date.now() < deadline) {
      job = await api('/api/image/jobs/' + quote.jobId);
      if (['completed', 'failed', 'cancelled'].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    assert.equal(job?.status, 'completed', 'Inspect saved job ID; never rerun an ambiguous generation');
    record.status = 'completed';
    const asset = await api('/api/image/assets/' + quote.jobId);
    assert.equal(asset.id, quote.jobId);
    const imageUrl = new URL(asset.image.url);
    assert.equal(imageUrl.origin, config.db, 'Download only from the approved isolated Storage origin');
    assert(imageUrl.pathname.startsWith('/storage/v1/object/sign/renders/image-studio/' + a.id + '/'));
    const response = await fetchImpl(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; assert(size <= 12 * 1024 * 1024, 'Image too large'); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.image.digest);
    const ledger = await db('/rest/v1/credit_ledger?select=delta&user_id=eq.' + a.id + '&metadata->>ref=eq.' + encodeURIComponent('image-studio-v1:' + quote.jobId));
    assert.equal(ledger.filter(row => row.delta < 0).length, 1, 'Exactly one debit per quoted job');
    assert.equal(ledger.reduce((sum, row) => sum + row.delta, 0), -quote.credits);
    assert.equal(await balance(), before - quote.credits);
    await api('/api/image/jobs/' + quote.jobId, undefined, config.b, 404);
    await api('/api/image/assets/' + quote.jobId, undefined, config.b, 404);
    const versions = await api('/api/image/assets/' + quote.jobId + '/versions');
    assert.equal(versions.current.id, quote.jobId);
    assert.equal(versions.current.parentJobId, draft.parentJobId ?? null);
    const library = await api('/api/studio/library?kind=image&limit=30');
    assert(library.items.some(item => item.id === quote.jobId));
    check(draft.operation + ': saved PNG digest, one ledger debit, owner isolation, Library and version lineage');
    draft.operation = 'edit'; draft.parentJobId = quote.jobId;
    draft.originalPrompt = 'Keep the cup unchanged; change only the table background to pale green.';
    draft.references = [{ id: 'source', role: 'product', asset: { kind: 'result', id: quote.jobId } }];
  }
  report.status = 'LIVE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED';
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || 'config';
  try {
    const report = await run(process.env, mode);
    if (process.env.IMAGE_E2E_REPORT) await writeFile(process.env.IMAGE_E2E_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    // Do not print request/response objects or tokens in diagnostics.
    console.error(String(error.message)); process.exitCode = 1;
  }
}
