# Image Studio architecture v1
Approved shared proposal: owner, 2026-10-12. Phase 0: documented in image-studio-phase-0.md.

## Request and provider contract
Strict v1 request (lib/image/studio/contracts.ts): operation, unchanged originalPrompt, explicit instructions, ordered role-tagged references, existing catalog model ID, aspect/resolution/count/locale, optional parentJobId. Unknown fields and excessive text fail; no normalization of user text. Sources are owner-prefixed uploads or owned completed result IDs, never arbitrary or bearer URLs.

Capabilities enrich an existing verified ModelCatalog ID; they cannot enable or verify one. Initial adapter: gemini-3.1-flash-image. Supported shape is a generative request, never a promise of exact identity, unchanged pixels or deterministic upscale. Imagen is unavailable until catalog verification and an adapter exist. Initial core supports one image per job; variations need separate independently settled jobs later. Application cap is four references, not a provider ceiling. Seed, mask, negativePrompt, referenceStrength and transparency requests fail rather than disappearing.

Google's current docs describe generation/editing, multiple reference images and 1K/2K/4K output. These describe the API, not this project's live availability:
https://ai.google.dev/gemini-api/docs/generate-content/image-generation?hl=en
Use the repository's existing generateContent/imageConfig transport contract; do not migrate to a new model or API from documentation alone. Catalog verification timestamp stays historical; operationVerifiedAt is null until real approved verification.

The quote contains every supplementary text part. The provider sees originalPrompt as its own byte-preserved text part, then the visible operation/instructions and explicit reference labels paired with image bytes. No translation, embellishment, random style or fallback. Exact payload is retained privately; public/structured logs never contain prompts, image bytes, signed URLs or credentials.

## Quote and billing
Quote validates model, ownership and image decoder limits, recording normalized reference SHA-256 manifests. It signs user + job + request/transport/manifests fingerprint + central quoteCredits price + expiry through existing signQuote. Quote invokes no paid model and no debit. Start requires explicit confirmation and the identical signed plan; it revalidates policy, then inserts one generation_jobs row under that UUID. Existing insert/CAS provides cross-instance idempotence.

A billing hold blocks workers until central reservation succeeds. Ledger unavailable is fail-closed, even if a generic development helper would allow unbilled compute. Cancellation while reservation is pending must preserve refund debt: a zero balance observed before a late debit is not evidence of settlement. Uncertain reservation remains reconcilable. No change to price tables or SQL.

## Durable execution and recovery
Use service_type=image; params._exec.kind=image-studio-v1. Existing status columns remain pending/processing/completed/failed; image stages are strings and image API progress is null until terminal. No invented percentages.

Worker claims existing lease, heartbeats, rechecks reference manifest, stores exact private payload, persists dispatch marker before model request. Persist returned decodable output under deterministic private job path before completion. Recovery first checks durable output; an ambiguous submitted request is never inferred again automatically. QC/storage retries may reuse stored bytes. If output cannot be recovered, fail as provider_outcome_unknown and settle user credits; actual provider spend remains unknown for reconciliation. A new inference requires a fresh quote and human approval.

Cancellation fences late delivery. Aborting a HTTP request is not proof that the provider stopped computing. Same job can never publish or charge twice. Refund outbox remains on the job if ledger is unavailable.

## Storage and QC
Use existing private renders bucket and existing upload convention, with no schema migration. The generic uploadBufferAndSign helper can create/resize buckets; the image adapter therefore uses the existing storage client in strict mode: assert an existing private bucket, upload/sign only, never mutate bucket configuration. Source originals remain untouched.

Provider copies are decoded under byte and pixel limits, oriented, re-encoded as PNG without EXIF. Output must fully decode, be one raster image of the promised dimensions/aspect and meet byte limits; no provider URL is presented as a saved result. Source/parent/reference/operation/prompt/model/payload hash/output digest metadata lives with the same generation_jobs record. Library reads the completed result through its existing convention.

## Integration and release boundary
New modules and routes first; additive Task API/sweep registration after their core tests. Existing shell/Agent G UI integration is Phase 4, not a second application. The shared proposal authorizes the precise seams; Video PR #58 code, storyboard helper, FFmpeg, central pricing and migrations stay unchanged.

Phase 2 exit needs a real Google call plus isolated storage/ledger proof. Mocks prove code behavior only. No production database, production deploy, paid inference or configuration changes are authorized by this design. Keep release readiness NO until those evidence gates and later UI/security phases pass.
