# Gemini MCP integration — not yet production-ready

`POST /api/mcp/gemini` uses stateless MCP Streamable HTTP on Vercel Node.js.
The official MCP SDK is required; no `@google/genai` dependency is needed.
The endpoint remains disabled unless `MCP_GEMINI_ENABLED=true`.

## Delegated authentication

The endpoint validates a bearer JWT through Supabase Auth and requires its
issuer, expiration, resource audience, allowed OAuth client ID, and `mcp:read`
scope to match trusted configuration. It publishes protected-resource metadata
at `/.well-known/oauth-protected-resource/api/mcp/gemini`. Required settings:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`MCP_GEMINI_RESOURCE_URL`, and `MCP_GEMINI_ALLOWED_CLIENT_IDS`.

**A working authorization server is not configured by this branch.** The
prototype first-party consent endpoint `/api/mcp/oauth/consent` is disabled by
default (`MCP_OAUTH_CONSENT_ENABLED`); it requires exact
`MCP_GEMINI_ALLOWED_CLIENT_IDS` and `MCP_GEMINI_ALLOWED_REDIRECT_URIS` values.
It must not be enabled until the token-claim, client and RLS design is audited.
Supabase's default OAuth tokens use the ordinary
`authenticated` audience and do not issue `mcp:read` or `mcp:write` scopes.
They will be rejected. A separately configured, audited authorization server
or token hook, client registration, consent screen, PKCE, refresh and revocation
tests are required before connecting Gemini. Do not weaken validation to accept
normal login JWTs. Avoid enabling dynamic client registration until RLS and the
OAuth client's privileges are audited.

Experimental token and revocation route prototypes are separately disabled by
default (`MCP_BROKER_EXPERIMENTAL`). Their SQL is a proposal under
`docs/handoffs/mcp/proposals/`, not an applied production migration. Authorization
request and grant creation, upstream Supabase OAuth delegation, token-to-RLS
resolution, discovery wiring, upstream revocation, rate limiting and real Gemini
testing are not complete. Never enable the experimental flag in production.

## Tools

* `chat_with_agent` uses the active Agent G runtime with a bounded deadline,
  step count and per-user rate limit.
* `get_recent_works` reads owner-filtered rows using the user's RLS bearer,
  returning metadata and HTTPS asset links. Owned storage links are freshly
  signed for 15 minutes; other provider links may expire according to issuer.
* `create_generation_task` offers a first-party, one-time approval prototype.
  Audio uses the existing Music Studio quote/reservation and recovery saga and
  remains gated by `MCP_AUDIO_GENERATION_ENABLED`; it has not been validated
  against Gemini or deployed. The legacy video path does not provide a verified
  runnable queue and must remain disabled. Never trust a model-supplied
  confirmation flag.

No configured QuotaGuard endpoint or outbound internal microservice was found
in the existing app. No generic proxy was added: forwarding user tokens to an
arbitrary proxy or host would be unsafe. If a specific outbound microservice
requires QuotaGuard, configure a trusted allowlisted destination and dedicated
proxy credentials for that service, and verify its egress IP before release.

## Before deployment

Implement and configure OAuth authorization and consent; verify issuer,
audience, scopes, revocation, redirect registration and user isolation against
Google's Connected Apps client. Complete the video and audio billing paths and
atomic approval/charge/queue behavior; apply and test the approval migration in
an isolated database. Test real read and explicitly confirmed write actions with
Gemini, then perform security review before enabling either feature flag.
