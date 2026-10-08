import { NextResponse } from 'next/server';
import { getUserMemory } from '@/lib/agent-g/memory';
import { secretMatches } from '@/lib/security/secretMatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalize(value: string | null | undefined): string {
  return (value || '').trim();
}

function json(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

export async function GET(req: Request) {
  // Constant-time: a plain `===` leaks how many leading characters of a guess were right — and this reads any user's memory.
  if (!secretMatches(req.headers.get('x-admin-key'), process.env.ADMIN_KEY)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const platform = normalize(url.searchParams.get('platform'));
  const userId = normalize(url.searchParams.get('userId'));

  if (!platform || !userId) {
    return json({ ok: false, error: 'platform and userId are required' }, 400);
  }

  const state = await getUserMemory(platform, userId);

  return json({
    ok: true,
    platform,
    userId,
    memory: state.memory,
    style: state.style,
    memoryEnabled: String(process.env.AGENT_G_MEMORY_ENABLED || '').trim().toLowerCase() === 'true',
  });
}
