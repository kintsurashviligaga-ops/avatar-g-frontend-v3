import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin runtime migration gate — applies an allow-listed SQL migration on the
 * DEPLOYED app using its own production env (no local CLI / no token pasting).
 *
 * IMPORTANT (Postgres reality): DDL like CREATE FUNCTION / TABLE CANNOT run
 * through the SUPABASE_SERVICE_ROLE_KEY / PostgREST — that key only reaches
 * tables + RPCs. Raw DDL needs ONE of:
 *   1. SUPABASE_ACCESS_TOKEN (Management API)  ← set this one env var in Vercel,
 *   2. a pre-existing exec_sql(text) RPC (service-role fallback), or
 *   3. a direct Postgres connection string.
 * This route tries (1) then (2) and reports precisely which path executed.
 *
 * Auth: x-admin-key header == MIGRATION_RUN_KEY (or ADMIN_KEY). Trigger:
 *   curl -X POST -H "x-admin-key: <KEY>" -H 'content-type: application/json' \
 *        -d '{"file":"20260523_wallet_and_onboarding.sql"}' \
 *        https://myavatar.ge/api/admin/run-migration
 */

const norm = (v: string | null | undefined) => String(v || '').trim();

// Allow-list: only these migrations may be applied via the runtime gate.
const ALLOWED: Record<string, string> = {
  '20260523_wallet_and_onboarding.sql': 'supabase/migrations/20260523_wallet_and_onboarding.sql',
  '20260523_generation_jobs.sql': 'supabase/migrations/20260523_generation_jobs.sql',
  '20260602_free_film_promo.sql': 'supabase/migrations/20260602_free_film_promo.sql',
  '006_gemini_chat_history.sql': 'migrations/006_gemini_chat_history.sql',
};

// Functions each migration installs — used for the pg_proc verification.
const EXPECTED_FNS: Record<string, string[]> = {
  '20260523_wallet_and_onboarding.sql': ['credit_wallet_gel', 'consume_free_avatar_chat', 'set_avatar_name'],
  '20260523_generation_jobs.sql': [],
  '20260602_free_film_promo.sql': ['consume_free_film', 'restore_free_film'],
  '006_gemini_chat_history.sql': [],
};

function extractRef(url: string): string | null {
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] ?? null : null;
}

interface SqlResult { ok: boolean; via?: string; rows?: unknown; detail: string }

async function runViaManagementApi(sql: string): Promise<SqlResult | null> {
  const token = norm(process.env.SUPABASE_ACCESS_TOKEN);
  const url = norm(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  if (!token || !url) return null;
  const ref = extractRef(url);
  if (!ref) return null;
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      cache: 'no-store',
    });
    const body = await res.text();
    if (res.ok) {
      let rows: unknown;
      try { rows = JSON.parse(body); } catch { rows = undefined; }
      return { ok: true, via: 'management_api', rows, detail: 'executed via Management API' };
    }
    return { ok: false, via: 'management_api', detail: `${res.status} ${body.slice(0, 240)}` };
  } catch (e) {
    return { ok: false, via: 'management_api', detail: e instanceof Error ? e.message : 'request failed' };
  }
}

async function runViaExecSqlRpc(sql: string): Promise<SqlResult | null> {
  const url = norm(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const key = norm(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  const endpoint = `${url}/rest/v1/rpc/exec_sql`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      cache: 'no-store',
    });
    if (res.ok) return { ok: true, via: 'exec_sql_rpc', detail: 'executed via exec_sql RPC' };
    const body = await res.text();
    return { ok: false, via: 'exec_sql_rpc', detail: `${res.status} ${body.slice(0, 180)}` };
  } catch (e) {
    return { ok: false, via: 'exec_sql_rpc', detail: e instanceof Error ? e.message : 'request failed' };
  }
}

async function execSql(sql: string): Promise<SqlResult> {
  const attempts: SqlResult[] = [];
  for (const runner of [runViaManagementApi, runViaExecSqlRpc]) {
    const r = await runner(sql);
    if (!r) continue;
    if (r.ok) return r;
    attempts.push(r);
  }
  if (attempts.length === 0) {
    return {
      ok: false,
      detail: 'No DDL channel available. Set SUPABASE_ACCESS_TOKEN in Vercel (Management API) — the service-role key alone cannot run CREATE FUNCTION.',
    };
  }
  return { ok: false, detail: attempts.map((a) => `${a.via}: ${a.detail}`).join(' | ') };
}

function authorized(req: NextRequest): boolean {
  const expected = norm(process.env.MIGRATION_RUN_KEY) || norm(process.env.ADMIN_KEY);
  return Boolean(expected) && norm(req.headers.get('x-admin-key')) === expected;
}

/** GET → verify only (pg_proc check, no mutation). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const file = norm(req.nextUrl.searchParams.get('file')) || '20260523_wallet_and_onboarding.sql';
  const fns = EXPECTED_FNS[file] ?? [];
  if (fns.length === 0) return NextResponse.json({ ok: true, file, verified: [], note: 'no functions to verify for this file' });
  const list = fns.map((f) => `'${f}'`).join(',');
  const res = await execSql(`SELECT proname FROM pg_proc WHERE proname IN (${list});`);
  const verified = Array.isArray(res.rows) ? (res.rows as Array<{ proname?: string }>).map((r) => r.proname).filter(Boolean) : [];
  return NextResponse.json({ ok: res.ok, file, via: res.via, verified, expected: fns, detail: res.detail });
}

/** POST → apply the migration, then verify. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let file = '20260523_wallet_and_onboarding.sql';
  try { const b = (await req.json()) as { file?: string }; if (b.file) file = b.file; } catch { /* default */ }

  const rel = ALLOWED[file];
  if (!rel) return NextResponse.json({ ok: false, error: `file not allow-listed (${Object.keys(ALLOWED).join(', ')})` }, { status: 400 });

  let sql: string;
  try { sql = await readFile(path.join(process.cwd(), rel), 'utf8'); } catch (e) {
    return NextResponse.json({ ok: false, error: `could not read ${rel}: ${e instanceof Error ? e.message : 'fs error'}` }, { status: 500 });
  }

  const applied = await execSql(sql);
  if (!applied.ok) return NextResponse.json({ ok: false, file, error: applied.detail }, { status: 502 });

  const fns = EXPECTED_FNS[file] ?? [];
  let verified: string[] = [];
  if (fns.length) {
    const v = await execSql(`SELECT proname FROM pg_proc WHERE proname IN (${fns.map((f) => `'${f}'`).join(',')});`);
    verified = Array.isArray(v.rows) ? (v.rows as Array<{ proname?: string }>).map((r) => r.proname || '').filter(Boolean) : [];
  }

  return NextResponse.json({ ok: true, file, via: applied.via, applied: applied.detail, verified, expected: fns });
}
