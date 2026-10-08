import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { geminiTierModel } from '@/lib/ai/google/models';
import { geminiFrameModel } from '@/lib/ai/geminiImage';
import { googleModelFetch, googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { redactSecrets, vertexAiConfig } from '@/lib/veo/vertexAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/admin/google-transport — does the selected Google transport (GEMINI_TRANSPORT) reach Google's models?
 *
 * Asks `countTokens` (free on both the Gemini API and Vertex AI: nothing is generated or billed) of the chat model and
 * the storyboard image model through lib/ai/google/transport — the same URL builder, credential and identity every
 * Gemini call now uses. On `vertex` a pass proves the Workload Identity token, the service account's model permission
 * and the endpoint for the exact identity the deployment's functions run as.
 *
 * ADMIN ONLY (404 otherwise). Returns the transport, variable NAMES that are missing, HTTP statuses and Google's
 * redacted error text — never a key, token or project credential. One `[google-transport]` log line per call.
 */
const MODELS = (): string[] => [geminiTierModel('flash'), geminiFrameModel()];
const PING = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] });

interface Step { model: string; ok: boolean; status?: number; totalTokens?: number; error?: string }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!assertAdminAccess(req, user).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let kind: ReturnType<typeof googleTransportKind>;
  try {
    kind = googleTransportKind();
  } catch {
    console.warn('[google-transport] ok=false transport=invalid');
    return NextResponse.json({ transport: 'invalid', configured: false, ok: false, detail: 'GEMINI_TRANSPORT is not gemini_api or vertex' });
  }
  const missing = googleTransportProblems(kind);
  const location = kind === 'vertex' ? vertexAiConfig()?.location ?? null : null;
  if (missing.length) {
    console.warn(`[google-transport] ok=false transport=${kind} missing=${missing.join(',')}`);
    return NextResponse.json({ transport: kind, configured: false, ok: false, missing });
  }

  const steps: Step[] = [];
  for (const model of MODELS()) {
    try {
      const r = await googleModelFetch(model, 'countTokens', {
        method: 'POST',
        body: PING,
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      if (r.ok) {
        const j = (await r.json().catch(() => ({}))) as { totalTokens?: unknown };
        steps.push({ model, ok: true, status: r.status, ...(typeof j.totalTokens === 'number' ? { totalTokens: j.totalTokens } : {}) });
      } else {
        steps.push({ model, ok: false, status: r.status, error: redactSecrets(await r.text().catch(() => ''), 200) });
      }
    } catch (e) {
      steps.push({ model, ok: false, error: redactSecrets(e instanceof Error ? e.message : String(e), 200) });
    }
  }
  const ok = steps.every((s) => s.ok);
  // console.warn, not info: next.config strips every console call but error/warn from deployed builds.
  console.warn(
    `[google-transport] ok=${ok} transport=${kind}${location ? ` location=${location}` : ''} ` +
      steps.map((s) => `${s.model}:${s.ok ? 'ok' : `failed${s.status ? ` http=${s.status}` : ''}`}`).join(' '),
  );
  return NextResponse.json({ transport: kind, configured: true, ok, ...(location ? { location } : {}), steps });
}
