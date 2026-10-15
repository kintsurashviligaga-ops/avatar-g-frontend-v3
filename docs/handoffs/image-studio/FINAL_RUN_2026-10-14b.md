# Image Studio v1.0 — recovery and final engineering run (2026-10-14, Opus 5.5)

Continues Astra's work on `codex/image-studio-v1` (Draft PR #60) from its last verified head `5b26a742`. Nothing was
restarted from zero. Nothing was merged, deployed, migrated on a shared database, or paid for.

## Recovered state

| Item | Finding |
| --- | --- |
| Worktree | clean (only untracked `node_modules`), equal to `origin/codex/image-studio-v1` = `5b26a742` — Astra's last work was fully pushed; no lost edits |
| CI on `5b26a742` | all green: verify, billing on real Postgres, isolated-db, image-browser, live E2E (local Supabase, desktop + phone), preview-e2e, Vercel |
| Astra's open gates (`NEXT_ACTIONS_KA.md`) | isolated non-production app + 2 disposable users, paid Google generate + edit, visual fidelity review, real Redis / restart / refund-outage drill, Agent G session, hosted Preview, rollout approval — all owner-side; still open |
| Font/build instability | reproduced again in this run: `fonts.gstatic.com … read ETIMEDOUT` during `next build`; the build still exits 0 (fallback) — **transient network, not a code defect**. A real build failure in this run was a missing local `.env` in a scratch tree, not the code |

## Fixes in this run (`4efb71a0`)

Found by an adversarial review of the 68 product files, each confirmed with a regression test that failed on `5b26a742`:

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| F1 | HIGH | a delivered image whose row was deleted from the Library could be re-submitted with its still-valid quote (30 min TTL): `deduct_credits_once` answered `replay`, treated as an *uncertain* reservation → the row owed a refund → settlement refunded the image already delivered. Every image could be made free | `replay` = used quote: `409 quote_used`, `billing: rejected`, nothing owed |
| F2 | MEDIUM | a heartbeat that could not read the row (`unsure`, one dropped DB read) aborted a healthy paid generation, wasted the provider call and showed the user "Cancelled" | stop only on `mustStop` (`lost` / `stopped`), as the other lease workers do |
| F3 | MEDIUM | an ambiguous reservation that never debited stayed `owe: refund` forever, locking the workspace for the tab session and crowding real refunds out of the sweep | after 24 h with nothing in the ledger, settle as `nothing` (audited) |
| F4 | LOW | ka/en/ru: insufficient credits, queue full, safety block, cancelled showed the generic "try again"; `not_found` read "capability unavailable"; `starting` / `retrying` showed "Queued" | per-code copy in all three languages; stages named |

Not changed (product decision for the owner): image price is flat across resolutions (4K = 1K credits).

Checked and sound (reviewer + tests): quote signing (user, job, fingerprint, price, expiry, transport); 8 concurrent
confirms + 8 workers → 1 reserve, 1 generate, 1 save; refunds ledger-derived and deduped; cancel during reserve; retries never
re-call the provider; lease fencing; job / asset / version ownership; reference inputs (no URLs, own-host signed URLs,
`maxHops: 0`, decode + MIME + 12 MB / 24 MP caps); private bucket enforced; Google-only, no fallback; Agent G change additive.

## Verification

| Layer | Result | Tier |
| --- | --- | --- |
| `tsc`, ESLint (changed files) | 0 errors | PROVEN ISOLATED |
| Jest `lib/image` + `components/studio/image` | 105 passed, 3 skipped (real-PG/live, run in CI) | PROVEN ISOLATED |
| Combined main + PR #64 + PR #60 | merges with **no conflict and no shared file**; `tsc` 0, build exit 0, Jest 904/910 suites (6 = macOS ffmpeg + 1 load flake, none in Image Studio) | PROVEN ISOLATED |
| Linux CI on `4efb71a0` | see the PR checks / Video Core `GO_NO_GO_FINAL_KA_2026-10-14b.md` §CI | PROVEN ISOLATED (CI) |
| Real Google generate / edit | not run — no isolated environment or test users supplied, cost not independently confirmable | BLOCKED |
| Hosted Preview, Production | not run | NOT TESTED |

## Status

**Engineering: release candidate. Public / Production: NO-GO** until the paid generate + edit gate (≤ 2 jobs, within the
$5 / 50-credit cap), the isolated real-Redis / restart drill and the owner's merge approval. Do not merge before PR #64 is
decided; it was verified on top of it.
