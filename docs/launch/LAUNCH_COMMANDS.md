# Launch day: exact commands and SQL

Prepared 2026-11-14. Updated 2026-11-19: Phases 8.4 to 8.9 added (Step 6 items 13 to 19, Step 7 paid checks), plus the plan for stacked PRs (Step 8). Use this the moment the production Supabase project (zwksnayknzggdcenqqxy) is active again.

The repo copy is `docs/launch/LAUNCH_COMMANDS.md`. Keep the two identical.

- **Who runs what:** GG runs every SQL file and every paid command. Claude merges only after GG approves each PR.
- **Flags:** every flag stays off after a merge. Turning a flag on is a separate decision.
- **Billing and BOG:** those steps are in the pricing thread's checklist ("Design pricing with 65% margin and admin dashboard"). They are not repeated here, so there is one list and no conflicting steps.

**SQL Editor:** https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new
Run each block, then paste the result back in the thread.

---

## Step 1. Check that the database is really back (free, Terminal)

```sh
# 1a. Full health check. This one does touch the database. Expect 6/6.
curl -s https://myavatar.ge/api/health | python3 -m json.tool | head -40

# 1b. Supabase Auth answers. Expect HTTP 200, not ENOTFOUND or a timeout.
curl -s -o /dev/null -w "%{http_code}\n" https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/health

# 1c. Signing keys (needed later for #339). An ES256 or RS256 key in "keys" is good. An empty list means legacy HS256.
curl -s https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/.well-known/jwks.json
```

Then open myavatar.ge signed in. The "temporarily unavailable" page from #294 must be gone.

> Do not rely on `/api/health/public`. It said 6/6 during the outage because it never touches the database.

---

## Step 2. Read-only SQL (SQL Editor, in this order)

These only read. Nothing changes in the database.

### 2a. Ledger introspection (B-02)

Paste the whole file `docs/ledger-unification/01_introspect.sql` from main. It has 86 lines and 6 result blocks. Copy every result block back to the thread.

### 2b. Tables deleted with an account (#319, needed for ACCOUNT_DELETE_V2)

Paste the whole file `docs/v5.1-phase6/sql/01_fk_cascades_readonly.sql` from branch `claude/phase6-security`. It has 24 lines.

### 2c. What the outage left behind

```sql
-- Q1. Generation jobs that were running when the database paused (12 Nov 09:33 UTC) and never finished.
select service_type, status, count(*) as jobs,
       min(created_at) as oldest, max(created_at) as newest
from public.generation_jobs
where created_at between timestamptz '2026-11-11 00:00+00' and timestamptz '2026-11-12 09:33+00'
  and status not in ('completed', 'failed')
group by 1, 2
order by 3 desc;

-- Q2. The same jobs, one row each (Claude checks every one against the ledger before any refund).
select id, user_id, service_type, status, current_stage, created_at, updated_at
from public.generation_jobs
where created_at between timestamptz '2026-11-11 00:00+00' and timestamptz '2026-11-12 09:33+00'
  and status not in ('completed', 'failed')
order by created_at
limit 200;

-- Q3. BOG orders from the 24 hours before the pause that were never completed.
--     GG compares this list with BOG Business Manager. A paid order with no credit is a gap.
select shop_order_id, bog_order_id, user_id, kind, amount_gel, credits, status, created_at, credited_at
from public.bog_orders
where created_at between timestamptz '2026-11-11 09:33+00' and timestamptz '2026-11-12 09:33+00'
  and status <> 'completed'
order by created_at;

-- Q4. Plans whose period ended during the outage. Their renewal is charged on the first cron tick.
--     Whether to extend those periods is GG's decision.
select tier, status, count(*) as plans, min(current_period_end), max(current_period_end)
from public.subscriptions
where current_period_end between timestamptz '2026-11-12 09:33+00' and now()
group by 1, 2;
```

Nothing is fixed from these results until GG has seen them. Any refund goes through the existing refund path, and live BOG code is never changed.

---

## Step 3. The one SQL change before a merge: #306 chat memory

This must run **before #306 is merged**. It adds the `embedding_model` column for chat memory, and it is safe to run twice.

Paste the whole file `supabase/migrations/20261113a_embedding_model.sql` from branch `claude/memory-google-only` (67 lines). Then check it:

```sql
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'memories' and column_name = 'embedding_model';
-- Expect one row with default 'gemini-embedding-001@1536'.
```

**After #306 is merged:** GG re-embeds old memories while signed in as admin. Copy the `cookie` header from DevTools, exactly as in Step 4.

```sh
read -s MYAVATAR_COOKIE && export MYAVATAR_COOKIE   # paste, then Enter. Nothing is shown or saved.

# Dry run (free): shows how many rows are pending and embeds nothing.
curl -s -X POST https://myavatar.ge/api/admin/memory-reembed \
  -H "content-type: application/json" -H "cookie: $MYAVATAR_COOKIE" -d '{}'

# Real run: repeat with the nextCursor it returns until nextCursor is null.
curl -s -X POST https://myavatar.ge/api/admin/memory-reembed \
  -H "content-type: application/json" -H "cookie: $MYAVATAR_COOKIE" \
  -d '{"dryRun": false, "limit": 200}'
curl -s -X POST https://myavatar.ge/api/admin/memory-reembed \
  -H "content-type: application/json" -H "cookie: $MYAVATAR_COOKIE" \
  -d '{"dryRun": false, "limit": 200, "cursor": "<nextCursor>"}'

unset MYAVATAR_COOKIE
```

- If a batch answers `repeated_failures`, check `curl -s https://myavatar.ge/api/health/embed` before calling it again.
- Cost: a fraction of a cent per thousand rows.

---

## Step 4. Paid Omni checks (#307), about $1, before 19 Nov ~21:16 UTC

Run these on GG's Mac, in the probe clone. They cannot run from localhost or from a Preview.

```sh
git fetch --depth 1 origin claude/omni-paid-checks && git reset --hard FETCH_HEAD
```

Find a clip made on Omni 1.1, for check C3. This query is read-only:

```sql
select m.created_at, jsonb_path_query_first(m.metadata, '$.**.omniJob') #>> '{}' as omni_job
from public.chat_messages m
join auth.users u on u.id = m.user_id
where u.email = '<your sign-in email>'
  and jsonb_path_exists(m.metadata, '$.**.omniJob')
  and (jsonb_path_query_first(m.metadata, '$.**.omniJob') #>> '{}') !~ 'm2(~|$)'
  and m.created_at > now() - interval '7 days'
order by m.created_at desc
limit 5;
```

Then run the checks:

```sh
read -s MYAVATAR_COOKIE && export MYAVATAR_COOKIE
node scripts/omni-checks/run.mjs --from11 '<omni_job>'          # dry run, free: expect C1 ✦20, C3 ✦25
node scripts/omni-checks/run.mjs --go --from11 '<omni_job>'     # paid, capped at ✦70
unset MYAVATAR_COOKIE
```

If the SQL finds no 1.1 clip, add `--skip-c3`. The full guide is in `docs/v5.1-phase2/omni-paid-checks.md`.

---

## Step 5. Live 3.8 relay switch (after #292 is merged)

Run this on GG's Mac with gcloud. The relay is Cloud Run `live-relay` in europe-west4.

```sh
gcloud run services update live-relay \
  --project gen-lang-client-0671348730 --region europe-west4 \
  --update-env-vars LIVE_RELAY_MODEL_LOCATIONS=gemini-3.8-live=eu
gcloud run services describe live-relay --project gen-lang-client-0671348730 --region europe-west4 \
  --format='value(status.latestReadyRevisionName,status.traffic)'
```

Then GG makes one Georgian voice and avatar call on myavatar.ge.

**Rollback:** set `GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-latest` in Vercel (this works until 13 Dec), or send traffic back to the previous revision:

```sh
gcloud run services update-traffic live-relay --project gen-lang-client-0671348730 \
  --region europe-west4 --to-revisions <previous-revision>=100
```

---

## Step 6. Merge order (Master Report Section 3, extended)

Rules for every merge:

- One decision card per PR.
- CI must be green on current main before the card.
- After each merge, check production health: `curl -s https://myavatar.ge/api/health` must read 6/6.
- Every flag stays off.

The order:

1. Step 1 checks pass.
2. Step 3 SQL, then merge **#306 → #318 → #332**. #332 goes last because it builds on both.
3. Merge **#292** (then do Step 5), **#317**, **#319**.
4. Run the Step 4 paid checks. You can merge #307 any time; it is tools and docs only.
5. Merge the UI work: **#320 → #323 → #321 → #322 → #325 → #326 → #327 → #328 → #331 → #329 → #330**. Resolve the conflicts as already tested:
   - In clipOrder.ts, keep both clipAdvancedLine and refineClipSettings.
   - In the OmniStudio imports, keep clipAdvancedUiOn, clipLastFrameUiOn and useChatMediaRenew.
6. Turn flags on one at a time, on GG's account first, each as its own decision: video advanced and last frame, then image, then NEXT_PUBLIC_MUSIC_UX_V2, then NEXT_PUBLIC_INTERIOR_UX_V2, then CHAT_MEDIA_RENEW.
7. Merge the docs: **#287 → #290**, then **#324**.
8. Merge the Agent G engine: **#308 → #309 → #310 → #311**, then **#314 → #316**. Flags stay off. Each stacked PR is retargeted to main after the one before it merges.
9. Merge **#274**. Main was merged into it on 2026-11-19 (f234ae4); it goes in only once its CI is green on current main.
10. *(new)* Merge the Phase 7.8 clean-up: **#333 → #334 → #338**, then **#335, #336, #337**.
11. *(new)* Merge the Phase 8.0 speed work: **#348** (lazy chat chunks) → **#342** (parallel chat checks) → **#347** (shared auth helper) → **#339** (AUTH_LOCAL_CLAIMS, off) → **#340** (TASK_RELAY_TICKET, off).
    - Turn on AUTH_LOCAL_CLAIMS only if Step 1c shows an ES256 or RS256 key.
    - **#341** (fra1) stays a draft until the database and Redis move to the EU.
12. Billing and pricing (**#313, #343, #344, #345, #351**, and the v8 SQL): follow the pricing thread's checklist.
13. Director's Workflow (Phase 8.2): **#349 → #350 → #352 → #355**, flag `DIRECTORS_WORKFLOW` off. Its paid check (Step 7) has **no approved budget yet**: GG sets one first.
14. *(new)* Art Director image (Phase 8.4): **#356 → #357 → #358**. Flags `IMAGE_ART_DIRECTOR` and `NEXT_PUBLIC_IMAGE_ART_DIRECTOR` stay off. No migration.
15. *(new)* Music Producer (Phase 8.5): **#359 → #360 → #361**, then the one-line `registerFilmTarget()` hook in #355's FinalCutPanel, which Claude adds after both stacks are in. Flags `MUSIC_PRODUCER_V2` and `NEXT_PUBLIC_MUSIC_PRODUCER_V2` stay off.
16. *(new)* Virtual Studio (Phase 8.6): **#362 → #363 → #364**. Flags `AVATAR_STUDIO_V2` and `NEXT_PUBLIC_AVATAR_STUDIO_V2` stay off. No relay deploy is needed (takes are recorded as a relay client).
17. *(new)* Smart Editor montage (Phase 8.7): **#365 → #368 → #370**. Flags `MONTAGE_SMART_EDITOR` and `NEXT_PUBLIC_MONTAGE_SMART_EDITOR` stay off.
18. *(new)* 3D Studio (Phase 8.8), in this order:
    - GG deploys the GPU worker job (`services/studio3d-worker/README.md` on #367) and runs the Step 7 probe.
    - GG runs `supabase/migrations/20261115a_studio3d_jobs.sql` (branch `claude/studio3d-routes`) in the SQL Editor.
    - Then merge **#366 → #367 → #369**. Flags `STUDIO_3D_V2` and `NEXT_PUBLIC_STUDIO_3D_V2` stay off.
19. *(new)* Lifecycle (Phase 8.9): **#372** (docs and a probe plan only, any time), then **#371** (`safety_identifier`, flag off).
    - To turn it on later: set `SAFETY_IDENTIFIER_SALT` (a random string of at least 16 characters, **never changed afterwards**), then `SAFETY_IDENTIFIER=1`, then redeploy.
20. *(new)* Other built work outside the old list. Each is its own decision:
    - **#346** (Agent G logs in inside the cloud browser): turn-on = merge + `AGENT_BROWSER_LOGIN=1` + redeploy, and one ~$0.05 sandbox run.
    - **#312** (Browser Agent loop, App Builder): not wired. Stays draft until `myavatar-apps.ge` exists.
    - **#315** (Georgian QA corpus): docs and tests, any time.
21. *(new)* The 24 old PRs: follow `CLEANUP.md` once GG approves it. Nothing there is closed before that.

**If a merge goes wrong:** in Vercel, promote the previous production deployment. This is instant and needs no rebuild. Then revert the merge commit. No step here runs SQL inside a merge, so a rollback never needs a database change.

---

## Step 7. Paid checks for Phases 8.2 to 8.9

Run each one only after its PRs are merged and its flags are set to `admin` for GG's account, on myavatar.ge (never a Preview: Previews block paid writes). GG runs every paid command. The amounts below are the budgets GG approved in each phase thread; the ones that differ from the 2026-11-19 list are marked.

| Phase | Check | Budget | Matches GG's list? | What it proves |
|---|---|---|---|---|
| 8.4 Art Director | 1K/2K/4K grid, one mask edit, one re-render upscale | ~$1.00 | yes | Billing per delivered image, refunds on failure, the 65 % margin |
| 8.5 Music Producer | 30 s clip, one full song, one "Add 30 s", Use in Video on a film | ~$0.30 | yes | Lyria on Vertex, Georgian Beta vocals, placement into a scene |
| 8.6 Virtual Studio | Live presenter renders, one Omni green-screen scene, Chirp timings | ~$1.00 | yes | The Live cost per 30 s (estimated ✦27), Georgian verbatim accuracy, keying |
| 8.7 Smart Editor | Chirp captions on a short Georgian clip | ~$0.10 | yes | Word timings and the ✦2 per minute price |
| 8.8 3D Studio | One probe across 5 models on the deployed GPU job | ~$2.00 | yes, but **also a running cost**: the GPU job costs about $3 a month while idle and about $0.13 per standard model | TRELLIS.2 call names, GPU seconds (then re-check prices) |
| 8.9 Lifecycle | Georgian lite-TTS backup | **$0 left** | **differs**: GG's probe already ran on 2026-11-19 (5/5 HTTP 200, ~$0.03). What is left is GG listening to the clips in `~/vertex-certify/out-lite-tts` | Whether lite is a usable Georgian backup |
| 8.2 Director's Workflow | Real Lyria bed, the ffmpeg cut on Vercel, the Library entry | **not set** | **not on GG's list** | GG sets a budget first |
| Agent G browser login (#346) | One login run on the real Vercel Sandbox | ~$0.05 | **not on GG's list** | Counted inside the existing $20 sandbox ledger |

**Total of the set amounts:** about $4.45 (plus the Omni checks in Step 4, about $1, and the Director's Workflow budget once set).

---

## Step 8. Stacked PRs: getting each one a real CI run

**The problem.** GitHub CI (`ci.yml`, `e2e.yml` and the rest) runs only for PRs into `main`. 29 PRs are stacked on another PR's branch, so they have only the Vercel preview check. Four of them (#43, #44, #51, #108) are in `CLEANUP.md`. These 25 are in launch plans:

| Stack (merge order) | Stacked PRs without GitHub CI |
|---|---|
| #287 → #290 | #290 (its Vercel status also shows failure) |
| #308 → #309 → #310 → #311 | #309, #310, #311 |
| #314 → #316 | #316 (3 checks only) |
| #320 → #323 | #323 |
| #313 → #343 → #351 → #353 → #354, and #343 → #344, #345 | #343, #344, #345, #351, #353, #354 |
| #349 → #350 → #352 → #355 | #350, #352, #355 |
| #356 → #357 → #358 | #357, #358 |
| #359 → #360 → #361 | #360, #361 |
| #362 → #363 → #364 | #363, #364 |
| #365 → #368 → #370 | #368, #370 |
| #366 → #367 → #369 | #367, #369 |

**The rule.** A stacked PR gets a merge card only after it targets `main` and the full CI is green on it.

**The steps for each child, right after its parent is squash-merged:**

1. Retarget the child to main. GitHub does this by itself if the parent's branch is deleted; otherwise Claude runs:
   ```sh
   gh api -X PATCH repos/kintsurashviligaga-ops/avatar-g-frontend-v3/pulls/<child> -f base=main
   ```
2. Merge main into the child's branch, without rebasing or force-pushing. The parent's changes now sit on main as one squash commit, so any conflict is in files the parent already changed; main's side is the merged version.
   ```sh
   git fetch --depth 50 origin main <child-branch>
   git checkout <child-branch> && git merge origin/main
   ```
3. Run the fast checks locally (`tsc`, `eslint` on the changed files, the PR's jest suites), then push. Pushing starts the full GitHub CI.
4. Wait for every check to be green. A red check is fixed on that branch, and a job is re-run at most once.
5. One decision card to GG for the merge. After the merge: production health 6/6, flags still off.
6. Repeat for the next child.

**Optional early signal (before the database is back).** Claude can open one throwaway draft PR into `main` that merges every launch PR together, as was done in Phase 7.7. CI then runs once on the whole set and shows conflicts or failures early. That PR is never merged; it is closed after the run. It needs GG's OK, because it uses a full CI run (about 20 minutes of runners).
