import 'server-only';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { getVertexAccessToken, vertexAiConfig, vertexAiConfigProblems } from '@/lib/veo/vertexAuth';
import { normalizeModelId } from './models';

/** Explicit opt-in. An invalid selector fails closed rather than spending on another billing account. */
type GoogleEnv = Readonly<Record<string, string | undefined>>;
export function googleTransport(env: GoogleEnv = process.env): 'gemini' | 'vertex' {
  const value = (env.GEMINI_TRANSPORT ?? 'gemini').trim().toLowerCase();
  if (value === 'gemini' || value === 'vertex') return value;
  throw new Error('GEMINI_TRANSPORT must be gemini or vertex');
}

export function googleAiConfigured(env: GoogleEnv = process.env): boolean {
  try {
    return googleTransport(env) === 'vertex' ? vertexAiConfig(env) !== null : !!env.GEMINI_API_KEY?.trim();
  } catch { return false; }
}

export function requireVertexAiConfig() {
  const config = vertexAiConfig();
  if (!config) throw new Error(`Vertex AI is not configured: ${vertexAiConfigProblems().join(', ')}`);
  return config;
}

/** Only model RPCs are accepted; neither credentials nor arbitrary hosts can enter the URL. */
export async function googleModelRequest(
  model: string,
  method: 'generateContent' | 'streamGenerateContent' | 'predict',
  apiKey = resolveGeminiKey(),
): Promise<{ url: string; headers: Record<string, string> }> {
  const id = normalizeModelId(model);
  if (!id) throw new Error('Invalid Google model id');
  const suffix = method === 'streamGenerateContent' ? '?alt=sse' : '';
  if (googleTransport() === 'vertex') {
    const config = requireVertexAiConfig();
    const projectId = config.projectId;
    // Imagen and embedding predict models use a regional endpoint, independently of global Gemini.
    const location = method === 'predict' ? (process.env.GCP_PREDICT_LOCATION?.trim() || 'us-central1') : config.location;
    if (!/^[a-z0-9-]{2,40}$/.test(location)) throw new Error('GCP_PREDICT_LOCATION (malformed)');
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return {
      url: `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${location}/publishers/google/models/${id}:${method}${suffix}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getVertexAccessToken(false)}` },
    };
  }
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${id}:${method}${suffix}`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
  };
}

export async function googleModelFetch(
  model: string,
  method: 'generateContent' | 'streamGenerateContent' | 'predict',
  init: RequestInit,
): Promise<Response> {
  const request = await googleModelRequest(model, method);
  return fetch(request.url, { ...init, headers: request.headers, redirect: 'manual' });
}
