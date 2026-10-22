# Director pre-POST attempt evidence

The durable Director writes private `submission` evidence into its existing run JSON under the same owner/version CAS as the shot. No table, ledger, credential, migration, public flag or second executor is added.

The engine allocates one Vertex output prefix and snapshots normalized request JSON before input upload and its daily cap reservation. A server-created hook persists `prepared` evidence: schema, transport/model, SHA-256 of that JSON, estimated USD, and Vertex project/location/output prefix. The fingerprint contains no raw prompt, image bytes, signed URL or credentials. A URL fingerprint identifies a locator; it does **not** prove immutable input bytes.

After media preparation and Vertex authentication, each transport calls a second hook with the SHA-256 of the **exact serialized POST body**. The existing store must accept its `posting` transition for the same shot/attempt/version before the single fetch can begin. A storage exception, lost CAS, cancellation, repeated phase, changed identity or detected Vertex configuration drift refuses the POST. Callback failures are sanitized. The output prefix sent to Vertex is the persisted one. Request input objects are cloned before awaiting persistence so a concurrent caller mutation cannot change that snapshot.

An accepted operation still follows the existing ticket CAS and late-ticket retention. Ambiguous acceptance or a stale submitting record remains reconciliation-required: never reconstruct/re-POST from a fingerprint or output prefix, never infer that a user credit refund means Google did not bill. Definite pre-submit refusals still use the existing explicit user decision path; a new authorized attempt clears the previous attempt's evidence. Public run views omit this evidence and tickets.

## Scope and limits

- This is additive evidence for **new durable Director attempts**. Synchronous callers and historical rows can lack a journal. Mixed/old deployed writers cannot be certified by the new code.
- The model/normalized request and Vertex output configuration are selected once for this engine invocation. Final transport payload defaults are evidenced by its exact body hash, not a complete immutable, user-approved manifest. Do not label the prepared hash an approved wire contract.
- Estimated USD is not a reservation/capture receipt or actual Google cost. Existing platform and daily budget guards remain in their original execution path. No account-wide spending cap or cross-run deduplication is introduced.
- Media is still prepared by the existing engine/GCS code. Immutable owned input assets, byte/PCM hashes and a complete frozen configuration/approval receipt are separate remaining work.
- The last CAS fences ownership immediately before fetch; Google does not participate in that transaction. A cancellation after that CAS can race an in-flight POST. Keep the existing conservative unknown-submit policy. No automatic recovery service, provider cancellation, or proof of rejection is added.
- Mandatory pre-publication QA, MAIN24/exact audio, one-time approval/nonces, publication/capture outbox, Vertex Live and paid/hardware certification remain open.

Validation uses mocked fetch/auth/storage and fake provider ports only. Tests exercise evidence before upload/POST, exact body/output prefix, secret omission, caller mutation, configuration drift, persistence refusal/outage, cancellation/version loss, interrupted prepared/posting phases and ambiguous acceptance without a second simulated POST. This document does not authorize paid requests or Production release.
