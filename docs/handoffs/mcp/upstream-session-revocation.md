# Upstream session revocation: blocked pending isolation and race controls

The broker currently revokes its own downstream grant only. It must not invoke
Supabase global sign-out or `oauth.revokeGrant(clientId)`: the latter can revoke
other sessions for the same OAuth client. Supabase access JWTs can remain valid
until expiry after sign-out.

The GoTrue logout implementation has a consequential fallback: if the current
session is absent from its request context, it executes global logout even when
the requested scope is `local`. A missing `session_id` must therefore never be
treated as a safe candidate for logout. References: [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout),
[OAuth grant revocation](https://supabase.com/docs/reference/javascript/oauth-server-revokegrant),
[logout implementation](https://github.com/supabase/auth/blob/master/internal/api/logout.go),
[JWT session IDs](https://supabase.com/docs/guides/auth/sessions).

Before wiring any upstream logout, the implementation needs all of the following:

1. The local proposal now verifies signed upstream and browser JWTs, rejects
   absent, malformed, equal or unverifiable session IDs, persists the upstream
   ID atomically with the grant, and checks the same ID after refresh. A unique
   immutable binding prevents different grants sharing one upstream session.
   This has not yet been applied or verified against the live staging service;
   the separate staging update refuses to migrate any pre-existing grants.
2. Add a durable per-grant revoke state that prevents new uses immediately and
   coordinates with in-flight refresh. A refresh already in progress must be
   able to persist its result encrypted for the revoke worker without reviving
   the grant. A crash or ambiguous rotation stays blocked and must be surfaced
   as upstream revocation unconfirmed; never replay the old refresh token.
3. Establish, through isolated integration tests against the deployed Supabase
   Auth version, that a verified OAuth JWT's local logout targets only its
   session, including a missing/deleted session, concurrent refresh, timeout,
   retry and already-revoked cases. Until then, do not issue logout at all.
   Never assume an HTTP timeout means the operation failed or blindly retry it.
4. Verify that other browser/device sessions and other broker grants remain
   active; independently prove the target refresh token cannot be reused. Mark
   unconfirmed outcomes honestly rather than reporting upstream revocation.

`verifyUpstreamIdentity` verifies the upstream signature, issuer, audience,
OAuth client, subject, expiry and a syntactically valid `session_id`. This is
still a foundation only: remote session revocation, its race coordination, and
the required provider-specific integration evidence are not implemented.
