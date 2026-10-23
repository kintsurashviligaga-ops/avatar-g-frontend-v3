/**
 * POST /api/orchestrator/avatar/produce — RETIRED (MASTER TASK v3.1, Phase 1 PR 9). This "managed avatar pipeline"
 * reserved the price, then rendered a HeyGen talking photo of the caller's script and photo through /api/heygen/avatar,
 * which the Google-only boundary refuses, so every call ended in a refund. v3.1 forbids HeyGen and GG chose built-in
 * avatars only (2026-10-22): a signed-in caller gets 422 `capability_unavailable` (gap `custom_avatar`) before any
 * reservation, free slot or job row. The talking avatar is the Avatar tool's (/api/avatar/veo, built-in faces on Veo).
 */
import { NextRequest, NextResponse } from 'next/server';
import { billingLocale } from '@/lib/api/billingCopy';
import { customAvatarBody } from '@/lib/avatar/curated';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  // Auth required in production; bypassed ONLY under `next dev` for local QA (tests/swarm-pipelines.spec.ts).
  if (!user && process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(customAvatarBody(billingLocale(req)), { status: 422 });
}
