# BOG Payments — Release Checklist (v1.3)

2026-10-12, განახლდა 2026-10-13 10:15Z · PR #59 · Owner-ის უფლება (GG, 19:39Z): PR #59-ის (და მხოლოდ მისი) draft-იდან გამოყვანა და merge = Production deploy, **როცა ქვემოთ ყველა პირობა შესრულებულია**. სხვა PR, მიგრაცია ან ცოცხალი გადახდა ამ უფლებაში არ შედის.

**შედეგი:** PR #59 შევიდა 2026-10-13 05:51Z (`883a013`), Owner-ის 05:50:55Z-ის ცალკე დადასტურებით („ახლავე merge“), **პირობა №3-ის (OAuth) დაუცდელად**. მიზეზი: Owner-ის 05:43Z-ის Redeploy-მ ძველი `30be5a2` ააშენა, რომელიც ახალი საიდუმლოთი BOG-ს ყველა შესულ მომხმარებელს აჩვენებდა. merge-ის deploy-მა (05:57Z) BOG ადმინზე დახურა. OAuth 200 მოგვიანებით დადასტურდა (06:37Z). დეტალები: [evidence/production-2026-10-13.md](evidence/production-2026-10-13.md).

## Merge-ის 10 პირობა

| # | პირობა | სტატუსი | როგორ მოწმდება |
|---|---|---|---|
| 1 | Security Audit | **PASS** | [BOG_SECURITY_VERIFICATION.md](BOG_SECURITY_VERIFICATION.md) |
| 2 | Billing-ის კრიტიკული ტესტები | **PASS** | 438/438 (+7 smoke), SQL 39/39, E2E 14/14; CI საბოლოო head-ზე (`0b2b996`) `verify` ✓, `preview-e2e` ✓ |
| 3 | OAuth — HTTP 200 | **PASS** (merge-ის შემდეგ, 06:37Z) | ადმინ ბარათი Production-ზე: `ok · HTTP 200 · production · 1073 ms`. merge-ისას BLOCKED იყო; Owner-მა ლოდინი გააუქმა (05:50:55Z) |
| 4 | Vercel Production credentials, სწორი scope | **PASS** | `BOG_CLIENT_ID` 06:23:14Z, `BOG_SECRET_KEY` 06:23:42Z: Sensitive, მხოლოდ Production; OAuth 200 იმავე deploy-ზე (`dpl_Gduf2SkotvazFoQp3qX1TeBQCX6M`) |
| 5 | `BOG_CHECKOUT_MODE=admin` | **PASS** (Production) | env 03:20Z; smoke: ანონიმური capabilities `bog:false`; ადმინ ბარათი „Checkout: admins only“ |
| 6 | არა-ადმინის შეზღუდვა | **PASS** (ტესტები + ანონიმური smoke) | checkout 403 `BOG_ADMIN_ONLY` (ტესტი), Production-ში ანონიმური checkout 401, capabilities `bog:false` |
| 7 | Stripe-ის გზა არ უარესდება | **PASS** | PR #59 Stripe-ის კოდს არ ეხება; `bog:false` → Stripe შეთავაზებულია |
| 8 | PR #58-თან კონფლიქტი | **PASS** | 0 საერთო ფაილი; PR #58 `883a013`-ზე კონფლიქტის გარეშე ერწყმის |
| 9 | Rollback Plan | **PASS** | [BOG_ROLLBACK_PLAN.md](BOG_ROLLBACK_PLAN.md) |
| 10 | ყველა საჭირო ნებართვა | **PASS** | GG 19:39Z (merge) + 05:50:55Z („ახლავე merge“); GitHub-ზე merge შესაძლებელია; მიგრაცია არ სჭირდება |

**თანმიმდევრობა PR #58-თან:** PR #59 პირველი შევიდა, ამიტომ PR #58-ის deploy (თუ Owner დაადასტურებს) `BOG_CHECKOUT_MODE`-ს შეინარჩუნებს. საშიში მხოლოდ ძველ (`883a013`-მდე) deployment-ზე დაბრუნება ან მისი Redeploy-ა: [Rollback](BOG_ROLLBACK_PLAN.md), B.

## Merge-ის ნაბიჯები (შესრულდა 2026-10-13; ისტორიისთვის)

1. Production env-ის საბოლოო შემოწმება (metadata): `BOG_CLIENT_ID`, `BOG_SECRET_KEY` (Sensitive), `BOG_CHECKOUT_MODE=admin`, `BOG_ENV` = `production` ან არ არის; override-ები (`BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST`) არ არის; `CRON_SECRET` და `NEXT_PUBLIC_SITE_URL` არის; `BOG_*` არ არის Preview / Development-ში.
2. main-ის HEAD ისევ `30be5a2`-ა, ან ახალი main შერწყმულია და CI მწვანეა.
3. Baseline: ანონიმური `GET https://myavatar.ge/api/checkout/capabilities` (merge-მდე workflow main-ზე ჯერ არ არის, ამიტომ ერთი გარე GET-ით).
4. PR #59 → Ready for review → merge (merge commit, head SHA-ს შემოწმებით).
5. Vercel Production deployment → READY; ჩავწერო deployment ID, commit SHA და დრო.
6. Smoke (ქვემოთ, GitHub Actions). თუ რომელიმე ვარდება → [Rollback](BOG_ROLLBACK_PLAN.md) A ან B.

## Production Smoke (deploy-ის შემდეგ; read-only, თანხა არ ჩამოიჭრება) — 9/9 ✓ run `38354130571`, ✓ run `38357706277`

გაშვება: GitHub → Actions → **BOG Production smoke (read-only)** → Run workflow (`base_url` = `https://myavatar.ge`, `expect_bog` = `false`). merge-ის შემდეგ workflow main-ზეა და მე თავად ვუშვებ. ლოკალურად: `node scripts/bog-production-smoke.mjs`. ყველა მოთხოვნა ანონიმურია (cookie, credential, ხელმოწერა არ იგზავნება), ამიტომ არაფერი იყიდება და ბაზაში არაფერი იწერება. ჩემი sandbox-იდან myavatar.ge 2026-10-13-დან აღარ იხსნება (ქსელის პოლიტიკა), ამიტომ smoke GitHub-ის runner-ზე ეშვება.

| შემოწმება | მოსალოდნელი |
|---|---|
| მთავარი გვერდი KA / EN / RU | 200 |
| ანონიმური `GET /api/checkout/capabilities` | `{"stripe":true,"bog":false}` |
| ანონიმური `POST /api/billing/bog/checkout` (ცარიელი body) | 401 `AUTH_REQUIRED`, რიგი არ იქმნება |
| `POST /api/billing/bog/webhook` ხელმოწერის გარეშე | 401 (503 = deployment-ს BOG წყვილი არ აქვს); ხელმოწერის შემოწმებამდე body არ მუშავდება, ბაზაში არაფერი იწერება |
| ანონიმური `GET /api/billing/bog/orders/<ნულოვანი id>` | 401 |
| ანონიმური `GET /api/admin/billing/bog` | 401 / 403 |
| `GET /api/cron/bog-billing` `CRON_SECRET`-ის გარეშე | 403 (401 / 403) |
| Production ბაზა (read-only SQL) | ფუნქციების md5 უცვლელი ✓; `bog_orders` merge-ისას 4 ძველი `init_failed` ✓ (+ Owner-ის 2 ტესტის შეკვეთა: 06:44Z `rejected`, 09:08Z `completed`) |
| Owner: ადმინ ბარათი | Credentials set · PRODUCTION · `client …XXXX` · Schema OK · CRON_SECRET · Checkout: admins only · `callback: https://myavatar.ge/api/billing/bog/webhook` · „Test credentials with BOG" → `ok` ✓ (06:37Z, HTTP 200) |

## ცალკე Release Gate-ები (ამ release-ში **არ** იხსნება)

| Gate | რა სჭირდება გახსნას |
|---|---|
| ცოცხალი 10 ₾ გადახდა | ✓ **შესრულდა.** Owner-ის სიტყვა 06:39Z და 06:48Z. მცდელობა 1: ბანკის უარი (თანხის უკმარისობა). მცდელობა 2: `completed` 09:09:27Z, +100 კრედიტი ერთხელ ([E2E Report](BOG_PRODUCTION_E2E_REPORT.md)). შემდეგი ცოცხალი გადახდა მხოლოდ Owner-ის ახალი სიტყვით; ავტომატური retry არ ხდება |
| საჯარო BOG checkout (`BOG_CHECKOUT_MODE=public`) | წარმატებული 10 ₾ ტესტი ✓ (09:09Z); ხელმოწერილი callback ✓ (Production, 09:09:27Z); **გეგმის ჩამკეტი** (`BOG_SUBSCRIPTION_MODE`, ნაგულისხმევად მხოლოდ ადმინი) და **სერვერული ლიმიტები** აშენებულია post-launch PR-ში, Production-ში merge-ის შემდეგ; მერე Owner-ის სიტყვა. სრული გეგმა: [BOG_PUBLIC_LAUNCH_PLAN.md](BOG_PUBLIC_LAUNCH_PLAN.md) |
| ავტომატური Subscription Renewals (`BOG_SUBSCRIPTION_MODE=public`) | ბანკის დადასტურება (კითხვა 3) + sandbox-ში სრული განახლება + ადმინის ერთი რეალური გეგმა Owner-ის სიტყვით ([გეგმა](BOG_PUBLIC_LAUNCH_PLAN.md) §5) |
| Refund-ზე კრედიტების ავტომატური კორექცია | Owner-ის გადაწყვეტილება (B4). პოლიტიკა უცვლელია: კრედიტები ავტომატურად არ იკლებს |
| 1 000 ₾ / 24სთ, 5 000 ₾ / 30 დღე | სერვერული კონტროლი აშენებულია (post-launch PR, ნაგულისხმევად მთელ მერჩანტზე, მოძრავი ფანჯრები). ბანკის განმარტება (მერჩანტზე / ბარათზე) env-ით ერთვება: `BOG_LIMIT_SCOPE`, `BOG_LIMIT_24H_GEL`, `BOG_LIMIT_30D_GEL` |
