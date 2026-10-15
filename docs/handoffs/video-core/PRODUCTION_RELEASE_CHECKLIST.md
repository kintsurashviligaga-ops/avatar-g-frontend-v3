# Video Core v1.0: Production release checklist (PR #69)

The ordered gates of this release, each with its owner, its proof and its state. A gate is ticked only with the evidence
in its row. This release does **not** open Video Core to the public: films stay as they are in Production today (open to
signed-in users, admin never billed), Video Core admin tools stay admin-only, BOG stays admin-only, prices are unchanged.

Labels: **VERIFIED FACT** · **INFERENCE** · **NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**.
States: DONE · PENDING · BLOCKED · N/A.

## 0. Owner's word

| Item | Word | State |
|---|---|---|
| Brief | GG 2026-10-13 17:34:41Z, Phases 0–7 (limited real Production testing ≤ $5 Vertex, ≤ 50 own credits, no new payment) | DONE |
| Vertex for Production Veo | decision card 2026-10-15 10:05:18Z "კი" | DONE |
| R3 refund rule | card 10:16:26Z "კი, დაუბრუნე" (built as R3-A) | DONE |
| B3 storyboard_revisions | card 10:18:22Z "ჯერ არა": stays a proposal, not in this release | DONE |
| Paid test account | card 10:22:23Z "ადმინით" | DONE |
| Production steps 1–3 (GCP trust, 8 env vars, migration + merge + deploy) | written 10:40:04Z "კი" and 10:43:26Z "ნებას გაძლევ ვეოუს უფლებები გამოიყენე და რაც დაგჭირდება ყველაფერი" | DONE (words given); each step's own state below |

## 1. Before the merge

| # | Gate | Owner | Proof | State |
|---|---|---|---|---|
| P1 | CI green on the PR head: "verify" (typecheck, lint, Jest, build), Video Core E2E (billing on real Postgres + live E2E desktop and phone), E2E Preview Contract | Claude | GitHub check runs on the head commit | PENDING |
| P2 | GCP G1: the WIF provider also accepts this project's Production tokens (ids, not names) | Claude on the owner's Mac | `providers describe` shows `environment in ['preview', 'production']` | PENDING |
| P3 | GCP G2: the Production subject may impersonate `myavatar-veo` (no key created) | Claude on the owner's Mac | `get-iam-policy` lists exactly the Preview and Production principals; `keys list --managed-by=user` empty | PENDING |
| P4 | Migration 20261014a preflight | in the script | the script refuses unless `credit_ledger` (jsonb metadata) and `refund_credits(uuid, integer, text)` exist and no film table or function does | PENDING (script drilled on a throwaway Postgres: applies once, refused on a second run) |
| P5 | Backup / recovery | Claude | the migration is additive (2 tables, 6 functions, nothing existing altered); recovery = its drop list, drilled (`ROLLBACK_AND_RECOVERY_PLAN.md` R4). Supabase's own backup list was not read from here | DONE (recovery); backup list NOT VERIFIED |
| P6 | Migration 20261014a applied | Claude opens the SQL Editor; **GG presses Run** | the verify row: both tables, RLS on, 0 policies, 0 rows, 6 SECURITY DEFINER functions, tables and functions closed to anon/authenticated | PENDING — **OWNER ACTION REQUIRED** (one press) |
| P7 | The migration recorded in the repo | Claude | `supabase/migrations/20261014a_film_billing.sql`; schema-drift snapshot lists the six functions as Production's; harness path updated | PENDING |
| P8 | V1: 8 Production env vars (plain, Production only), right before the merge | Claude (Vercel CLI on the owner's Mac) | `vercel env ls production` names them; `GEMINI_TRANSPORT` still absent | PENDING |
| P9 | Rollback point written down | Claude | the deployment id serving myavatar.ge right before the merge | PENDING |

Nobody presses Redeploy between P8 and the merge (a Redeploy would build the current Production commit with Vertex on).

## 2. Merge and deploy

| # | Gate | Proof | State |
|---|---|---|---|
| M1 | PR #69 merged into main with a merge commit (no squash, no force push) | GitHub | PENDING |
| M2 | Vercel builds Production from main | deployment READY, myavatar.ge aliased | PENDING |
| M3 | Build log: `[gcp-auth-check] env=production … ok=true mode:wif token:ok bucket:ok sign:ok` (no model call; `preview-inference-check` skips Production builds) | Vercel build log | PENDING |

## 3. After the deploy (free, read-only, before any paid call)

| # | Gate | Proof | State |
|---|---|---|---|
| V1 | `/api/health` names the merge commit | anonymous GET | PENDING |
| V2 | `/api/video/engine` → `"transport":"vertex","audioToggle":true` | anonymous GET | PENDING |
| V3 | BOG smoke workflow 9/9, `bog:false` for anonymous | GitHub Actions run | PENDING |
| V4 | No new runtime error group for 15 minutes; crons answer 200 (the old `/api/app/worker/tick` service_jobs error is known and unrelated) | Vercel runtime errors / observability | PENDING |
| V5 | Anonymous probes still refused: `/api/credits/balance` 401, `/api/tasks` 401, sweep without secret 403 | anonymous requests | PENDING |

Any red row here → Instant Rollback (`ROLLBACK_AND_RECOVERY_PLAN.md` R1), then report.

## 4. Phase 5: the one limited paid test

| # | Rule | State |
|---|---|---|
| L1 | Only after §3 is all green | PENDING |
| L2 | One 4 s Veo 3.1 Fast 720p clip with audio, as admin, on Vertex (≈ $0.40; budget ≤ $5) | PENDING |
| L3 | No retry and no second paid call on an unclear outcome; stop if any limit would be exceeded | rule |
| L4 | No new BOG/Stripe payment, subscription, refund or top-up | rule |
| L5 | Chain recorded end to end in `VIDEO_CORE_PAID_E2E_EVIDENCE.md`: auth → prompt + storyboard → quote → confirm → (admin: 0 credits) → Vertex op id → MP4 in storage → FFmpeg → QC → preview → download → Library → history → reconciliation | PENDING |
| L6 | The free Volume check (defect 43) on a delivered clip | PENDING |

## 5. Not in this release (public opening)

The public opening of Video Core is a separate decision of the owner, after this release is verified. What is still
open for it is listed in `VIDEO_CORE_FINAL_PRODUCTION_REPORT.md` and `NEXT_PHASE_HANDOFF.md` (D1–D12, B3, B4–B7, a
Veo budget cap, whether films should stay open to every signed-in user, DAST).
