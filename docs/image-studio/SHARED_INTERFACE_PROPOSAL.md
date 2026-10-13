# Image Studio v1 — Shared Interface Proposal

Status: APPROVED — owner message 2026-10-12 (Phase 1 and Phase 2; exclusions below remain) under the owner's Image Studio task §1.3. No shared production file has been edited.
Date: 2026-10-12 (Asia/Tbilisi)
Baseline: main 30be5a2d96495f67134cad34796ce724a744bd28
Worktree branch: codex/image-studio-v1
Parallel Video Core: PR #58, claude/video-core-v1-6gh97e; observed head 5434df781e3506bc5d8edabada7a250da120b011.

## Decision requested

Approve the bounded integration described here on the Image Studio branch. Approval is for code and local/mocked/isolated tests only. It does not authorize merge, deployment, paid inference, shared database changes, secrets, central credit prices, or Video Core changes.

The existing central workspace, Agent G, Task API and recovery sweep require additive image wiring. Their interfaces are the critical shared dependency. The owner's supplied task explicitly requires a proposal and agreement before that integration. Until agreement, Phase 1 remains open and no dependent production integration is implemented.

## Ownership and collision policy

No tracked AGENTS.md, CLAUDE.md or CODEOWNERS was found at the baseline. File ownership is therefore a working change boundary, not a claim of approval from another engineer.

| Area | Proposed ownership / action |
|---|---|
| New lib/image/studio/**, components/studio/image/**, app/api/image/** and their tests | This Image Studio task |
| docs/image-studio/**, IMAGE_STUDIO_AUDIT.md, docs/handoffs/image-studio* | This task |
| components/studio/create/ImageCreatePanel.tsx, ImageDesk.tsx, ImageResultPane.tsx, imageCreateCopy.ts; lib/studio/imageCreate.ts | Image-only UI changes after dependency audit; existing contracts remain compatible |
| components/studio/OmniStudio.tsx | Actual overlap with Video PR #58. Only an imported ImageWorkspace seam and image-specific event/result fields; no changes to video code. Refresh PR diff before integration |
| lib/agent/chatTurn.ts, intent.ts, params.ts, lib/chat/studioIntent.ts | Actual Video overlap. Do not refactor. Prefer new image command/tool modules; any necessary additive dispatch reviewed against latest Video diff |
| lib/agent/tools/registry.ts + declarations/handlers, lib/agent/capabilities.ts | Add quote-only image tool, human-confirmed action, truthful image capability metadata; model never invokes billing |
| lib/tasks/taskLive.ts, app/api/agent/media/sweep/route.ts | Register image TaskKind and bounded image recovery/refund sweep, without changing existing kinds |
| lib/models/catalog.ts, lib/contracts/modelCatalog.ts | Read existing enabled/verified image entries. Operation details live in image-specific extension keyed by catalog ID; no second model catalog and no automatic model enablement |
| lib/orchestrator/jobLease.ts, ledger.ts, storage-adapter.ts, lib/credits/quote.ts, pricing.ts | Reuse unchanged. No central algorithm, price, ledger or storage replacement |
| Shared Library / upload / API middleware | Reuse read/auth/ownership interfaces. Add image metadata via job params/result. If a shared edit becomes necessary beyond this proposal, stop that edit and submit an amendment |
| lib/ai/geminiImage.ts, FFmpeg, Video Rendering, video routes, Supabase migrations, navigation, PROJECT_MASTER.md | No edits; Gemini image helper is also a storyboard dependency. New strict image adapter uses existing Google transport |

## Contract: draft → quote → confirm

A versioned image-only request contains operation, projectId, revision, parentJobId?, originalPrompt, explicit edit instructions, ordered references {id, role, assetRef}, modelId, aspectRatio, resolution, count, selected style, optional capabilities.

Supported roles: subject, character, face, clothing, pose, style, composition, product, background, color.
No inferred reordering, reference swapping, dropped inputs or silent prompt translation.
Raw prompt remains byte-for-byte in the provider text part. User-selected style/edit constraints and role labels are separate, previewed structured instructions; the effective payload is bound to the quote.
Reject oversized prompt/unsupported settings; never silently slice to fit.

Quote response: version, quoteId/jobId, requestFingerprint, normalized immutable request, actual central credit amount, expiry, capability/identity limitations, signed token.
POST start: quote token + same request + explicit human confirmation. Authenticate user server-side, revalidate capability/ownership/expiry/fingerprint/price, then enqueue exactly once.
Client cost, owner ID and model permission fields are never authoritative.

## Engine and persistence

Use existing generation_jobs, service_type=image, params._exec.kind=image-studio-v1, existing lease/CAS and refund outbox.
Keep coarse job statuses compatible; represent VALIDATING/QUOTED/QC/SAVING as image-domain views or current_stage. Do not add database enum states.
Retain original/effective prompt, ordered role mapping, parent/source links, provider/model/transport, parameters, QC and storage object reference in versioned params/result.
Result has both signed_url and result.url for existing Library compatibility.

One quoted variation is one output job. A count of 2/4 expands into an explicitly priced, stable set of child IDs; no repeat charge for replay. Partial outcomes and settlement shown per child.
Existing central image unit price remains unchanged; unknown real provider cost is null/unverified, never the legacy approximate cost constant.
No automatic paid retry after an ambiguous provider timeout. Persist submitted/response-received/stored state and recover storage/settlement without repeating inference. Reconcile ambiguous inference explicitly.
Cancellation stops delivery and further dispatch; cancelling an HTTP request is not represented as guaranteed provider-side cancellation.

## Provider mapping

Image Studio calls Google directly through lib/ai/google/transport, fixed to the configured transport. Vertex preferred only when configured/authorized; never alter production environment or silently switch billing accounts.
Initially eligible existing entry: gemini-3.1-flash-image (catalog has dated Vertex inference evidence). Re-verify availability before declaring live support.
Imagen has no verifiedAt and a historical project-specific Vertex 404: it remains unavailable until verified.
Do not expose nb/auto, nb/v2, nb/pro reseller IDs or Higgsfield/Replicate paths in the new workspace.
Seed, native negative prompt, masks, alpha output and specialized restoration are disabled unless their exact adapter capability is verified. A natural language request is not proof of pixel-accurate inpainting or face identity.
Documented multi-reference support is not treated as live project proof. MVP cap starts conservatively and is enforced server-side; extra references are refused, never dropped.

## Security and QC

References use owner-checked stored assets, not arbitrary third-party URLs. Possession of a still-valid signed URL is not sufficient proof of ownership for a private face reference.
Use existing upload/sign and verify; image-specific decoder validates byte cap, format, pixel count, dimensions and orientation, strips EXIF for provider/export copies and leaves original unchanged.
Decode generated bytes before success. Check requested size/aspect tolerance, empty/corrupt output, alpha policy; record explicit QC result.
Save in existing private storage; no raw provider URL on save failure. Storage failure enters recoverable state; it is not successful Library persistence.
Semantic checks report estimates/limitations; no 100% identity guarantee and no paid automatic repair loop.

## Proposed endpoint mapping

| Proposed route | Purpose / existing infrastructure |
|---|---|
| POST /api/image/operations/validate | Strict image schema, capability, source ownership |
| GET /api/image/capabilities and /api/image/models | Image operation details over central model catalog; known blockers |
| POST /api/image/jobs/quote | Human-reviewable signed plan, central image pricing, zero inference |
| POST /api/image/jobs | Confirm and enqueue using existing lease store / ledger |
| GET /api/image/jobs/[id] | Owner-scoped job and image metadata; mirrors Task API |
| POST /api/image/jobs/[id]/cancel | Existing CAS/lease cancellation rules |
| GET /api/image/assets/[id]/versions | Owner-scoped parent/source links stored in existing jobs |
| Existing /api/upload/sign, /verify, /api/studio/library, /api/tasks | Reuse rather than duplicate stores |

## One Window seam

ImageWorkspace owns image-only draft/references/quote/result/revisions. OmniStudio passes locale, conversation/project identity, owned attachments and image commands. It receives stable image job/result events.
Quote/Confirm is inline. The real server stage drives indeterminate progress; no elapsed-time percentage.
KA/EN/RU, 44px controls, 16px mobile inputs, keyboard focus, before/after/zoom, same workspace library reuse.
Legacy image generate/edit entry points migrate behind this seam; no bypass of confirmation. Photographer/interior callers of the legacy image route are inventoried before any compatibility change.
Send to Video remains disabled pending a separately agreed asset-transfer contract.

## Acceptance / rollback

All 15 owner E2E scenarios map to IMAGE_STUDIO_IMPLEMENTATION_PLAN.md.
Tests must prove quote tamper rejection, cross-user access refusal, concurrent confirm idempotency, no provider on unsupported/no-confirm/insufficient credit, lease loss, failed refund debt, storage failure and refresh recovery.
Mocked checks are marked mocked; paid provider and real isolated DB checks are separate gates.
Rollback is reverting the Image Studio commits or retaining the existing image entry point before activation. No database rollback needed for the proposed JSONB-only design.
