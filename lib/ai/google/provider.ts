/**
 * lib/ai/google/provider.ts — the @ai-sdk/google factory on the selected transport (Part 2, A2).
 *
 * `gemini_api` is the SDK as before (API key). `vertex` reuses the same SDK against the Vertex publisher endpoint
 * (`…/projects/P/locations/L/publishers/google/models/ID:generateContent` — the SDK appends `/models/ID:method` to its
 * base URL) with a Workload Identity bearer token. The SDK insists on an API key, so it gets a placeholder that the
 * fetch below always strips: no key is ever sent to Vertex and no token to the Gemini API. No new dependency
 * (@ai-sdk/google-vertex would bring a second @ai-sdk/google, google-auth-library 10 and the Anthropic SDK with it).
 */
import 'server-only';
import { createGoogleGenerativeAI as createGeminiSdk } from '@ai-sdk/google';
import { NotConfiguredError } from '@/lib/contracts/geminiTransport';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
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
 * Drop-in for `createGoogleGenerativeAI` from @ai-sdk/google. `apiKey` is honoured on `gemini_api` only (a caller's
 * own key pool entry); on `vertex` the transport's identity is used. Throws NotConfiguredError, never falls back.
 */
export function createGoogleGenerativeAI(options: { apiKey?: string } = {}) {
  if (googleTransportKind() === 'gemini_api') {
    const apiKey = (options.apiKey ?? resolveGeminiKey()).trim();
    if (!apiKey) throw new NotConfiguredError('gemini_api', ['GEMINI_API_KEY']);
    return createGeminiSdk({ apiKey }); // exactly the SDK call every caller made before the transport existed
  }
  const config = vertexAiConfig();
  if (!config) throw new NotConfiguredError('vertex', vertexAiConfigProblems());
  return createGeminiSdk({
    apiKey: VERTEX_SDK_PLACEHOLDER_KEY,
    baseURL: vertexPublisherBase(config.projectId, config.location),
    fetch: vertexFetch,
  });
}
