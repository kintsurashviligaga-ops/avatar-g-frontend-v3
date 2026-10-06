import 'server-only';
import { createGoogleGenerativeAI as createGemini } from '@ai-sdk/google';
import { createVertex, type GoogleVertexProviderSettings } from '@ai-sdk/google-vertex';
import { getVertexAuthClient } from '@/lib/veo/vertexAuth';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { googleTransport, requireVertexAiConfig } from './transport';

// Provider-local guard: never forward credentials across redirects.
const providerFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'manual' });

/** Shared SDK factory: Vertex auth refreshes through the existing WIF/service-account client. */
export function createGoogleGenerativeAI(options: { apiKey?: string } = {}) {
  if (googleTransport() === 'gemini') {
    const apiKey = (options.apiKey ?? resolveGeminiKey()).trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    return createGemini({ apiKey, fetch: providerFetch });
  }
  const { projectId, location } = requireVertexAiConfig();
  // The SDK bundles google-auth-library 10; our existing Veo client uses 9.
  // GoogleAuth delegates token refresh to the supplied client's stable getAccessToken contract.
  type SdkAuthClient = NonNullable<GoogleVertexProviderSettings['googleAuthOptions']>['authClient'];
  return createVertex({
    apiKey: '', // Never inherit GOOGLE_VERTEX_API_KEY (express-mode billing).
    project: projectId,
    location,
    fetch: providerFetch,
    googleAuthOptions: { authClient: getVertexAuthClient(false) as unknown as SdkAuthClient, projectId },
  });
}
