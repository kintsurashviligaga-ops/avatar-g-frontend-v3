/**
 * lib/ai/google/provider.ts — the @ai-sdk/google factory on Vertex AI (Part 2, A2; MASTER TASK v3.1: Vertex only).
 *
 * The SDK runs against the Vertex publisher endpoint (`…/projects/P/locations/L/publishers/google/models/ID:
 * generateContent` — the SDK appends `/models/ID:method` to its base URL) with a Workload Identity bearer token. The
 * SDK insists on an API key, so it gets a placeholder that the fetch below always strips: no key is ever sent. It is
 * never pointed at the Developer API. No new dependency (@ai-sdk/google-vertex would bring a second @ai-sdk/google,
 * google-auth-library 10 and the Anthropic SDK with it).
 */
import 'server-only';
import { createGoogleGenerativeAI as createGeminiSdk } from '@ai-sdk/google';
import { NotConfiguredError } from '@/lib/contracts/geminiTransport';
import { getVertexAccessToken, vertexAiConfig, vertexAiConfigProblems } from '@/lib/veo/vertexAuth';
import { googleTransportKind, vertexPublisherBase } from './transport';

/** Never leaves the process: vertexFetch deletes the header it travels in. */
const VERTEX_SDK_PLACEHOLDER_KEY = 'vertex-oauth';

export const vertexFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.delete('x-goog-api-key');
  headers.set('Authorization', `Bearer ${await getVertexAccessToken(false)}`);
  return fetch(input, { ...init, headers, redirect: 'manual' });
};

/**
 * Drop-in for `createGoogleGenerativeAI` from @ai-sdk/google, on Vertex AI's identity. `_options.apiKey` (a caller's
 * old key-pool pick) is ignored. Throws NotConfiguredError, including for GEMINI_TRANSPORT=gemini_api; never falls back.
 */
export function createGoogleGenerativeAI(_options: { apiKey?: string } = {}) {
  googleTransportKind();
  const config = vertexAiConfig();
  if (!config) throw new NotConfiguredError('vertex', vertexAiConfigProblems());
  return createGeminiSdk({
    apiKey: VERTEX_SDK_PLACEHOLDER_KEY,
    baseURL: vertexPublisherBase(config.projectId, config.location),
    fetch: vertexFetch,
  });
}
