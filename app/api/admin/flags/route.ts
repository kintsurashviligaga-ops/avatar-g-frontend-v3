/**
 * /api/admin/flags — the runtime feature-flag store for the Master Control Panel (v358 #3).
 *   GET  → the resolved flags (env/db/default provenance + effective value) + read-only provider readiness.
 *   POST → { flag, enabled } upsert of a DB override for a KNOWN flag.
 * Gated by isAdmin() — the EMAIL ALLOWLIST only (DEFAULT_ADMIN_EMAILS ∪ ADMIN_EMAILS), never user/app_metadata
 * — matching the sibling mutating admin routes (credits/grant). Writes go through the service-role client;
 * the actor is stamped for audit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { resolveAllFlags, setFeatureFlag, isKnownFlag } from '@/lib/server/feature-flags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Read-only readiness of the 6 core agents (KEY PRESENCE only — not a guarantee the provider works). */
function providerReadiness() {
  const has = (...names: string[]) => names.some((n) => Boolean(process.env[n]?.trim()));
  const hasVertex = has('GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GOOGLE_VERTEX_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY');
  return [
    { key: 'video', label: 'Video (Google Vertex AI · Veo)', ready: hasVertex },
    { key: 'gemini', label: 'Chat & Vision (Google Gemini)', ready: has('GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY') || hasVertex },
    { key: 'music', label: 'Music (Google Lyria 3)', ready: hasVertex },
    { key: 'image', label: 'Image (Google Gemini / Imagen)', ready: has('GEMINI_API_KEY', 'NANOBANANA_API_KEY') || hasVertex },
    { key: 'audio', label: 'Voice / Live Audio (Gemini Native)', ready: has('GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY') || hasVertex },
    { key: 'audiomix', label: 'Audio-mix & Mastering (FFmpeg)', ready: true },
  ];
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const flags = await resolveAllFlags();
  return NextResponse.json({ ok: true, flags, providers: providerReadiness() });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { flag?: unknown; enabled?: unknown };
  const flag = typeof body.flag === 'string' ? body.flag : '';
  if (!isKnownFlag(flag)) {
    return NextResponse.json({ error: 'unknown_flag' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_enabled' }, { status: 400 });
  }

  // Record which admin flipped it (best-effort audit).
  let actorId: string | null = null;
  try {
    const { data: { user } } = await createRouteHandlerClient().auth.getUser();
    actorId = user?.id ?? null;
  } catch {
    /* keep null */
  }

  const result = await setFeatureFlag(flag, body.enabled, actorId);
  if (!result.ok) {
    const status = result.error === 'unknown_flag' ? 400 : result.error === 'server_misconfigured' ? 503 : 500;
    return NextResponse.json({ error: result.error ?? 'write_failed' }, { status });
  }
  return NextResponse.json({ ok: true });
}
