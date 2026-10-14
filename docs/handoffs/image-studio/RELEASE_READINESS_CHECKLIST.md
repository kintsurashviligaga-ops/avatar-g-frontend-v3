# Image Studio — Release Readiness Checklist
2026-10-14. **საინჟინრო review: GO. საჯარო/Production rollout: NO-GO.**

## შესრულებული
- [x] Existing work/commits/backups დაცულია; branch `codex/image-studio-v1`, Draft PR60.
- [x] main `fef867a6` შემოტანილია feature branch-ში; main თვითონ არ შეცვლილა.
- [x] Source tree ზუსტად უდრის წარმატებით შემოწმებულ main+Image GitHub integration tree-ს.
- [x] Timer cleanup; natural-exit Image DB suites; existing PR58 QC fixture fix.
- [x] Redis configuration regression გამოსწორებულია main-ის საერთო helper-ით;30/30 targeted tests.
- [x] TypeScript, scoped ESLint, Jest, Build, mocked One Window და free real Auth/RLS/Storage/Library.
- [x] Real PostgreSQL/PostgREST Lease/Ledger/Recovery/Outbox და idempotency before/after.
- [x] First next/font failure შენახულია; იგივე კოდზე retry build/E2E წარმატებულია.

## საჯარო გაშვებამდე აუცილებელი gates
- [ ] საბოლოო PR head-ის საჭირო CI checks PASS და reviewed release artifact. ბოლო სტატუსი PR60→Checks.
- [ ] მფლობელის მიერ დადასტურებული nonproduction app+Supabase+Redis,2disposable user, server-only Google credentials.
- [ ] Google generate+edit, რეალური output/usage/cost და provider request count.
- [ ] Reference/identity/product fidelity და უცვლელი original-ის visual acceptance.
- [ ] Real Redis admission; worker restart/in-flight cancel/timeout/refund-outage settlement drill.
- [ ] რეალური Agent G session და ordinary-user access policy-ის review.
- [ ] Hosted Preview acceptance და intended platform/FFmpeg validation; macOS baseline failures ცალკე რისკია.
- [ ] Owner-approved monitoring, rollback target/drill და ცალკე main merge/Production deploy approval.

## კონფიგურაციის სახელები — მნიშვნელობები Git-ში არ ჩაიწეროს
- Auth/DB: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; საჭიროებისამებრ `SUPABASE_URL`.
- Quote/access: `AGENT_G_QUOTE_SECRET`, `AGENT_G_MEDIA_EXEC`; recovery route: `CRON_SECRET`.
- Redis: სრული `KV_REST_API_URL`+`KV_REST_API_TOKEN` პირველად; სრული `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` fallback. წყვილები არ ირევა. იზოლირებული instance/namespace, Production-ის გარეშე.
- Google: fixed `GEMINI_TRANSPORT=gemini_api|vertex`; `GEMINI_API_KEY` ან არსებული aliases `GOOGLE_GENERATIVE_AI_API_KEY`/`GEMINI_API_KEYS`. Vertex: `GCP_PROJECT_ID`, `GCP_GEMINI_LOCATION`/`GCP_PREDICT_LOCATION`; WIF/OIDC: `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, ან არსებული server-only `GCP_SERVICE_ACCOUNT_KEY`.
- Harness: `IMAGE_E2E_ENVIRONMENT=isolated`, `IMAGE_E2E_APP_ORIGIN`, `IMAGE_E2E_SUPABASE_ORIGIN`, `IMAGE_E2E_PROJECT_REF`, `IMAGE_E2E_ANON_KEY`, `IMAGE_E2E_SERVICE_KEY`, `IMAGE_E2E_USER_A_TOKEN`, `IMAGE_E2E_USER_B_TOKEN`, `IMAGE_E2E_REPORT`.
- მხოლოდ ცალკე explicit approval-ის შემდეგ: `IMAGE_E2E_PAID_APPROVAL=explicit-owner-approval`, `IMAGE_E2E_MAX_CREDITS`. Environment flag თავისთავად owner approval არ არის.
- CI PG: loopback `LEASE_PG_REST_URL`, synthetic `LEASE_PG_JWT_SECRET`, `LEDGER_PHASE`, upstream `IDEM_PHASE`. Production secrets არ გამოიყენება.

## Database / Storage prerequisites
საჭიროა არსებული Auth/profiles/generation_jobs/credit_ledger, hardened debit/refund RPC-ები, RLS/grants, private renders/uploads buckets. Image არ ქმნის bucket-ს და public bucket-ს უარყოფს.
მიმდინარე main-ის request-idempotency ფუნქციები ცალკე disposable DB-ში შემოწმებულია. Production-ის schema/config ფაქტობრივი მდგომარეობა ამ სესიაში არ დადასტურებულა; main-ში არსებული deployment report დამოუკიდებელი owner workstream-ის ჩანაწერია.
Low-level PG suite service-role-ს იყენებს; RLS-ის მტკიცებულება ცალკე free E2E-ში A/B authenticated clients-ითაა. Service role იქ მხოლოდ synthetic fixture setup/cleanup-ს ემსახურება. policies არ შემსუბუქებულა.
CI schema setup/truncate მხოლოდ ერთჯერად გარემოს ეკუთვნის და Production-ზე არ გადაიტანოთ.

## Rollback ინსტრუქცია — მხოლოდ დამტკიცებული rollout-ის შემდეგ
1. შეაჩერეთ ახალი Image dispatch დამტკიცებული operational routing-ით. ცალკე Image-only feature flag არ არის დადასტურებული; shared media flag სხვა სერვისებზეც მოქმედებს.
2. Owner-ის თანხმობით დააბრუნეთ წინასწარ შემოწმებული deployment artifact; code revert ცალკე reviewed PR-ით, reset/force-push-ის გარეშე.
3. შეინარჩუნეთ jobs/ledger/storage objects/audit IDs. უცნობი provider outcome შეაჯერეთ; generation ავტომატურად არ გაიმეოროთ.
4. შესაბამისი ავტორიზაციით შეამოწმეთ pending refunds/debts და ერთჯერადი settlement.
5. DB rollback/destructive migration ცალკე approval-ს საჭიროებს. Production rollback drill ამ სესიაში არ შესრულებულა.
