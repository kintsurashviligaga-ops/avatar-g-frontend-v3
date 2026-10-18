# EXACT CONTINUATION (after the final P0/P1 repair run, 2026-10-14)

Worktree `/Users/giorgikintsurashvili/myavatar-global-e2e-wt`, branch `claude/global-final-e2e-20261014`, Draft PR #67.
Read first: FINAL_RELEASE_GATES.md, FINAL_FINANCIAL_SECURITY_EVIDENCE.md, FINAL_INTEGRATION_E2E_MATRIX.md.

## Rules that still hold

Keep #67 Draft. No force push, no main merge, no Production deploy or env change, and no paid Google call without new
owner approval. Don't edit #64/#60/#65/#68 branches; use disposable worktrees. In a worktree, symlink node_modules from
this worktree.

## Rebuild the integration tree

```
git worktree add --detach /tmp/int-wt claude/global-final-e2e-20261014
cd /tmp/int-wt && ln -s /Users/giorgikintsurashvili/myavatar-global-e2e-wt/node_modules node_modules
for b in claude/video-core-final-20261013-234606 codex/image-studio-v1 claude/music-studio-v1-20261014 astra/agent-g-voice-experience-v2-20261014; do git merge --no-edit origin/$b; done
git cherry-pick 7fe06fb5                       # uid-race proposal
git am <worktree>/docs/handoffs/global-e2e/patches/defect51-durable-stitch-settlement.patch
npx tsc --noEmit -p . && npx jest --silent      # expect only the 5 macOS ffmpeg suites to fail
```

Known merge interaction: `lib/pipeline/statusAgent.test.ts` line 39 needs
`OUTSIDE_ENGINES_APPROVED: 'owner-test-approval'`. #67 carries it; #65's version of that file merges on top cleanly.

## Isolated Preview database (owner approval needed)

- Resource: one **new Supabase project** for Previews. The org is FREE tier. A second free project costs **$0** if the
  org's free project quota allows it; otherwise Pro is **$25/month + ~$10/month compute** (owner decision).
  Free projects pause after 7 idle days.
- Setup: apply `supabase/migrations/*` in order. Then set **Preview-scoped** Vercel env: `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_URL`, anon and service keys of the new project, `PREVIEW_ISOLATED_DB=1`, `PREVIEW_SUPABASE_REF=<new ref>`,
  `PRODUCTION_SUPABASE_REF=zwksnayknzggdcenqqxy`. Redeploy a Preview. `previewIsolationVerdict` must report
  `isolated: true`; any other reason code means it stays refused.
- Cleanup: delete the Preview-scoped env rows, then pause or delete the project.
- Until then, the CI local-Supabase E2E (desktop + phone) is the strongest evidence, and it is **not** deployed E2E.

## Next engineering steps

1. #64 owner: apply the defect-51 patch, decide R3 (hook points in the patch notes: drain-renders ~L106, the route's
   refund branches).
2. Owner: approve prices ⇒ `OWNER_APPROVED_PRICING=dubbing:10,presentation:15` (Production-scoped) + redeploy.
3. Enable `RENDER_DRAINER_ENABLED=1` after observing settlement rows.
4. P2 leftovers: hide `params.source === 'assemble-settlement'` rows from History. Two old lint warnings in
   ServiceParamsPanel.

## Final commit and CI

Filled in below by the last step of this run.

**Last code commit: `62a9940f`** — all CI green, Linux:
- CI (verify: tsc, ESLint, full Jest incl. ffmpeg real-media suites, `next build`): success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259872
- E2E Preview Contract (mocked, no provider calls): success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259948
- Video Core E2E: billing on real Postgres (leaseIsolation, ledgerOnce, runIsolation) success; live E2E desktop + phone (local Supabase) success — https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38611259583

The docs-only commit on top of it is the branch head; its CI re-runs the same jobs.
