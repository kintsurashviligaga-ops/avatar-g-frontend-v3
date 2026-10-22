/**
 * lib/ai/google/transport.ts — which Google endpoint a model call goes to, and with which credential (Part 2, A2).
 *
 * Implements the Part 1 contract (lib/contracts/geminiTransport.ts) under MASTER TASK v3.1, which makes Vertex AI the
 * only model transport: aiplatform.googleapis.com with a Workload Identity token, billed to the Google Cloud project.
 * Project and auth come from lib/veo/vertexAuth (vertexAiConfig: no bucket needed).
 *   · GEMINI_TRANSPORT unset or `vertex` → Vertex AI. An unset variable never selects the Developer API.
 *   · `gemini_api` / `gemini` (the AI Studio key on generativelanguage.googleapis.com) → NotConfiguredError. No key is
 *     read here, so no model call made through this module can bill the AI Studio balance.
 *   · anything else → an error. Callers treat both as "cannot serve", before any provider I/O.
 * An unconfigured Vertex throws NotConfiguredError naming the missing variables (names only, never values).
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
import { getVertexAccessToken, vertexAiConfig, vertexAiConfigProblems } from '@/lib/veo/vertexAuth';
import { normalizeModelId } from './models';

type Env = Readonly<Record<string, string | undefined>>;

/** `embedContent` exists on the Developer API only; Vertex serves the same embedding model through `predict`. */
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

const LOCATION_RE = /^[a-z0-9-]{2,40}$/;

/** What a `gemini_api` selection lacks: the policy, not a variable. Reported where variable names would be. */
export const DEVELOPER_API_REFUSED = 'GEMINI_TRANSPORT=vertex (the Gemini Developer API is not an allowed transport)';

/**
 * Vertex AI, or a throw: `gemini_api` / `gemini` (PR #44's name) throw NotConfiguredError, so routes answer "not
 * configured"; any other value throws a plain error. Neither ever selects another transport.
 */
export function googleTransportKind(env: Env = process.env): 'vertex' {
  const raw = (env.GEMINI_TRANSPORT ?? '').trim().toLowerCase();
  if (!raw || raw === 'vertex') return 'vertex';
  if (raw === 'gemini_api' || raw === 'gemini') throw new NotConfiguredError('gemini_api', [DEVELOPER_API_REFUSED]);
  throw new Error('GEMINI_TRANSPORT must be vertex or unset');
}

/** Variable names a transport would need and does not have (never values). [] when it can serve. */
export function googleTransportProblems(kind: GeminiTransportKind, env: Env = process.env): string[] {
  return kind === 'vertex' ? vertexAiConfigProblems(env) : [DEVELOPER_API_REFUSED];
}

/** True when Vertex AI can serve a call right now (false whenever GEMINI_TRANSPORT is set to anything but vertex). */
export function googleAiConfigured(env: Env = process.env): boolean {
  try {
    return googleTransportProblems(googleTransportKind(env), env).length === 0;
  } catch {
    return false;
  }
}

/**
 * Why a call cannot be made right now, or null. `_apiKey` is what callers passed when the Developer API was a
 * transport; it is ignored, so holding a key never makes a call possible.
 */
export function googleTransportBlocker(_apiKey?: string | null): string | null {
  try {
    googleTransportKind();
  } catch {
    return 'GEMINI_TRANSPORT is not vertex';
  }
  return googleAiConfigured() ? null : 'Vertex AI is not configured';
}

/**
 * The attempts a key-rotating caller makes: exactly one on Vertex AI (one identity; a key pool does not apply), none
 * when Vertex cannot serve. `undefined` stands for the transport's own credential; `_keys` is ignored.
 */
export function googleCallAttempts(_keys: readonly string[]): Array<string | undefined> {
  return googleTransportBlocker() ? [] : [undefined];
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

async function* sseObjects(res: Response): AsyncGenerator<unknown> {
  if (!res.ok || !res.body) throw new Error(`Google vertex stream failed: HTTP ${res.status}`);
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

function vertexTransport(): GoogleRestTransport {
  const request: GoogleRestTransport['request'] = async (model, method): Promise<{ url: string; headers: Record<string, string> }> => {
    const id = modelId(model);
    const suffix = method === 'streamGenerateContent' ? '?alt=sse' : '';
    if (method === 'embedContent') throw new Error('embedContent is a Developer API method; on Vertex AI use predict');
    const config = vertexAiConfig();
    if (!config) throw new NotConfiguredError('vertex', vertexAiConfigProblems());
    // predict models (Imagen, gemini-embedding-001) are regional; Gemini, the image model and Lyria answer on global.
    const location = method === 'predict' ? (process.env.GCP_PREDICT_LOCATION?.trim() || 'us-central1') : config.location;
    return {
      url: `${vertexPublisherBase(config.projectId, location)}/models/${id}:${method}${suffix}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getVertexAccessToken(false)}` },
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
    kind: 'vertex',
    request,
    fetch: doFetch,
    generateContent: (call) => doFetch({ ...call, method: call.method ?? 'generateContent' }),
    streamGenerateContent: (call) => ({
      [Symbol.asyncIterator]: async function* () {
        yield* sseObjects(await doFetch({ ...call, method: 'streamGenerateContent' }));
      },
    }),
    checkConfiguration: () => {
      const missing = googleTransportProblems('vertex');
      return { ok: missing.length === 0, missing };
    },
  };
}

const VERTEX = vertexTransport();

/** The contract's selector: Vertex AI, or NotConfiguredError — never another transport. */
export const googleTransports: GeminiTransportSelector<GoogleRestTransport> = {
  select() {
    return this.selectFixed(googleTransportKind());
  },
  selectFixed(kind) {
    const missing = googleTransportProblems(kind);
    if (missing.length) throw new NotConfiguredError(kind, missing);
    return VERTEX;
  },
};

/** One model RPC on Vertex AI. Throws NotConfiguredError when it cannot serve. */
export async function googleModelFetch(model: string, method: GoogleModelMethod, init: RequestInit): Promise<Response> {
  return googleTransports.select().fetch({ model, method, init });
}

/**
 * The transport for IMAGE generation: GEMINI_IMAGE_TRANSPORT when set, else GEMINI_TRANSPORT, under the same rule
 * (vertex or unset). It once let frames stay on the AI Studio key while text used Vertex (on 2026-10-16 Vertex answered
 * every storyboard frame with 429, per-minute image quota). Under v3.1 a leftover `gemini_api` here refuses the call
 * instead of moving images to another account.
 */
export function googleImageTransportKind(env: Env = process.env): 'vertex' {
  const raw = (env.GEMINI_IMAGE_TRANSPORT ?? '').trim();
  return raw ? googleTransportKind({ GEMINI_TRANSPORT: raw }) : googleTransportKind(env);
}

/** One image-model RPC on Vertex AI. Throws NotConfiguredError when it cannot serve. */
export async function googleImageModelFetch(model: string, method: GoogleModelMethod, init: RequestInit): Promise<Response> {
  return googleTransports.selectFixed(googleImageTransportKind()).fetch({ model, method, init });
}

/** Why an image call cannot be made right now, or null. */
export function googleImageTransportBlocker(): string | null {
  let kind: GeminiTransportKind;
  try {
    kind = googleImageTransportKind();
  } catch {
    return 'GEMINI_IMAGE_TRANSPORT is not vertex';
  }
  return googleTransportProblems(kind).length ? `${kind} is not configured` : null;
}
