# 15 — Second run: P0/P1 fixes (2026-10-14)

Branch `claude/global-final-e2e-20261014` (Draft PR #67), on top of e61180d9. **No paid provider call, no new billable
resource, no merge, no deploy, no env change.** Spend this run: **$0**.

## Fixed in code (commits e8c7cbe1, 025e65ce)

| # | Was | Now | Proof |
|---|---|---|---|
| S2 dubbing | `/api/v2/dubbing/start` spent ElevenLabs with 0 credits | `reserveProduce` **10 cr per started minute** before any provider call (ref `dubbing:<jobId>`, replay-refusing); refund once on failure / budget refusal / throw; measured-length top-up `…:extra` (under-declaring buys nothing) | `app/api/v2/dubbing/start/route.test.ts` +6 tests |
| S2 presentation | `/api/v2/presentation/build` spent Gemini + Imagen with 0 credits | **15 cr** reserved before the build, refund once on failure/throw | `app/api/v2/presentation/build/route.test.ts` +3 tests |
| S2 voice + pipeline media legs | `/api/pipeline` voice (ElevenLabs) and media legs uncharged | closed by default via the provider boundary (below) — `refuseOutsideEngine` already guards every non-text leg | `lib/providers/mediaPolicy.test.ts` |
| Provider boundary | `MEDIA_GOOGLE_ONLY` opt-in, unset ⇒ HeyGen / Kling / NanoBanana / Replicate / Higgsfield / Udio live | **default ON (fail closed)**; only `MEDIA_GOOGLE_ONLY=0|false|off|no` re-opens outside engines. 35 gated entries unchanged | mediaPolicy.test pins the default with explicit envs; Jest baseline pins the opt-out (`jest.setup.cjs`) so legacy suites keep testing their paths |
| S5 Preview = Production DB | a Preview with a studio flag would write Production wallets/rows | `lib/env/previewIsolation.ts`: on `VERCEL_ENV=preview` every debit is refused (`ledger.deductCredits/deductCreditsOnce`, `billing/enforce.deductCreditsTransaction`, `commerce.deductFromWallet`) unless `PREVIEW_ISOLATED_DB=1` **and** the Supabase ref ≠ `PRODUCTION_SUPABASE_REF` (when set) → paid routes refuse before the provider | `lib/env/previewIsolation.test.ts` (7, incl. ledger never calls the RPC) |
| S3/S4 catalogue | Workflow Builder / Digital Shop / Visual Intelligence / Media hub / BI promised non-existent features | copy says what runs (chat handoff): „Workflow Planner — no visual builder or automation yet", „Shop Content — no storefront hosting", etc.; Agent G's workflow persona no longer claims automation | `lib/services` suites |
| Agent G prices | — | platform prompt quotes dubbing/deck from pricing.ts (≤ 5 000 chars kept) | `lib/chat/platformPrompt.test.ts` |

Prices 10 cr/min and 15 cr/deck are **PROPOSED** (provider cost + margin at 1 cr ≈ $0.037) — owner must confirm before merge.

## Behaviour change when merged (owner must know)

1. Third-party tools (avatar/HeyGen, remix restyle, motion/Kling, 3D/TRELLIS, swap, upscale, photo editor, legacy wizard media + voice) answer 503 `google_only` („თანხა არ ჩამოგეჭრა") in Production unless `MEDIA_GOOGLE_ONLY=0` is set. Rollback = set `MEDIA_GOOGLE_ONLY=0`.
2. Every paid action on any Vercel **Preview** answers `billing_unavailable` until a Preview DB exists and `PREVIEW_ISOLATED_DB=1` (+ `PRODUCTION_SUPABASE_REF`) are set Preview-scoped. Chat/free paths unaffected. The CI preview-e2e stubs its paid route, so it is unaffected.
3. Dubbing and decks start charging.

## Verification (this run)

| Check | Result |
|---|---|
| tsc (#67 head) | 0 errors |
| tsc integration tree (main + #67 + #64 bcb724a1 + #60 be9edee3 + #65 9d25c7a4 + uid-race 7fe06fb5 + Astra e6dfab9d) | 0 errors, merges clean |
| Jest #67 | 893 suites pass; fails only the 5 macOS ffmpeg baseline suites (13 832 tests pass) — before the prompt fix also platformPrompt, fixed in 025e65ce |
| Jest integration tree | 919 suites / 14 090 tests pass; fails only the same 5 ffmpeg baseline suites |
| Local real Postgres 16 + PostgREST (`scripts/lease-isolation/run.sh`) | leaseIsolation 9/9, ledgerOnce 7/7 (+1 skip); runIsolation 5 fail = known macOS ffmpeg 6.0 local-only (Linux CI reference) |
| Studio debit paths in the integration tree | Video `filmComposite.deductCredits`, Image `ledger.deductCreditsOnce`, Music `reserveProduce` → all pass through the guarded ledger, so the Preview guard covers all three studios |
| CI on 025e65ce | billing on real Postgres ✅ run 38598328552 (Linux; includes runIsolation); verify ✅ 38598328495 · preview-e2e ✅ 38598328529 · live E2E desktop + phone ✅ 38598328552 · Vercel ✅ |

## Still open (honest)

- Deployed (Preview) E2E per studio: still impossible without an isolated Preview DB (option A in 10 = billable, owner).
- No paid provider test this run (no approval). Live microphone (Astra) not tested.
- `/services/software` page shows no price for its 3 cr; legacy registries (`uiCatalog.ts`, `workspace-config.ts`) still say „Workflow Builder"/„Digital Shop" (P2).
- Defect 51 (#64 stitch kill keeps debit) and R3 refund policy remain #64's gates.
