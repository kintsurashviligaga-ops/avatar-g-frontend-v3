/**
 * GET /api/admin/launch-flags — how the code reads every launch switch right now (Phase 8.14 pre-flight).
 * Admins only (isAdmin: the email allowlist). Read-only. Secret entries say only whether they are set.
 * Use it after changing a flag in Vercel: a value the reader ignores, a misspelt name or a missing NEXT_PUBLIC_ twin
 * shows up under `warnings` instead of leaving the feature silently off.
 */
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { checkLaunchFlags, launchFlagStatus } from '@/lib/env/launchFlags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(
    { ok: true, warnings: checkLaunchFlags(), flags: launchFlagStatus() },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
