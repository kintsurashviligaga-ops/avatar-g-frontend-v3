# Video Core v1.0: rollback and recovery plan (PR #69 release)

Status 2026-10-15, written **before** any of the changes it undoes. It covers the four changes the PR #69 release makes
in Production: (1) GCP trust for the Production identity (G1/G2), (2) eight Veo env vars (V1), (3) migration 20261014a,
(4) the PR #69 code. BOG, prices, Image Studio (PR #60) and every other service are not touched by this release.

Labels: **VERIFIED FACT** · **INFERENCE** · **NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**.

## მოკლედ

* კოდის და env-ის დაბრუნება: **მხოლოდ Vercel Instant Rollback** წინა Production deployment-ზე. Redeploy არასოდეს
  (Redeploy მიმდინარე commit-ს ახალი env-ით ააგებს).
* GCP-ის დაბრუნება: 2 ბრძანება; Production-ის იდენტობა Veo-ს ანგარიშს ვეღარ გამოიყენებს, Gemini-ზე ჩუმი გადასვლა არ ხდება.
* ბაზის დაბრუნება: 8 `drop` ბრძანება. ფულის ჩანაწერი ledger-ში რჩება, ამიტომ ორმაგი ჩამოჭრა არ ხდება.
* ყველა ნაბიჯს Claude აკეთებს Owner-ის Mac-ზე; SQL-ში Run-ს GG აჭერს.

## 1. Rollback points

| Point | Value | Label |
|---|---|---|
| Production before the release | `dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD` (3516a61, PR #62, created 2026-10-15 10:33Z), the deployment serving myavatar.ge right before the PR #69 deploy | VERIFIED FACT (`vercel inspect myavatar.ge`, 2026-10-15 ~11:08Z) |
| One step further back | `dpl_53vwsPFRs9cppPcvxjhUviH8hSwd` (fef867a, PR #63); BOG's own rollback plan points here too | VERIFIED FACT (memory, BOG release report 2026-10-15) |
| Never | a Redeploy of any deployment, or a git revert pushed to main as the first action (it builds a new deployment with today's env) | rule (brief 2026-10-13 17:34Z) |

## 2. Triggers and actions

| # | Trigger (any one) | Action | Effect | Who |
|---|---|---|---|---|
| R1 | Production build log lacks `[gcp-auth-check] env=production … ok=true`, or `/api/video/engine` does not say `"transport":"vertex"`, or a Veo error spike, or any new 5xx group after the deploy, or the BOG smoke fails | **Vercel Instant Rollback** to the point in §1 | code and env of that deployment come back together (env is per deployment): Veo on the Gemini API as before, no `film_billing` reads | Claude (Vercel connector or CLI on the owner's Mac) |
| R2 | the GCP side must be closed too | `update-oidc … environment in ['preview']`; `remove-iam-policy-binding` of the `…:environment:production` principal on `myavatar-veo` | a Production token can no longer impersonate the SA; a pinned Vertex call fails closed (`token_failed` / `not_configured`), never a Gemini render | Claude on the owner's Mac (gcloud wrapper) |
| R3 | after R1, to return Production env to its old list | `vercel env rm NAME production` for the 8 vars, **no redeploy** | the next deploy builds without Vertex | Claude on the owner's Mac |
| R4 | the migration itself is faulty (it is not expected: preflight + verify row, PG-tested) | the drop statements in the migration header (functions first, then `film_scenes`, then `film_billing`) | the code falls back to the ledger + Redis cache and STOPS on uncertainty; a failed scene is simply not given back (as before R3-A) | Claude opens the SQL Editor; GG presses Run |
| R5 | a paid film is stuck (stitch refused as `busy` / `spent`, or a refund logged `REFUND FAILED`) | read the film with the reconciliation queries (`FINANCIAL_INTEGRITY_REPORT.md` §4); a lease expires on its own after 660 s; a failed refund is credited by hand under its own ref | the user is made whole once | Claude reads; a manual credit is **OWNER ACTION REQUIRED** |

The order of R1–R4 is safe in any combination: the code never needs the GCP trust to stay safe (F6, a pinned but
unusable Vertex is `not_configured`), and it never needs the tables to avoid a second charge (the ledger is the proof of
payment). VERIFIED FACT: `lib/veo/engine.test.ts`, `lib/chat/filmBilling.pg.test.ts` "before" phase.

## 3. The exact commands (for R2–R4)

```bash
G=~/.myavatar-gcloud/gcloud; P=gen-lang-client-0671348730
# R2
$G iam workload-identity-pools providers update-oidc vercel-oidc --workload-identity-pool=vercel --location=global --project=$P \
  --attribute-condition="assertion.owner_id == 'team_YGQHjuCUs0f7tKoLtrCgSIFG' && assertion.project_id == 'prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH' && assertion.environment in ['preview']"
$G iam service-accounts remove-iam-policy-binding myavatar-veo@$P.iam.gserviceaccount.com --project=$P --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/subject/owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:production"
# R3 (cwd ~/Movies/myavatar-upstash-20261013, linked to the project; never `vercel env pull`)
for n in GCP_PROJECT_ID GCP_PROJECT_NUMBER GCP_SERVICE_ACCOUNT_EMAIL GCP_WORKLOAD_IDENTITY_POOL_ID \
         GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID GCP_VEO_BUCKET GCP_VEO_LOCATION VEO_TRANSPORT; do vercel env rm "$n" production --yes; done
```

```sql
-- R4 (one transaction)
begin;
drop function public.settle_film_scene(uuid, text, integer, boolean);
drop function public.pending_film_scenes(uuid, text);
drop function public.record_film_scenes(uuid, text, jsonb);
drop table public.film_scenes;
drop function public.settle_film_waiver(uuid, text, text, boolean);
drop function public.lease_film_waiver(uuid, text, text, integer);
drop function public.record_film_billing(uuid, text, text, integer, text);
drop table public.film_billing;
commit;
```

## 4. Verification after a rollback (all free, read-only)

1. `/api/health` names the rollback point's commit.
2. `/api/video/engine` → `"transport":"gemini"` (Instant Rollback) or `not_configured` for Veo (R2 without R1).
3. BOG smoke workflow "BOG Production smoke (read-only)" 9/9.
4. Runtime errors (Vercel) for 15 minutes: no new group.
5. After R4: `select to_regclass('public.film_billing'), to_regclass('public.film_scenes')` → both null.

## 5. Recovery of a user's money (any time)

* A film is paid once under `filmpay:<token>`; every give-back has its own ref and is paid at most once
  (`refund_credits` dedupes per ref). So a refund can be re-run safely by hand under the SAME ref. VERIFIED FACT
  (`lib/orchestrator/ledger.refundByRef.test.ts`, the unique index `credit_ledger_user_ref_positive_uniq`).
* Never credit a user under a new, made-up ref for a film refund: it bypasses the per-ref cap.

## 6. What is not covered

* Veo outputs already in `gs://myavatar-veo-outputs` stay under its 30-day delete rule; a rollback deletes nothing.
* Rows written to `film_billing` / `film_scenes` before an R4 are lost with the tables; the ledger keeps the money facts.
  INFERENCE: the only effect is that those films' stitches fall back to the cache path (stop, never a second charge).
* R4 was drilled on a throwaway Postgres 16 on 2026-10-15: the SQL Editor script applied, one paid film recorded, then
  the §3 block → both tables gone, no film function left, the film's ledger debit still there (VERIFIED FACT). The same
  script run a second time is refused by its preflight and changes nothing (VERIFIED FACT). R1–R3 were not exercised in
  Production: NOT TESTED in T6.
