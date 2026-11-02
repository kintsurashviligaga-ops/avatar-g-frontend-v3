# MCP OAuth broker design — not implemented

## Why a broker is necessary

The current MCP resource server requires its own audience and `mcp:read` or
`mcp:write` permission, then passes the same token to Supabase APIs for RLS.
Supabase's OAuth authorization server currently supports only OIDC identity
scopes; it does not accept custom scopes, and its default access token uses the
`authenticated` audience. Merely changing discovery metadata cannot make it
issue a standards-compliant `mcp:read` grant. Changing the global token hook or
accepting ordinary login tokens is not an adequate substitute.

## Proposed authorization flow

1. Operate a dedicated MyAvatar OAuth 2.1 authorization server, with static
   registration for the Google Connected Apps client and exact registered
   Google redirect URIs. Publish OAuth AS and protected-resource metadata.
   Require authorization code, S256 PKCE, exact resource URI, exact redirect
   URI, state preservation and an explicit set of supported MCP scopes. Do not
   enable dynamic client registration by default.
2. Authenticate the person using the MyAvatar first-party session, then obtain
   an **independent** Supabase delegated OAuth session via a separately
   registered confidential broker client and a second authorization-code/S256
   flow. Bind its OAuth state and PKCE verifier to the pending downstream
   request. Compare the verified upstream token's subject with the MyAvatar
   session; abort if they differ. Never copy or rotate the browser session's
   refresh token: doing so can invalidate the user's active login.
3. Display a first-party consent screen naming the Google client and the exact
   requested MCP scopes, with allow/deny, expiry and revocation information.
   Store the explicit decision and issue an opaque single-use authorization
   code bound to the client, redirect, resource, granted scopes, subject, PKCE
   challenge and short expiry. An existing Supabase identity consent alone is
   not consent to MCP read/write actions.
4. At the broker token endpoint, authenticate the registered Google client,
   atomically consume the authorization code, verify S256, redirect, resource
   and expiration, then issue opaque access and rotating refresh tokens. Return
   only granted scopes. Store only domain-separated token hashes, never the
   bearer values. Prevent replay, and fail closed on mismatches.
5. For each MCP call, hash and resolve the bearer token; check its grant's
   expiry, revocation, resource, client and required action scope. Resolve a
   current Supabase access token from the same grant, verify its signature,
   issuer, subject and upstream broker client, and pass **only that Supabase
   token** to existing user-scoped RLS clients. Do not send the opaque MCP token
   or a service-role key as the user's Supabase credential.

## Durable state and failure behavior

Use dedicated server-only tables, revoked from `anon` and `authenticated`, for
client registrations, pending authorization requests, grants, one-time codes,
access-token hashes, refresh-token hashes and revocations. Sensitive upstream
refresh tokens must be encrypted with a distinct versioned key and authenticated
encryption, binding grant ID, user ID and client ID as associated data. No token,
authorization code, PKCE verifier or client secret belongs in logs.

Code consumption, downstream refresh rotation and revocation must each be a
single database transaction. Bind every record to its parent grant and revoke
the grant on detected refresh replay. Upstream Supabase token refresh must be
serialized per grant across serverless instances. If the process fails after
upstream rotation but before durable persistence, treat the grant as uncertain
and require re-linking rather than replaying an old refresh token indefinitely.
Revocation must invalidate derived access and refresh tokens immediately and
attempt to revoke the upstream grant without logging its token.

The user's paid-generation approval is a separate first-party, expiring,
single-use authorization bound to the exact action and price. MCP `write` scope
or client-provided confirmation cannot substitute for that approval.

## Required verification before enabling

Use an isolated Supabase project and test accounts. Test exact redirect and
resource matching, PKCE failure, wrong client, subject mismatch, concurrent
code redemption, refresh rotation/replay, crash recovery, revocation and
cross-user RLS. Verify the real Google client performs discovery, consent,
token refresh and revoke correctly. Validate user-facing withdrawal and the
separate paid-action confirmation. Only then configure production secrets,
registrations, policies and feature flags.

The `oauth/tokens.ts` module supplies token and PKCE primitives only. It is not
an authorization server, does not persist state and is not wired to production.
