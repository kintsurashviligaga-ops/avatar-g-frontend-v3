/**
 * lib/ai/google/transport.ts — which Google endpoint a model call goes to, and with which credential (Part 2, A2).
 *
 * Implements the Part 1 contract (lib/contracts/geminiTransport.ts). Two transports, chosen by GEMINI_TRANSPORT:
 *   · `gemini_api` (unset, `gemini_api`, or `gemini` — the name PR #44 used) — generativelanguage.googleapis.com with
 *     the API key (billed to the AI Studio balance). Today's behaviour; nothing changes while the variable is unset.
 *   · `vertex` — aiplatform.googleapis.com with a Workload Identity token (billed to the project, where the $300
 *     credit applies). Project and auth come from lib/veo/vertexAuth (vertexAiConfig: no bucket needed).
 * There is NO switch from one to the other at runtime: an unconfigured transport throws NotConfiguredError naming the
 * missing variables, and an unknown GEMINI_TRANSPORT value fails closed instead of spending on another account.
 *
 * Model RPCs only: the URL is built from a validated model id and a fixed method, so neither a credential nor an
 * arbitrary host can enter it, and `redirect: 'manual'` keeps the credential from following a redirect.
 */
import 'server-only';
import {
  NotConfiguredError,
  type GeminiTransport,
  type GeminiTransportKind,
  type GeminiTransportSelector,
} from '@/lib/contracts/geminiTransport';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { getVertexAccessToken, vertexAiConfig, vertexAiConfigProblems } from '@/lib/veo/vertexAuth';
import { normalizeModelId } from './models';

type Env = Readonly<Record<string, string | undefined>>;

/** `embedContent` exists on the Gemini API only; Vertex serves the same embedding model through `predict`. */
export type GoogleModelMethod = 'generateContent' | 'streamGenerateContent' | 'predict' | 'countTokens' | 'embedContent';

export interface GoogleModelCall {
  model: string;
  method?: GoogleModelMethod;
  init: RequestInit;
}

/** A REST transport: the contract's surface plus the request builder and raw fetch every wrapper needs. */
export interface GoogleRestTransport extends GeminiTransport<GoogleModelCall, Response, unknown> {
  request(model: string, method: GoogleModelMethod): Promise<{ url: string; headers: Record<string, string> }>;
  fetch(call: GoogleModelCall): Promise<Response>;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const LOCATION_RE = /^[a-z0-9-]{2,40}$/;

/** The one place `gemini` (PR #44's name) maps to the contract's `gemini_api`. */
export function googleTransportKind(env: Env = process.env): GeminiTransportKind {
  const raw = (env.GEMINI_TRANSPORT ?? '').trim().toLowerCase();
  if (!raw || raw === 'gemini_api' || raw === 'gemini') return 'gemini_api';
  if (raw === 'vertex') return 'vertex';
  throw new Error('GEMINI_TRANSPORT must be gemini_api or vertex');
}

function geminiApiKey(env: Env): string {
  const single = (env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
  if (single) return single;
  return (env.GEMINI_API_KEYS || '').split(/[\s,]+/).map((k) => k.trim()).find(Boolean) ?? '';
}

/** Variable names a transport would need and does not have (never values). [] when it can serve. */
export function googleTransportProblems(kind: GeminiTransportKind, env: Env = process.env): string[] {
  if (kind === 'vertex') return vertexAiConfigProblems(env);
  return geminiApiKey(env) ? [] : ['GEMINI_API_KEY'];
}

/** True when the selected transport can serve a call right now (false for an unknown GEMINI_TRANSPORT). */
export function googleAiConfigured(env: Env = process.env): boolean {
  try {
    return googleTransportProblems(googleTransportKind(env), env).length === 0;
  } catch {
    return false;
  }
}

/**
 * Why a caller holding `apiKey` (its own key-pool pick, possibly empty) cannot make a call on the selected transport,
 * or null. `gemini_api` needs that key; `vertex` needs its project and Workload Identity config and ignores the key.
 * An unknown GEMINI_TRANSPORT fails closed.
 */
export function googleTransportBlocker(apiKey: string | null | undefined): string | null {
  let kind: GeminiTransportKind;
  try {
    kind = googleTransportKind();
  } catch {
    return 'GEMINI_TRANSPORT is not gemini_api or vertex';
  }
  if (kind === 'vertex') return googleAiConfigured() ? null : 'Vertex AI is not configured';
  return (apiKey ?? '').trim() ? null : 'Gemini API key is not configured';
}

/**
 * The attempts a key-rotating caller makes on the selected transport: one per key of its own pool on the Gemini API (a
 * quota miss on one key moves to the next), exactly one on Vertex AI (one identity; the pool does not apply), none when
 * the transport cannot serve. `undefined` stands for the transport's own credential.
 */
export function googleCallAttempts(keys: readonly string[]): Array<string | undefined> {
  let kind: GeminiTransportKind;
  try {
    kind = googleTransportKind();
  } catch {
    return [];
  }
  if (kind === 'vertex') return googleAiConfigured() ? [undefined] : [];
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
}

function modelId(model: string): string {
  const id = normalizeModelId(model);
  if (!id) throw new Error('Invalid Google model id');
  return id;
}

/** The Vertex host and resource prefix for a location (`global` has no regional host). */
export function vertexPublisherBase(projectId: string, location: string): string {
  if (!LOCATION_RE.test(location)) throw new Error('Vertex location (malformed)');
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${location}/publishers/google`;
}

async function* sseObjects(res: Response, kind: GeminiTransportKind): AsyncGenerator<unknown> {
  if (!res.ok || !res.body) throw new Error(`Google ${kind} stream failed: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : '';
      if (data && data !== '[DONE]') yield JSON.parse(data);
    }
  }
}

function restTransport(kind: GeminiTransportKind): GoogleRestTransport {
  const request: GoogleRestTransport['request'] = async (model, method): Promise<{ url: string; headers: Record<string, string> }> => {
    const id = modelId(model);
    const suffix = method === 'streamGenerateContent' ? '?alt=sse' : '';
    if (kind === 'vertex') {
      if (method === 'embedContent') throw new Error('embedContent is a Gemini API method; on Vertex AI use predict');
      const config = vertexAiConfig();
      if (!config) throw new NotConfiguredError('vertex', vertexAiConfigProblems());
      // predict models (Imagen, gemini-embedding-001) are regional; Gemini, the image model and Lyria answer on global.
      const location = method === 'predict' ? (process.env.GCP_PREDICT_LOCATION?.trim() || 'us-central1') : config.location;
      return {
        url: `${vertexPublisherBase(config.projectId, location)}/models/${id}:${method}${suffix}`,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getVertexAccessToken(false)}` },
      };
    }
    const apiKey = resolveGeminiKey();
    if (!apiKey) throw new NotConfiguredError('gemini_api', ['GEMINI_API_KEY']);
    // The key travels in the x-goog-api-key header, never the URL: a URL lands in logs, traces and error text.
    return {
      url: `${GEMINI_API_BASE}/models/${id}:${method}${suffix}`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    };
  };
  const doFetch: GoogleRestTransport['fetch'] = async ({ model, method = 'generateContent', init }) => {
    const { url, headers } = await request(model, method);
    // A caller's own headers survive, except any credential or a name the transport sets itself.
    const own = new Set(['x-goog-api-key', 'authorization', ...Object.keys(headers).map((h) => h.toLowerCase())]);
    const extra = init.headers
      ? Object.fromEntries([...new Headers(init.headers).entries()].filter(([name]) => !own.has(name)))
      : {};
    return fetch(url, { ...init, headers: { ...extra, ...headers }, redirect: 'manual' });
  };
  return {
    kind,
    request,
    fetch: doFetch,
    generateContent: (call) => doFetch({ ...call, method: call.method ?? 'generateContent' }),
    streamGenerateContent: (call) => ({
      [Symbol.asyncIterator]: async function* () {
        yield* sseObjects(await doFetch({ ...call, method: 'streamGenerateContent' }), kind);
      },
    }),
    checkConfiguration: () => {
      const missing = googleTransportProblems(kind);
      return { ok: missing.length === 0, missing };
    },
  };
}

const TRANSPORTS: Record<GeminiTransportKind, GoogleRestTransport> = {
  gemini_api: restTransport('gemini_api'),
  vertex: restTransport('vertex'),
};

/** The contract's selector: the environment's transport, or exactly the one asked for — never another. */
export const googleTransports: GeminiTransportSelector<GoogleRestTransport> = {
  select() {
    return this.selectFixed(googleTransportKind());
  },
  selectFixed(kind) {
    const missing = googleTransportProblems(kind);
    if (missing.length) throw new NotConfiguredError(kind, missing);
    return TRANSPORTS[kind];
  },
};

/** One model RPC on the selected transport. Throws NotConfiguredError when it cannot serve. */
export async function googleModelFetch(model: string, method: GoogleModelMethod, init: RequestInit): Promise<Response> {
  return googleTransports.select().fetch({ model, method, init });
}
