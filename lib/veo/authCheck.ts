import 'server-only';
import { getVertexAccessToken, getVertexGoogleAuth, redactSecrets, vertexConfig, VertexAuthError } from './vertexAuth';
import { parseGsUri } from './gcs';

/**
 * Does the keyless Vertex chain work from this deployment? (GCP Part 0 "AUTH VERIFIED", run by the admin provider probe.)
 *
 * Three free calls, no model call, nothing billed:
 *   token  — the Vercel OIDC token is traded at STS and the service account impersonated (or the key mode JWT signs in);
 *   bucket — the resulting token lists one object of the Veo bucket (the bucket grant works);
 *   sign   — IAM signBlob as the service account (what V4 signed read URLs need under WIF).
 * Returns step names and redacted error text only — never the token or a signature.
 */
export interface VertexAuthCheck {
  ok: boolean;
  /** e.g. ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] or [..., 'token:failed HTTP 400: invalid_grant: …'] */
  steps: string[];
}

const TIMEOUT_MS = 8000;

function failure(err: unknown): string {
  if (err instanceof VertexAuthError) return `failed ${err.code}: ${redactSecrets(err.message, 200)}`;
  return `failed ${redactSecrets(err instanceof Error ? err.message : String(err), 200)}`;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkVertexAuth(fetchImpl: Fetch = fetch): Promise<VertexAuthCheck> {
  const config = vertexConfig();
  if (!config) return { ok: false, steps: ['config:missing'] };
  const steps = [`mode:${config.auth.mode}`];

  let token: string;
  try {
    token = await getVertexAccessToken();
    steps.push('token:ok');
  } catch (err) {
    steps.push(`token:${failure(err)}`);
    return { ok: false, steps };
  }

  let ok = true;
  const bucket = parseGsUri(config.bucket)?.bucket ?? '';
  try {
    const r = await fetchImpl(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?maxResults=1&fields=kind`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (r.ok) steps.push('bucket:ok');
    else {
      ok = false;
      const body = await r.text().catch(() => '');
      steps.push(`bucket:failed HTTP ${r.status} ${redactSecrets(body, 160)}`.trimEnd());
    }
  } catch (err) {
    ok = false;
    steps.push(`bucket:${failure(err)}`);
  }

  try {
    await getVertexGoogleAuth().sign('myavatar-vertex-auth-check');
    steps.push('sign:ok');
  } catch (err) {
    ok = false;
    steps.push(`sign:${failure(err)}`);
  }

  return { ok, steps };
}
