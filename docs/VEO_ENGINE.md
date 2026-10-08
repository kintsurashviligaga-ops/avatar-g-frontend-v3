# The Google Veo engine — architecture, parameter mapping, module contracts

Status: 2026-09-29. Owner brief: move the video generation service strictly onto Google (Veo on Vertex AI, the Gemini
API until GCP credentials exist), align the parameter panel with what Veo natively does, and put an "Omni" director
in front of Veo that turns a raw idea into Google's documented prompt anatomy.

## 1. What Veo can do (Google docs, fetched 2026-09-29)

| | Veo 3.1 (standard) | Veo 3.1 Fast | Veo 3.1 Lite |
|---|---|---|---|
| Vertex id (GA unless noted) | `veo-3.1-generate-001` | `veo-3.1-fast-generate-001` | `veo-3.1-lite-generate-001` (Preview) |
| Gemini API id (Preview) | `veo-3.1-generate-preview` | `veo-3.1-fast-generate-preview` | `veo-3.1-lite-generate-preview` |
| Aspect | 16:9, 9:16 | 16:9, 9:16 | 16:9, 9:16 |
| Duration | 4, 6, 8 s | 4, 6, 8 s | 4, 6, 8 s |
| Resolution | 720p, 1080p (8 s), 4k (8 s) | 720p, 1080p (8 s), 4k (8 s, Gemini) | 720p, 1080p (8 s) |
| First frame / last frame | yes / yes | yes / yes | yes / yes |
| Asset reference images | ≤3, 8 s | ≤3, 8 s | no |
| Native audio | yes (Vertex: `generateAudio` toggle; Gemini: always on) | yes | yes |
| $/s with audio (720p·1080p / 4k) | 0.40 / 0.60 | 0.10·0.12 / 0.30 | 0.05·0.08 / — |
| $/s video-only (Vertex) | 0.20 / 0.40 | 0.08·0.10 / 0.25 | 0.03·0.05 / — |

- Veo on Vertex runs in **us-central1 only**. REST host `https://us-central1-aiplatform.googleapis.com/v1`.
- Submit `…/publishers/google/models/{MODEL}:predictLongRunning`; poll `…/{MODEL}:fetchPredictOperation {operationName}`.
- `storageUri: gs://…` makes Vertex write `…/sample_N.mp4` into our bucket; without it bytes come back inline.
- Gemini API: `POST /v1beta/models/{MODEL}:predictLongRunning` (header `x-goog-api-key`), poll `GET /v1beta/{operation}`,
  output is a Files-API URI kept **2 days**, downloadable only with the key.
- There is **no transition parameter and no motion-vector input**. Camera motion is prompt language (the documented
  vocabulary below). Vertex's `instances[].cameraControl` enum (`fixed, pan_left, pan_right, tilt_up, tilt_down,
  truck_left, truck_right, pedestal_up, pedestal_down, push_in, pull_out`) exists in the REST schema only, requires an
  `image`, and is undocumented for Veo 3.x — it ships **opt-in** (`VEO_NATIVE_CAMERA_CONTROL=1`).
- `predictLongRunning` has **no idempotency key**. A timed-out or 5xx submit may already be a billed job: the engine
  classifies it `ambiguous` and it is **never re-POSTed** (owner rule).

Sources: ai.google.dev/gemini-api/docs/veo · docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate ·
…/models/video/{generate-videos-from-text, generate-videos-from-an-image, generate-videos-from-first-and-last-frames,
generate-videos-from-references, extend-videos, best-practice, video-gen-prompt-guide} · …/reference/rest/Shared.Types/
{VideoGenerationModelInstance, VideoGenerationModelParams} · vercel.com/docs/oidc/gcp · cloud storage signed-URL docs.

## 2. Every panel parameter → what it does in Veo

| Panel control | Veo mapping | Kind |
|---|---|---|
| Format 9:16 / 16:9 | `parameters.aspectRatio` | native |
| Format 1:1 / 4:5 | rendered at a native ratio (1:1 → 16:9, 4:5 → 9:16), prompt carries a centred-framing hint, cropped in post | post |
| Length 8 / 24 / 48 s | 1 / 3 / 6 clips × `durationSeconds: 8`, stitched | native + orchestration |
| Quality (Standard / Fast) | model id (tier) | native |
| Resolution | `parameters.resolution` — 1080p when the clip is 8 s, 720p otherwise (contract) | native |
| Scene text | `instances.prompt` via the prompt compiler | prompt |
| Camera move + intensity | Google's documented movement phrase + speed adverb; `cameraControl` when opted in and a first frame exists | prompt (+ native opt-in) |
| Shot size / angle / lens | documented vocabulary in the prompt | prompt |
| Character photos — first frame | `instances.image` per scene (animate from the approved frame) | native |
| Character photos — reference | `instances.referenceImages[{referenceType:'asset'}]` ≤3 (forces 8 s, not Lite) | native |
| Dialogue lines | `Speaker says: line` in the prompt (Vertex best practice: colon, no quotes) | prompt → native audio |
| Veo sound on/off | `parameters.generateAudio` (Vertex; the Gemini API is always on) | native |
| Transition Cut / Crossfade / Dissolve / Fade to black | ffmpeg join between clips | post |
| Seed lock | `parameters.seed`, identical across scenes | native |
| Negative prompt | `parameters.negativePrompt` (nouns, never "no …") | native |
| Music bed, narration, lip-sync, ducking | the existing post-production audio lanes | post |

Removed because they never reached the render or promised what the pipeline cannot do: the "engine" choice (it was a
constant; any Veo miss silently rendered on Runway/Kling/LTX), Zoom/Slide transitions (the assembler replaced them
with crossfade/dissolve on every multi-clip film), and camera "pan" chips that were really dolly/arc prose.

## 3. Transport selection

`engine.veoTransport()`: **vertex** when `vertexConfig()` is complete and `VEO_TRANSPORT` is not `gemini`; else **gemini**
when a Gemini key exists and `GEMINI_VEO_ENABLED` is not off; else none. Transport of an existing operation is
recoverable from its name (`projects/…` = Vertex, `models/…` = Gemini), so in-flight tokens keep polling across a
switch. The engine string stays `gemini-veo` (double-voice guard, task-ref allowlist, provider badge depend on it).

Google-only: `VIDEO_GOOGLE_ONLY` (default ON; `0` restores the old Runway/Kling/LTX fallbacks) makes a Veo miss a
Veo failure — surfaced honestly and refunded by the existing per-leg rollback — instead of a silent non-Google clip.

## 4. Environment

| Variable | Purpose |
|---|---|
| `VEO_TRANSPORT` | `vertex` \| `gemini` \| unset (auto) |
| `GCP_PROJECT_ID` | Vertex project id |
| `GCP_VEO_LOCATION` | default `us-central1` |
| `GCP_VEO_BUCKET` | `gs://bucket[/prefix]` for Veo outputs and uploaded inputs |
| `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | keyless auth: Vercel OIDC → GCP STS → service-account impersonation (recommended) |
| `GCP_SERVICE_ACCOUNT_KEY` | alternative: base64 of a service-account JSON key |
| `GEMINI_TRANSPORT` | every non-Veo Google call (`lib/ai/google/transport`): unset / `gemini_api` = the API key (today), `vertex` = the same project + Workload Identity as above, no bucket; anything else fails closed |
| `GCP_GEMINI_LOCATION` | Gemini on Vertex, default `global` (Gemini 3.x, `gemini-3.1-flash-image`, Lyria 3 answered there in the Part 0 T2 test) |
| `VEO_MODEL_STANDARD` / `VEO_MODEL_FAST` / `VEO_MODEL_LITE` | override model ids (the -001 ids list retirement "November 17, 2026 or later") |
| `GEMINI_VEO_MODEL`, `GEMINI_VEO_RESOLUTION`, `GEMINI_VEO_ENABLED` | Gemini-API transport (unchanged) |
| `VEO_NATIVE_CAMERA_CONTROL` | `1` sends Vertex `cameraControl` with a first frame |
| `VEO_VERTEX_PERSON_GENERATION` | default `allow_adult` |
| `VIDEO_GOOGLE_ONLY` | default on |
| `FILM_ALLOW_ANONYMOUS` | default **off**: every paid generation (film, chat image/video/music/avatar, storyboard, remix) needs a session — `lib/auth/generationGate.ts` |
| `DAILY_COST_LIMIT` / `MONTHLY_COST_LIMIT` | budget guard ceilings in USD (defaults $10 / $300); Google-only clips are priced at the real Veo rate |
| `BILLING_GUARD_FAIL_CLOSED` | `1` refuses paid calls while the guard cannot read spend (default fails open) |
| `GEMINI_PROBE_MODEL` | the model the admin provider probe spends one token on to prove the prepaid balance (default `gemini-2.5-flash`) |

Setup runbook: `docs/VEO_VERTEX_SETUP.md`.

## 4a. Cost protection (what stands between the key and a drain)

1. **Sign-in.** `orchestrate()` refuses every paid branch for an anonymous caller; `/api/film/storyboard`,
   `/api/pipeline/remix` and the other paid routes check the session themselves. The studio stops a guest earlier
   (`myavatar:auth-required`); the server gate is what stops a direct POST.
2. **Credits.** A chat video clip costs the studio's 8 s price (25 credits), checked before the render and charged
   on the successful poll; a pipeline remix costs `remix_video`, charged once the re-cut is delivered.
3. **Budget guard.** `ServiceManager.execute` prices a Google-only clip at `costPerSecondUsd(model, resolution,
   audio, transport)` for the seconds Veo actually renders (4 / 6 / 8, never the caller's number) and stops at
   `DAILY_COST_LIMIT`. Storyboard frames on Gemini image are inside the same envelope.
4. **Free film.** A new account's free film renders on Veo Fast at most — it is paid by the platform.
5. **Refunds.** Composite refunds pay back what the ledger shows was debited under the leg's ref
   (`refundDebitByRef`), never a forecast — a GEL forecast refunded through `credit_wallet_gel` minted ×10 credits.

## 5. Module contracts (lib/veo/)

All modules import types from `lib/veo/types.ts`. Server-only modules never log secrets, tokens, signed URLs or base64.

### capabilities.ts
- `VEO_MODELS`: catalogue keyed by model id → `{ id, tier, transport, status: 'ga'|'preview', durations, aspects,
  resolutions (with the 8 s rule), maxReferenceImages, supportsLastFrame, supportsAudioToggle (vertex only),
  pricePerSecondUsd: { audio: {'720p','1080p','4k'?}, videoOnly?: {...} } }` — the table in §1.
- `resolveModel(transport, tier): string` — env overrides (`VEO_MODEL_STANDARD|FAST|LITE`) first; for the Gemini
  transport and tier `standard`, `GEMINI_VEO_MODEL` keeps working; defaults per §1. Unknown ids resolve to the
  capability profile of their tier.
- `capsFor(modelId)`.
- `nativeAspectFor(format: OutputFormat): VeoAspect` — 9:16→9:16, 16:9→16:9, 4:5→9:16, 1:1→16:9.
- `framingHintFor(format: OutputFormat): string | null` — for 1:1 / 4:5 an English clause asking to keep the subject
  centred with safe margins for a square / 4:5 crop; null for native formats.
- `normalizeClipRequest(input: Partial<VeoClipRequest> & {prompt, aspect}, modelId): { request: VeoClipRequest; adjustments: ClipAdjustment[] }`
  rules, in order: tier from the model; duration snapped to the nearest allowed {4,6,8} (ties up); reference images
  → drop when the model has none (Lite), cap at 3, force 8 s, and drop startImage/lastFrame (exclusive); lastFrame
  without startImage → dropped; resolution: 4k only where supported else 1080p; any resolution above 720p requires
  8 s → if duration < 8 the duration is kept and resolution becomes 720p; generateAudio=false only when the transport
  supports the toggle; cameraControl only with startImage; seed coerced to uint32. Every change pushes a
  `ClipAdjustment` with a human reason.
- `costPerSecondUsd(modelId, resolution, audio)`, `estimateClipCostUsd(request, modelId)`.

### cinematography.ts
- `CAMERA_MOVES`, `SHOT_SIZES`, `CAMERA_ANGLES`, `LENS_LOOKS` — ordered option lists with `{ id, ka, en, phrase }` for the UI.
- `speedAdverb(intensity)` — 1–3 "slow", 4–6 "" (neutral: 5 adds nothing), 7–8 "brisk", 9–10 "fast".
- `cameraPhrase(spec: CameraSpec): string` — Google's documented vocabulary: static shot; pan left/right (rotate);
  tilt up/down; dolly in/out = push_in/pull_out (physically move); truck left/right; pedestal up/down; zoom in/out
  (focal length, "different from a dolly"); orbit = arc shot around the subject; crane up/down; aerial drone shot;
  handheld. Combines shot size + angle + lens + move + speed into one clause; 'auto' parts contribute nothing.
- `nativeCameraControl(move): VertexCameraControl | undefined` — static→fixed, pan/tilt/truck/pedestal direct,
  push_in/zoom_in→push_in, pull_out/zoom_out→pull_out, others undefined.
- `motionVector(spec): MotionVector` — the structured description (see types) of the move at that intensity.

### promptCompiler.ts
- `compileShotPrompt(shot: ShotSpec, opts?: { maxChars?: number; framingHint?: string | null; styleGuide?: string }): { prompt: string; negativePrompt?: string; sections: Record<string,string> }`
  Order (Google's anatomy): Subject + Action (or, when `hasStartImage`, "The subject …" motion-only — do not re-describe
  subject/background/lighting), Setting, Camera (cameraPhrase), Lens/Lighting/Style/Mood, framing hint, Audio (one
  sentence each: `Speaker says: line` — colon, no quotation marks; SFX; ambience). Clamp to `maxChars` (default
  1800) by dropping the lowest-priority sections first (mood → style → lighting → ambience/sfx → setting) — never
  subject, action, camera or dialogue.
- `normalizeNegativePrompt(raw, style?)` — comma list of nouns; strips "no ", "don't", "avoid", "without"; de-dupes;
  removes terms that contradict the chosen style (Anime ⇏ "anime, cartoon, illustration"; Neon/Cyberpunk ⇏ "neon glow";
  Vintage ⇏ "sepia"; Noir ⇏ "monochrome"); ≤ 800 chars cut on a comma.
- `dialogueLanguageWarning(lines): string | null` — non-English lines note that Veo speech is evaluated for English.

### payload.ts
- `buildVertexPayload(req: VeoClipRequest, opts: { storageUri?: string; personGeneration?: PersonGeneration }): { instances: [...]; parameters: {...} }`
  Instance: `prompt`, `image {gcsUri|bytesBase64Encoded, mimeType}`, `lastFrame`, `referenceImages[{image, referenceType:'asset'}]`,
  `cameraControl`. Parameters: `aspectRatio, durationSeconds, resolution, sampleCount: 1, seed?, negativePrompt?,
  personGeneration, generateAudio, enhancePrompt? (sent only when true: Veo 3.x fails the operation on an explicit false), storageUri?`. `VeoMedia` `url` kind is NOT allowed
  here (caller must upload to GCS or inline first) → throws `VeoPayloadError`.
- `buildGeminiPayload(req: VeoClipRequest): {...}` — the production-proven shape: `image {bytesBase64Encoded, mimeType}`
  (live-probed 2026-07-25: `inlineData` → 400), `personGeneration: 'allow_all'` (live-probed: others → 400),
  `aspectRatio, resolution, durationSeconds, seed?, negativePrompt?`; `lastFrame`/`referenceImages` use the same image
  shape; no `generateAudio`/`enhancePrompt`/`storageUri`/`cameraControl` (not on this API).
- Both validate the exclusivity rules and throw `VeoPayloadError` (exported class) on a violation.

### vertexAuth.ts
- `vertexConfig(): VertexConfig | null` — from env (§4); null unless project, bucket and one auth mode are complete.
- `getVertexAuthClient()` — google-auth-library: WIF via `ExternalAccountClient.fromJSON({ type:'external_account',
  audience:'//iam.googleapis.com/projects/NUM/locations/global/workloadIdentityPools/POOL/providers/PROVIDER',
  subject_token_type:'urn:ietf:params:oauth:token-type:jwt', token_url:'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/EMAIL:generateAccessToken',
  subject_token_supplier:{ getSubjectToken: () => getVercelOidcToken() } })` (from `@vercel/oidc`, called lazily per
  token fetch — never at module scope), or a `JWT` from the decoded key JSON; scope `cloud-platform`. One client per
  warm instance.
- `getVertexAccessToken(): Promise<string>`.

### gcs.ts
- `parseGsUri(uri)`, `toGsUri(bucket, path)`.
- `veoOutputPrefix(sessionId, ordinal): string` — `gs://BUCKET/[prefix/]veo/{session}/{ordinal}-{rand}/`.
- `uploadVeoInput(media: VeoMedia | string (data: or https URL), opts: { sessionId }): Promise<VeoMedia & {kind:'gcs'}>`
  — https fetch guarded by `isPublicHttpUrl` (lib/security) + 20 MB cap + image/jpeg|png only; writes `inputs/{session}/…`.
- `signedReadUrl(gsUri, ttlSec = 3600): Promise<string>` — V4, ≤ 604800 s; WIF signs through IAM signBlob.
- Uses `@google-cloud/storage` with the auth client from vertexAuth.

### vertexClient.ts / geminiTransport.ts / engine.ts
- `submitVertexVeo(req, cfg): Promise<VeoCreateOutcome>`; `pollVertexVeo(operationName): Promise<VeoPollOutcome>`.
- `submitGeminiVeo(req): Promise<VeoCreateOutcome>`; `pollGeminiVeo(operationName)`; `downloadGeminiVideo(uri)` —
  header auth only (`x-goog-api-key`), never `?key=`.
- Classification (both): 400 → invalid_request (safety wording → safety); 401/403 → auth; 402 / billing wording →
  quota; 429 → rate_limited (retryable); 503 → unavailable (retryable); timeout / network / 500 / 502 / 504 →
  ambiguous (NOT retryable). No function re-POSTs a submit.
- Poll: not done → processing; done+error → failed (safety codes → filtered); videos → succeeded; done, no video,
  `raiMediaFilteredCount > 0` → filtered; a poll HTTP 404 on a Gemini op older than its 2-day retention → failed.
- `engine.veoTransport()`, `engine.transportOf(operationName)`, `engine.createVeoClip(req, ctx)` (uploads url/bytes
  inputs to GCS for Vertex), `engine.pollVeoClip(operationName)`, `engine.deliverableUrl(video)` (Vertex → signed URL;
  Gemini → caller downloads with the key).
