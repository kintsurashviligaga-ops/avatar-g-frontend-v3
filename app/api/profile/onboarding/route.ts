/**
 * /api/profile/onboarding — server-authoritative avatar onboarding state.
 *
 *   GET  → { avatarName, isAvatarNamed, freeRemaining }  (authed; the source of
 *          truth for logged-in sessions, replacing client localStorage trust)
 *   POST { name } → persists avatar_name + flips is_avatar_named, returns state.
 *
 * Unauthenticated callers get a null state (200) — anonymous visitors keep using
 * localStorage client-side. Fail-open: degrades to nulls when the migration/RPCs
 * aren't applied yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { getOnboardingState, setAvatarName } from '@/lib/billing/wallet-ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ authenticated: false, state: null });
  const state = await getOnboardingState(user.id);
  return NextResponse.json({ authenticated: true, state });
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: string };
  try { body = (await req.json()) as { name?: string }; } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const name = String(body.name ?? '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const ok = await setAvatarName(user.id, name);
  const state = await getOnboardingState(user.id);
  return NextResponse.json({ ok, state });
}
