/**
 * lib/ai/google/transportCheck.ts — does Vertex AI, the only Google model transport under MASTER TASK v3.1, reach
 * Google's models?
 *
 * Asks `countTokens` (free: nothing is generated or billed) of the chat model and the storyboard image model through
 * lib/ai/google/transport — the same URL builder, credential and identity every Gemini call uses. A pass proves the
 * Workload Identity token, the service account's model permission and the endpoint for the exact identity the
 * deployment's functions run as. GEMINI_TRANSPORT=gemini_api is reported as refused by policy; nothing is called.
 *
 * Used by GET /api/admin/google-transport (admin, full report) and GET /api/preview/google-check (Preview only, no
 * sign-in, statuses only). Returns the transport, variable NAMES that are missing, HTTP statuses and Google's redacted
 * error text — never a key, token or project credential. Logs one `[google-transport]` line per run. Never throws.
 */
import 'server-only';
import { geminiTierModel } from '@/lib/ai/google/models';
import { geminiFrameModel } from '@/lib/ai/geminiImage';
import { isNotConfiguredError } from '@/lib/contracts/geminiTransport';
import { googleModelFetch, googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { redactSecrets, vertexAiConfig } from '@/lib/veo/vertexAuth';

const PING = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] });
const STEP_TIMEOUT_MS = 12_000;

export interface TransportStep {
  model: string;
  ok: boolean;
  status?: number;
  totalTokens?: number;
  /** Google's error status enum (PERMISSION_DENIED, NOT_FOUND, …) when it sent one. */
  reason?: string;
  /** Google's error text, redacted. */
  error?: string;
}

export interface TransportCheck {
  /** `gemini_api` only reports a GEMINI_TRANSPORT that asks for the refused Developer API (never a transport run). */
  transport: 'gemini_api' | 'vertex' | 'invalid';
  configured: boolean;
  ok: boolean;
  location?: string;
  missing?: string[];
  detail?: string;
  steps: TransportStep[];
}

const checkedModels = (): string[] => [geminiTierModel('flash'), geminiFrameModel()];

function reasonOf(text: string): string | undefined {
  try {
    const status = (JSON.parse(text) as { error?: { status?: unknown } })?.error?.status;
    return typeof status === 'string' && /^[A-Z_]{3,40}$/.test(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

async function step(model: string): Promise<TransportStep> {
  try {
    const r = await googleModelFetch(model, 'countTokens', {
      method: 'POST',
      body: PING,
      cache: 'no-store',
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (r.ok) {
      const j = (await r.json().catch(() => ({}))) as { totalTokens?: unknown };
      return { model, ok: true, status: r.status, ...(typeof j.totalTokens === 'number' ? { totalTokens: j.totalTokens } : {}) };
    }
    const text = await r.text().catch(() => '');
    const reason = reasonOf(text);
    return { model, ok: false, status: r.status, ...(reason ? { reason } : {}), error: redactSecrets(text, 200) };
  } catch (e) {
    return { model, ok: false, error: redactSecrets(e instanceof Error ? e.message : String(e), 200) };
  }
}

/** One run of the free check. */
export async function checkGoogleTransport(): Promise<TransportCheck> {
  let kind: 'vertex';
  try {
    kind = googleTransportKind();
  } catch (e) {
    if (isNotConfiguredError(e)) {
      console.warn(`[google-transport] ok=false transport=${e.transportKind} refused`);
      return { transport: e.transportKind, configured: false, ok: false, missing: e.missingVars, steps: [] };
    }
    console.warn('[google-transport] ok=false transport=invalid');
    return { transport: 'invalid', configured: false, ok: false, detail: 'GEMINI_TRANSPORT is not vertex', steps: [] };
  }
  const missing = googleTransportProblems(kind);
  const location = vertexAiConfig()?.location ?? undefined;
  if (missing.length) {
    console.warn(`[google-transport] ok=false transport=${kind} missing=${missing.join(',')}`);
    return { transport: kind, configured: false, ok: false, missing, steps: [] };
  }

  const steps = await Promise.all(checkedModels().map(step));
  const ok = steps.every((s) => s.ok);
  // console.warn, not info: next.config strips every console call but error/warn from deployed builds.
  console.warn(
    `[google-transport] ok=${ok} transport=${kind}${location ? ` location=${location}` : ''} ` +
      steps.map((s) => `${s.model}:${s.ok ? 'ok' : `failed${s.status ? ` http=${s.status}` : ''}`}`).join(' '),
  );
  return { transport: kind, configured: true, ok, ...(location ? { location } : {}), steps };
}
