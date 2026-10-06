/**
 * lib/research/interactionsClient.ts — the Gemini Interactions API, as far as Deep Research needs it. Deep Research is an
 * AGENT of this API, NOT reachable through generateContent:
 *
 *   start   POST /v1beta/interactions                 { agent, input, background: true, store: true, agent_config, tools }
 *   poll    GET  /v1beta/interactions/{id}            → status in_progress → completed | failed | cancelled | incomplete
 *   cancel  POST /v1beta/interactions/{id}/cancel     ("only applies to background interactions that are still running")
 *
 * Developer requests use x-goog-api-key; Vertex uses project OAuth against the global v1beta1 Interactions endpoint.
 * No credential enters a URL. Every call uses redirect: 'manual' so credentials cannot follow redirects. Existing
 * jobs carry their transport/project in a private reference; changing environment selectors never changes their
 * billing transport. Error bodies redact the credential and are returned as INTERNAL detail — never to a user
 * (lib/api/providerError.ts).
 *
 * ⚠️ THE START POST IS SENT AT MOST ONCE. It has no idempotency key, so a retry after a lost answer could start (and bill)
 * a second run. Every doubtful outcome — a timeout, a dropped connection, a 5xx, a 2xx with no usable id — is reported as
 * `ambiguous`, and the caller refunds instead of re-sending. Nothing in this file retries.
 *
 * Injectable `fetch` and key, so the whole client is unit-tested against fixtures with no network.
 */
import 'server-only';
import { classifyProviderError, type ProviderFailure } from '@/lib/api/providerError';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { googleTransport, requireVertexAiConfig } from '@/lib/ai/google/transport';
import { getVertexAccessToken } from '@/lib/veo/vertexAuth';
import { parseInteraction, parseInteractionId, type ParsedInteraction } from './parse';

export const INTERACTIONS_HOST = 'generativelanguage.googleapis.com';
export const INTERACTIONS_BASE = `https://${INTERACTIONS_HOST}/v1beta/interactions`;

/**
 * ⚠️ EVERY ONE OF THESE MUST END BEFORE VERCEL ENDS THE FUNCTION. vercel.json grants `app/api/**` 15 s (and `app/api/cron/**`
 * 60 s), and it overrides a route's own `maxDuration`. A start POST that outlived the function would die mid-flight with the
 * job stuck in `submitting` (the sweeper would refund it, safely but needlessly), so the client gives up first: creating a
 * background interaction answers in a second or two, never in twelve.
 */
export const START_TIMEOUT_MS = 12_000;
export const POLL_TIMEOUT_MS = 12_000;
export const CANCEL_TIMEOUT_MS = 12_000;

/**
 * `visualization` for every run. 'off' on purpose: the agent returns charts as base64 images INSIDE the interaction (MBs),
 * and this product neither stores nor renders them yet — asking for them would spend tokens on pictures nobody sees. The
 * parser drops images safely if the owner flips this to 'auto' (and the report may then say "see the chart").
 */
export const RESEARCH_VISUALIZATION: 'off' | 'auto' = 'off';

/** The id goes into a URL path: `../x` or a slash must never re-route a keyed request. */
const INTERACTION_ID_RE = /^[A-Za-z0-9_-]{4,512}$/;
export const isInteractionId = (v: unknown): v is string => typeof v === 'string' && INTERACTION_ID_RE.test(v);

export type StartOutcome =
  // `id` is an opaque private reference, persisted unchanged in research_jobs.provider_interaction_id.
  | { ok: true; id: string }
  | {
      ok: false;
      /** The user-facing class (lib/api/providerError). */
      failure: ProviderFailure | 'not_configured';
      /** The request MAY exist at the provider (a timeout, a 5xx, a 2xx with no id): never re-sent, always refunded + alerted. */
      ambiguous: boolean;
      status?: number;
      /** Internal diagnostics — key-redacted, bounded, never shown to a user. */
      detail: string;
    };

export type PollOutcome =
  | { ok: true; parsed: ParsedInteraction }
  | { ok: false; kind: 'not_found' | 'auth' | 'transient'; status?: number; detail: string };

export type CancelOutcome =
  | { ok: true; parsed: ParsedInteraction }
  | { ok: false; kind: 'not_found' | 'not_running' | 'transient'; status?: number; detail: string };

export interface StartRequest {
  agent: string;
  /** The finished input string (lib/research/context.buildResearchInput). */
  input: string;
}

export interface InteractionsClient {
  start(req: StartRequest): Promise<StartOutcome>;
  /** `timeoutMs` shortens the wait for a poll that a person is watching (the read-through refresh). */
  poll(id: string, opts?: { timeoutMs?: number }): Promise<PollOutcome>;
  cancel(id: string): Promise<CancelOutcome>;
}

export interface InteractionsClientOptions {
  fetch?: typeof fetch;
  /** Defaults to resolveGeminiKey() at call time. */
  apiKey?: string;
  baseUrl?: string;
}

/** The request body of a Deep Research start — exported so the contract is asserted in one place. */
export function startBody(req: StartRequest, transport: 'gemini' | 'vertex' = 'gemini'): Record<string, unknown> {
  // Vertex supports background Interactions on the global endpoint. The documented contract does
  // not include the Developer API's visualization/collaborative_planning options.
  // https://docs.cloud.google.com/gemini-enterprise-agent-platform/agents/use-deep-research
  if (transport === 'vertex') {
    return {
      agent: req.agent, input: req.input, background: true, stream: false, store: true,
      agent_config: { type: 'deep-research', thinking_summaries: 'auto' },
      tools: [{ type: 'google_search' }, { type: 'url_context' }],
    };
  }
  return {
    agent: req.agent,
    input: req.input,
    background: true,
    // `background=true` REQUIRES store=true (guide, "Limitations"); the default is true — stated so it cannot drift.
    store: true,
    agent_config: {
      type: 'deep-research',
      thinking_summaries: 'auto',
      visualization: RESEARCH_VISUALIZATION,
      collaborative_planning: false,
    },
    tools: [{ type: 'google_search' }, { type: 'url_context' }],
  };
}

/** Bounded, key-redacted body text of a failed response. */
async function readError(res: Response, key: string): Promise<string> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  const redacted = key ? text.split(key).join('[redacted]') : text;
  return `HTTP ${res.status}${redacted ? `: ${redacted.replace(/\s+/g, ' ').slice(0, 400)}` : ''}`;
}

const errText = (e: unknown, key: string): string => {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? 'error');
  return (key ? raw.split(key).join('[redacted]') : raw).slice(0, 200);
};

/**
 * A versioned private reference pins a job to its original transport/project across deploys.
 * Old bare IDs were created through the Developer API. They never become Vertex IDs when an
 * operator changes GEMINI_TRANSPORT. The database column is already text; no migration is needed.
 */
export type InteractionReference =
  | { transport: 'gemini'; id: string }
  | { transport: 'vertex'; project: string; location: 'global'; id: string };

export function parseInteractionReference(raw: string): InteractionReference | null {
  if (INTERACTION_ID_RE.test(raw)) return { transport: 'gemini', id: raw };
  const parts = raw.split(':');
  if (parts[0] !== 'research' || parts[1] !== 'v1') return null;
  if (parts.length === 4 && parts[2] === 'gemini' && isInteractionId(parts[3])) {
    return { transport: 'gemini', id: parts[3] };
  }
  if (parts.length === 6 && parts[2] === 'vertex' && parts[4] === 'global' && isInteractionId(parts[5])) {
    try {
      const project = decodeURIComponent(parts[3]!);
      // Match vertexAuth's project IDs, including numbers and legacy domain-scoped projects.
      if (/^[a-z0-9][a-z0-9.:-]{0,99}$/.test(project) && encodeURIComponent(project) === parts[3]) {
        return { transport: 'vertex', project, location: 'global', id: parts[5] };
      }
    } catch { /* malformed percent encoding is not a job reference */ }
  }
  return null;
}

interface RequestTarget {
  transport: 'gemini' | 'vertex';
  base: string;
  secret: string;
  headers: Record<string, string>;
  reference(id: string): string;
}

export function createInteractionsClient(opts: InteractionsClientOptions = {}): InteractionsClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  const target = async (ref?: InteractionReference): Promise<RequestTarget> => {
    // Only NEW starts use the current setting; all lifecycle calls use the persisted reference.
    const transport = ref?.transport ?? googleTransport();
    if (transport === 'vertex') {
      const config = requireVertexAiConfig();
      if (ref?.transport === 'vertex' && ref.project !== config.projectId) {
        throw new Error('Research job belongs to a different Vertex project');
      }
      const token = await getVertexAccessToken(false);
      return {
        transport,
        base: `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(config.projectId)}/locations/global/interactions`,
        secret: token,
        headers: { Authorization: `Bearer ${token}` },
        reference: (id) => `research:v1:vertex:${encodeURIComponent(config.projectId)}:global:${id}`,
      };
    }
    const key = (opts.apiKey ?? resolveGeminiKey()).trim();
    if (!key) throw new Error('GEMINI_API_KEY is not configured');
    return {
      transport,
      base: (opts.baseUrl ?? INTERACTIONS_BASE).replace(/\/$/, ''),
      secret: key,
      headers: { 'x-goog-api-key': key },
      reference: (id) => `research:v1:gemini:${id}`,
    };
  };

  const call = (url: string, init: RequestInit, signal: AbortSignal, t: RequestTarget): Promise<Response> =>
    doFetch(url, {
      ...init,
      headers: { ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...t.headers },
      cache: 'no-store',
      redirect: 'manual',
      signal,
    });

  return {
    async start(req) {
      // Token exchange and the provider request share one budget; slow auth cannot extend the
      // create POST beyond the Vercel deadline and leave a billed job with no recorded ID.
      const signal = AbortSignal.timeout(START_TIMEOUT_MS);
      let t: RequestTarget;
      try { t = await target(); } catch {
        // Authentication failed before the create POST; no run can have been billed. Never fall back.
        return { ok: false, failure: 'not_configured', ambiguous: false, detail: 'Research transport authentication is unavailable' };
      }
      if (signal.aborted) return { ok: false, failure: 'not_configured', ambiguous: false, detail: 'Research authentication exceeded the request deadline' };
      const k = t.secret;
      let res: Response;
      try {
        res = await call(t.base, { method: 'POST', body: JSON.stringify(startBody(req, t.transport)) }, signal, t);
      } catch (e) {
        // The request may have reached Google (a timeout fires after the send) — never re-POST.
        return { ok: false, failure: 'provider_unavailable', ambiguous: true, detail: `start failed: ${errText(e, k)}` };
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, failure: 'provider_unavailable', ambiguous: true, status: res.status, detail: `start answered a redirect (${res.status}) — not followed` };
      }
      if (!res.ok) {
        const detail = await readError(res, k);
        const failure = classifyProviderError({ status: res.status, message: detail });
        // 4xx = a definite refusal (nothing was created). A 5xx may have created the run before failing.
        return { ok: false, failure, ambiguous: res.status >= 500, status: res.status, detail };
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const id = parseInteractionId(json);
      if (!id) {
        return { ok: false, failure: 'provider_unavailable', ambiguous: true, status: res.status, detail: 'accepted the start but returned no usable interaction id — the run may exist; not re-sent' };
      }
      return { ok: true, id: t.reference(id) };
    },

    async poll(id, popts) {
      const signal = AbortSignal.timeout(Math.max(1_000, Math.min(popts?.timeoutMs ?? POLL_TIMEOUT_MS, POLL_TIMEOUT_MS)));
      const ref = parseInteractionReference(id);
      if (!ref) return { ok: false, kind: 'not_found', detail: 'not an interaction reference' };
      let t: RequestTarget;
      try { t = await target(ref); } catch {
        return { ok: false, kind: 'auth', detail: 'Research transport authentication is unavailable or project changed' };
      }
      const k = t.secret;
      let res: Response;
      try {
        res = await call(`${t.base}/${ref.id}`, { method: 'GET' }, signal, t);
      } catch (e) {
        return { ok: false, kind: 'transient', detail: `poll failed: ${errText(e, k)}` };
      }
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, kind: 'not_found', status: res.status, detail: `interaction unknown or expired (${res.status})` };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, kind: 'auth', status: res.status, detail: await readError(res, k) };
      }
      if (!res.ok) return { ok: false, kind: 'transient', status: res.status, detail: await readError(res, k) };
      try {
        return { ok: true, parsed: parseInteraction(await res.json()) };
      } catch {
        return { ok: false, kind: 'transient', status: res.status, detail: 'unreadable poll answer' };
      }
    },

    async cancel(id) {
      const signal = AbortSignal.timeout(CANCEL_TIMEOUT_MS);
      const ref = parseInteractionReference(id);
      if (!ref) return { ok: false, kind: 'not_found', detail: 'not an interaction reference' };
      let t: RequestTarget;
      try { t = await target(ref); } catch {
        return { ok: false, kind: 'transient', detail: 'Research transport authentication is unavailable or project changed' };
      }
      const k = t.secret;
      let res: Response;
      try {
        res = await call(`${t.base}/${ref.id}/cancel`, { method: 'POST', body: '{}' }, signal, t);
      } catch (e) {
        return { ok: false, kind: 'transient', detail: `cancel failed: ${errText(e, k)}` };
      }
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, kind: 'not_found', status: res.status, detail: `interaction unknown or expired (${res.status})` };
      }
      if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403) {
        return { ok: false, kind: 'transient', status: res.status, detail: await readError(res, k) };
      }
      if (!res.ok) {
        // Any other 4xx: the run is not cancellable (already finished, say) — the caller polls to learn which.
        return { ok: false, kind: 'not_running', status: res.status, detail: await readError(res, k) };
      }
      try {
        return { ok: true, parsed: parseInteraction(await res.json()) };
      } catch {
        // Accepted but unreadable: the caller polls for the real state.
        return { ok: true, parsed: parseInteraction(null) };
      }
    },
  };
}
