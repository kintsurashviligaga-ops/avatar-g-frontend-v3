import { NextResponse } from 'next/server';
import { checkGoogleTransport, type TransportCheck } from '@/lib/ai/google/transportCheck';
import { verifiedModelCatalog } from '@/lib/models/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/preview/google-check — the free Google transport proof on a Vercel PREVIEW, without signing in.
 *
 * Runs the same countTokens check as /api/admin/google-transport (lib/ai/google/transportCheck.ts) and the ModelCatalog
 * runtime check (lib/models/verify.ts). countTokens is free on both transports: nothing is generated or billed.
 *
 * Preview only: every other environment (Production, local) answers 404 and calls nothing. The answer carries model ids,
 * HTTP statuses, Google's error status enum and variable NAMES — never Google's error text, a key, token or project
 * credential (the full text is in the admin route and the `[google-transport]` log line). One run per CACHE_MS per
 * instance, so the open URL cannot be used to hammer Google.
 */
const CACHE_MS = 5 * 60_000;

interface PreviewCheck {
  checkedAt: string;
  transport: TransportCheck['transport'];
  configured: boolean;
  ok: boolean;
  location?: string;
  missing?: string[];
  steps: Array<{ model: string; ok: boolean; status?: number; reason?: string }>;
  catalog: {
    ok: boolean;
    method: string;
    present: string[];
    missing: string[];
    unchecked: number;
    reviewQueue: number;
    errors: Array<{ id?: string; status?: number }>;
  };
}

let cache: { at: number; body: PreviewCheck } | null = null;

export async function GET(): Promise<NextResponse> {
  if (process.env.VERCEL_ENV !== 'preview') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = Date.now();
  if (!cache || now - cache.at >= CACHE_MS) {
    const [t, { check: c }] = await Promise.all([checkGoogleTransport(), verifiedModelCatalog()]);
    cache = {
      at: now,
      body: {
        checkedAt: new Date(now).toISOString(),
        transport: t.transport,
        configured: t.configured,
        ok: t.ok,
        ...(t.location ? { location: t.location } : {}),
        ...(t.missing ? { missing: t.missing } : {}),
        steps: t.steps.map(({ model, ok, status, reason }) => ({ model, ok, status, ...(reason ? { reason } : {}) })),
        catalog: {
          ok: c.ok,
          method: c.method,
          present: c.present,
          missing: c.missing,
          unchecked: c.unchecked.length,
          reviewQueue: c.reviewQueue.length,
          errors: c.errors.map(({ id, status }) => ({ id, status })),
        },
      },
    };
  }
  return NextResponse.json(cache.body, { headers: { 'Cache-Control': 'no-store' } });
}
