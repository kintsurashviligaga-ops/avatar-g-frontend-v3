/**
 * lib/research/interactionsClient.ts — the Gemini Interactions API, as far as Deep Research needs it. Deep Research is an
 * AGENT of this API, NOT reachable through generateContent:
 *
 *   start   POST /v1beta/interactions                 { agent, input, background: true, store: true, agent_config, tools }
 *   poll    GET  /v1beta/interactions/{id}            → status in_progress → completed | failed | cancelled | incomplete
 *   cancel  POST /v1beta/interactions/{id}/cancel     ("only applies to background interactions that are still running")
 *
 * The key travels ONLY in the `x-goog-api-key` header — never `?key=` (a URL ends up in logs, traces and error reports)
 * — and only to generativelanguage.googleapis.com: every call uses `redirect: 'manual'`, so a redirect can never carry the
 * header to another host (the repo rule, lib/veo/geminiTransport.ts). Error bodies are read through `readError`, which
 * redacts the key and bounds the text, and are returned as INTERNAL `detail` — they never reach a user
 * (lib/api/providerError.ts).
 *
 * ⚠️ THE START POST IS SENT AT MOST ONCE. It has no idempotency key, so a retry after a lost answer could start (and bill)
 * a second run. Every doubtful outcome — a timeout, a dropped connection, a 5xx, a 2xx with no usable id — is reported as
 * `ambiguous`, and the caller refunds instead of re-sending. Nothing in this file retries.
 *
 * GEMINI_TRANSPORT DOES NOT APPLY HERE (Part 2 A2): the Interactions API and its Deep Research agent exist on the Gemini
 * API only, so this client is pinned to it — the contract's `selectFixed('gemini_api')`, stated, never a fallback. With
 * `GEMINI_TRANSPORT=vertex` a research run still bills the API key's account, not the Google Cloud project.
 *
 * Injectable `fetch` and key, so the whole client is unit-tested against fixtures with no network.
 */
import 'server-only';
import { classifyProviderError, type ProviderFailure } from '@/lib/api/providerError';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
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
export function startBody(req: StartRequest): Record<string, unknown> {
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

export function createInteractionsClient(opts: InteractionsClientOptions = {}): InteractionsClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = (opts.baseUrl ?? INTERACTIONS_BASE).replace(/\/$/, '');
  const key = () => (opts.apiKey ?? resolveGeminiKey()).trim();

  const call = (url: string, init: RequestInit, timeoutMs: number, k: string): Promise<Response> =>
    doFetch(url, {
      ...init,
      headers: { ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}), 'x-goog-api-key': k },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

  return {
    async start(req) {
      const k = key();
      if (!k) return { ok: false, failure: 'not_configured', ambiguous: false, detail: 'no Gemini API key configured' };
      let res: Response;
      try {
        res = await call(base, { method: 'POST', body: JSON.stringify(startBody(req)) }, START_TIMEOUT_MS, k);
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
      return { ok: true, id };
    },

    async poll(id, popts) {
      const k = key();
      if (!k) return { ok: false, kind: 'auth', detail: 'no Gemini API key configured' };
      if (!isInteractionId(id)) return { ok: false, kind: 'not_found', detail: 'not an interaction id' };
      let res: Response;
      try {
        res = await call(`${base}/${id}`, { method: 'GET' }, Math.max(1_000, Math.min(popts?.timeoutMs ?? POLL_TIMEOUT_MS, POLL_TIMEOUT_MS)), k);
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
      const k = key();
      if (!k) return { ok: false, kind: 'transient', detail: 'no Gemini API key configured' };
      if (!isInteractionId(id)) return { ok: false, kind: 'not_found', detail: 'not an interaction id' };
      let res: Response;
      try {
        res = await call(`${base}/${id}/cancel`, { method: 'POST', body: '{}' }, CANCEL_TIMEOUT_MS, k);
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
