# MCP avatar video: safe queue design (not implemented)

The legacy `/api/video/generate` accepts an `avatar_id` UUID, but it queues
`jobs.type=generate_video` and no consumer for that job type was found in the
repository. It inserts job records and debits credits in separate operations.
It must not be called for a paid MCP action.

`/api/avatar/veo` is an active renderer, but it accepts only curated built-in
avatar image paths, not arbitrary user avatar UUIDs; it is separately gated and
uses a reservation/refund flow around a direct provider submit. Video Director
runs require advancing and do not expose a UUID-to-avatar contract. The Agent G
video queue accepts prompts, not avatar IDs, and its drain is caller-driven.
None is a drop-in implementation of the requested durable UUID-avatar flow.

`/api/video/clip` is an existing direct photo-to-video path: one user-supplied
photo becomes a first frame and two or three can be references, submitted to
Veo or Omni. It submits within the HTTP request and uses the Genjutsu status
route for polling and failure refunds. It does not resolve an avatar UUID,
apply MCP approval, or atomically enqueue and debit a durable MCP job. Reusing
it to animate arbitrary UUID avatars would also need an explicit resolution of
the separate curated-avatar product policy; do not silently bypass that gate.

There is also a long-form state machine with durable scene rows and a tick
endpoint supporting image references, reservation and refund logic. However,
the tick ships disabled by default, has no `vercel.json` cron entry and does not
expose the required owner-verified UUID-avatar or MCP consent contract. Its
actual deployment and provider entitlement have not been established. It is
useful existing machinery to evaluate, not proof of a runnable MCP worker.

Google documents Veo image-to-video and adult-only person generation defaults
([image generation reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-an-image)).
This establishes model capability, not entitlement for the configured project,
consent to use a particular person's image, or permission to change this
product's curated-avatar policy.

## Implementation prerequisites

* Read-only production inspection found `avatars.user_id` (UUID) and
  `avatars.image_url`. The still-unwired `resolveOwnedAvatarInput` handles that
  shape, verifies the owner, and accepts only the user's own object in the
  project's upload bucket. It does not fetch bytes, validate image contents or
  grant consent. Establish an explicitly supported UUID-to-renderable-asset
  mapping and recheck ownership and media at execution time. Do not infer a
  curated face from a UUID or silently broaden the current avatar policy.
* Define an approved provider, feature/plan policy, worker and price using the
  existing Video Core rules. Register a reliable scheduled worker rather than
  assuming a Gemini client will poll the queue. Respect provider spend limits,
  static-IP requirements where applicable, and existing avatar safety gates.
* Read-only production inspection confirmed `profiles.credits_balance`,
  `credit_ledger`, and `deduct_credits_once(uuid, integer, text)`, whose debit
  is idempotent under a balance lock; a ledger trigger updates the balance.
  Confirm all deployment prerequisites and reconciliation behavior before use.
  Legacy video also uses `credits` and `deduct_credits_transaction`; do not mix
  these ledgers or independently debit both for one request.

## Transaction boundary

Use a service-role-only RPC with a fixed search path. In one Postgres
transaction it must lock the approval row and verify pending `approved` state,
expiry, user, OAuth client, exact request fingerprint, supported owned avatar,
and immutable quoted price/version. Lock the chosen balance, invoke the
correct canonical debit (or equivalent locked ledger write) with a unique
reference derived from the approval ID, insert exactly one durable job with a
unique approval ID, and transition approval to consumed. Reject a changed
quote, insufficient funds, or any failed insert by raising an exception so the
entire transaction rolls back. Concurrent callers must return the same job or
an explicit replay, never create two jobs or two charges.

The non-deployable `docs/handoffs/mcp/proposals/video-transaction.sql` and its
isolated Postgres harness demonstrate this boundary with synthetic records.
They do not provide a worker, production migration or provider integration.

Only after commit may a worker claim a job. A lease/CAS must allow one submit,
record provider operation IDs, and handle expiry, cancellation and refunds.
On ambiguous provider submission, never submit again without a provider-side
idempotency guarantee; reconcile or fail/refund according to verified policy.
Refunds must be bounded by the real debit and deduplicated. Protect all queue
and approval writes from user roles; users read only their own job through RLS.

## Required proof before enabling

Run migration tests against an isolated Postgres matching production constraints,
including wrong owner/client/hash, expired approval, insufficient credits,
concurrent double-submit, injected rollback at each transaction step, lost
responses, worker crash/recovery and exactly-once refund. Follow with real
provider E2E using a safe test avatar and explicit user confirmation, verify
the generated asset reaches My Works, and check live queue/sweep and billing
reconciliation. Until then `requestOrExecuteVideo` must stay fail-closed.
