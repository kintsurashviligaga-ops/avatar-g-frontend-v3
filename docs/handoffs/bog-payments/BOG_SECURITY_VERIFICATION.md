# BOG Payments — უსაფრთხოების გადამოწმება (v1.3, Phase 0)

2026-10-12 · ბრენჩი `claude/bog-payments-master-task-yjxq59` · PR #59 (draft) · კოდი `93ec307` · main `30be5a2` (= Production)

სტატუსები: **PROVEN** (ტესტით ან read-only შემოწმებით დადასტურდა) · **PARTIAL** · **BLOCKED** · **NOT RUN**. Unit/E2E ტესტები ყალბი BOG-ით მუშაობს. ისინი კოდის ქცევას ადასტურებს, რეალურ საბანკო ტრანზაქციას არა.

## შედეგი

კრიტიკული დეფექტი არ აღმოჩნდა. ერთი გამკაცრება დაემატა: Preview / Development deployment-ზე ცოცხალი BOG გადახდა ყოველთვის დახურულია (`93ec307`, პუნქტი 14). Vercel-ის კონფიგურაციის შემოწმება **BLOCKED**-ია, სანამ Vercel კონექტორი გუნდზე წვდომას არ მიიღებს.

| # | საკითხი | სტატუსი | მტკიცება |
|---|---|---|---|
| 1 | `bog-oauth-check.mjs`: Secret Input, Output Redaction, Ctrl+C, PTY | **PROVEN** | `scripts/bog-oauth-check.test.ts`, 9 ტესტი. ნამდვილ pty-ში: საიდუმლო ეკრანზე არ ჩანს; Ctrl+C → exit 130, მოთხოვნა არ იგზავნება. გამოტანიდან იშლება საიდუმლო ოთხივე ფორმით (პირდაპირ, JSON-escaped, URL-encoded, base64), token ინიღბება. host-ის შეცვლა მხოლოდ loopback-ზე შეიძლება. ფაილი `18b2a15`-ის შემდეგ არ შეცვლილა (SHA-256 `3be96bb8…55c93be`) |
| 2 | `bogClient.ts`: OAuth, Order, Receipt, Signature, Timeout, Retry | **PROVEN** | client-credentials Basic auth; token იკეშება ვადის გასვლამდე. Timeout: OAuth 15 წმ, API 20 წმ (`AbortSignal.timeout`). Retry მხოლოდ ერთხელ და მხოლოდ 401-ზე, ახალი token-ით. 401 დამუშავებამდე უარყოფილი მოთხოვნაა, ამიტომ შეკვეთა არ ორმაგდება. 5xx / timeout შეკვეთის შექმნაზე ხელახლა **არ** იგზავნება. Callback: RSA-SHA256 ნედლ body-ზე, BOG-ის გამოქვეყნებული გასაღებით; ხელმოუწერელი ან არასწორი → 401, body არ იკითხება (E4, webhook route ტესტები) |
| 3 | `BOG_CHECKOUT_MODE` admin/off/default | **PROVEN** | unset/`public` = ყველა შესული; `admin` = მხოლოდ ადმინი (სხვას checkout 403 `BOG_ADMIN_ONLY`, capabilities `bog:false`); `off` ან უცნობი მნიშვნელობა = არავინ (503 `BOG_DISABLED`). ჩარიცხვა რეჟიმზე არ არის დამოკიდებული |
| 4 | Sandbox Callback Isolation | **PROVEN** | sandbox smoke 17 ტესტი (callback ნაგულისხმევად `.invalid`-ზე მიდის; myavatar.ge-სა და `*.vercel.app`-ს არ იღებს). E14: sandbox წყვილი ნებისმიერ Vercel deployment-ზე → შეკვეთა, ჩარიცხვა და cron არ ხდება |
| 5 | Refund Requested / Partial / Completed | **PROVEN (ყალბი BOG)** | `refund_requested` → `refunded_partially` → `refunded`, მხოლოდ წინ (E12). რეალური refund BOG-ში ჯერ **NOT RUN** |
| 6 | Completed Receipt Replay refund-ის შემდეგ | **PROVEN** | E12: კრედიტი ხელახლა არ ირიცხება. E13: გაუქმებული გეგმის ავტო-განახლება არ აღდგება და თვე ხელახლა არ ირიცხება |
| 7 | Double Settlement | **PROVEN** | `bog_fulfill_order`: ერთი ტრანზაქცია, row lock. SQL C1: 16 პარალელური ჩარიცხვა → ერთხელ. C3: 16 პარალელური renewal ჩარიცხვა → ერთხელ. E1: callback ზუსტად ერთხელ არიცხავს |
| 8 | Credit Ledger Idempotency | **PROVEN (Production read-only)** | Production-ში (19:45Z) არის `credit_ledger_user_ref_positive_uniq` / `_negative_uniq` (user_id + `metadata->>'ref'`) და `wallet_topups_pkey(ref)`, ლოკალური ასლის იდენტური |
| 9 | Recurring Billing Safety | **PROVEN (კოდი)** / ბანკი **UNCONFIRMED** | ერთ პერიოდზე ერთი claim (C2, `bog_orders_renewal_period_uniq` Production-შიც არის); backoff (T8); 3 უარი → `past_due`, მეოთხე ჩამოჭრა არ ხდება (T7, E10); გაუქმება აჩერებს (E9). ავტომატურ გადახდებს ბანკი არ ადასტურებს, ამიტომ გეგმა მხოლოდ ადმინისთვისაა (admin რეჟიმი) |
| 10 | 500 ₾ ერთ ტრანზაქციაზე | **PROVEN** | 500 ₾-ზე მეტი → 400 `BOG_LIMIT`, რიგი და BOG შეკვეთა არ იქმნება (checkout route ტესტი) |
| 11 | Stripe-ის ალტერნატიული გზა | **PARTIAL** | `bog:false`-ისას Credits ფანჯარა და საფულე Stripe-ს სთავაზობს. BOG-ის უარის შემდეგ Stripe-ზე გადასვლა არ ხდება. Stripe-ით Production-ში გადახდა ჯერ არ დასრულებულა. PR #59 Stripe-ის კოდს არ ცვლის, ანუ დღევანდელზე უარესი არ ხდება |
| 12 | Admin Authorization | **PROVEN** | checkout, capabilities და `/api/admin/billing/bog` ერთ წესს იყენებს (`isAdminIdentity`); არა-ადმინს 403. `__tests__/api-lockdown`, `__tests__/api-security` მწვანეა |
| 13 | Sensitive Data in Logs | **PROVEN** | BOG-ის 9 `console.*` ხაზი ბეჭდავს მხოლოდ შეკვეთის id-ს, სტატუსს და მიზეზს. საიდუმლოს, token-ს და header-ს არცერთი არ ბეჭდავს. E7: შეკვეთის მიზეზში საიდუმლო არ ხვდება. ადმინ დიაგნოსტიკა ასუფთავებს ყველა ფორმას (`scrub`) |
| 14 | Vercel Environment Scope Isolation | კოდი **PROVEN** · კონფიგურაცია **PROVEN** (metadata) | ახალი (`93ec307`): `VERCEL_ENV` ≠ `production` → რეჟიმი ყოველთვის `off`, ადმინისთვისაც. 3 ახალი ტესტი გამოსწორების გარეშე ვარდება, გამოსწორებით გადის. Vercel (2026-10-13 03:21Z, მხოლოდ metadata): ყველა `BOG_*` მხოლოდ Production-შია, Preview / Development-ში არცერთი; ქვემოთ „Vercel Production env“ |
| 15 | PR #58-თან გადაკვეთა | **PROVEN: 0** | PR #58 head `ebc3444` (19:48Z): 164 ფაილი; PR #59: 45 ფაილი; საერთო 0. Image Studio-ს აქტიური ბრენჩი არ არის; ძველ `claude/design-pass-imagery` და `claude/fix-image-google-redis-voice`-თან საერთოც 0-ია |

## Vercel Production env (2026-10-13, მხოლოდ metadata, მნიშვნელობები არ წამიკითხავს)

| ცვლადი | ტიპი · scope | მდგომარეობა |
|---|---|---|
| `BOG_CLIENT_ID`, `BOG_SECRET_KEY` | Sensitive · მხოლოდ Production | არის, 2026-10-02-დან. OAuth-ით ჯერ შემოწმებული არ არის; Owner ჩაანაცვლებს OPAY წყვილით OAuth 200-ის შემდეგ |
| `BOG_ENV` | Sensitive · მხოლოდ Production | 03:20Z → `production` (Claude). ძველი მნიშვნელობა უცნობია (Sensitive) |
| `BOG_CHECKOUT_MODE` | Plain · მხოლოდ Production | 03:20Z შექმნა Claude-მა: `admin` |
| `BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST` | — | არ არსებობს. სიაში ჩანს 2026-02-18-ის შემდეგ შექმნილი ყველა ცვლადი, ეს სახელები კი repo-ში 2026-09-29-დან ჩნდება |
| `CRON_SECRET` | Sensitive · Production + Preview | არის |
| `NEXT_PUBLIC_SITE_URL` | — | ხილულ სიაში არ არის (Vercel-ის პასუხი 12 უძველეს ცვლადს ჭრის). callback URL ასეთ შემთხვევაში `NEXT_PUBLIC_APP_URL`-იდან იგება (Sensitive, Production); deploy-ის შემდეგ ადმინ ბარათზე უნდა ჩანდეს `callback: https://myavatar.ge/api/billing/bog/webhook` |

რა გავლენა აქვს: მიმდინარე Production კოდი (`30be5a2`) `BOG_CHECKOUT_MODE`-ს არ კითხულობს, `BOG_ENV`-ს კი მხოლოდ ჰოსტის ასარჩევად იყენებს. env მხოლოდ ახალ deploy-ზე მოქმედებს, ამიტომ საიტი ამ ცვლილებით არ შეცვლილა. შემდეგი deploy PR #59 უნდა იყოს ([Release Checklist](BOG_PAYMENT_RELEASE_CHECKLIST.md)).

## Production ბაზა (read-only, 2026-10-12 19:45Z)

- 6 ფულის ფუნქცია (`bog_fulfill_order`, `bog_claim_renewal`, `bog_record_renewal_failure`, `credit_wallet_gel`, `grant_subscription_allowance`, `update_credits_balance`) md5-ით ემთხვევა ლოკალურ ასლს (`tests/sql/bog/build.sh`). პირველი ხუთი SECURITY DEFINER-ია; `anon`/`authenticated`-ს მათი გამოძახება არ შეუძლია.
- `bog_orders`: 19 სვეტი, 8 constraint და 7 ინდექსი იდენტურია. `status`-ზე CHECK არ არის, ამიტომ ახალი refund სტატუსები მიგრაციის გარეშე ჩაიწერება. Refund-ის თანხა ბაზაში არ ინახება.
- `bog_orders`-ში 4 რიგია, ოთხივე `init_failed` (ბოლო: 2026-10-06 14:02Z). გადახდილი შეკვეთა არ არის.
- **მიგრაცია არ სჭირდება.**

## ტესტები (`93ec307`, ლოკალურად)

| ნაკრები | შედეგი |
|---|---|
| billing + BOG + admin + checkout + `scripts/bog-*` + api-lockdown / api-security | 35 suite, **438/438** |
| SQL სცენარები + რბოლები (ლოკალური Postgres 16) | **39/39** (36 + 3) |
| Route-level E2E (ნამდვილი route-ები → PostgREST → Postgres, ყალბი BOG) | **14/14** |
| `tsc --noEmit` / eslint (შეცვლილი ფაილები) | 0 / 0 |
| სრული jest (`fb29913`) | 13 326 ✓, 16 ✕ — ყველა `lib/agent/media/composition.ffmpeg.test.ts`-შია, ქვემოთ |
| CI `fb29913`-ზე (typecheck, სრული jest, `next build`; preview-e2e) | ✓ 19:17Z / ✓ 19:11Z |
| DAST (HawkScan) | **NOT RUN**: sandbox-ში API key არ არის |

**FFmpeg-ის ჩავარდნის მიზეზი (არა BOG, არა PR #58):** ამ sandbox-ში `node_modules/ffmpeg-static/ffmpeg` სისტემის `/usr/bin/ffmpeg` 6.1.1-ზე მიუთითებს, რადგან ffmpeg-static-ის ჩამოტვირთვა proxy-მ დაბლოკა. ffmpeg 6.1-ის `gradients` ფილტრი `speed=0`-ს აღარ იღებს (დიაპაზონი 1e-05…1). ტესტის fixture კი სწორედ `speed=0`-ს იყენებს (`composition.ffmpeg.test.ts:69`). CI ffmpeg-static-ის საკუთარ binary-ს იყენებს და მწვანეა. გაფრთხილება Agent G / Video Core-ის მფლობელს: ffmpeg-static-ის განახლებისას ეს fixture ჩავარდება. ფაილი ამ PR-ის არ არის და არ შემიცვლია.
