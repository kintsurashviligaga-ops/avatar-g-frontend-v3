/**
 * lib/research/http.ts — the small pieces every research route shares: who is calling, and a JSON answer that is never cached.
 * Server-only (it reads the verified session).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { isAnonymousUser } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';

/** The verified user id, or null — an auth outage reads as "no session", never as a user (the longform route's rule). */
export async function callerId(req: Request): Promise<string | null> {
  try {
    const id = (await authedClientFromRequest(req)).user?.id ?? null;
    return id && !isAnonymousUser(id) ? id : null;
  } catch {
    return null;
  }
}

/** JSON with `no-store`: a job's state must never be served from a cache. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
