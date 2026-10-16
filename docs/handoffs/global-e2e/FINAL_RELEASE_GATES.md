# FINAL — release gates (2026-10-14, final P0/P1 repair run)

Branch `claude/global-final-e2e-20261014`, Draft PR #67. **Final SHA: see the "Final commit" section at the bottom.**
No merge, no deploy, no Production env change, no paid provider call, no force push.

## Commits this run (on top of 0e57f748)

| SHA | What |
|---|---|
| 0485f93a | Preview isolation: a flag is not proof. Refunds, grants, wallet, admin adjust and trace debit are guarded |
| dddf52f3 | Dubbing + Presentation: owner-approval gate, signed quote + Confirm, measured pricing, exactly-once debit/refund, crash recovery, no false "completed" |
| (P3) | Provider boundary needs `OUTSIDE_ENGINES_APPROVED`. Paid build hooks pinned disarmed |
| 3de19e5b | Software price on the button (single source). Legacy registries stop promising a builder or storefront |
| 5e8d02ca | statusAgent fixture; defect-51 patch file for #64 |
| 62a9940f | Build fix: crypto-free `pricingApproval` for the client-reachable prompt |

## Gates

| Gate | State |
|---|---|
| G1 Preview cannot move Production money | **CLOSED in code** (fail-closed proof rules + every money sink guarded). Needs `PREVIEW_SUPABASE_REF` / `PRODUCTION_SUPABASE_REF` only when an isolated Preview DB exists |
| G2 Dubbing/Deck can't spend without paying | **CLOSED** — and both are OFF until the owner approves prices |
| G3 Exactly-once debit/refund, concurrency, crash, persistence | **CLOSED** for dubbing and deck (tests). Video stitch: **patch ready** for #64 (defect 51); #64's owner applies it |
| G4 No silent outside engines | **CLOSED** (a falsy flag needs an owner approval reference) |
| G5 No paid calls from CI/Preview builds | **CLOSED** (hooks unreferenced, request files absent, pinned by a test) |
| G6 Truthful service UI | Software price shown. Workflow/Shop copy truthful in ka/en/ru. Unavailable dubbing/deck answer in the user's language and say nothing was charged |
| G7 Deployed Preview E2E | **OPEN — owner**: needs an isolated Preview DB |
| G8 R3 refund policy (Video) | **OPEN — owner decision** (recommendation from #64: B with N=2) |
| G9 Final CI green on exact SHA | **GREEN** on 62a9940f (CI, Preview Contract, Video Core E2E incl. real Postgres + desktop/phone) |

## Owner approvals required

1. **Prices**: dubbing 10 cr per started minute and deck 15 cr. To approve, set (Production-scoped, then redeploy)
   `OWNER_APPROVED_PRICING=dubbing:10,presentation:15`. Changing a price in `lib/credits/pricing.ts` turns the service off
   again until the new number is approved.
2. **Isolated Preview DB** (needed for any deployed E2E): see EXACT_CONTINUATION.md §Preview.
3. **R3** refund policy for failed final assemblies (#64).
4. **Defect 51 patch**: #64's owner reviews and applies `patches/defect51-durable-stitch-settlement.patch`.
5. **Drainer**: `RENDER_DRAINER_ENABLED=1` (Production) so crash refunds actually run. Without it, crashed rows wait.
6. Outside engines stay closed unless the owner sets both `MEDIA_GOOGLE_ONLY=0` and `OUTSIDE_ENGINES_APPROVED=<ref>`.

## Behaviour changes when #67 merges

- Dubbing and deck answer 503 „ჯერ ხელმისაწვდომი არ არის — თანხა არ ჩამოგეჭრა" until approval (1). Once approved, the
  panel shows the price and a Confirm button; nothing is charged before Confirm.
- Every paid action on a Vercel Preview stays refused until (2) is configured with valid refs.
- `MEDIA/VIDEO/AI_GOOGLE_ONLY=0` alone no longer re-opens third-party engines.
- The Software page button reads „კოდის დაწერა · 3 კრედიტი".

## Safe rollout

1. Owner reviews #67 (Draft) and approves or adjusts prices.
2. Merge order: #64 (with the defect-51 patch and an R3 decision) → #60 → #65 (consider the uid-race proposal) → #68 →
   #67 last. The integration tree proved these merge clean and pass tsc and Jest.
3. After each main push: `vercel ls --prod`, `/api/health` commit check, then smoke-test chat and one free path.
4. Set `OWNER_APPROVED_PRICING` only after (3) is green; redeploy; run one dub and one deck with a test account.
5. Set `RENDER_DRAINER_ENABLED=1` once the settlement rows are observed.

## Rollback

- Code: `git revert -m 1 <merge sha>` of #67 on main (never force). Vercel: promote the previous deployment.
- Pricing only: unset `OWNER_APPROVED_PRICING` + redeploy ⇒ dubbing and deck off, nothing charged.
- Outside engines needed in an incident: set `MEDIA_GOOGLE_ONLY=0` + `OUTSIDE_ENGINES_APPROVED=<owner ref>` + redeploy.
- Preview guard is not a rollback concern: it never affects Production (`VERCEL_ENV=production`).

## Final commit

Filled in after the final CI run; see the last section of EXACT_CONTINUATION.md.

**Last code commit: `62a9940f`** — all CI green, Linux:
- CI (verify: tsc, ESLint, full Jest incl. ffmpeg real-media suites, `next build`): success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259872
- E2E Preview Contract (mocked, no provider calls): success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259948
- Video Core E2E: billing on real Postgres (leaseIsolation, ledgerOnce, runIsolation) success; live E2E desktop + phone (local Supabase) success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259583

The docs-only commit on top of it is the branch head; its CI re-runs the same jobs.
