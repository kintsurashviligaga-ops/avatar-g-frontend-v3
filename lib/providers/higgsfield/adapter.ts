/**
 * Higgsfield behind the provider-neutral ProviderAdapter (brief D4). The saga never imports the client.
 */
import 'server-only';
import { createHfClient, hfAuthHeaderFromEnv, type HfClientOptions } from '@/lib/providers/higgsfield/client';
import type { ProviderAdapter } from '@/lib/providers/types';

/** null when the credential pair is not configured — the caller answers `not_configured`, never throws. */
export function createHiggsfieldAdapter(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<HfClientOptions> = {},
): ProviderAdapter | null {
  const authHeader = hfAuthHeaderFromEnv(env);
  if (!authHeader) return null;
  const c = createHfClient({ authHeader, baseUrl: env.HF_API_BASE_URL || undefined, ...overrides });
  return {
    id: 'higgsfield',
    estimate: (endpoint, input) => c.estimate(endpoint, input),
    submit: (endpoint, input, opts) => c.submit(endpoint, input, opts),
    status: (requestId) => c.status(requestId),
    cancel: (requestId) => c.cancel(requestId),
    createUpload: (contentType) => c.createUpload(contentType),
  };
}
