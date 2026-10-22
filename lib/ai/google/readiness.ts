/**
 * lib/ai/google/readiness.ts — can Vertex AI serve a Google model call from this deployment? (MASTER TASK v3.1)
 *
 * Health and probe routes ask this instead of calling the Gemini Developer API. Nothing here calls a model, so nothing
 * is billed: without `live` it reads the policy and the variable NAMES; with `live` it also mints the Workload Identity
 * token (STS + impersonation, or the key-mode JWT), which proves the keyless chain without a single generated token.
 * An AI Studio key, set or not, never changes the answer, and the detail carries no credential.
 */
import 'server-only';
import { googleTransportKind, googleTransportProblems } from './transport';
import { getVertexAccessToken, redactSecrets, vertexAiConfig, VertexAuthError } from '@/lib/veo/vertexAuth';

export interface GoogleAiReadiness {
  /** GEMINI_TRANSPORT allows Vertex and every Vertex variable is present. */
  configured: boolean;
  /** Configured, and (when live) the token was minted. */
  ok: boolean;
  /** e.g. `vertex · location:global · mode:wif · token:ok`, or `vertex · missing GCP_PROJECT_ID`. Names only. */
  detail: string;
}

export async function checkGoogleAiReadiness(options: { live?: boolean } = {}): Promise<GoogleAiReadiness> {
  try {
    googleTransportKind();
  } catch {
    return { configured: false, ok: false, detail: 'refused · GEMINI_TRANSPORT must be vertex or unset' };
  }
  const missing = googleTransportProblems('vertex');
  const config = vertexAiConfig();
  if (missing.length || !config) return { configured: false, ok: false, detail: `vertex · missing ${missing.join(', ')}` };

  const head = `vertex · location:${config.location} · mode:${config.auth.mode}`;
  if (!options.live) return { configured: true, ok: true, detail: `${head} · token:not checked` };
  try {
    await getVertexAccessToken(false);
    return { configured: true, ok: true, detail: `${head} · token:ok` };
  } catch (err) {
    const why = err instanceof VertexAuthError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    return { configured: true, ok: false, detail: `${head} · token:failed ${redactSecrets(why, 200)}` };
  }
}
