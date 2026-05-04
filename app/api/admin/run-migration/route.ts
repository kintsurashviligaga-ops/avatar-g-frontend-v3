/**
 * ONE-TIME migration  DELETE THIS FILE after use.runner 
 * Protected by ADMIN_KEY env var (x-admin-key header).
 * Deploy to Vercel, call once, then delete and redeploy.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATEMENTS = [
  {
    label: 'create gemini_chat_sessions',
    sql: `CREATE TABLE IF NOT EXISTS gemini_chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      service_context TEXT NOT NULL DEFAULT 'general',
      locale TEXT NOT NULL DEFAULT 'ka',
      title TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`,
  },
  {
    label: 'create gemini_chat_messages',
    sql: `CREATE TABLE IF NOT EXISTS gemini_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL,
      user_id UUID,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      service_context TEXT DEFAULT 'general',
      locale TEXT DEFAULT 'ka',
      model TEXT,
      credits_used INTEGER DEFAULT 0,
      has_attachment BOOLEAN DEFAULT false,
      feedback INTEGER CHECK (feedback IN (-1, 0, 1)),
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
  },
  {
    label: 'create gemini_message_feedback',
    sql: `CREATE TABLE IF NOT EXISTS gemini_message_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES gemini_chat_messages(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
  },
  {
    label: 'enable rls sessions',
    sql: `ALTER TABLE gemini_chat_sessions ENABLE ROW LEVEL SECURITY`,
  },
  {
    label: 'enable rls messages',
    sql: `ALTER TABLE gemini_chat_messages ENABLE ROW LEVEL SECURITY`,
  },
  {
    label: 'enable rls feedback',
    sql: `ALTER TABLE gemini_message_feedback ENABLE ROW LEVEL SECURITY`,
  },
  {
    label: 'policy sessions',
    sql: `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gemini_chat_sessions' AND policyname='Users see own sessions') THEN
        CREATE POLICY "Users see own sessions" ON gemini_chat_sessions FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$`,
  },
  {
    label: 'policy messages',
    sql: `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gemini_chat_messages' AND policyname='Users see own messages') THEN
        CREATE POLICY "Users see own messages" ON gemini_chat_messages FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$`,
  },
  {
    label: 'policy feedback',
    sql: `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gemini_message_feedback' AND policyname='Users manage own feedback') THEN
        CREATE POLICY "Users manage own feedback" ON gemini_message_feedback FOR ALL USING (auth.uid() = user_id);
      END IF;
    END $$`,
  },
];

async function execSQL(
  projectRef: string,
  serviceKey: string,
  sql: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  // Try Supabase Management API (works with service key for database queries)
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (res.ok) return { ok: true, data: text };
  return { ok: false, error: `${res.status}: ${text}` };
}

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key');
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const supabaseUrl = rawUrl.replace(/\/$/, '');

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 503 });
  }

  const projectRef = supabaseUrl.replace('https://', '').split('.')[0] ?? '';
  const results: { label: string; ok: boolean; error?: string }[] = [];

  for (const { label, sql } of STATEMENTS) {
    const result = await execSQL(projectRef, serviceKey, sql);
    results.push({ label, ok: result.ok, error: result.error });
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, projectRef, results });
}
