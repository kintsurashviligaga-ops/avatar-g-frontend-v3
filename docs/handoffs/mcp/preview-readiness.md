# Read-only Gemini MCP preview: preparation and remaining checks

This is a staging-only procedure. It does not authorize production activation,
paid generation, or use of production user data. Real Gemini account linking
and generated-asset E2E have not been demonstrated.

## Staging state

The separately identified Supabase project `lejrrdeffeswrdzjqthm` was found
without auth users and with no application repository attached. The broker SQL,
denial update, and session-binding update were applied there. The empty grants
and restricted service-only function access were checked. No preview auth user
or sample asset has been provisioned, and its OAuth Server was observed disabled.
Do not apply experimental broker SQL to the production project.

The `gemini-readonly-preview-fixture.sql` is a reviewed proposal, not applied;
it requires a separately provisioned synthetic staging-only user and asset. The
fixture refuses an existing `generation_jobs` table and grants only owner SELECT.
Inspect the target project and the proposal again before applying it.

## Required preview-only configuration

Use branch-scoped Vercel **Preview** variables and separate staging credentials.
Never print credentials or copy them to Git. Set `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to that staging project, and set
`MCP_BROKER_PREVIEW_SUPABASE_URL` to exactly the same canonical project URL.
Enable only `MCP_GEMINI_ENABLED`, `MCP_BROKER_EXPERIMENTAL`,
`MCP_BROKER_PREVIEW_ENABLED`, and `MCP_OAUTH_CONSENT_ENABLED` for the branch's
preview. Leave paid generation flags disabled. `MCP_BROKER_ENCRYPTION_KEY`
must be an independently generated 32-byte key, stored as a secret.

Configure the upstream Supabase confidential OAuth client via
`MCP_BROKER_UPSTREAM_CLIENT_ID` and `MCP_BROKER_UPSTREAM_CLIENT_SECRET`;
include that client ID in `MCP_GEMINI_ALLOWED_CLIENT_IDS`. Configure the
separate downstream Gemini client with `MCP_BROKER_CLIENT_ID`,
`MCP_BROKER_CLIENT_SECRET`, and an exact Google redirect in
`MCP_BROKER_REDIRECT_URI`. Capture the exact redirect from the actual Google
registration flow; do not guess it or accept a wildcard.

When both broker preview flags are enabled and the explicit values are absent,
the resource URL and upstream callback are derived from Vercel's `VERCEL_URL`
system variable. This avoids requiring the unknown deployment URL before a new
deployment exists. The host must be a canonical `*.vercel.app` deployment host,
and the broker still checks the staging project and refuses the known production
project. Explicit resource/callback values override derivation and must match
the deployment origin. Vercel must expose system variables, and deployment
protection must allow the intended Google client to reach the endpoint.

After the Preview exists, configure the staging Supabase Site URL to that
deployment origin, authorization path to `/api/mcp/oauth/consent`, and its
confidential client callback to the same origin plus
`/api/mcp/oauth/upstream/callback`. Verify the active JWT signing configuration
supports the requested `openid` scope. Use a staging-only signed-in browser
session before starting Gemini account linking; automatic login continuation is
not implemented. Preview offers only `get_recent_works` and `mcp:read`.

## Remaining evidence

Verify discovery, exact redirect, `resource`, scope, PKCE, approval and denial,
linking, token rotation, revocation, and cross-user RLS using the actual Google
client and synthetic assets. Google documents manual pre-registered credentials
in [Developer Mode](https://developers.google.com/connected-apps/mcp/dev-mode/usage),
but the currently signed-in accounts redirected the Developer Mode URL to the
ordinary Gemini chat; the reason and availability remain unverified.

Even a passing read-only preview is not production readiness: upstream session
revocation and distributed ingress limits require completion, and audio and
UUID-avatar video require real confirmed E2E plus a verified video worker and
charge/queue path. Expired generated-asset links without trustworthy ownership
provenance are omitted rather than re-signed.
