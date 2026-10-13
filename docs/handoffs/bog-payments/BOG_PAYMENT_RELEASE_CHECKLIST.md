# BOG Payments — Release Checklist (v1.3)

2026-10-12 · PR #59 · Owner-ის უფლება (GG, 19:39Z): PR #59-ის (და მხოლოდ მისი) draft-იდან გამოყვანა და merge = Production deploy, **როცა ქვემოთ ყველა პირობა შესრულებულია**. სხვა PR, მიგრაცია ან ცოცხალი გადახდა ამ უფლებაში არ შედის.

## Merge-ის 10 პირობა

| # | პირობა | სტატუსი | როგორ მოწმდება |
|---|---|---|---|
| 1 | Security Audit | **PASS** | [BOG_SECURITY_VERIFICATION.md](BOG_SECURITY_VERIFICATION.md) |
| 2 | Billing-ის კრიტიკული ტესტები | **PASS** ლოკალურად (`93ec307`); CI საბოლოო head-ზე უნდა იყოს მწვანე | 438/438, SQL 39/39, E2E 14/14; CI `verify` + `preview-e2e` |
| 3 | OAuth — HTTP 200 | **BLOCKED (Owner)** | Owner-ის Mac-ზე `bog-oauth-check.mjs` → `✓ ok · HTTP 200` |
| 4 | Vercel Production credentials, სწორი scope | **BLOCKED** | Vercel კონექტორი გუნდს ვერ ხედავს (403). კონექტორის შემდეგ: env-ის metadata (სახელები, scope-ები, განახლების დრო, მნიშვნელობების გარეშე) |
| 5 | `BOG_CHECKOUT_MODE=admin` | **BLOCKED** | env metadata merge-მდე; deploy-ის შემდეგ ანონიმური capabilities → `bog:false` |
| 6 | არა-ადმინის შეზღუდვა | **PASS** (ტესტები) | checkout 403 `BOG_ADMIN_ONLY`, capabilities `bog:false`; deploy-ის შემდეგ Production-ზეც |
| 7 | Stripe-ის გზა არ უარესდება | **PASS** | PR #59 Stripe-ის კოდს არ ეხება; `bog:false` → Stripe შეთავაზებულია |
| 8 | PR #58-თან კონფლიქტი | **PASS** | 0 საერთო ფაილი (`ebc3444`); main = `30be5a2`, PR #59 ზედ დგას |
| 9 | Rollback Plan | **PASS** | [BOG_ROLLBACK_PLAN.md](BOG_ROLLBACK_PLAN.md) |
| 10 | ყველა საჭირო ნებართვა | **PASS** | GG 19:39Z (merge); GitHub-ზე merge შესაძლებელია; მიგრაცია არ სჭირდება |

**თანმიმდევრობა PR #58-თან:** ფაილები არ იკვეთება, მაგრამ OPAY წყვილის Vercel-ში ჩაწერის შემდეგ PR #59 პირველი უნდა შევიდეს. PR #58-ის (ან ნებისმიერი სხვა) deploy PR #59-მდე იმ კოდს გაუშვებს, რომელსაც `BOG_CHECKOUT_MODE` არ ესმის, და მუშა BOG ყველასთვის გამოჩნდება.

## Merge-ის ნაბიჯები (როცა 1–10 PASS)

1. Production env-ის საბოლოო შემოწმება (metadata): `BOG_CLIENT_ID`, `BOG_SECRET_KEY` (Sensitive), `BOG_CHECKOUT_MODE=admin`, `BOG_ENV` = `production` ან არ არის; override-ები (`BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST`) არ არის; `CRON_SECRET` და `NEXT_PUBLIC_SITE_URL` არის; `BOG_*` არ არის Preview / Development-ში.
2. main-ის HEAD ისევ `30be5a2`-ა, ან ახალი main შერწყმულია და CI მწვანეა.
3. Baseline: ანონიმური `GET https://myavatar.ge/api/checkout/capabilities` (merge-მდე workflow main-ზე ჯერ არ არის, ამიტომ ერთი გარე GET-ით).
4. PR #59 → Ready for review → merge (merge commit, head SHA-ს შემოწმებით).
5. Vercel Production deployment → READY; ჩავწერო deployment ID, commit SHA და დრო.
6. Smoke (ქვემოთ, GitHub Actions). თუ რომელიმე ვარდება → [Rollback](BOG_ROLLBACK_PLAN.md) A ან B.

## Production Smoke (deploy-ის შემდეგ; read-only, თანხა არ ჩამოიჭრება)

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
| Production ბაზა (read-only SQL) | ფუნქციების md5 უცვლელი; `bog_orders` უცვლელი (4 `init_failed`) |
| Owner: ადმინ ბარათი | Credentials set · PRODUCTION · `client …XXXX` · Schema OK · CRON_SECRET · Checkout: admins only · „Test credentials with BOG" → `ok` |

## ცალკე Release Gate-ები (ამ release-ში **არ** იხსნება)

| Gate | რა სჭირდება გახსნას |
|---|---|
| ცოცხალი 10 ₾ გადახდა | Owner-ის ცალკე სიტყვა; Owner თავად იხდის ბანკის გვერდზე; ავტომატური retry არ ხდება |
| საჯარო BOG checkout (`BOG_CHECKOUT_MODE`-ის წაშლა) | წარმატებული 10 ₾ ტესტი + Owner-ის სიტყვა. ამ დროს გეგმის (ავტო-განახლების) ღილაკიც გაიხსნება, ამიტომ ჯერ საჭიროა ბანკის დადასტურება ავტომატურ გადახდებზე, ან გეგმის ცალკე ჩამკეტი (წინადადება, ჯერ არ არის აშენებული) |
| ავტომატური Subscription Renewals | ბანკის დადასტურება (§10 პ.3) + ერთი რეალური განახლება |
| Refund-ზე კრედიტების ავტომატური კორექცია | Owner-ის გადაწყვეტილება (B4). პოლიტიკა უცვლელია: კრედიტები ავტომატურად არ იკლებს |
| 1 000 ₾ / 24სთ, 5 000 ₾ / 30 დღე | ბანკის განმარტება: მერჩანტზეა თუ ბარათზე. ადმინ ბარათი აჩვენებს, კოდი არ ზღუდავს |
