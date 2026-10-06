# Migration checkpoint — 2026-10-06

This branch is an IN-PROGRESS checkpoint shared for collaboration, not a production-ready release.
The owner explicitly requested an immediate GitHub push so Claude Code can see these changes.

Latest verification:
- Most recent full run: 624 suites; 599 passed, 25 failed (137 failing assertions). Some fixtures still
  expect retired providers or old credential aliases. The command needed interruption after results
  because of an existing Jest open handle. This is NOT a clean full-suite pass.
- Subsequent image/billing/auth-audit/timed-dubbing run: 10 suites, 86 tests passed.
- TypeScript passed before the latest UI edits; it is being rerun for this checkpoint.
- No deployment, production variable cleanup, SQL migration, paid smoke generation or IAM grant was made.

Cloud facts now verified in the Console:
- Project: gen-lang-client-0671348730 (467145118875), signed in as myavatar.ge@gmail.com.
- Billing credit page: $300 GCP Free Credit available, expires 2026-12-31; billing account is paid.
- Three existing service accounts, all with no keys: vertex-express, default compute, Gemini API key identity.
- Workload Identity Pools shows the Get started screen. Vercel WIF has not been configured.
- Vercel project prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH in team_YGQHjuCUs0f7tKoLtrCgSIFG.

Current work includes shared project-scoped Vertex auth, SDK/REST routing without cross-billing fallback,
Research Interactions and Lyria Vertex adapters, mandatory provider policy, retired adapter no-network
checks, Imagen-only image compatibility, Google timed dubbing transcription, and Gemini voice relay.
Native Vertex Live WebSocket still requires a secure server relay; browser token mint fails closed in Vertex mode.
Image reference editing is unavailable; default Imagen text generation is the implemented path.

Before deployment: finish remaining legacy provider audit and UI/test updates, pass the complete test/build
checks, configure WIF with narrowly scoped project access, and verify real model calls in a preview.
The sections below record the earlier stages and must be read with this checkpoint status.

---

# Vertex migration — phase 2, based on preview commit 8ee92f7

This is a working migration record, not the missing PROJECT_MASTER.md manifest.
The changes are local on `codex/vertex-ai-migration` and have not been deployed.

## Verified environment — 2026-10-05

- GitHub remote: `kintsurashviligaga-ops/avatar-g-frontend-v3`; main is `572d5fac`.
- The owner's URL `avatar-g-frontend-v3-r2hvqxlpp-kintsurashviligaga-ops-projects.vercel.app`
  is a Ready preview of `claude/fix-image-google-redis-voice`, commit `8ee92f763e42c1bd7997aee3f62291027d0d847c`.
- `myavatar.ge` resolves to the older Ready production deployment `dpl_ANGLbd7AGjDQyYHCGk5UJQsrp2Rr`.
- Authorized Vercel CLI inspection succeeds. The Vercel connector account cannot access this team (403).
- Production environment names were inspected without decrypting values: no GCP_* variables,
  GEMINI_TRANSPORT, VEO_TRANSPORT or SANDBOX_API_KEY are present. GEMINI_API_KEY and ELEVENLABS_API_KEY
  are present, as are deprecated provider credentials. No remote variables were changed.
- PROJECT_MASTER.md was not found in accessible local paths, pasted attachments, GitHub code search,
  or any of the 76 refreshed origin refs. Its Part numbering cannot be asserted. The available handoff
  places shared Google transport work in Phase 2 and Live WebSocket work in Phase 3.
- Cloud resources, billing balance and model access remain unverified. Mocked tests do not establish
  live availability or credit eligibility.

## Mandatory provider policy — in progress

The owner's v32 allowlist supersedes legacy optional Google-only flags: Google AI, ElevenLabs TTS/lipsync,
and isolated Sandbox execution only. Video generation must use Veo. Existing infrastructure is separate.
The shared text helper now uses Gemini exclusively, including when old callers pass googleOnly=false;
it retains the budget gate and books only successful Gemini output. Deprecated text SDKs are not loaded.
Canonical Gemini credentials and mandatory policy expectations have regression coverage.

This is not yet repository-wide enforcement. Legacy image/video/music/voice dispatchers, dedicated adapters,
health panels and credential aliases still need migration or explicit retirement. Do not deploy claiming
that all prohibited provider calls have been removed. Production secret cleanup must follow a verified
code cutover so the existing production version is not unexpectedly broken.

## Validation of the current checkpoint

- TypeScript compilation and targeted ESLint checks passed.
- Shared transport/policy/text regression run: 5 suites, 53 tests passed.
- Full suite initially: 603 suites passed, 15 failed; all failures were obsolete policy/alias expectations
  or a public-secret scanner matching a denylist string. Updated expectations assert prohibited calls stay
  disabled, budget refusal prevents generation, and failed calls do not book usage.
- Rerun of all 15 affected suites: 381 tests passed. The original full-run process required interruption
  after results due to an existing open handle; do not treat that command as a clean exit.
- No paid generation, cloud configuration, deployment or production secret mutation was performed.

## Implemented

Set `GEMINI_TRANSPORT=vertex` to select project-scoped Vertex requests. Missing credentials, token exchange
errors and provider errors do not trigger a Gemini Developer API retry. Unset or `gemini` preserves the old
transport; other values are rejected. The shared SDK factory uses `@ai-sdk/google-vertex` and the existing
Vercel WIF/service-account token client. `GOOGLE_VERTEX_API_KEY` cannot select express-mode billing.

The switch covers product/legacy chat, SDK-based intent/personality and script/interior generation,
REST text and multimodal analysis, Gemini images, Imagen, Gemini TTS, audio transcription, memory embeddings,
and the paid admin/system generation probes. Readiness gates on migrated entry points work without a
Developer API key. Vertex embeddings retain `gemini-embedding-001`, SEMANTIC_SIMILARITY and 1536 dimensions;
the request/response is translated to Vertex's `predict` contract.

Cloud Text-to-Speech uses the same OAuth identity, but remains a separate Google Cloud API rather than a
Vertex model. Enable `texttospeech.googleapis.com` and grant the appropriate service permissions if used.

The existing Veo engine is pinned to Vertex for NEW jobs by `GEMINI_TRANSPORT=vertex`, even if a stale
`VEO_TRANSPORT=gemini` remains. Existing video operations keep their original polling transport.

## Remaining before a complete migration

- **Live WebSocket:** the browser currently connects directly using a Gemini ephemeral token. Vertex needs a
  separately hosted, authenticated WebSocket relay (or a verified equivalent constrained-token mechanism).
  A project OAuth bearer token must not be sent to the browser. In Vertex mode the mint route returns
  `503 vertex_live_relay_required`; the existing UI can fall back to the migrated REST voice loop.
- **Deep Research:** the Vertex global Interactions adapter now implements start, poll and cancel using
  project OAuth and the documented `deep-research-preview-04-2026` contract. Each new operation stores a
  private versioned transport/project reference in the existing text column (no SQL migration). Legacy bare
  IDs stay on the Developer API, and Vertex jobs reject a changed project. The create call is never retried
  or sent to a fallback billing transport. A live project smoke test is still required.
- **Lyria:** new Developer API music requests are blocked in Vertex mode. A separate Vertex music contract
  needs implementation and validation. Existing downstream music-provider behavior is unchanged.
- Some legacy non-generation readiness panels still report API-key presence. Use the admin provider probe's
  Vertex configuration result and its separate generation result for this phase; do not infer credit coverage
  from a green key-only panel.

Do not enable this switch in production expecting feature parity until those gaps are accepted or completed.

## Environment for a preview smoke test

```dotenv
GEMINI_TRANSPORT=vertex
GCP_PROJECT_ID=gen-lang-client-0671348730
GCP_GEMINI_LOCATION=global
GCP_PREDICT_LOCATION=us-central1
GCP_VEO_LOCATION=us-central1
VEO_TRANSPORT=vertex
# GCP_VEO_BUCKET=<existing private bucket; required only for Veo>
# GEMINI_TTS_MODEL=gemini-3.8-flash-tts
```

`GCP_GEMINI_LOCATION` defaults to `global`; `GCP_PREDICT_LOCATION` defaults to `us-central1` for Imagen and
embeddings. Gemini auth does not require a Veo bucket. Model env overrides remain supported. The existing
Developer API TTS default is a preview alias: explicitly choose and verify a Vertex-supported TTS model before
cutover, including a Georgian speech check. Image and STT model availability also needs a live project check.

Use either the existing WIF variables:

```text
GCP_PROJECT_NUMBER
GCP_SERVICE_ACCOUNT_EMAIL
GCP_WORKLOAD_IDENTITY_POOL_ID
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
```

or `GCP_SERVICE_ACCOUNT_KEY` (sensitive server-side JSON/base64). Never put credentials in `NEXT_PUBLIC_*`
variables, logs, screenshots, or chat. WIF is preferred. See [VEO_ENGINE.md](VEO_ENGINE.md) for existing roles and
bucket setup. Phase 0 remains owner-controlled as specified in the hand-off.

## Rollout checks

1. Confirm project billing, unexpired trial balance, API enablement, WIF trust and model permissions.
2. Configure a preview deployment and redeploy; env changes require a new deployment.
3. Smoke-test streaming chat + grounding, image, TTS/STT in Georgian, embeddings and an 8-second Veo clip.
4. Verify the Cloud Billing report attributes those calls to this project and applies the intended credit.
5. Complete or explicitly accept the Live/Research/Lyria gaps before production cutover.
6. For an intentional rollback, set `GEMINI_TRANSPORT=gemini` and `VEO_TRANSPORT=gemini`, retain the Developer
   API key, and redeploy. Automatic fallback between billing accounts is intentionally absent.

A paid billing account can continue charging after trial credit is exhausted; only an unupgraded trial account
stops at trial end. Budget alerts are notifications, not spending caps. This migration does not itself guarantee
that any particular request is covered by credits.

## References checked 2026-10-05

- [Gemini 3.8 Flash Vertex global endpoint](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash)
- [Vertex AI SDK provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex)
- [Vertex text embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)
- [Gemini speech generation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview)
- [Vertex Interactions API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/interactions/developer-guide)
- [Vertex Deep Research contract](https://docs.cloud.google.com/gemini-enterprise-agent-platform/agents/use-deep-research)
- [Vertex Interactions lifecycle reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/interactions-api)
- [Google Live WebSocket backend proxy guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/get-started-websocket)
- [Google Cloud trial rules](https://docs.cloud.google.com/free/docs/free-cloud-features)

## Research and Live checkpoint — 2026-10-06

The Research adapter has offline coverage for Vertex start/poll/cancel, transport switches, project changes,
legacy job continuation, credential failures, redirect refusal and the single-submit billing rule. No new
provider credential or SQL migration is required. Vertex's documented Research agent config omits the
Developer API's visualization and collaborative-planning fields; only documented options are sent.

The Live endpoint regression test proves Vertex mode performs no Developer token mint and returns no
project bearer credential. Google's WebSocket guide uses a persistent backend authentication proxy. That
relay still needs provisioning and a real audio session test before native Vertex Live parity can be claimed.
The existing REST voice fallback remains available; it is not native bidirectional Live.
