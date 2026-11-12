# 04 — Google AI integration audit (v5.1 Phase 0)

Audit base: `main` @ `4c502c7` (2026-11-12 09:02Z). Read-only. No paid call, no project runtime probe was made in this
session. Official sources were fetched live on **2026-11-12 between 09:03Z and 09:12Z** (WebFetch / Firecrawl). Where a
Firecrawl result came from its cache, the cache time is given. Third-party pages found in searches were **not** used as
evidence.

## 1. How MyAvatar reaches Google today

| Fact | Evidence |
|---|---|
| Transport is Vertex AI only. `GEMINI_TRANSPORT` unset or `vertex` → Vertex; the Developer API is refused, never a fallback. | `lib/ai/google/transport.ts:7,46`, `lib/ai/google/provider.ts:28`, `lib/ai/google/readiness.ts:26` |
| Model allowlist with dated runtime evidence | `lib/models/catalog.ts` (version `2026-10-08.2`, not updated since) |
| Model defaults | `lib/ai/google/models.ts` (Live, TTS, STT, transcribe, Chirp) |
| Last paid certification (one call per model, contract-tested) | PR #269 `02dc5e9c`, 2026-11-06, ~$2.20; `docs/master-v3.1/VERIFICATION.md`, project record |
| Production flags (names only) | `docs/production-truth/PRODUCT_TRUTH_MATRIX.md` §3 |

Because production uses Vertex, the **Agent Platform (Vertex) lifecycle is the one that binds production**. The Gemini
Developer API pages are recorded for comparison only.

## 2. Official sources fetched

| # | URL | Result |
|---|---|---|
| S1 | https://ai.google.dev/gemini-api/docs/models | OK, page "Last updated 2026-10-28 UTC" |
| S2 | https://ai.google.dev/gemini-api/docs/changelog | OK (entries to 2026-10-30) |
| S3 | https://ai.google.dev/gemini-api/docs/deprecations | OK |
| S4 | https://ai.google.dev/gemini-api/docs/interactions | OK |
| S5 | https://ai.google.dev/gemini-api/docs/decisions-api | 302 → https://aistudio.google.com/docs/decisions-api (fetched, OK) |
| S6 | https://ai.google.dev/gemini-api/docs/pricing | OK but **does not list** Gemini 4, 3.8, Omni, Nano Banana 2.1, Lyria 3.5 (see conflict C1) |
| S7 | https://ai.google.dev/gemini-api/docs/rate-limits | **NOT FETCHED** (time budget) → NOT VERIFIED |
| S8 | https://cloud.google.com/model-garden/pricing and https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing | OK (Agent Platform pricing) |
| S9 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes | OK, entries 2026-08-04 … 2026-11-11 |
| S10 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions | Only navigation came back (page too long); one table row via search excerpt → **PARTIAL** |
| S11 | …/models/gemini/4-carbon | OK (Firecrawl cache 2026-11-12 08:37Z), "last updated 2026-11-11 UTC" |
| S12 | …/models/gemini/omni-1-2-flash | OK (Firecrawl cache 2026-11-11 19:28Z), "last updated 2026-11-11 UTC" |
| S13 | …/models/veo/3-1-generate | OK (Firecrawl cache 2026-11-12 08:07Z), "last updated 2026-11-10 UTC" |
| S14 | …/resources/locations | Search excerpt only (table of endpoints) → PARTIAL |
| S15 | …/models/live-api and …/models/gemini/3-8-live | Search excerpt only → PARTIAL |
| S16 | https://aistudio.google.com/docs/deprecations, …/whats-new-gemini-4-carbon, …/omni | Search excerpts (official Google domain) |
| S17 | Antigravity pages (spec §4.1) | **NOT FETCHED** — Antigravity is optional and not needed for Phase 0 |

Bash/curl from this container to Google hosts is blocked by the session proxy (HTTP 403 on CONNECT), so pages were
read through the fetch tools only.

## 3. Conflicts between official sources (spec §1.15: recorded, affected decision stopped)

| ID | Conflict | Effect |
|---|---|---|
| C1 | S6 (ai.google.dev pricing) lists only older models; S8 (Agent Platform pricing) and aistudio.google.com list Gemini 4 / 3.8 / Omni prices. ai.google.dev looks like an older mirror of the AI Studio docs. | Pricing decisions use **S8 (Vertex)** only, because production is Vertex. Developer-API prices = NOT VERIFIED. |
| C2 | `gemini-2.5-flash`: S3 says "not deprecated, served until further notice"; aistudio.google.com/docs/deprecations says shutdown 2026-12-01 with auto-route to `gemini-3.5-flash-lite`; Agent Platform says retired **2026-10-20**. | Irrelevant to runtime (code only has it as a label, `lib/chat/chatModes.ts:133`), but the catalog must not offer it. |
| C3 | Omni naming: Developer API GA id is `gemini-omni-1.1-flash`; Agent Platform release notes (2026-08-27) and the locations table call the Vertex model `gemini-omni-1.1-flash-preview` (Preview). | The repo's `gemini-omni-1.1-flash-preview` is the **Vertex** name and is correct for this transport. No alias / auto-routing from 1.1 to 1.2 is documented anywhere fetched → must not be assumed. |

## 4. Model verification table (every Google model the runtime references)

Status = official lifecycle on **Agent Platform** unless marked (Dev API). "Runtime" = last recorded project evidence;
nothing was re-run today.

| Model id in repo | Where | Official status (source, UTC fetch 2026-11-12) | Retirement | Runtime evidence for this project | Verdict |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | chat primary, flash tier (`lib/models/catalog.ts`) | GA 2026-09-02 (S9); Canada/Japan regions 2026-11-09 | none announced (S3) | Vertex T2 2026-10-08 + daily use | OK |
| `gemini-3.6-flash` | chat chain, STT default | GA 2026-07-21 (S2) | none announced | key 2026-10-02 | OK |
| `gemini-3.7-flash` | STT step-down | GA 2026-08-13; **Dev API: deprecated 2026-10-08, auto-routed to 3.8 Flash** (S2/S3) | Vertex: UNKNOWN | key 2026-10-02 | REVIEW |
| `gemini-3.5-flash` | chat chain 3rd, `models.ts:76` | **Dev API: deprecated, auto-routed to 3.6 Flash** (S3) | Vertex: UNKNOWN | key 2026-10-02 | REVIEW |
| `gemini-3.1-pro-preview` | Chat Pro, pro tier | listed, no shutdown (S3); Vertex price "Preview, global only" (S8) | none announced | key 2026-10-02 | OK (Preview) |
| `gemini-3.1-flash-lite` / `gemini-3.5-flash-lite` | Chat Lite | GA; 3.1 Flash-Lite shutdown **2027-05-07** (Dev API S3) | see left | key 2026-10-02 | OK |
| `gemini-flash-latest`, `gemini-pro-latest` | catalog (Dev API only) | aliases; not in any lifecycle table | — | Vertex countTokens 404 (catalog note) | unusable on Vertex; DISABLE candidate |
| `gemini-4-carbon` | **not referenced** | GA on Vertex 2026-11-10 (S9, S11) | not stated | none | MISSING in repo |
| `gemini-4-argon` | **not referenced** | GA 2026-10-13; long decode GA 2026-11-05 via Interactions `v1beta1` (S9) | not stated | none | MISSING in repo |
| `gemini-decision-1` | **not referenced** | documented on Developer API v1beta only (S5); no Vertex entry found | — | none | MISSING; not on our transport |
| `gemini-3.1-flash-image` | image + storyboard frames | GA; **Dev API: deprecated 2026-10-06, replacement `gemini-nano-banana-2.1`** (S2/S3); Vertex: GA, US/EU endpoints 2026-08-31 | none announced | contract PASS #269 (2026-11-06) | OK now, plan migration |
| `gemini-nano-banana-2.1` | **not referenced** | GA 2026-10-06 (S9), 1K/2K/4K | none | none | candidate replacement |
| `imagen-4.0-generate-001` | `lib/ai/geminiImagen.ts` (opt-in `GEMINI_IMAGEN_ENABLED`) | **shut down 2026-08-17** (Dev API S3); 404 on Vertex for this project (catalog note) | past | 404 | DEAD CODE PATH |
| `imagen-3.0-generate-002` | 7 refs (tests/legacy) | shut down 2025-11-10 (S3) | past | — | DEAD |
| `gemini-2.0-flash*`, `gemini-1.5-pro` | legacy refs | shut down 2026-06-01 (S2) | past | — | DEAD |
| `veo-3.1-fast-generate-001`, `veo-3.1-generate-001` | video (Veo path) | **GA**, released 2025-11-17, region **us-central1**, 4/6/8 s, 720p/1080p (+4K on standard), 9:16 & 16:9, sound, first/last frame, reference images, extension (S13) | **2027-05-04 or later** | contract PASS #269; owner E2E 2026-10-26 | OK |
| `veo-3.1-lite-generate-001` | 5 refs | Preview, 2026-04-02 (S13) | not specified | none | Preview only |
| `veo-3.1-*-preview` | 9 refs | Dev API ids, **shut down 2026-10-22** (S3) | past | — | must not be selectable |
| `veo-3.2-*-001` (fast, standard, lite) | 13 refs, `lib/veo/capabilities.ts:198` | **no official source found** (S9, S13) | — | none | UNKNOWN — do not enable |
| `gemini-omni-1.1-flash-preview` | `lib/video/omniClip.ts:36` (`OMNI_MODEL`), cost model `lib/credits/unitEconomics.ts:206` | Vertex **Preview** since 2026-08-27 (S9, S14); Dev API GA id differs (C3) | UNKNOWN | owner E2E 2026-10-26 (Georgian speaking video) | OK but Preview |
| `gemini-omni-1.2-flash` | **not referenced** | **GA 2026-11-05**, global only, **Interactions API only** (no generateContent), 3–15 s, 360p/720p/1080p/4K, 16:9 & 9:16, audio, edit / extend / upscale, ≤10 images and ≤3 videos per prompt; grounding, function calling, Computer Use, structured output, Live, system instructions **not supported** (S12) | 2027-11-05 or later | none | candidate; no auto-routing documented |
| `lyria-3-clip-preview`, `lyria-3-pro-preview` | music | Dev API: both listed, no shutdown; `lyria-3-pro-preview` replacement `lyria-3.5` (S3); Vertex price: Lyria 3 $0.04/30 s clip, Lyria 3 Pro $0.08/song (S8); exact Vertex ids not confirmed (S10 partial) | none announced | contract PASS (Pro) #269 | OK; ids NOT VERIFIED on Vertex docs |
| `lyria-3.5` | **not referenced** | GA 2026-09-03 (Dev API, S2); Vertex price not listed (S8) | — | none | candidate |
| `gemini-3.8-live` | Live talking avatar `lib/voice/liveAvatar.ts:17` | GA 2026-09-24 on Vertex, `us`, `eu`, `us-central1`; supports Live avatar (S15) | 2027-09-25 or later | owner E2E 2026-10-26 | OK |
| `gemini-2.5-flash-native-audio-latest` (`DEFAULT_LIVE_MODEL`) | Live voice `lib/ai/google/models.ts:89`, `lib/voice/geminiLive.ts:102` | id **not in any official table fetched**. Vertex GA Live model is `gemini-live-2.5-flash-native-audio`; Dev API `gemini-2.5-flash-native-audio-preview-12-2025` shuts down **2026-11-17** (S3) | see left | the EU relay is configured with `LIVE_RELAY_MODELS=gemini-live-2.5-flash-native-audio,gemini-3.8-live` (`services/live-relay/README.md:94,103`), i.e. the Vertex GA id; owner E2E 2026-10-26. The live Cloud Run env was not read today. | OK via relay; the `-latest` default name is Dev-API naming → REVIEW |
| `gemini-3.1-flash-live-preview` | allowlist | Dev API shutdown **2026-11-17** (S3) | 5 days | — | remove |
| `gemini-2.5-flash-preview-tts` (`DEFAULT_TTS_MODEL`) | read-aloud default `lib/ai/google/models.ts:100` | Dev API shutdown **2026-11-17** (S3). **Not in the Vertex endpoint table** (S14), which lists `gemini-2.5-flash-tts`, `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` | 5 days (Dev API) | **FAILED**: HTTP 500 twice in certification #269 (2026-11-06) | BROKEN / BLOCKER B-01 |
| `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` | allowlist, trial | **Vertex GA 2026-10-26** (global, us, eu; voice design/replication still Preview) (S9) | none | trial only | replacement |
| `gemini-2.5-flash-tts` | `lib/audio/google-tts.ts:44` (Cloud TTS) | on Vertex endpoint table (S14) | UNKNOWN | contract PASS ka (#269) | OK |
| `gemini-3.5-transcribe-preview` | owner `?stt=` trial only | official ids are `gemini-3.5-transcribe` / `-live`, GA 2026-08-26 (S2); a `-preview` id was not found | — | none | wrong id, trial only |
| `chirp_3` | mic STT (Cloud Speech-to-Text) | Cloud Speech docs **not fetched** | NOT VERIFIED | owner PASS ka/ru/en 2026-11-01; listed-languages call 400 | OK in prod; docs NOT VERIFIED |
| `deep-research-preview-04-2026` | research | Dev API managed agent, deprecation announced 2026-10-08 (S2), no shutdown date (S3); our transport is Vertex | — | none recorded | REVIEW |
| `gemini-embedding-001` | RAG | shutdown 2028-05-14, replacement `gemini-embedding-2` (S3) | 2028 | — | OK |
| Computer Use | **not used** (browser agent uses Playwright, not Google Computer Use) | Computer Use tool GA 2026-10-30 (S2/S9, human-in-the-loop controls); billed at the model's token price (S8) | — | none | MISSING |

## 5. Carbon and Argon (spec §14.1–14.2)

- **Gemini 4 Carbon** — `gemini-4-carbon` (+ `gemini-4-carbon-cyber-permissive`, allowlisted). GA 2026-11-10 on Agent
  Platform. Endpoints `global`, `us`, `eu`. Text in/out; image, audio, video input. Context 1,048,576, max output
  1,048,576; long decode on Interactions API and generateContent `v1beta1`. `thinking_level` LOW / MEDIUM (default) /
  HIGH; **`thinking_budget` or `thinking_level="MINIMAL"` → HTTP 400**. **Custom `temperature`, `top_p`, `top_k` are
  ignored** (defaults 1.0 / 0.95 / 64). Function calling, grounding, structured output and Computer Use supported; Live
  API not supported (S11). Price: **not on the Vertex pricing page** (S8) → NOT VERIFIED for Vertex. The AI Studio page
  (search excerpt, S16) gives $2 / $10 per 1M through 2026-11-30, then $4 / $20 — Developer API only.
- **Gemini 4 Argon** — `gemini-4-argon`, GA 2026-10-13, separate model identity (never an alias of Carbon). 1M tokens,
  long decodes up to 1,048,576 via Interactions `v1beta1` (GA 2026-11-05). Vertex price (S8): Standard global
  $2.00 in / $10.00 out per 1M **through 2026-11-30** (promotion), **$4.00 / $20.00 from 2026-12-01**; non-global +10%.
- No fixed Carbon:Argon cost multiplier is claimed; Carbon's Vertex price is unknown.
- The repo references neither model. Changelog 2026-07-21 says sampling parameters were deprecated for newer models,
  so any code that relies on `temperature` for determinism must be re-checked before adopting Gemini 4.

## 6. Long-decode pricing (spec §13, §21.13)

Vertex pricing footnote for Gemini 4 Argon (S8): **from 2026-11-13, if a completion exceeds 32K tokens, the retrievable
tokens are charged even when the request fails from a client or server timeout.** No separate long-decode price tier is
listed. Consequence for MyAvatar: a timeout is **not** zero cost; the current chat budget and credit refund logic
assume a failed call costs nothing (refund on miss). Must be designed in Phase 5 before any Gemini 4 long decode.

## 7. Interactions API storage and retention (spec §14.4)

From S4: GA since June 2026 ("recommended for all new projects"). **`store` defaults to `true`.** Retention: **55 days
paid tier**, 1 day free tier; paid projects can set 7/14/28/55 days in AI Studio. `background=true` needs storage.
`previous_interaction_id` keeps only the conversation history; `tools`, `system_instruction` and `generation_config` do
**not** carry over and must be resent each turn. Interactions can be deleted with `delete`. Changelog 2026-10-26: Generate
Content API storage is on by default for new paid-tier projects (Developer API).

MyAvatar today: Omni clip continuation sends `previous_interaction_id` (`lib/video/omniClip.ts:169-177`,
`app/api/video/omni-edit/route.ts:11`). Whether these calls set `store`, and what retention applies on the **Vertex**
Interactions surface, is NOT VERIFIED (Vertex docs for Interactions retention were not fetched). Private user
prompts/media may therefore be stored by Google by default → decision D-04.

## 8. Gemini Decision suitability (spec §14.3)

`gemini-decision-1` on `POST /v1beta/decisions` (Developer API, SDK ≥ 3.2). Question types yes/no (`noul`), `choice`,
`score`; 1–1,000 questions; 2–255 options; context 262,144 tokens; zero output tokens; confidence = probability the top
answer is right. Not for text generation, schema extraction, tool calls or multi-step reasoning. No pricing, no region and
**no Agent Platform (Vertex) availability** were found. Because production is Vertex-only by policy, Decision is **not
usable** without a founder decision to allow a Developer-API call path (D-05). Suitable later only for closed-ended
routing/QC checks (e.g. "is this Georgian transcript in Georgian script?", "does the output match intent?").

## 9. Omni: official model vs internal implementation (spec §14.5, §21.12)

- Internal: `OMNI_MODEL = 'gemini-omni-1.1-flash-preview'` (`lib/video/omniClip.ts:36`), Interactions API with
  `previous_interaction_id` continuation, Georgian speaking video at every length (owner decision 2026-10-26), cost
  rows in `lib/credits/unitEconomics.ts:206,226`.
- Official: 1.1 Flash on Vertex is still **Preview**; **1.2 Flash GA 2026-11-05**, 15 s, upscaling, 30% lower price per
  Google's blog (not used as evidence for the price). No auto-routing 1.1 → 1.2 is documented (C3).
- Vertex Omni price (S8): input $1.50/1M; video output $17.50/1M tokens = ≈ $0.034/s 360p, $0.101/s 720p, $0.152/s
  1080p, $0.304/s 4K (derived from published tokens/s). 1.2 Flash price not on the page fetched.
- Gap: our credit table was set against 1.1 preview pricing; a move to 1.2 needs a new price row and a paid test.

## 10. Project entitlement / runtime findings (spec §21.10)

No runtime probe was run in this session (Phase 0, no paid calls; Vertex auth from this container is not configured).
Last recorded runtime evidence: certification #269 (2026-11-06): PASS for `gemini-3.1-flash-image`, `lyria-3-pro-preview`,
Veo 3.1 fast + standard, Cloud TTS ka (`gemini-2.5-flash-tts`) + ru Chirp3-HD, `chirp_3` Georgian; **FAIL** for the
read-aloud default `gemini-2.5-flash-preview-tts` (500 ×2) and for a multi-language `chirp_3` request (400).
Custom avatar from own photo and lip-sync to own audio = BLOCKED_EXTERNAL (Google allowlist). A free, non-billable
`models.list` / `countTokens` probe for Carbon, Argon, Omni 1.2, Nano Banana 2.1 and 3.8 TTS is the next step, and needs
the founder's OK because it runs with production credentials (D-03).
