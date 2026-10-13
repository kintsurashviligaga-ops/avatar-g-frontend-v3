# Image Studio Phase 6 — isolated real E2E

Status: PREPARED, NOT EXECUTED. No live Google generation, production migration, deployment, or production write was authorized or performed during recovery. Offline harness tests are not live evidence.

## Prerequisites

- Provision a separate nonproduction Supabase project with the existing application schema, hardened ledger RPCs, private `renders` and upload buckets, and their existing RLS policies. Do not point this harness at production or apply migrations there.
- Supply two disposable authenticated users, A and B. Seed A's profile and test credits through the project's approved test fixture process. Both users must pass the existing media access policy; B must have no ownership of A's assets.
- Run this branch against that same isolated project, a separate Redis namespace/instance, and the intended fixed Google transport. Configure existing Google/WIF or Gemini credentials on the application server only. Do not expose provider credentials to the harness or browser.
- Retain the current capability gate. `operationVerifiedAt: null` and `liveOperationVerified: false` are honest until actual evidence is reviewed. Catalog presence is not proof of Google availability.
- No other work should spend credits from these test users during ledger-delta assertions.

Set the following locally (never commit values or paste secrets into a report):

| Variable | Meaning |
|---|---|
| `IMAGE_E2E_ENVIRONMENT` | exactly `isolated`; owner must verify this environment is nonproduction |
| `IMAGE_E2E_APP_ORIGIN` | origin of the isolated app, HTTPS or loopback HTTP |
| `IMAGE_E2E_SUPABASE_ORIGIN` | `https://<isolated-project-ref>.supabase.co` |
| `IMAGE_E2E_PROJECT_REF` | exact isolated project ref, checked against the database hostname |
| `IMAGE_E2E_ANON_KEY` | isolated project's public client key |
| `IMAGE_E2E_SERVICE_KEY` | isolated service role, used only for explicit read checks |
| `IMAGE_E2E_USER_A_TOKEN`, `IMAGE_E2E_USER_B_TOKEN` | separate short-lived user access tokens |
| `IMAGE_E2E_REPORT` | new private report file outside the repository; paid mode refuses an existing path |

The guard rejects `myavatar.ge`, mismatched project refs, credential-bearing URLs, and missing isolation declarations. A hostname guard cannot independently certify an arbitrary custom preview domain: verify its server environment before invoking it.

## Stages

1. `node scripts/image-studio/live-e2e.mjs config` validates configuration with **zero network requests**. This currently reports BLOCKED because the isolated environment and credentials were not supplied.
2. `node scripts/image-studio/live-e2e.mjs preflight` performs GET-only real checks: authenticate two distinct users, inspect the existing private Storage bucket, read A's database profile, and verify that the application returns A's identity and the expected catalog model. It does not quote, start jobs, write Storage, run migrations, or contact Google. Success is `PREFLIGHT_PASS_NOT_E2E`.
3. **STOP for separate owner approval before paid mode.** Agree on two maximum paid jobs (one generation and one edit), a credit cap, intended Google transport/model, and acceptable provider cost. Credit prices are not a verified USD cost estimate. No such approval exists in this recovery session.
4. Only after that approval, set `IMAGE_E2E_PAID_APPROVAL=explicit-owner-approval` and `IMAGE_E2E_MAX_CREDITS=<approved positive integer>`, then run `node scripts/image-studio/live-e2e.mjs paid`. The mode submits at most two distinct quoted jobs, each with two concurrent confirmations to exercise idempotency. There is no automatic resubmission after an uncertain POST. Each request has a 30-second deadline; each job is polled for at most five minutes. IDs are saved before dispatch so an interrupted run can be reconciled without starting again.
5. The paid mode checks quote-without-job/debit; 202 initial / 200 replay; completed job; private signed PNG and digest; exactly one real ledger debit and balance delta; B's 404 on A's job/asset; Library inclusion; and generation→edit version lineage. These are real app/DB/Storage/provider calls only when deliberately run against the isolated environment. The offline test suite substitutes HTTP fixtures and proves harness behavior only.
6. Review the two actual images for the requested edit and unchanged source. Record provider request IDs, actual usage/cost if available, job IDs and private artifact paths. Do not publish signed URLs, tokens, user secrets, or full private payloads. Technical completion is explicitly `LIVE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED`, not visual acceptance.

## Remaining real scenarios (not claimed by the two-job harness)

| Gate | Required isolated experiment |
|---|---|
| AC-03–05 | Approved reference/character/outfit/product images; inspect role adherence and exact packaging visually; separately authorize any additional generations |
| AC-07 | Isolated provider failure injection and temporary ledger/refund outage; inspect real debit/refund rows and durable debt, then sweep once and prove no double refund |
| AC-08–09 | Cancel while in flight; restart only the isolated worker; reload the browser and inspect the same job ID; prove no duplicate dispatch or late delivery |
| AC-10 | Real RLS/auth checks for A/B upload, result and version ownership, including direct Storage access and foreign lineage |
| AC-12 | Georgian command through the real Agent G session, quote only until a human confirmation; no implicit inference |
| AC-15 | Inspect real concurrent CAS/lease behavior and one provider request per quoted job; ledger delta alone does not prove provider-call count |
| PR #58 | Run the same isolated lifecycle with the reviewed Video Core version installed in a separate test environment; existing mocked browser coexistence is insufficient |

Do not invoke another user's pending Image Studio approvals. Do not provision production resources. The existing `scripts/lease-isolation/run.sh` documents local PostgreSQL/PostgREST fixtures but still contains legacy `--forceExit` invocations; do not use that flag as cleanup. Once its required local runtimes are available, run its four suites separately with bounded deadlines and full logs, including both before/after ledger states. Its notification outlets are mocked.

## Verification already available

`node --test scripts/image-studio/live-e2e.test.mjs` passes five offline harness tests: default no-network behavior, missing approval/config refusal, GET-only preflight, real-response-shape 202/200 idempotent flow, and budget rejection before confirmation. These tests do not contact Google, Storage or a database.

## Free local acceptance evidence (2026-10-13)
PR head09333d7a: Image Auth/RLS/private Storage/Versions/Library3/3 PASS in the existing isolated Video Core workflow; total38/38 PASS. Outputs are synthetic seeded PNGs, not Google results. Credit balance and ledger remained unchanged. No quote/confirm/provider call. This closes only local free boundaries; hosted preflight and paid lifecycle remain unexecuted. Run38413376597; see current matrix.
