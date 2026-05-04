import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function extractProjectRef(supabaseUrl: string): string | null {
  const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] ?? null : null;
}

async function executeSql(sql: string): Promise<{ ok: boolean; endpoint?: string; detail: string }> {
  const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const accessToken = normalize(process.env.SUPABASE_ACCESS_TOKEN);

  if (!supabaseUrl) {
    return { ok: false, detail: 'Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL' };
  }

  const errors: string[] = [];

  // Primary: Supabase Management API (requires PAT)
  if (accessToken) {
    const ref = extractProjectRef(supabaseUrl);
    if (ref) {
      const mgmtUrl = `https://api.supabase.com/v1/projects/${ref}/database/query`;
      try {
        const res = await fetch(mgmtUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
          cache: 'no-store',
        });
        if (res.ok) {
          return { ok: true, endpoint: mgmtUrl, detail: 'Migration SQL executed via Management API' };
        }
        const body = await res.text();
        errors.push(`${mgmtUrl} => ${res.status} ${body.slice(0, 240)}`);
      } catch (error) {
        errors.push(`${mgmtUrl} => ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }
  }

  // Fallback: project REST API with service role key
  if (serviceRoleKey) {
    const fallbackEndpoints = [
      { url: `${supabaseUrl}/rest/v1/rpc/exec_sql`, body: { query: sql } },
    ];
    for (const attempt of fallbackEndpoints) {
      try {
        const res = await fetch(attempt.url, {
          method: 'POST',
          headers: buildHeaders(serviceRoleKey),
          body: JSON.stringify(attempt.body),
          cache: 'no-store',
        });
        if (res.ok) {
          return { ok: true, endpoint: attempt.url, detail: 'Migration SQL executed via REST RPC' };
        }
        const body = await res.text();
        errors.push(`${attempt.url} => ${res.status} ${body.slice(0, 180)}`);
      } catch (error) {
        errors.push(`${attempt.url} => ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }
  }

  if (!accessToken && !serviceRoleKey) {
    return { ok: false, detail: 'No SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY configured' };
  }

  return { ok: false, detail: errors.join(' | ') };
}

async function loadMigrationSql(): Promise<string> {
  const migrationPath = path.join(process.cwd(), 'migrations', '006_gemini_chat_history.sql');
  return readFile(migrationPath, 'utf8');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const migrationKey = normalize(process.env.MIGRATION_RUN_KEY);
  const adminKey = normalize(process.env.ADMIN_KEY);
  const expectedKey = normalize(migrationKey || adminKey);
  const providedKey = normalize(req.headers.get('x-admin-key'));

  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = await loadMigrationSql();
    const result = await executeSql(sql);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, endpoint: result.endpoint, detail: result.detail });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    );
  }
}
