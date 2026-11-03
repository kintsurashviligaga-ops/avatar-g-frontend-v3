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
   The separate staging update was applied to the empty test project, and its
   access controls were checked; a live OAuth link has not yet been verified.
   The update refuses to migrate any pre-existing grants.
2. The local SQL proposal has a durable per-grant revoke state: new refreshes
   are blocked, and an already-claimed refresh can persist encrypted results
   without restoring access. A revoke task is reclaimable only before entering
   `sending`; uncertain network outcomes are never retried automatically.
   Missing/expired access is `no_access`, and ambiguous refresh is `unconfirmed`.
   A crashed refresh may stay `waiting_refresh` until explicitly investigated;
   the schema deliberately does not assume a timed-out refresh was harmless.
   This proposal has not been applied to staging.
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
still a foundation only: no logout worker, outbound remote logout, recovery
monitoring, or required provider-specific integration evidence is implemented.
The proposed initial exchange stores the separately encrypted, verified access
JWT and its verified expiry with the refresh token and session binding. An
immediate local revocation can queue the cached access token for a future worker;
an expired or missing access token still leaves upstream logout unconfirmed.
