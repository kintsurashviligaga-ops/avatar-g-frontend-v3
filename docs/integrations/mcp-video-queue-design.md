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

## Implementation prerequisites

* Establish the actual production `avatars` schema and an owner-verified,
  explicitly supported UUID-to-renderable-asset mapping. Do not infer a curated
  face from a UUID, and do not enable user-uploaded faces on a provider that
  currently only permits built-in faces. The repository has conflicting
  references to `avatars.owner_id` and `avatars.user_id`; resolve this against
  an isolated copy of the production schema first.
* Define an approved provider, feature/plan policy, worker and price using the
  existing Video Core rules. Register a reliable scheduled worker rather than
  assuming a Gemini client will poll the queue. Respect provider spend limits,
  static-IP requirements where applicable, and existing avatar safety gates.
* Choose the actual source-of-truth ledger. Legacy video uses `credits` and
  `deduct_credits_transaction`, whereas newer generation uses
  `profiles.credits_balance` and `deduct_credits`; they must not be mixed or
  independently debited for a single request.

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
