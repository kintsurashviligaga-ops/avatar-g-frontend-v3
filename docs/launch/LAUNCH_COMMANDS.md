# Launch day: exact commands and SQL

Prepared 2026-11-14. Updated 2026-11-19: Phases 8.4 to 8.9 added (Step 6 items 13 to 19, Step 7 paid checks), plus the plan for stacked PRs (Step 8). Use this the moment the production Supabase project (zwksnayknzggdcenqqxy) is active again.

Updated 2026-11-20 (before GREEN): Step 1d live checks, Step 2d old CSP hosts, Step 3b migrations 20261120a/b, Step 4 deadline note, Step 6 item 22 (drafts #375, #376, #390, #391, #392, #393, #395). 2026-11-21: Step 6 item 23 (#396, #397, Phase 8.14 pre-flight); then Step 0 (Vercel environment variables, exact values) and Step 6 item 24 (#398, Phase 8.15 polish). The combined CI run of every launch PR is #374 (run 2, head d3a8b51e). Readiness report: `/mnt/project-files/launch-green/LAUNCH_READY_2026-11-20.md`. 2026-11-22 (Phase 8.18): Step 3c (every SQL change in one list), Step 6 item 25 (#399, #400, the flag fixes on #309, #310 and #392, and the combined run #401).

The repo copy is `docs/launch/LAUNCH_COMMANDS.md`. Keep the two identical.

- **Who runs what:** GG runs every SQL file and every paid command. Claude merges only after GG approves each PR.
- **Flags:** every flag stays off after a merge. Turning a flag on is a separate decision.
- **Billing and BOG:** those steps are in the pricing thread's checklist ("Design pricing with 65% margin and admin dashboard"). They are not repeated here, so there is one list and no conflicting steps.

**SQL Editor:** https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new
Run each block, then paste the result back in the thread.

---

## Step 0. Vercel environment variables (exact, 2026-11-21)

Where: Vercel → project `avatar-g-frontend-v3` → Settings → Environment Variables → **Production**.

**Two rules that catch people out**

1. **Every change needs a redeploy.** Vercel applies an environment change only to deployments made after it, on the server as well as in the browser. `NEXT_PUBLIC_` names are also baked into the page bundle. To redeploy: Deployments → the current Production deployment → ⋯ → **Redeploy** (keep the same commit). Never run `vercel --prod` from a laptop folder: that would deploy the laptop's files.
2. **Each flag has its own vocabulary.** A value outside the list below leaves the feature **off with no error**. `admin` and `admins` are not the same. Copy the value from this table, with no spaces or quotes. The full generated list is `docs/launch/ENV_REGISTRY.md` (#396).

**0a. Before GREEN and during the merges: change nothing.** Every launch switch stays unset. A merge never needs an environment change.

**0b. Two read-only checks (BOG and OAuth callbacks are built from these).** Open each and confirm the value. Do not edit.

| Name | Must be exactly |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://myavatar.ge` (no slash at the end) |
| `NEXT_PUBLIC_SITE_URL` | `https://myavatar.ge`, or not set |

**0c. After #396 is merged:** open `https://myavatar.ge/api/admin/launch-flags` while signed in as an admin. `warnings` must be `[]`. A warning names the switch and says what is wrong (an ignored value, a misspelt name, a missing `NEXT_PUBLIC_` twin). The same warnings appear once per cold start in the Vercel logs as `[launch-flags]`.

**0d. Turning a feature on later (one decision card each, GG's account first).** Set every name in the row, redeploy, then check 0c.

| Feature (PRs) | Set these | For GG and admins | For everyone | Also needed first |
|---|---|---|---|---|
| 3D Studio (#366, #367, #369, #397) | `STUDIO_3D_V2` and `NEXT_PUBLIC_STUDIO_3D_V2` | `admin` | `everyone` | `STUDIO_3D_JOB`, `STUDIO_3D_REGION=europe-west4`, the GPU job and the `20261115a` SQL (item 18) |
| Smart Editor (#365, #368, #370) | `MONTAGE_SMART_EDITOR` and `NEXT_PUBLIC_MONTAGE_SMART_EDITOR` | `admin` | `everyone` | |
| Director's Workflow (#349 to #355) | `DIRECTORS_WORKFLOW` | `admin` | `everyone` | a paid-check budget from GG |
| Art Director image (#356 to #358) | `IMAGE_ART_DIRECTOR` and `NEXT_PUBLIC_IMAGE_ART_DIRECTOR` | `admin` | `everyone` | |
| Music Producer (#359 to #361) | `MUSIC_PRODUCER_V2` and `NEXT_PUBLIC_MUSIC_PRODUCER_V2` | `admin` | `everyone` | |
| Virtual Studio avatar (#362 to #364) | `AVATAR_STUDIO_V2` and `NEXT_PUBLIC_AVATAR_STUDIO_V2` | `admin` | `everyone` | |
| Reel Task (#393) | `AGENT_REEL_TASK` | `admins` (with the s) | `everyone` | a Reel budget from GG |
| Agent G plugins (#392) | `AGENT_PLUGINS` and `NEXT_PUBLIC_AGENT_PLUGINS` | `admin` and `1` | `all` and `1` | migrations 20261120a/b (Step 3b) |
| Notion (#392) | `CONNECTORS_NOTION` | `admin` | `all` | `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`, `CONNECTOR_TOKEN_KEY`; redirect URL in Notion: `https://myavatar.ge/api/connectors/notion/callback` |
| GitHub (#392) | `CONNECTORS_GITHUB` | `admin` | `all` | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `CONNECTOR_TOKEN_KEY`; callback URL in GitHub: `https://myavatar.ge/api/connectors/github/callback` |
| Google Drive | `CONNECTORS_DRIVE` | `admin` (today) | `all` (not `admins`) | Google verification for everyone |
| Browser login (#346) | `AGENT_BROWSER_LOGIN` | `1` (admins only by design) | none | `AGENT_BROWSER_VAULT_KEY` (already set) |
| Video advanced, last frame (#320, #323) | `CLIP_ADVANCED`, `NEXT_PUBLIC_CLIP_ADVANCED`, `CLIP_LAST_FRAME`, `NEXT_PUBLIC_CLIP_LAST_FRAME` | none (site-wide) | `1` | |
| Music and Interior UX v2 (#329, #330) | `NEXT_PUBLIC_MUSIC_UX_V2`, `NEXT_PUBLIC_INTERIOR_UX_V2` | none (site-wide) | `1` | |
| Chat media renew (#331) | `CHAT_MEDIA_RENEW` | none (site-wide) | `1` | |
| Read-aloud voice v2 (#322) | `READ_ALOUD_VOICE_V2` | none (site-wide) | `1` | |
| Local JWT check (#339) | `AUTH_LOCAL_CLAIMS` | none (site-wide) | `1` | only if Step 1c shows an ES256 or RS256 key |
| Task relay ticket (#340) | `TASK_RELAY_TICKET` | none (site-wide) | `1` | |
| Safety identifier (#371) | `SAFETY_IDENTIFIER_SALT`, then `SAFETY_IDENTIFIER` | none (site-wide) | salt: a random string of 16+ characters, never changed; flag: `1` | |
| Pricing v8, founder finance (#343 to #354) | `NEXT_PUBLIC_PRICING_V8`, `ADMIN_FINANCE_DASHBOARD` | | | the pricing thread's checklist (billing, not here) |
| Image extras (#321) | `IMAGE_EXTRA_RATIOS`, `NEXT_PUBLIC_IMAGE_EXTRA_RATIOS`, `IMAGE_MULTI_REF`, `NEXT_PUBLIC_IMAGE_EDIT_MODE` | none (site-wide) | `1` | |
| Agent G 8.10 (#381, #382, #384, #385, #386) | `NEXT_PUBLIC_AGENT_G_ROUTER_V2`, `NEXT_PUBLIC_AGENT_G_COMMANDS`, `AGENT_G_SHIELD`, `AGENT_G_CONTEXT_V2`, `NEXT_PUBLIC_CHAT_PIN_GOAL`, `LIVE_AGENT_PLANNER` | none (site-wide) | exactly `1`, one at a time | |
| AI provenance metadata (#403) | `AI_PROVENANCE_META` | none (site-wide) | exactly `1` | invisible metadata only |
| Visible AI badge / deepfake label (#404, #405) | `NEXT_PUBLIC_AI_LABELS` | | | **stays off** (GG 2026-11-27 08:09Z) |
| Ledger fail-closed (#407) | `LEDGER_FAIL_CLOSED` | none (site-wide) | exactly `1` | billing: GG card; after Step 1 shows the ledger RPCs answer |

Live voice and the talking avatar are already on for everyone (`LIVE_AUDIENCE=everyone`, `LIVE_AVATAR_AUDIENCE=everyone`). Leave them.

**0e. Not now.** `OPENAI_API_KEY`, `NANOBANANA_API_KEY` and `REPLICATE_API_TOKEN` are still in Production and are still read by the status, diagnostics and video-assemble code. Remove them only after #332 is merged and a fresh search of main shows no reader. That is a post-launch clean-up.

---

## Step 1. Check that the database is really back (free, Terminal)

```sh
# 1a. Full health check. Expect 6/6. It touches the database ONLY with the CRON_SECRET bearer (or an admin session):
#     an anonymous call answers a bare {"ok":true} with no database check at all. Easiest: the GO script (Phase 8.23),
#     which runs 1a, 1b and 1c and prints SUCCESS or FAIL:
#       CRON_SECRET='<the value in Vercel>' scripts/launch/verify.sh
#     By hand (the secret is read from the prompt, not typed on the command line):
read -rs CRON_SECRET && printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" | curl -s --config - https://myavatar.ge/api/health | python3 -m json.tool | head -40

# 1b. Supabase Auth answers. Expect HTTP 200, not ENOTFOUND or a timeout.
curl -s -o /dev/null -w "%{http_code}\n" https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/health

# 1c. Signing keys (needed later for #339). An ES256 or RS256 key in "keys" is good. An empty list means legacy HS256.
curl -s https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/.well-known/jwks.json
```

Then open myavatar.ge signed in. The "temporarily unavailable" page from #294 must be gone.

### 1d. Live checks after GREEN (free, Claude and GG)

Claude does these right after Step 1 passes and reports each one. Nothing here spends money.

| Check | How | Pass |
|---|---|---|
| Sign-in | GG signs in on myavatar.ge (phone and desktop) | Chat opens, no 503 page |
| Balance | The credits chip and `/ka/admin` Billing | The same balance as before the pause |
| Library | `/ka/library` and `/ka/library/workspace` | Old items list and play; signed links renew |
| Generations | Chat history with old images, clips and songs | Results show after a reopen. A **new** paid generation belongs to Step 7 |
| Cron sweeps | Vercel runtime logs for `/api/cron/*`, 30 minutes after GREEN | The ENOTFOUND errors stop |
| Agent G | Open Agent G, run one free web search | Answer with sources |
| Ledger RPCs (8.20) | SQL Editor: `select proname from pg_proc where proname in ('deduct_credits','deduct_credits_once','refund_credits','bog_fulfill_order');` then `notify pgrst, 'reload schema';` | All four names listed. Until the reload, paid routes may see "Could not find the function" (see #407) |
| BOG redelivery (8.20) | Vercel logs for `/api/billing/bog/webhook` after the first real payment | One `bog:` credit per order, even if BOG sends the callback twice |
| Live reconnect (8.20) | GG on a phone: start a Live call, switch Wi-Fi off and on | "კავშირის აღდგენა…" then the call continues, or a clear error. Never a frozen screen |

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

### 2d. Old CSP hosts still in use? (read only)

Paste `/mnt/project-files/launch-green/02_old_csp_hosts_readonly.sql`. It counts rows in every text and json column of `public` that still point at `*.replicate.delivery`, `api.ltx.video` or `files2.heygen.ai`.

- **No rows:** Claude prepares the small CSP clean-up PR (`lib/security/csp.js` and its test). It merges only with GG's card.
- **Any row:** the hosts stay. The result shows which old items still need them.

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

### 3b. Agent G plugin migrations 20261120a/b (with #392, GG's OK)

Both are additive. Each was tested on 2026-11-20 on a local Postgres 16: applied twice, rolled back, applied again. They are needed only before the Notion, GitHub or reminders flags go on. Merging #392 without them is safe, because the plugins then say "needs setup".

Before you start, check the constraint name (read only):

```sql
select conname from pg_constraint
where conrelid = 'public.connector_accounts'::regclass and contype = 'c';
-- Expect connector_accounts_provider_check among the rows. If it is missing, stop and tell Claude.
```

Then paste `supabase/migrations/20261120a_connector_accounts_providers.sql` and `supabase/migrations/20261120b_agent_reminders.sql` from branch `claude/agent-g-plugins`, and check them:

```sql
select public.connector_providers_allowed();            -- expect {google_drive,notion,github}
select count(*) from public.agent_reminders;             -- expect 0
select provider, count(*) from public.connector_accounts group by 1;   -- Drive rows unchanged
```

The rollback is written at the top of each file.

### 3c. Every SQL change after GREEN, in one list (Phase 8.18 audit, 2026-11-22)

This is the complete list. It was checked against the files of all 99 open PRs on 2026-11-22. Nothing outside this table writes to the database. Run each file in the SQL Editor of `zwksnayknzggdcenqqxy` only, in this order:

| # | When | File (branch) | PR | Needed before | Check |
|---|---|---|---|---|---|
| 1 | Right after Step 2 | `supabase/migrations/20261113a_embedding_model.sql` (`claude/memory-google-only`, 67 lines) | #306 | merging #306 (Step 3) | the checks in Step 3 |
| 2 | Any time before the 3D flag goes on | `supabase/migrations/20261115a_studio3d_jobs.sql` (`claude/studio3d-routes`, 35 lines) | #367 | `STUDIO_3D_V2` = `admin` (Step 6 item 18 runs it before the 3D merges) | `select count(*) from public.studio3d_jobs;` gives 0, and `select id, public from storage.buckets where id = 'studio3d';` gives `studio3d`, `false` |
| 3 | Any time before the plugin flags go on | `supabase/migrations/20261120a_connector_accounts_providers.sql` (`claude/agent-g-plugins`, 35 lines) | #392 | `CONNECTORS_NOTION` or `CONNECTORS_GITHUB` | Step 3b |
| 4 | With row 3 | `supabase/migrations/20261120b_agent_reminders.sql` (`claude/agent-g-plugins`, 33 lines) | #392 | reminders | Step 3b |

Every file is additive (`create … if not exists`), and its rollback is written at the top. Rows 2 to 4 are safe to merge before the SQL runs: with the flags off, the routes are 404, and the plugins say "needs setup".

**Not needed at GREEN:**
- **`run_steps`.** There is no migration for it in any PR. It is the planned Phase 3.5d table (docs/v5.1-phase3/01-wiring-plan.md, M-8). The engine PRs #308 to #311 keep a run's state in the job row's `params._run`, which needs no new table. Claude writes the migration only when 3.5d is built, and tests it on staging first.
- **Billing and pricing SQL** (`docs/v5.1-phase5/migrations/20261114a_phase5_money.sql` on #313, and `docs/v8.1-finance/sql/*` on #351 and #353). Item 12 covers these, following the pricing thread's checklist. Phase 8.18 did not touch them, as the rule says.
- **Read-only files** (Step 2a to 2d) change nothing. `docs/v5.1-phase6/sql/02_purge_inactive_chats_DRAFT.sql` (#319) is a draft and is **not** run.
- Migrations already on main (up to `20261101a_connector_accounts.sql`) were applied before the outage. The production-truth check (#276) found only `research_context_files` missing, and no launch PR reads that table.

---

## Step 4. Paid Omni checks (#307), about $1, before 19 Nov ~21:16 UTC

> **2026-11-20:** the C3 deadline passed while the database was paused, and the Omni 1.1 clips have expired. Run with `--skip-c3`. C1 (✦20) still applies.

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

22. *(new, 2026-11-20)* The drafts made since the 19 November run. All were refreshed with main on 2026-11-20 and are in #374 run 2.
    - **#375, #376, #391, #395:** based on main, independent of each other, any order. Each needs green CI on current main before its card.
    - **#390 → #392:** #392 is stacked on #390. Migrations 20261120a/b (Step 3b) are needed only before the plugin flags go on.
      - If **#346** merges first, #390 conflicts in `components/studio/ConnectorsButton.tsx`. Keep both sides. The tested result is in `/mnt/project-files/launch-green/resolutions/ConnectorsButton.tsx`.
      - If **#325** merges first, #392 conflicts in `components/agent/AgentTerminal.tsx`. Keep #325's `agentTerminalCopy` import and add #392's `NotionDraftCard` import.
    - **#393** (Reel Task) is now stacked on **#310** (`claude/engine-media`), so it goes after #308 → #309 → #310. Its flag `AGENT_REEL_TASK` stays off. The Reel paid E2E needs a budget from GG.
23. *(new, 2026-11-21, Phase 8.14 pre-flight)*
    - **#396** (launch flag registry, `/api/admin/launch-flags`, `[feature-error]` log, Library cold start): based on main, any order. **Merge it early**, so that from then on every flag you set can be checked at `https://myavatar.ge/api/admin/launch-flags`. Set flag values only from `docs/launch/ENV_REGISTRY.md`.
    - **#397** (3D per-user limits, failure log): stacked on #369, so merge it right after #366 → #367 → #369.
    - After each feature draft lands, wrap its POST route with `withFeatureLog` (one line each). Claude does this during the merge sequence.
24. *(new, 2026-11-21, Phase 8.15 polish)* **#398** (Georgian screen-reader names, ka/en/ru crash screen, 44 px touch areas, browser logs off in production, README): based on main, no flags, any order. Its CI must be green on current main before its card.
25. *(new, 2026-11-22, Phase 8.18 audit blockers)*
    - **#399** (the browser's network guard, IPv6 and DNS): based on main. Merge it **before** the browser is opened to anyone new. The browser is live for admins today, so after the merge, run one admin browser task on example.com (one sandbox run, a few cents). If it fails, revert #399.
    - **#400** (the same guard for Browser Agent v2): stacked on #387, so it merges right after **#312 → #387**. `AGENT_BROWSER_AGENT` stays off.
    - The flag-isolation fixes are commits on the PRs themselves, so the merge order does not change:
      - **#309:** admin switches.
      - **#310:** pause and unpause.
      - **#392:** Notion and GitHub routes.
      - **#311** and **#393** were brought up to date with #310.
    - **#401** is the throwaway combined run (#312, #387, #400, #399, #308 to #311, #356, #365, #366 to #369, #390, #392). It is closed unmerged after CI.

26. *(new, 2026-11-27, Phase 8.20 pre-flight)* Built work that was outside this list, plus the 8.20 fixes. Each is its own card; flags stay off.
    - **#381 → #382 → #383 → #384 → #385 → #386** (Agent G 8.10), then **#387 → #388 → #389** (8.11 browser v2, error safety, follow-ups). #387 goes after #312; #400 then follows #387 (item 25).
    - **#402 → #403 → #404 → #405** (EU AI Act). Visible labels stay off; only `AI_PROVENANCE_META` may go on later.
    - **#406** (Agent G task card says "temporarily unavailable" in Georgian): main-based, no flag, any time.
    - **#407** (ledger fail-closed, `LEDGER_FAIL_CLOSED` off): main-based. Billing-adjacent, so its own GG card.
    - **#408** (login browser behind the network guard): goes **after #346 and #399**. Its base is #346's branch, so after #346 merges, retarget it to main. Required before `AGENT_BROWSER_LOGIN=1`.
    - New commits on existing PRs (order unchanged): **#396** now lists 13 more switches and the infra names in `.env.example`; **#364** and **#369** got localized skeletons while their panel loads.
27. *(new, 2026-11-27)* Conflicts the 8.20 combined run (branch `claude/throwaway-820-combined`, all 96 PRs + the 8.20 fixes) hit, with the tested resolution. Use the same when the real merges hit them:
    - **#318** privacy page: drop the OpenAI row (chat memory and dictation are both on Google after #306).
    - **#328** clipOrder.ts and **#331** OmniStudio imports: keep both sides.
    - **#340** tasks route.test: keep both test blocks.
    - **#351** live route.test: keep the 3.8 model from #292 and #351's new call shape.
    - **#358**: the upscale button is already gone (#333). Add `artPick`/`runArtChat` and the recipe line in LibraryGallery.
    - **#361** and **#364** OmniStudio: keep Art Director, Music Producer and Virtual Studio side by side (5 hunks, all "keep all").
    - **#371** clip route imports, **#392** AgentTerminal imports, **#403**, **#404**: keep both.
    - **#390** ConnectorsButton: the tested file in `/mnt/project-files/launch-green/resolutions/ConnectorsButton.tsx`.
    - **#396** and **#389** `.env.example`: keep both blocks (#389: keep ours; its seek label is already in #398).
    - **#398**: its a11y labels win; keep #376's ka/ru TrackPlayer copy.
    - **#399** script.ts header comment: keep both bullets (saved login from #346 and the network guard). #408 carries the same resolution.
    - **#388**: CommandCenter, OnboardingWizard and UnifiedServiceLayout stay deleted (#334); in LiveAvatarEnroll keep both imports.

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
