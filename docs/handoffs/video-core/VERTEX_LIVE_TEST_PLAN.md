# Video Core v1.0 — Phase 5: live Veo / Vertex readiness WITHOUT paid calls

Status: **audit of the code as it stands (dac6106, branch `claude/video-core-v1-6gh97e`, draft PR #58). Nothing live was
called; the sandbox has no Google credentials and none were sought.** Every "live" item below is a plan GG decides on,
one approval per test, with the exact cost written next to it. Unit evidence: `npx jest lib/veo lib/video/director
app/api/video/director` → **22 suites, 974 / 974 tests passed** (2026-10-12, this sandbox).

## მოკლედ

1. კოდი Vertex-ისთვის კონფიგურირებულია: 8 env ცვლადი (სახელები §1), WIF (Vercel OIDC → STS → SA impersonation), Veo us-central1, bucket `gs://…`, მოდელები `veo-3.1-*-001`.
2. 974/974 unit ტესტი გადის; არც ერთი ფასიანი გამოძახება სანდბოქსიდან არ გაკეთებულა და არ შეიძლება.
3. 29.7 წმ ფილმი = 4 სცენა × 8 წმ (32 წმ native) → 891 კადრი 30 fps-ზე; ანუ **4 Veo PredictLongRunning ოპერაცია**, poll-ები უფასოა.
4. ფასი (კოდის ტარიფით): Fast 1080p ხმით ≈ $3.84 (720p $3.20), Standard ≈ $12.80, Lite ≈ $2.56; მომხმარებელს 100 / 330 / 60 კრედიტი.
5. ერთადერთი გაზომილი წერტილი: 2026-10-08 T1 — 4 წმ Fast 720p კლიპი ≈ $0.40 (inferred; Billing-ით ჯერ არ არის დადასტურებული).
6. უმცირესი უსაფრთხო გეგმა: L1 ერთი 4 წმ smoke კლიპი ($0.40) → L2 2-კადრიანი director run (≈ $1.92) → L3 სრული 29.7 წმ ფილმი (≈ $3.84 Fast + ≈ $0.27 კადრები). ჯამი ≈ **$6.2–6.5**, ყველა Fast-ზე.
7. თითო ტესტი GG-ის ცალკე თანხმობით, ერთხელ; წარუმატებელი კადრი არ მეორდება (V5), timeout/5xx არ იგზავნება ხელახლა.
8. გაჩერების წესი: budget „out-of-pocket $1/თვე" გაფრთხილება ან `[veo] submit … ambiguous` — შემდეგი ფასიანი ნაბიჯი ჩერდება.
9. L2 და L3 ერთი და იმავე admin ანგარიშით ერთდროულად არ გაკეთდება: L2-ს სჭირდება `VIDEO_DIRECTOR_RUNS=admin`, L3-ს (891-კადრიანი კონტრაქტი) — გამორთული.
10. რაც ვერ შემოწმდა: ცოცხალი კვოტა, IAM binding-ები დღეს, მოდელის ხელმისაწვდომობა რეგიონში დღეს, Production-ის `GEMINI_TRANSPORT`/`VEO_TRANSPORT` მნიშვნელობა (§4).

Status legend: **CONFIGURED-IN-CODE** (the code reads/enforces it) · **VERIFIED-BY-UNIT-TEST** (a suite in this repo proves it
offline) · **OWNER-READABLE-ONLY** (only GG's GCP/Vercel account can read it; cited as documented on 2026-10-08) · **UNVERIFIED**.

## 1. Readiness checklist

| # | Item | Status | Evidence (file:line · test) | Limitation |
|---|---|---|---|---|
| 1 | **Vertex configuration — env NAMES.** Veo transport (`vertexConfig`): `GCP_PROJECT_ID` (required, `/^[a-z0-9][a-z0-9.:-]{0,99}$/`), `GCP_VEO_LOCATION` (default `us-central1`, `/^[a-z0-9-]{2,40}$/`), `GCP_VEO_BUCKET` (required; `gs://bucket[/prefix]` or `bucket[/prefix]`), plus ONE auth mode: WIF = `GCP_PROJECT_NUMBER` (`/^\d{1,20}$/`) + `GCP_SERVICE_ACCOUNT_EMAIL` (one `@`, no `/ : ? # % \`) + `GCP_WORKLOAD_IDENTITY_POOL_ID` + `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` (`/^[a-z0-9][a-z0-9-]{2,62}$/`), or `GCP_SERVICE_ACCOUNT_KEY` (raw/base64 JSON, `type` = `service_account`). WIF wins when complete; malformed env → `vertexConfig()` null and `vertexConfigProblems()` names the variables (never values). Gemini transport (`vertexAiConfig`): project + auth only, `GCP_GEMINI_LOCATION` default `global`, no bucket. | VERIFIED-BY-UNIT-TEST | `lib/veo/vertexAuth.ts:26-47` (names, regexes), `:145-196` (`readVertexEnv`), `:199-217`; `lib/veo/vertexAuth.test.ts` 70/70; Preview had 8/8 set on 2026-10-08 (`docs/handoffs/2026-10-08-gcp-part0-report.md` §9.3) | Values in the Vercel Preview env today are not readable from here. |
| 2 | **Auth mode — Preview: WIF via Vercel OIDC.** `ExternalAccountClient.fromJSON` with audience `//iam.googleapis.com/projects/{NUM}/locations/global/workloadIdentityPools/{POOL}/providers/{PROVIDER}`, STS `https://sts.googleapis.com/v1/token`, impersonation `…/serviceAccounts/{EMAIL}:generateAccessToken`, subject token from `@vercel/oidc` `getVercelOidcToken()` with NO audience argument; scope `cloud-platform`; one client per warm instance, rebuilt on a config fingerprint change. Key mode = `JWT` client. **Production: Veo uses the Gemini API key** (`veoTransport()` auto → `gemini` when Vertex is not configured and `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEYS` exists and `GEMINI_VEO_ENABLED` is not off). Non-Veo Google calls follow `GEMINI_TRANSPORT` (`gemini_api`/unset = key; `vertex` = WIF; anything else fails closed). | CONFIGURED-IN-CODE (WIF proven live once, 2026-10-08) | `lib/veo/vertexAuth.ts:227-242, 257-285, 351-363`; `lib/veo/engine.ts:38-58, 70-77`; `lib/orchestrator/gemini-guard.ts:13`; `lib/ai/google/transport.ts:47-52`; Part 0 report §9.7 (`token:ok bucket:ok sign:ok`), §10.4 (Production = API key) | Production's current `VEO_TRANSPORT` / `GEMINI_TRANSPORT` values: UNVERIFIED (documented 2026-10-08 as absent / key). |
| 3 | **Model availability.** `DEFAULT_MODEL_IDS` — vertex: `veo-3.1-generate-001` (standard), `veo-3.1-fast-generate-001` (fast), `veo-3.1-lite-generate-001` (lite); gemini: the `-preview` ids. Overrides `VEO_MODEL_STANDARD` / `VEO_MODEL_FAST` / `VEO_MODEL_LITE` (must match `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`, else ignored); `GEMINI_VEO_MODEL` first for gemini+standard. Unknown ids get their tier's inferred profile. `-001` ids list retirement "November 17, 2026 or later". | CONFIGURED-IN-CODE (Fast proven live once) | `lib/veo/capabilities.ts:85-99, 203-231`; `capabilities.test.ts` 93/93; Part 0 §10.3 lists all three in us-central1 | Whether all three answer in the region TODAY is UNVERIFIED (only Fast was called, once). |
| 4 | **Region.** `VEO_DEFAULT_LOCATION = 'us-central1'`, override `GCP_VEO_LOCATION`; the value becomes the host label `{location}-aiplatform.googleapis.com` and is regex-checked twice (config and operation name). Gemini default `global`. | CONFIGURED-IN-CODE | `lib/veo/vertexAuth.ts:21-24, 152-154`; `lib/veo/vertexClient.ts:41-46, 74-76` | Veo in another region is not offered by the code; Google's region table is as of 2026-09. |
| 5 | **Storage bucket.** `GCP_VEO_BUCKET`; `isValidGcsBucketName`: `/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/` and no `..`; prefix segments `/^[A-Za-z0-9._-]+$/`. Layout: outputs `gs://BUCKET/[prefix/]veo/{session}/{ordinal}-{rand8hex}/` (Vertex appends `…/sample_0.mp4`), inputs `gs://BUCKET/[prefix/]inputs/{session}/{uuid}.{jpg|png}` (≤ 20 MB, JPEG/PNG by magic bytes, `ifGenerationMatch: 0`). Delivery: V4 signed read URL, TTL clamped 60 s … 7 d, default 1 h. | VERIFIED-BY-UNIT-TEST | `lib/veo/vertexAuth.ts:46-52, 105-114`; `lib/veo/gcs.ts:21-26, 101-106, 296-342, 356-372`; `gcs.test.ts` 78/78; object seen live 2026-10-08 (`veo/admin-veo-smoke-…/0-0b0a94b5/…/sample_0.mp4`) | Bucket IAM and lifecycle today: owner-readable only (`gcloud storage buckets get-iam-policy gs://BUCKET`). |
| 6 | **Quota.** The code knows nothing of quota in advance; it classifies the answer: 429 → `rate_limited` (retryable), 402 / billing wording → `quota`, poll error code 8/429 → `rate_limit`. Documented on 2026-10-08: Veo 3.1 (all tiers) **50 req/min** in us-central1; `gemini-3.1-flash-image` **2 req/min**. Budgets on the billing account (read back 2026-10-08): "MyAvatar Vertex test - gross usage" $10/month (50/90/100 %, forecast 100 %); "MyAvatar 300 USD credit guard" $300/year; "MyAvatar out-of-pocket cost - after credits" $1/month (50/100 %). Budgets alert, they do not stop spend. Code-side envelope: `DAILY_COST_LIMIT` $10 / `MONTHLY_COST_LIMIT` $300 defaults, guard fails OPEN unless `BILLING_GUARD_FAIL_CLOSED=1`. | OWNER-READABLE-ONLY (as documented) | `lib/veo/vertexClient.ts:129-142`; `lib/video/director/googleVeoProvider.ts:178-181, 208`; `lib/services/billing/budgetPolicy.ts:24-28`; Part 0 report §10.2 (lines 401-408), §10.3 (414-431) | Owner reads: Console → IAM & Admin → Quotas, filter `aiplatform.googleapis.com` + "veo"; `gcloud billing budgets list --billing-account=<ID>` (as `scripts/gcp/part0-wif.sh:82` audit mode). Not run here. |
| 7 | **Permissions (keyless SA).** What the code exercises: STS token exchange (pool/provider + `roles/iam.workloadIdentityUser` on the SA for the exact Preview `subject`), impersonation (`generateAccessToken`), `aiplatform.endpoints.predict` (custom role `myavatarVeoInvoker`), bucket list/read/write (`roles/storage.objectCreator` + `roles/storage.objectViewer` on the bucket, for the SA and the Vertex AI Service Agent), `iam.serviceAccounts.signBlob` on the SA itself (custom role `myavatarUrlSigner`, needed for V4 signing under WIF). `checkVertexAuth` proves three of them free of charge: `token` → `bucket` (list 1 object) → `sign`. | CONFIGURED-IN-CODE (proven live 2026-10-08 14:21 UTC) | `lib/veo/authCheck.ts:29-70`; `scripts/gcp/preview-auth-check.cjs:74-150`; `scripts/gcp/part0-wif.sh:149-165`; Part 0 report §4.2-4.3, §9.2, §9.7 | IAM bindings TODAY are owner-readable only (`gcloud iam service-accounts get-iam-policy <SA>`, `gcloud projects get-iam-policy <PROJECT>`). The predict permission is proven only by the one live clip. |
| 8 | **Provider adapter flow.** `GoogleVeoProvider.submitShot` → preflight (same `normalizeClipRequest` + `veoWireFields`) → `engine.createClip` (live: `createClipGuarded` inside `guardedCall`) → `createVeoClip`: `veoTransport()` → `resolveModel` → `normalizeClipRequest` → cameraControl gate → `submitViaVertex` (`veoOutputPrefix`, `uploadVeoInput` per media, `submitVertexVeo` — exactly one POST) → ticket `{operationName, metadata}`. `checkShot` → `pollVeoClip` → `pollVertexVeo` (one `fetchPredictOperation`) → on `succeeded` `deliver` → `hostGcsVideo` (`deliverableUrl` = V4 signed URL → download ≤ 256 MB → Supabase `renders/video-director/{board}/{order}-{sha24}.mp4`, 7-day URL; falls back to the GCS signed URL). | VERIFIED-BY-UNIT-TEST | `lib/video/director/googleVeoProvider.ts:287-370, 376-398`; `lib/video/director/server.ts:47-78, 93-112`; `lib/veo/engine.ts:297-311, 333-368, 373-382, 390-393`; `lib/veo/vertexClient.ts:273-336, 361-407`; `lib/veo/deliver.ts:42-63`; suites `googleVeoProvider.test.ts` 56, `engine.test.ts` 88, `vertexClient.test.ts` 82, `deliver.test.ts` 6, `server.test.ts` 8 | All with a fake engine / mocked fetch; the only live run of this exact chain is the smoke (`createVeoClip` → `pollVeoClip` → `deliverableUrl`), not the director. |
| 9 | **Request schema (`buildVertexPayload`).** `instances[0]`: `prompt` (verbatim when `verbatimPrompt`, else trimmed), `image` / `lastFrame` / `referenceImages[{image, referenceType:'asset'}]` as `{gcsUri, mimeType}` or `{bytesBase64Encoded, mimeType}` (a `url` input is refused — the engine uploads it first), `cameraControl` (opt-in, needs `image`). `parameters`: `aspectRatio` 16:9 \| 9:16, `durationSeconds` 4 \| 6 \| 8, `resolution` 720p \| 1080p \| 4k (above 720p only at 8 s), `sampleCount: 1`, `seed?` uint32, `negativePrompt?`, `personGeneration` (request → `VEO_VERTEX_PERSON_GENERATION` → `allow_adult`), `generateAudio` (boolean, always stated), `enhancePrompt` **only when `true`** — never `false`, `storageUri?` `gs://bucket[/prefix]`. **2026-10-08 finding:** an explicit `enhancePrompt: false` fails the whole operation ("Veo 3 prompt enhancement cannot be disabled", operation `71e35314-…`); Google rewrites server-side regardless, so V3 holds on the wire only. | VERIFIED-BY-UNIT-TEST | `lib/veo/payload.ts:58-75, 132-175, 238-288` (enhancePrompt `:281-284`); `payload.test.ts` 119/119; `lib/veo/vertexClient.ts:247-250` | The schema was verified against Google docs 2026-09-29 and one live clip; Google may change it. |
| 10 | **Response schema.** Submit 2xx → `{ name }` must match `projects/P/locations/L/publishers/google/models/M/operations/ID` (each part regex-checked) else `ambiguous`. Poll body `{ done, error?, response? }`: `done !== true` → `processing`; `error` with RAI wording / "Support codes: NNN…" → `filtered` (+ `supportCodes`), other `error` → `failed` (+ `code`); `response.videos[]` `{gcsUri, mimeType}` (storageUri set) or `{bytesBase64Encoded, mimeType}` → `succeeded`; no video + `raiMediaFilteredCount>0` / `raiMediaFilteredReasons` → `filtered`; nothing → `failed`. Any non-2xx / network / unreadable poll → `processing` (caller deadline ends it). | VERIFIED-BY-UNIT-TEST | `lib/veo/vertexClient.ts:46, 63-72, 187-230, 317-335, 341-353, 393-406`; `vertexClient.test.ts` 82/82; live 2026-10-08: `done=true`, `raiMediaFilteredCount=0`, one `gcsUri` | Only the `gcs` variant was seen live. |
| 11 | **Error handling.** `VertexAuthError` codes: `not_configured`, `client_init_failed`, `oidc_unavailable`, `token_failed` (+HTTP status), `no_token`; → `VeoCreateFailure` `not_configured` / `auth` / `rate_limited` (429) / `unavailable` (STS 5xx). Submit HTTP: 402 or billing wording → `quota`; 429 → `rate_limited` (retryable); 400 + API-key wording → `auth`; 400 → `safety` (`isSafetyWording`) else `invalid_request`; 401/403 → `auth`; 503 → `unavailable` (retryable); 500/502/504/408/timeout/network → `ambiguous`, **never re-POSTed**. `ShotError.reason`: `prompt_safety`, `invalid_dimension`, `invalid_duration`, `rate_limit` (also for `quota`), `reference_image_issue`, `seed_conflict`, `veo_internal` (ambiguous, unavailable, poll failures, 10-min wait), `unknown`. **What stops a director run (V5):** the first `{ ok:false }` from the provider → `waiting_for_shot_decision`, later shots never submitted; options `retry` / `edit` / `cancel`, no skip. | VERIFIED-BY-UNIT-TEST | `lib/veo/vertexAuth.ts:54-66`; `lib/veo/vertexClient.ts:84-157, 256-267`; `lib/veo/types.ts:182-205`; `lib/video/director/googleVeoProvider.ts:172-212`; `lib/video/director/director.ts:194-198`; `lib/video/director/run.ts:284-295, 358, 385`; suites `director.test.ts` 20, `run.test.ts` 21 | The RAI regexes match Google's 2026-09/10 wording; new wording would land in `failed`, not `filtered`. |
| 12 | **V1–V6 enforcement** (definitions from `PROJECT_MASTER.md` §B, lines 820-885, as written): see the six rows below. | VERIFIED-BY-UNIT-TEST | — | Enforced on a fake engine; "on a live model" is blocker B1 (`blockers-and-deferred.md`). |
| 12·V1 | **Google engine only** — the only `VideoGenProvider` is `GoogleVeoProvider` (`providerName` `"google_veo"`); no fallback/legacy provider. | VERIFIED-BY-UNIT-TEST | `director.ts:60-65, 115` (class check, not the name); `run.ts:210-215`; `server.ts:119-133` (planner `googleOnly: true`); `lib/veo/policy.ts:14-16` (`VIDEO_GOOGLE_ONLY`, default on) | Studio non-director legs (music, narration) are outside V1's scope. |
| 12·V2 | **Strict storyboard execution** — the LLM only drafts (`approvedByUser: false`); the user's approval freezes a deep-frozen copy; execution strictly by `order`, each shot with its own prompt/reference/seed/duration/aspect/quality; error → stop, user chooses retry/edit/cancel. | VERIFIED-BY-UNIT-TEST | `director.ts:209-216, 218-220, 222-225`; `storyboard.ts:235-244 (freeze), 247-261 (isFrozen), 289-291`; `run.ts:218-249, 416-457`; `app/api/video/director/runs/route.ts:44-48`; `storyboard.test.ts` 33 | A run restored from Supabase is re-validated and re-frozen (`restoreFrozen`, `storyboard.ts:268-278`). |
| 12·V3 | **Direct prompt integration** — `Shot.prompt` → Veo byte-for-byte; no improve/rephrase/translate/trim; enhancement never requested. | VERIFIED-BY-UNIT-TEST | `googleVeoProvider.ts:325-328` (`enhancePrompt: false`, `verbatimPrompt: true`), `:416-422` (wire === prompt, `enhancePrompt` must be false on the wire), `:351-354`; `payload.ts:223-232, 281-284`; `types.ts:155-161` | Holds up to the wire; Google's server-side rewrite is outside the system (PROJECT_MASTER note, 2026-10-08). |
| 12·V4 | **Consistency guarantee** — one character reference, one seed (if set), locked aspect ratio across the shot list; the shot's own value overrides the lock's. | VERIFIED-BY-UNIT-TEST | `googleVeoProvider.ts:295-304` (seed/reference source, aspect must equal `lock.aspectRatio`), `:426-429` (seed and reference count on the wire); `storyboard.ts:66-83, 102-106, 116-123`; `types.ts:59-72` | Style consistency is written into the prompts by the planner, not a Veo field (Veo 3.1 has `asset` references only). |
| 12·V5 | **Error handling per shot** — the eight `ShotError.reason` values; execution halts → `waiting_for_shot_decision`; no silent skip, no auto-fix. | VERIFIED-BY-UNIT-TEST | `types.ts:90-104`; `director.ts:194-198`; `run.ts:284-295, 326-408`; `googleVeoProvider.ts:1-4, 23-24` (never re-submits) | The studio's non-director film path (`filmComposite.ts:420-429`) does retry a `retryable` Veo miss (429/503) up to 4 dispatch attempts — a different, older policy. |
| 12·V6 | **No silent deviation** — no shot skipped/added, no prompt/scene/character changed after freeze, no adaptive behaviour. | VERIFIED-BY-UNIT-TEST | `googleVeoProvider.ts:401-431` (any normalisation adjustment → `ShotError` before spend), `:351-354` (post-submit adjustment → clip discarded); `storyboard.ts:133-174`; `fromStudio.ts:1-12, 41-73`; `payload.ts:1-9` (never "repairs") | — |

## 2. What a 29.7 s film really costs in provider operations

**From the request to native clips** (`lib/video/durationContract.ts:65-74, 115-154`; `lib/video/duration.ts:23-30`): 29.7 s is above one
clip, so `nativeGridSeconds` takes the smallest N ≥ 2 with N × 8 ≥ 29.7 → **4 scenes × 8 s = 32 s native** (`clipSec` 8, `FILM_CLIP_SEC = 8`,
`lib/chat/filmPipeline.ts:60`). `finalFrames = round(29.7 × 30) = 891`, `trimSec = 2.3`, priced at the native 32 s. With 1 s soft
joins the plan becomes 5 × 8 = 40 s stitched to 36 s (5 ops). The assemble route cuts the stitched master to 891 frames and QA
rejects a mismatch (`app/api/video/assemble/route.ts:315-323`; `lib/orchestrator/ffmpeg-assembly.ts:648-663`;
`lib/orchestrator/masterQa.ts:110-118`); measured offline on real ffmpeg: 891/891 (`evidence/t3-film-frame-counts.json`).

**Provider operations for the 4-scene film (cuts):**

| Operation | Count | Paid? | Where |
|---|---|---|---|
| Veo `predictLongRunning` (one per clip, `sampleCount: 1`) | **4** | yes — $/s × 8 s each | `vertexClient.ts:304-311`; `payload.ts:276` |
| `fetchPredictOperation` polls | director: every 5 s, ≤ 120 per clip (10 min cap); studio: browser-driven, every few s | no price line (treated as free) | `googleVeoProvider.ts:231-233`; `vertexClient.ts:377-384` |
| Storyboard frames (one per scene, Google-only path) | 4 (0 in reference mode, or when the board is approved without frames) | yes — `gemini-3.1-flash-image` ≈ $0.067 each (Part 0 T2.2); quota 2 req/min | `app/api/film/storyboard/route.ts:435-452`; `lib/ai/geminiImage.ts:25-27`; `filmComposite.ts:1020-1025` |
| GCS writes: input image per clip (the same reference re-uploaded per clip) + 1 `sample_0.mp4` per clip | 4 + 4 (0 + 4 without a reference) | storage, cents | `engine.ts:303-306`; `gcs.ts:326-337` |
| Signed-URL reads (IAM `signBlob` under WIF) + one download + one Supabase upload per clip | 4 + 4 + 4 | free / Supabase storage | `gcs.ts:356-372`; `deliver.ts:42-63`; `server.ts:81-103` |
| Retries | **director: none** (V5; a failed shot waits for the user; `retry` = a new, separately charged attempt). Studio film path: a `retryable` Veo miss (429/503) only, ≤ 4 dispatch attempts; `ambiguous` is never re-POSTed anywhere. | — | `run.ts:284-295`; `filmComposite.ts:420-429`; `lib/chat/filmClipRetry.ts:35` |

**Cost per clip** (`capabilities.ts:108-119, 460-476`; 8 s shots default to 1080p: `capabilities.ts:261-263, 384-385`):

| Tier (Vertex id) | 8 s · 1080p · audio | 8 s · 720p · audio | 8 s · 1080p · video-only (Vertex) |
|---|---|---|---|
| Standard `veo-3.1-generate-001` | $3.20 | $3.20 | $1.60 |
| Fast `veo-3.1-fast-generate-001` (studio default, `STUDIO_DEFAULT_VEO_TIER`) | $0.96 | $0.80 | $0.80 |
| Lite `veo-3.1-lite-generate-001` | $0.64 | $0.40 | $0.40 |

Measured point: GCP Part 0 T1, 2026-10-08 15:48 UTC — ONE **4 s** Fast 720p clip with audio, 1280×720 h264+AAC, 4.01 s, 638,497 B,
≈ **$0.40 inferred** ($0.10/s × 4), Billing confirmation still pending (Part 0 test plan §6/§8). ⚠️ The task memory says "one 8 s
1280×720 clip ≈ $0.40"; the repo's own evidence says 4 s — at $0.10/s an 8 s Fast 720p clip would be $0.80.

**Scenario table** (USD at the code's published rates; credits per `lib/credits/videoPricing.ts:24, 39, 61-67` — 3.125 credits/s on
Fast, × 0.6 Lite, × 3.3 Standard, rounded up once on the native length; the director's `shotCredits` (`run.ts:154-166`) adds up to the
same film price):

| Scenario | Veo ops | Est. USD (Fast 720p → 1080p) | Est. USD Standard 1080p | Est. USD Lite 1080p | Credits charged (Fast / Standard / Lite) |
|---|---|---|---|---|---|
| L1 — admin smoke, 1 × 4 s Fast 720p audio | 1 | **$0.40** | n/a (smoke is pinned to Fast) | n/a | none — the smoke writes no ledger row (`smoke.ts:9-13`) |
| L2 — director run, 2 × 8 s | 2 | $1.60 → **$1.92** | $6.40 | $1.28 | 50 / 165 / 30 |
| L3 — 29.7 s film, 4 × 8 s (+ 4 frames ≈ $0.27) | 4 | $3.20 → **$3.84** (+$0.27) | $12.80 (+$0.27) | $2.56 (+$0.27) | 100 / 330 / 60 |
| L1 + L2 + L3, all Fast | 7 | **≈ $5.2 – $6.4** (+$0.27 frames) | — | — | 150 (L2+L3) |

Note on the code-side guard: `DAILY_COST_LIMIT` default $10 — L3 on Standard ($12.80) would be refused by `guardedCall` on the first
shot that crosses it (→ `quota` → `ShotError rate_limit`), so a Standard L3 needs an explicit limit change as well as GG's approval.
All three on Fast fit the $10 "Vertex test" monthly budget with the 90 % alert likely firing (≈ $6.4 of $10 is 64 %; with the ≈ $0.51 of
2026-10-08 the month is at ≈ $6.9).

## 3. Smallest safe live test plan — NOT to be executed without GG's approval of the exact cost and scope

Rules for every test: **one approval per test, one run per test**; a submit that answers 429/503 may be re-sent once by hand, a
timeout / 5xx / `ambiguous` never (the job may exist and bill); `filtered` or 4xx ends the test and is written down. **No call is
made from this sandbox** — GG performs every step from the Preview UI or the GCP Console. Preview and Production share one Supabase
project, so L2/L3 debit the admin account's real credit ledger (`NODE_ENV` is `production` on Vercel: `unbilledRenderAllowed()`
is false, `lib/orchestrator/produceBilling.ts:32-34`).

**Common preconditions (Preview env, names only):** `VEO_TRANSPORT=vertex`, `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`,
`GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_VEO_BUCKET`,
`GCP_VEO_LOCATION` (8/8 were set on 2026-10-08); `VIDEO_GOOGLE_ONLY` unset (on); no `GCP_SERVICE_ACCOUNT_KEY`; Vercel OIDC in team
mode. Admin = a user whose verified email is on the admin allowlist or who carries the admin `app_metadata` role (`lib/admin/guard.ts:23-27`).
Since dac6106 this branch builds a Preview again (`vercel.json` buildCommand runs `preview-auth-check.cjs` first), so the build log of
the Preview must show `[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok` before any paid step.

### Test L1 — one 4 s Fast 720p clip via the admin smoke path · expected ops 1 · est. $0.40

- **Path:** `/{locale}/admin/veo-smoke` → `POST /api/admin/veo-smoke {confirm:"paid-test"}` → `submitVeoSmoke()` (Fast, 4 s, 16:9,
  720p, **audio on** — hard-coded; a no-audio variant at $0.32 would need a code change and is not offered) → page polls
  `GET ?op=` every 10 s → 15-minute signed URL. Refuses 409 unless `VEO_TRANSPORT=vertex` and Vertex is ready; admin only (404).
  `app/api/admin/veo-smoke/route.ts:27-47`; `lib/veo/smoke.ts:15-21, 48-68, 78-100`; `app/[locale]/admin/veo-smoke/page.tsx:24`.
- **Steps (GG):** 1) open the page, confirm it shows `veo-3.1-fast-generate-001 · 4 s · 720p · audio · ≈ $0.40 · Transport: vertex (pinned)`;
  2) press the button once, confirm the browser dialog; 3) wait for the clip to play; 4) do not press again.
- **Read afterwards:** Vercel runtime log `[veo] submit transport=vertex model=veo-3.1-fast-generate-001 aspect=16:9 duration=4s
  resolution=720p adjustments=0 → ok op=…` (`engine.ts:283-295`); GCP Monitoring `serviceruntime.googleapis.com/api/request_count`,
  service `aiplatform.googleapis.com`, method `PredictionService.PredictLongRunning` = 1 × 200 under the SA's credential; bucket
  `gs://<BUCKET>/veo/admin-veo-smoke-<ts>/0-<rand>/…/sample_0.mp4`; no ledger row (none is written).
- **Pass:** `state: succeeded`, clip plays, ~4 s, 1280×720; exactly one `PredictLongRunning` in Monitoring.
- **Abort:** any `failed` / `filtered` / `submit_failed` → stop, record the redacted `detail`; the "out-of-pocket $1" budget alert
  at any time → stop everything until GG and Claude have read Billing.

### Test L2 — one director run of a 2-shot storyboard (2 × 8 s) on Preview · expected ops 2 · est. $1.92 (Fast 1080p)

- **Preconditions:** L1 passed; `VIDEO_DIRECTOR_RUNS=admin` in the Preview env (`runServer.ts:29-40`); `SUPABASE_SERVICE_ROLE_KEY`
  present (else 503, `runHttp.ts:31-33`); migration `20261008b_director_runs.sql` applied (it was, 2026-10-08); the admin account
  holds ≥ 50 credits (2 × 25 on Fast; `run.ts:154-166`). Tier Fast in the panel; no reference photo on the first run (a reference
  adds 2 input uploads and forces 8 s — fine, but keep the first run minimal); a seed is optional.
- **Path:** studio Approve → `studioToDirectorStoryboard` → `POST /api/video/director/runs` (freeze, 201) → the overlay calls
  `POST …/runs/{id}/advance` every few seconds: claim → charge 25 credits under `director:<run>:shot:0:a1` → ONE `createClip` → poll …
  → deliver to Supabase `renders/video-director/…` → shot 2 the same. `components/studio/OmniStudio.tsx:12228-12237`;
  `components/studio/video/DirectorRunOverlay.tsx:81, 104, 132`; `run.ts:326-396`; `server.ts:47-78` (inside `guardedCall`).
- **Steps (GG):** 1) in the studio build a 2-scene board (two short English prompts, 16:9, Fast); 2) Approve once; 3) keep the tab
  open until "All shots are ready"; 4) do not press Retry unless the error says `rate_limit` / `veo_internal` with "Nothing was rendered".
- **Read afterwards:** Vercel log — two `[veo] submit … → ok op=…` lines, model `veo-3.1-fast-generate-001`, `duration=8s
  resolution=1080p adjustments=0`; Monitoring — `PredictLongRunning` 200 × 2; bucket — `veo/director-<runId>/1-…/` and `2-…/`;
  Supabase `director_runs` row `state=completed`, `record.shots[*].charged=25`, `refunded=false`; ledger — two debits of 25 with
  refs `director:<run>:shot:0:a1`, `director:<run>:shot:1:a1`, no refunds.
- **Pass:** both clips play; the run's `metadata` says `transport: vertex`, `seedSource` as set; Monitoring count = 2;
  credits −50 exactly.
- **Abort:** the first `waiting_for_shot_decision` → choose `cancel` (the failed attempt is refunded, `run.ts:284-295`), record the
  `ShotError`; an `ambiguous` message ("may still render (and bill)") → cancel and check Monitoring/bucket before anything else.

### Test L3 — the full 29.7 s film once · expected ops 4 · est. $3.84 Fast 1080p (+ ≈ $0.27 frames)

- **Preconditions:** L2 passed; **`VIDEO_DIRECTOR_RUNS` unset/off** — the director run renders clips only and never assembles
  (`DirectorRunOverlay.tsx:195`), while the 891-frame contract lives on the film path (`filmStudioClient.ts:197-199, 635` →
  `/api/video/assemble` with `finalDurationSec`). The two paths are mutually exclusive for the same admin account, so L3 needs a Preview
  env change after L2. Panel: length typed as 29.7 (plan shows "Requested 29.7 s · Rendered 32 s (4 × 8 s) · Final 29.7 s (891 frames,
  2.3 s trimmed)"), Fast, cuts between scenes (soft joins = 5 ops), music and narration OFF (those legs are not Veo and are outside
  this audit), reference mode "first frame" with the board's frames or no photo at all; ≥ 100 credits.
- **Path:** storyboard (4 frames on `gemini-3.1-flash-image` through `GEMINI_TRANSPORT`; with the 2 req/min quota some tiles may come
  back empty — that is fail-open, not an error) → Approve → `filmComposite` dispatches 4 clips (`ServiceManager` → `createVeoClip`,
  `lib/chat/ServiceManager.ts:1145-1164`) → studio polls task-refs → assemble → final cut 32 → 29.7 s → QA frame count.
- **Read afterwards:** four `[veo] submit … → ok` lines; Monitoring `PredictLongRunning` = 4 (5 with soft joins); bucket
  `veo/<sessionId>/0-…/` … `3-…/`; `[assemble] final cut: master 32s → final 29.7s (891 frames at 30 fps, 2.3s trimmed)` and
  `[assemble] frame-exact QC: 891 / 891 frames at 30 fps` (`ffmpeg-assembly.ts:498, 651`); ledger — one film debit of 100 credits.
- **Pass:** QA `pass`, `frame_count_mismatch` absent, delivered file 29.7 s at 30 fps, 4 clips of 8 s in the master; cost on the
  Vertex SKU report ≈ $3.84 (+ image SKU ≈ $0.27) once Billing catches up (~24 h).
- **Abort:** any clip `failed` with a non-retryable reason → the pipeline's own per-leg refund applies; do not re-run the film the same
  day; `qc_rejected` (502) → nothing hosted, refund once, stop and read the QA report.

**Total estimated cost L1 + L2 + L3 (all Fast): ≈ $5.2 (720p) – $6.4 (1080p) + ≈ $0.27 storyboard frames ≈ $6.5 ceiling.** Approval is
one-time per test; the sandbox makes no call. Stop rule for the whole series: the "MyAvatar out-of-pocket cost - after credits" $1/month
alert (credits not covering the spend), or a `[veo] submit … ambiguous` line, ends the series until Billing has been read.

## 4. What this audit could not verify

- **Live quota.** The 50 req/min (Veo) and 2 req/min (image) figures are from the 2026-10-08 read-back; today's values and any
  dynamic-shared-quota change are owner-readable only.
- **Live IAM bindings.** `workloadIdentityUser` on the Preview `subject`, `myavatarVeoInvoker`, `myavatarUrlSigner`, the bucket roles
  for the SA and the Vertex AI Service Agent — proven once on 2026-10-08 (`token:ok bucket:ok sign:ok` + one 200 predict); not re-read.
- **Model availability in us-central1 today** for `veo-3.1-generate-001` and `veo-3.1-lite-generate-001` (never called; only Fast was).
  Lite is Preview-status and may move.
- **Production's transport values** (`VEO_TRANSPORT`, `GEMINI_TRANSPORT`, the Gemini key names) — documented 2026-10-08 as "API key,
  no `GCP_*`"; not readable from here. Production has not been switched to Vertex (owner decision, Part 0 §10.4).
- **Whether the $300 credit covered the 2026-10-08 ≈ $0.51** (owner's point 7, Billing photo) — still pending in the repo's records.
- **The Preview env of this branch today** — 8/8 variables were read back on 2026-10-08 for the project; this branch's Preview was only
  re-enabled in dac6106 and no build log of it was read.
- **Billing confirmation of the $0.40 data point** — the Part 0 figure is inferred from the rate, not from an invoice line.
- **Code ↔ docs drift found (not fixed, read-only audit):** `docs/VEO_ENGINE.md` §2 still says "Length 8 / 24 / 48 s" (the grid is
  4·6·8 then every 8 s to 240, `duration.ts:38-41`); §3 omits that a pinned-but-unready `VEO_TRANSPORT` yields `null`, not the other
  transport (`engine.ts:52-58`); §5 lists `costPerSecondUsd(modelId, resolution, audio)` without the `transport` argument
  (`capabilities.ts:460`); `lib/services/billing/budgetPolicy.ts:204` still labels the economy video tier `veo-2` while the engine
  ships Veo 3.1 ids only; `scripts/gcp/preview-auth-check.cjs:30` bounds bucket names at 63 chars where `vertexAuth.ts:46` allows
  222 (stricter script, harmless for the current name); the task memory's "8 s ≈ $0.40" vs the repo's 4 s.
