# Long-form video (8 s … 240 s) — Director Agent + server-side render queue

Status: 2026-10-01, branch `feat/longform-director`. **Foundation only, shipped dark**: every entry point is a no-op
unless `LONGFORM_VIDEO_ENABLED` is truthy, the migration is a file that nothing applies, and there is no cron entry.
The existing ≤ 48 s film path (`lib/chat/filmComposite.ts`, `/api/chat/orchestrate`, `/api/video/assemble`) is
untouched; long-form reuses its building blocks (the Veo engine, the prompt compiler, the camera vocabulary, the
ledger, the budget guard, storage) instead.

## 1. Architecture

```
                      (later) POST /api/video/longform  ── signed-in user, tier limits, balance
                                   │
                                   ▼
   plan.validateLongformRequest ── 8…240 s in 8 s steps · acts of ≤ 12 · wholesale cost · credits · limits
                                   │
                                   ▼
   director.runLongformDirector ── generate() = runtime.llmDirectorGenerate (llmText, Google-only JSON)
        1 call  → BIBLE  (cast with LOCKED descriptions · look/palette · arc: 1 entry per act · music)
        1 call per act, in order → that act's scenes, bible injected verbatim,
                                   previous act's last scene + end state injected (continuity)
        malformed act → retried once → else the storyboard fails with the act index (nothing charged yet)
                                   │
                                   ▼
   INSERT longform_jobs (1 row) + longform_scenes (N rows, spec.shot = the structured Veo shot)  [service role]

   Vercel Cron ──► /api/cron/longform-tick   404 unless enabled · CRON_SECRET (lib/api/cronAuth)
                                   │
                                   ▼
   tick.runLongformTick ── claim_longform_jobs (lease, FOR UPDATE SKIP LOCKED)
     per job:  settle()     cancel · deadline · planned→rendering · early abort · stitch decision · refunds
               planWork()   stale claims / render timeouts → failed
                            reserve the next act ── ledger.deductCredits(ref longform:<job>:act:<n>)
                            seed frames ── ffmpeg -sseof (act N's last clip → act N+1's first frame)
                            submit ── claim_longform_scenes ─► director.buildSceneClipInput
                                      ─► guardedCall(createVeoClip)   (lib/veo/engine, Vertex or Gemini)
                            poll ── pollVeoClip ─► host in Supabase `renders` (path fixed per operation)
               settle()     ─► stitch.buildStitchPlan ─► ffmpeg-static ─► renders/longform/<job>/film.mp4
                            ─► refunds: ledger.refundCredits(ref <act ref>:s<n>:refund), capped by the ledger
```

| File | Role | Pure? |
|---|---|---|
| `lib/video/longform/plan.ts` | durations (`LONGFORM_DURATIONS` for the UI), scene count, acts, cost, credits, limits, validation | yes, client-safe |
| `lib/video/longform/director.ts` | bible + per-act storyboard with an injected `generate`; defensive parsing; `buildSceneClipInput` → `CreateVeoClipInput` | yes |
| `lib/video/longform/stateMachine.ts` | job/scene transitions, `settle`, `planWork`, refund markers, outcome classifiers | yes |
| `lib/video/longform/stitch.ts` | ffmpeg argv plans: probe parse, copy-compatibility, size guard, concat copy, re-encode, music loop, last frame | yes |
| `lib/video/longform/tick.ts` | one tick over leased jobs; every side effect injected | yes (deps injected) |
| `lib/video/longform/rows.ts` | DB rows ⇄ records, never throws on content | yes |
| `lib/video/longform/runtime.ts` | the real deps: Supabase store, Veo engine adapter, ledger billing, ffmpeg stitcher, director LLM | server-only |
| `app/api/cron/longform-tick/route.ts` | gate (flag → 404, CRON_SECRET → 403) + wiring | — |
| `supabase/migrations/20261001b_longform_jobs.sql` | `longform_jobs`, `longform_scenes`, RLS, two claim functions | **not applied** |

## 2. Cost (wholesale, what Google charges)

Gemini API, 1080p, native audio on (the production path until the GCP env exists). From `lib/veo/capabilities.ts`
via `plan.longformCostTable` — the doc table is asserted by `plan.test.ts`, so it cannot drift.

| Length | Scenes | Acts | Standard ($0.40/s) | Fast ($0.12/s) | Lite ($0.08/s) |
|---:|---:|---:|---:|---:|---:|
| 8 s | 1 | 1 | $3.20 | $0.96 | $0.64 |
| 24 s | 3 | 1 | $9.60 | $2.88 | $1.92 |
| 48 s | 6 | 1 | $19.20 | $5.76 | $3.84 |
| 96 s | 12 | 1 | $38.40 | $11.52 | $7.68 |
| 240 s | 30 | 3 | **$96.00** | $28.80 | $19.20 |

720p is cheaper on Fast ($0.10/s) and Lite ($0.05/s); Vertex with `generateAudio: false` is cheaper still. 4k is not
offered for long-form. Retries of provable failures (429/503, a Veo `failed` verdict) can add at most
`maxAttempts − 1` = 2 extra clips per scene; an `ambiguous` submit is never retried (it may already have billed).

**Credits** = `ceil(USD × 2.7 GEL/USD ÷ 0.10 GEL/credit × margin)` per scene, × scene count (so a per-scene refund
is exact). The margin is a REQUIRED input (`LongformPricing.marginMultiplier`) — a commercial decision this code
refuses to make. At margin 1.5: Standard 130, Fast 39, Lite 26 credits per scene; a 240 s Standard film is 3 900
credits (390 ₾). For comparison the current flat `video_30s` price is 25 credits.

## 3. The breakpoints, and how this design removes each

| # | Breakpoint today | Removed by |
|---|---|---|
| 1 | The 12-scene cap, restated in `filmPipeline.planFilmGrid`, `script-breakdown`, `orchestrate`, `film/storyboard`, `promptAgent`, `renderOptions` | A separate grid (`plan.ts`: 30 scenes, acts of ≤ 12). The existing caps are **deliberately untouched** — they bound the one-request film path, which still has one request's limits. |
| 2 | `runPromptAgent` writes the whole film in one call, `maxTokens = min(8000, 1500 + 400·n)` → a 30-scene JSON is truncated | Bible call + one call per act (≤ 12 scenes, `min(8000, 1200 + 450·n)`); a malformed act is retried once. |
| 3 | Identity drift across many calls | The bible's locked descriptions go into every act call verbatim **and** the Veo subject is compiled from the bible at render time (`buildShot` / `buildSceneClipInput`), not from the act model's prose. Act N+1 opens from act N's last frame (i2v, "motion only" prompt). Seed lock + reference images as today. |
| 4 | All clips dispatched in ONE 300 s request; the BROWSER polls every 4 s — a closed tab or killed function strands the film | A server-side queue: one row per scene, a cron tick, job leases + atomic scene claims (`FOR UPDATE SKIP LOCKED`), a 4-wide concurrency cap per job, backoff, deadlines. Nothing lives in memory between ticks. |
| 5 | Stitch = x264 ultrafast re-encode of every clip, 280 s exec timeout | Concat demuxer `-c copy` when every clip is **probed** identical (Veo clips of one job are): seconds of I/O. Re-encode (concat filter, scale/pad, silent tracks for silent clips) only as a fallback. |
| 6 | Music bed padded with silence after the track (30 s Lyria bed → silent from 30 s on) | The bed is looped for the whole film (`aloop`), faded out at the end, ended by `-shortest` + `-t`; only the audio is re-encoded. ⚠️ **Not `-stream_loop -1`**: with the bundled ffmpeg it HANGS after writing the file when the looped input is not drained (verified 2026-10-01 with `-stream_loop -1`, `-stream_loop -1 -t N` and `-stream_loop 40`; the process even ignores SIGTERM). `aloop` exits cleanly — `stitch.ffmpeg.test.ts` (opt-in) proves it on the real binary. |
| 7 | ~50 MB Supabase upload limit | A size guard: copy fits → standard upload; resumable available → keep the copy; else re-encode to fit when the bitrate stays ≥ 2 Mb/s (1080p) / 1 Mb/s (720p); else refuse with `needs_resumable_upload`. **240 s at 1080p does not fit 50 MB above the floor** (it would need 1.47 Mb/s) — see activation. |
| 8 | Vercel `/tmp` is 512 MB; 30 clips × ~12 MB downloaded + the output would not fit | Clips are streamed over https straight into the concat demuxer (no local copies); only the ≤ upload-limit output touches `/tmp`. |
| 9 | Per-clip billing through `debit_wallet_gel`, which does not exist in prod; no per-clip charge record | `ledger.deductCredits` per ACT (one ref per act), a per-scene charge record on the row (`charge_ref`, `charge_credits`, `refunded`), and per-scene refunds through `ledger.refundCredits`, capped by `netDebitedForRef` (never by the row). |
| 10 | `DAILY_COST_LIMIT` $10 vs a $96 film | Validation refuses a film costing more than the whole daily envelope (it could never finish in 24 h); every submit runs inside `guardedCall`; a budget refusal HOLDS the job (30 min) instead of failing scenes. Raising the limit is an activation decision. |

## 4. The queue (stateMachine.ts)

Job: `planned → rendering → stitching → done`, any non-terminal → `failed` | `canceled`.
Scene: `queued → submitted → rendering → delivered | failed`.

- **Concurrency**: ≤ 4 scenes in flight per job, earliest ordinals first; ≤ 12 polls per tick.
- **Never twice**: a scene is claimed atomically before its submit. An `ambiguous` submit (timeout / 5xx / a thrown
  submit), a claim whose tick died before recording the operation (10 min), and a render past 20 min all FAIL the
  scene — never re-submitted.
- **Retry the provable**: 429/503 and a Veo `failed` verdict re-queue with backoff 30 s → 60 s → … (cap 10 min), up
  to 3 submits. Safety-filtered is final.
- **Holds, not burns**: budget refusal, provider quota/auth/config, an unaffordable act, the ledger down → the JOB
  waits (15–30 min) while in-flight clips are still collected; the 24 h deadline ends it.
- **Terminal rule**: the job fails as soon as failed scenes exceed `floor(n × 10 %)` (zero tolerance under 10 scenes);
  otherwise it stitches the delivered scenes (a failed scene is cut, hard-cut joins) once every scene is terminal.
  Stitch: 2 attempts; a stitch still not done 6 h past the deadline (e.g. deferred every tick by a too-small tick
  budget) fails the job and refunds everything.
- **Act chaining**: the first scene of act N+1 `dependsOn` act N's last scene; once delivered, its last frame is
  extracted and becomes the first frame. A failed dependency or a failed extraction releases the scene (text
  continuity only). Off when reference images are used (Veo: references exclude a first frame).

## 5. Billing

1. **Up front**: `validateLongformRequest` checks the balance covers the WHOLE film (credits = per-scene × N).
2. **Reserve per act**: just ahead of need (when concurrency slots would idle), `deductCredits(user, perScene × k,
   'longform:<job>:act:<n>')`. Idempotent by reading the ledger first (`netDebitedForRef`), so a tick that died
   between the debit and marking the scenes never charges twice. Insufficient → the job holds; a missing/broken
   ledger → hold, **never a free render**.
3. **Per-scene charge record**: each scene row carries its act's `charge_ref` and its own `charge_credits`.
4. **Refund on failure**: as soon as a scene fails, `refundCredits(user, share, '<act ref>:s<n>:refund')` — the ref
   starts with the act ref, so `netDebitedForRef` caps the sum of an act's refunds at its debit; an existing credit
   under that exact ref short-circuits a retry. A missed refund sets `refunds_pending`, which keeps even a terminal
   job claimable until it lands.
5. **Who pays for what** ("you pay for the clips you receive"): done → failed scenes refunded; canceled or failed
   for any reason except the stitch → every undelivered scene refunded, delivered clips stay paid (they are the
   user's — refunding them would make "provoke a failure after rendering" a way to get clips free); failed **at the
   stitch** → everything refunded (we rendered it all and could not assemble it).

## 6. Tier gating

Everything is passed in (`LongformLimits`), nothing is hard-coded: `maxSeconds` (0 = not included), `allowedTiers`,
`maxJobCostUsd`, `platformDailyLimitUsd`, `platformBudgetRemainingUsd` (warning only), `balanceCredits`. A starting
proposal for the plans in `lib/billing/pricingConfig.ts` (a product decision, not implemented): trial 0 s · pro 48 s
Fast/Lite · business 120 s · executive 240 s all tiers.

## 7. Activation checklist

1. Apply `supabase/migrations/20261001b_longform_jobs.sql` (SQL editor / MCP `apply_migration`), then run
   `node scripts/check-db-exposure.mjs` — it now probes both tables and `claim_longform_scenes`.
2. Decide the margin multiplier and the per-plan `maxSeconds`; decide `DAILY_COST_LIMIT` (a 240 s Standard film is
   $96 against the $10 default — it is refused until raised).
3. Build the job-creation route (validate → `runLongformDirector(…, llmDirectorGenerate)` → insert rows with
   `depends_on` for act openers when chaining), a status route and a cancel route (`cancel_requested = true`), and
   the UI selector over `LONGFORM_DURATIONS`. **Not in this foundation.**
4. `vercel.json`: a `functions` entry `app/api/cron/longform-tick/route.ts → maxDuration 300` (the `app/api/cron/**`
   glob grants 60 s) and a cron `{"path": "/api/cron/longform-tick", "schedule": "* * * * *"}`. Then set
   `LONGFORM_TICK_BUDGET_MS=270000` — with the 50 s default a stitch (`LONGFORM_MIN_STITCH_BUDGET_MS`, 120 s) is
   always deferred (`stitchDeferred` in the report, a `longform_tick` warn marker) until the job fails 6 h past its
   deadline and refunds everything.
5. Uploads: either raise the project's global storage limit and add a resumable (TUS) upload, then set
   `LONGFORM_MAX_UPLOAD_BYTES`; or launch with lengths that fit 50 MB above the quality floor (≤ 176 s at 1080p,
   240 s at 720p — both via the fit-to-size re-encode, which needs the 300 s budget).
6. Run `LONGFORM_FFMPEG_IT=1 npx jest lib/video/longform/stitch.ffmpeg.test.ts` on the deploy runtime too — the
   Linux ffmpeg-static binary is not the darwin one the argv was verified on.
7. Env: `LONGFORM_VIDEO_ENABLED=1`, `CRON_SECRET` (already set for the other crons). Smoke-test a 16 s Lite film on a
   staging account; watch the `longform_tick` markers and `/api/admin/reliability`.

## 8. Unverified assumptions

- Veo clips of one job share codec / size / fps / pixel format / audio layout — **not assumed**: copy is chosen only
  when every clip's probe agrees; the assumption only decides how often the fast path is taken.
- Veo's output bitrate (`ASSUMED_CLIP_KBPS`, 12 Mb/s at 1080p) — used only when a clip's size is unknown; the engine
  adapter records the real size for Gemini-file clips (Vertex/GCS clips are probed instead).
- `deduct_credits` / `refund_credits` idempotency on a replayed ref — not relied on: the adapter reads the ledger
  first for both.
- The concat demuxer reading Supabase signed https URLs, and `-sseof` on them (range requests) — verified with local
  files and https in argv shape only, not against Supabase.
- The Gemini-API watermark crop (`stripBottomWatermark` in ServiceManager) is NOT applied to long-form clips (the
  agent video queue does not apply it either).

## 9. Deliberately left for later

The job-creation / status / cancel routes and the UI; a resumable upload; a dedicated stitch worker (or the 300 s
budget above); watermark crop and the free-tier watermark (`shouldWatermark`) on the final film; transitions other
than hard cuts (a copy stitch cannot dissolve); per-scene SFX / voice-over / lip-sync lanes; Library filing of the
finished film (`generation_jobs`); global (cross-job) Veo concurrency; and admin visibility of long-form spend.
