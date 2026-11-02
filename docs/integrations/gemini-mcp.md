# Gemini MCP bootstrap

`POST /api/mcp/gemini` is a stateless MCP Streamable HTTP endpoint for a
Vercel Node.js function. It is disabled unless `MCP_GEMINI_ENABLED=true`.
It uses the official MCP TypeScript SDK; no `@google/genai` dependency is
needed for this endpoint. If a browser sends an `Origin`, it must match
`MCP_ALLOWED_ORIGINS` (comma-separated; defaults to the two MyAvatar origins).

This is a **bootstrap, not a complete Gemini Connected Apps integration**.
Its temporary token mode accepts a Supabase user access token in an explicit
Bearer header, validates it using Supabase Auth, and uses the user's token and
RLS for library data. It does not provide OAuth authorization-server discovery,
consent, authorization code/PKCE, or MCP-specific token audience and scopes.
Do not enable it for external clients until a resource-bound delegated OAuth
flow and appropriate access policies are implemented and independently tested.
Never use a service-role token or a shared API key as a user's bearer token.

The tools are:

* `chat_with_agent`: authenticated Agent G personality response; subject to
  the existing per-user chat rate limit and model availability.
* `get_recent_works`: returns owner-filtered metadata for recent completed
  generation jobs. Asset URLs, pagination and the full library normalization
  are not yet provided.
* `create_generation_task`: exposes the intended schema but **always fails
  closed**. A model-supplied confirmation flag is not evidence of a user's
  approval. Before enabling paid generation, implement a first-party user
  confirmation flow and durable, one-time, principal-and-arguments-bound
  approval, then invoke the existing ownership, billing and job pipeline.

## Production work remaining

1. Configure a trusted OAuth authorization server, consent and a registered
   Google client, publish protected-resource metadata, validate issuer, expiry,
   audience, client, scopes and principal, and test revocation and isolation.
   Supabase OAuth Server is a possible option, but its documented scopes and
   ordinary user-token audience need a deliberate resource-server design.
2. Build and test the first-party approval flow and call the existing video and
   audio generation services only after an atomic one-time approval is consumed.
3. Return the user's actual accessible assets through the canonical library
   logic and test account isolation and signed URL behavior.
4. Connect and test with Gemini's development tools and actual users before
   enabling or claiming production compatibility.

No QuotaGuard configuration or proxy routing is present in the existing app.
These adapters call existing application code and Supabase, not an arbitrary
outbound microservice. If a specific provider later requires a static IP, route
only that allowlisted provider through the existing approved proxy arrangement;
do not forward bearer credentials to arbitrary hosts.
