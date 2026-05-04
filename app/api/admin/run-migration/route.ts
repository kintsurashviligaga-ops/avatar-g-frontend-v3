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

async function executeSql(sql: string): Promise<{ ok: boolean; endpoint?: string; detail: string }> {
  const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, detail: 'Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
  }

  const endpoints = [
    { url: `${supabaseUrl}/pg/v1/query`, body: { query: sql } },
    { url: `${supabaseUrl}/rest/v1/rpc/exec_sql`, body: { query: sql } },
    { url: `${supabaseUrl}/rest/v1/rpc/query`, body: { query: sql } },
  ];

  const errors: string[] = [];
  for (const attempt of endpoints) {
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: buildHeaders(serviceRoleKey),
        body: JSON.stringify(attempt.body),
        cache: 'no-store',
      });
      if (res.ok) {
        return { ok: true, endpoint: attempt.url, detail: 'Migration SQL executed' };
      }
      const body = await res.text();
      errors.push(`${attempt.url} => ${res.status} ${body.slice(0, 180)}`);
    } catch (error) {
      errors.push(`${attempt.url} => ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }

  return {
    ok: false,
    detail: errors.join(' | '),
  };
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
