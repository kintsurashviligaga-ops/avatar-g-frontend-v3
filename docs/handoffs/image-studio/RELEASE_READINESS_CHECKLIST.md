# Image Studio v1.0 — Release readiness checklist
**Production NO-GO; merge/deploy/ხარჯვის ნებართვა ამ დოკუმენტით არ გაიცემა.**

## დასრულებული
- [x] Recovery checkpoint/backup/hash verification; არსებული branch და Draft PR60.
- [x] Timer cleanup და bounded tests/logs; release suites ბუნებრივად სრულდება.
- [x] PR58-ის უკვე არსებული QC fixture fix, უცვლელი assertions-ით.
- [x] Lease7/7 before/after, ImageDB3/3, ledger, runs, outbox; Image browser5/5 და harness5/5.
- [x] PR58 finalhead aa0de1f7-ზე source/typecheck/browser coexistence.
- [x] რეალური local Auth/RLS/Storage/Versions/Library — Image3/3, Video+Image38/38.
- [ ] საბოლოო owner approval და რეალური paid-provider acceptance.

## Production-safe prerequisites
- [ ] Final PR head-ის ყველა საჭირო CI check PASS; ახალი main/PR head-ზე compatibility განმეორდეს.
- [ ] დადასტურებული იზოლირებული app/Supabase/Redis გარემო,2disposable მომხმარებელი და server-only Google credentials.
- [ ] რეალური Google generation/edit, outputs-ის ხარისხი და ზუსტი ხარჯი/call count.
- [ ] Real Redis admission, crash/restart, cancel, timeout და refund-outage settlement drills.
- [ ] ordinary მომხმარებლის rollout/access policy და reference/image ownership live review.
- [ ] შესაბამისი production platform/FFmpeg binary validation; macOS baseline incompatibilities ცალკე tracked.
- [ ] Reviewed artifact/rollback target/მონიტორინგის owner და ცალკე merge/Production rollout approval.

## Environment names — მნიშვნელობები არ ჩაიწეროს Git-ში
- App/Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; quote: `AGENT_G_QUOTE_SECRET`; access policy: `AGENT_G_MEDIA_EXEC`.
- Concurrency: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` ან არსებული `KV_REST_API_URL`, `KV_REST_API_TOKEN`. ცალკე test instance; შეცდომისას paid lane fail-closed.
- Google: ფიქსირებული `GEMINI_TRANSPORT=gemini_api|vertex`. Gemini key: `GEMINI_API_KEY` (არსებული aliases `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_API_KEYS`). Vertex: `GCP_PROJECT_ID`, საჭიროებისამებრ `GCP_GEMINI_LOCATION`/`GCP_PREDICT_LOCATION`; auth: `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` და OIDC federation, ან არსებული `GCP_SERVICE_ACCOUNT_KEY`. Google secret მხოლოდ server-ზე.
- Hosted harness: `IMAGE_E2E_ENVIRONMENT=isolated`, `IMAGE_E2E_APP_ORIGIN`, `IMAGE_E2E_SUPABASE_ORIGIN`, `IMAGE_E2E_PROJECT_REF`, `IMAGE_E2E_ANON_KEY`, `IMAGE_E2E_SERVICE_KEY`, `IMAGE_E2E_USER_A_TOKEN`, `IMAGE_E2E_USER_B_TOKEN`, `IMAGE_E2E_REPORT`.
- მხოლოდ explicit owner approval-ის შემდეგ: `IMAGE_E2E_PAID_APPROVAL=explicit-owner-approval`, `IMAGE_E2E_MAX_CREDITS`. Flag თავისთავად თანხმობა არ არის.
- CI DB: loopback `LEASE_PG_REST_URL`, synthetic `LEASE_PG_JWT_SECRET`, `LEDGER_PHASE=before|after`. CI-ს Production secrets არ მიეწოდება.

## Database / Storage
არსებული `generation_jobs`, `profiles`, `credit_ledger`, Auth/grants/RLS, hardened debit/refund RPC-ები და private `renders`/uploads buckets საჭიროა. Image adapter public bucket-ს უარყოფს და bucket-ს თვითონ არ ქმნის/არ ასაჯაროებს.
CI-ში მხოლოდ disposable test schema გამოიყენება. ამ PR-ში migration ფაილი არ შეცვლილა; Production-ზე არაფერი გამოყენებულა.
Legacy before-fixture განზრახ ქმნის duplicate refs-ს; მისი rows მხოლოდ disposable CI-ში იწმინდება. Production hardening-მდე საჭიროა read-only audit და owner-reviewed reconciliation; CI truncate Production-ზე არ გადაიტანოთ.
Low-level PG suite service-role-ით მუშაობს და RLS-ის მტკიცებულება არ არის. უფასო local Supabase suite-ის ორი user client რეალურ RLS/Storage denial-ს ამოწმებს;3/3 PASS. Service role გამოიყენება მხოლოდ synthetic fixture setup/cleanup-ში.

## Rollback — მხოლოდ დამტკიცებული rollout-ის შემდეგ
1. შეწყვიტეთ ახალი Image dispatch დამტკიცებული routing/operational გზით; ცალკე Image feature flag-ის არსებობა არ არის დადასტურებული.
2. Owner-ის თანხმობით დააბრუნეთ წინასწარ შემოწმებული deployment artifact; code revert ცალკე reviewed PR-ით, reset/force-push-ის გარეშე.
3. შეინარჩუნეთ jobs/ledger/objects/audit/recovery IDs. უცნობი provider outcome reconcile-ით დაამუშავეთ; generation ავტომატურად არ გაიმეოროთ.
4. შეამოწმეთ pending refunds/debts ერთხელ, შესაბამისი ავტორიზაციით.
5. Production DB rollback/დესტრუქციული migration ცალკე approval-ს საჭიროებს. ოპერაციული rollback drill ჯერ არ ჩატარებულა.
