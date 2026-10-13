# Image Studio audit — 2026-10-12

Scope: user-supplied IMAGE STUDIO MASTER TASK v1.0. This is an audit of repository code and local tests, not a production certification.

## Checkout and isolation
- Baseline: `30be5a2d96495f67134cad34796ce724a744bd28` (main, PR #57 merged).
- Worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`; branch: `codex/image-studio-v1`.
- Original checkout is detached at `0b931eb7`, with existing untracked `.codex/`; it was left unchanged.
- Remote main was fetched before branching. Active Video Core PR #58 (`claude/video-core-v1-6gh97e`) last inspected at `5434df781e3506bc5d8edabada7a250da120b011`. This work does not change that branch.
- No tracked AGENTS.md, CLAUDE.md or CODEOWNERS in this baseline. File responsibility below is a collision map, not invented ownership.
- PROJECT_MASTER.md, docs/DESIGN.md, image/agent/queue/credits/storage code and existing tests reviewed. This scoped task supersedes the old master file's unrelated whole-product migration instructions.
- Shared-interface proposal approved explicitly by the owner in this chat on 2026-10-12. Approval excludes deploy, merge, paid inference, shared database writes, prices and production configuration.

## Evidence language
PROVEN means a named real test in a stated environment. BUILT means implementation exists. PARTIAL means important pieces are absent. MISSING means no usable implementation found for this requirement. BLOCKED means an external capability or agreement is required. UNVERIFIED means evidence is insufficient. Passing a provider mock never proves live model access or output quality.

## Existing capability matrix

| Capability | Status | Evidence and practical limit |
|---|---|---|
| Text-to-image | BUILT / live UNVERIFIED | `app/api/nanobanana/image/route.ts`, `lib/ai/geminiImage.ts`; historical catalog verification is not a run in this task |
| Google-only selection | PARTIAL | Shared verified catalog exists; current ImageCreatePanel uses legacy provider catalogue and old route |
| Exact prompt | MISSING | Old route trims/truncates, translates, appends style/default enhancement and learned directives |
| Style / aspect / resolution | PARTIAL | Controls exist; Google route does not honor every advertised resolution/model setting |
| Variations and history | PARTIAL | Client-side batch/history exist; no new durable image execution contract |
| Seed / negative prompt / reference strength | UNVERIFIED | No verified strict Google image adapter contract for these controls; must reject unsupported settings |
| Image-to-image / text editing | PARTIAL | Gemini helper accepts reference input; shared storyboard helper drops excess refs and returns null on detailed failures |
| Object addition/removal/replacement, lighting/color | UNVERIFIED | Natural-language generation may express these; no exact-edit guarantee or task-specific visual proof |
| Background replacement / outfit changes | UNVERIFIED | Must verify source roles and actual visual outcome; existing edit-photo route uses forbidden Replicate |
| Mask inpainting / region-specific generative edit | BLOCKED | No verified Google backend mask contract in this repository; deterministic blur/mosaic is a different operation |
| Outpainting | UNVERIFIED | Natural-language reframing is not proof that out-of-frame pixels extend correctly or preserve the subject |
| Upscale / restoration / face enhancement | BLOCKED | Existing `/api/ai/upscale` and edit-photo enhancement paths use Replicate; do not expose them in Google-only Studio |
| Multiple role-mapped references | MISSING | ImageCreatePanel admits one reference; shared Gemini helper slices to three and has no typed roles |
| Character sheet / views / expression / outfit library | MISSING | Can be represented as explicit reference-guided requests; identity accuracy remains unverified |
| Product photography | PARTIAL | Photographer/product prompts exist; exact package/label preservation is not certified |
| Marketing generation | PARTIAL | Existing templates and prompt inputs; automatic enrichment conflicts with exact prompt requirement |
| Exact text / logo composition | BUILT / local regression FAIL | PR #57 deterministic media composition exists; baseline real-FFmpeg tests fail on local FFmpeg 6.0 |
| Quote then human confirmation | MISSING for current image endpoint | Credit deduction happens in old generation route without a signed image quote requirement |
| Central pricing / credit ledger | BUILT | `lib/credits/quote.ts`, `pricing.ts`, `ledger.ts`; image price currently 2 credits/output. No live ledger mutation tested here |
| Durable queue, CAS lease, refund outbox | BUILT for other media | `lib/orchestrator/jobLease.ts`; image lane not registered |
| Image cancel / refresh / orphan recovery | PARTIAL | Old UI abort is not durable provider cancellation; task API has no dedicated image executor |
| Private storage / Library | BUILT with image gaps | Existing completed generation_jobs feed Library; old image route can return a provider URL after save failure |
| Version graph / source preservation | PARTIAL | Existing edits preserve source; new generation/edit references need parent/source IDs in image result metadata |
| Ownership checks | PARTIAL | `callerMedia.ts` checks upload/library ownership but also permits signed-token possession; image face refs need explicit owner verification |
| Upload validation / metadata removal | PARTIAL | Existing upload size/sniff checks; no strict image decode + pixel cap + stripped provider copy in image flow |
| Image QC | MISSING | Old route has no decode/dimensions/format QC before reporting success |
| One Window | BUILT shell / image flow PARTIAL | OmniStudio, ImageDesk, ImageCreatePanel exist. Preserve shell; add image-specific workspace seam |
| Agent G image tools | PARTIAL | Existing image capability routes old flow; no strict quote-only typed tool and durable confirmed execution |
| KA / EN / RU, mobile accessibility | BUILT old UI / new requirements UNVERIFIED | Existing image UI tests use mocks; new flow needs browser and keyboard checks |
| Advanced workflows | EXTENDED SCOPE / UNVERIFIED | Try-on, 3D preparation, layers, fusion, transparency and architecture are not automatically enabled |

## Findings requiring implementation

| ID | Severity | Finding | Planned closure |
|---|---|---|---|
| IMG-01 | High | Old model list / provider path can leave Google boundary | Verified catalog keyed image capability adapter; exact model and transport |
| IMG-02 | High | Prompt silently altered or truncated | Strict input validation and byte-preserved original prompt as its own provider part |
| IMG-03 | High | No signed confirmed image quote | User/job/request/price/expiry-bound quote; confirmation before reserve |
| IMG-04 | High | Short fail-open dedup lock and request-bound inference | Durable idempotent generation_jobs row, CAS lease and persisted dispatch state |
| IMG-05 | High | Storage or Library write may fail while response says success | Private save + QC + durable completed row required for delivery |
| IMG-06 | High | References lack roles and strict private ownership | Stable IDs, explicit roles/order, owner-resolved storage refs; no arbitrary URL |
| IMG-07 | High | Crash retry can duplicate a paid model request | Never retry an ambiguous dispatch automatically; retain uncertainty and reconcile |
| IMG-08 | Medium | Unsupported controls imply capabilities | Capability validation on server; disabled controls with clear reason |
| IMG-09 | Medium | No image output QC or sensitive metadata removal | Decode, dimensions/byte/pixel limits, orientation normalization, stripped provider copy |
| IMG-10 | High | Shared-file collisions with Video Core | Additive agreed seams; no edits to video algorithms or shared storyboard helper |
| IMG-11 | Medium | Existing full regression is red | Pre-existing 18 failures recorded below; no certification until resolved |
| IMG-12 | Medium | Developer runtime initially Node 25 | Node 24.19.0 located and used for subsequent validation |

## Dependency and file responsibility matrix

| Surface | Existing source | Image change |
|---|---|---|
| Core image modules | new `lib/image/studio/**` | Image responsibility; isolated implementation |
| API | new `app/api/image/**` | Existing guard/auth conventions; no middleware rewrite |
| Workspace | `components/studio/OmniStudio.tsx` | Shared and active PR #58 overlap; minimal adapter seam only after approved proposal |
| Agent routing | `lib/agent/{chatTurn,intent,params}.ts`, `lib/chat/studioIntent.ts` | Active Video overlap; avoid broad routing rewrite |
| Agent tools | `lib/agent/tools/**`, `lib/agent/react/bindLiveAgent.ts` | Add quote-only image tool; no ledger mutation by LLM |
| Task recovery | `lib/tasks/taskLive.ts`, `app/api/agent/media/sweep/route.ts` | Add image kind; retain other kinds unchanged |
| Model list / transport | `lib/models/catalog.ts`, `lib/ai/google/transport.ts` | Read-only reuse; operation extension keyed to verified catalog model; no global env change |
| Pricing / ledger / queue | `lib/credits/**`, `lib/orchestrator/jobLease.ts` | Reuse interfaces; no new ledger, no price mutation |
| Storage / Library | upload routes, `lib/storage/**`, `/api/studio/library` | Reuse private bucket + completed rows; image-owned validation/version metadata |
| Shared storyboard / FFmpeg | `lib/ai/geminiImage.ts`, `lib/video/**`, assembly code | No changes in Image Studio task |
| Migrations / navigation / master tracker | existing shared files | No changes without new need and scoped agreement |
| Photographer / interior callers | old image route and template contexts | Inventory before changing old route; new lane must not silently alter them |

## Baseline results

- TypeScript: PASS, `tsc --noEmit --incremental false`, exit 0; initial Node 25.9.0.
- Full Jest: 872 suites; 864 passed, 3 failed, 5 skipped. 13,299 tests; 13,251 passed, 18 failed, 30 skipped. 192.643 seconds. Jest left an open handle after printing its report; process was interrupted after results, exit 130. No application files changed.
- Failing suites: `composition.ffmpeg.test.ts` (16: FFmpeg 6.0 rejects fixture gradient speed=0), `effects.ffmpeg.test.ts` (1 delivery expectation), `ffmpegExec.test.ts` (1 version-dependent stderr expectation: the file is rejected, but text differs).
- Recheck of those three suites on required Node 24.19.0: same 18 failures, 21 passing; confirms these are not cured by runtime correction. Used --forceExit; this does not certify clean async shutdown.
- Lint on Node 24: PASS exit 0 with existing accessibility warnings; full output retained.
- Build on Node 24: PASS exit 0 with dummy local credentials; transient Google Fonts timeouts recovered.
- Browser, real Google inference, live credit mutation, production RLS and deployed storage: NOT RUN. Preview shares production database per master; do not treat it as isolated.
- Dependencies reuse existing installed node_modules by symlink; no dependency files changed. Clean-install reproducibility not claimed.

Evidence: `docs/handoffs/image-studio/evidence/baseline-*`.

## Gate and next action
Isolation and shared integration approval: satisfied. Audit establishes the actual state with explicit failures; it does not mean all baselines are green. Complete build evidence, preserve these pre-existing failures, then implement the approved contracts and image core. Production readiness remains NO. Implementation/AC traceability is in `docs/image-studio/IMPLEMENTATION_PLAN.md`.
