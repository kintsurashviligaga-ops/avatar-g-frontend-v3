# BOG Payments v1.0 — ანგარიში (2026-10-12)

**Branch:** `claude/bog-payments-master-task-yjxq59` (main `30be5a2`-დან) · **PR:** draft → main · Merge / Deploy / Migration / რეალური ტრანზაქცია **არ** გაკეთებულა.

> „BOG Payments Master Task v1.0"-ის დოკუმენტი შეტყობინებას არ ახლდა და რეპოში / პროექტის ფოლდერში ვერ ვიპოვე. სამუშაო ავაგე GG-ის შეტყობინების მიხედვით: Phase 0 აუდიტი → ყველა უსაფრთხო საინჟინრო ფაზა Mock/Sandbox ტესტებით → ბლოკერები → რეალური სტატუსი. დოკუმენტის მიღების შემდეგ მის ფაზებს ამ ანგარიშს შევადარებ.

## 1. მოკლედ

| | სტატუსი |
|---|---|
| BOG კოდი (OAuth, შეკვეთა, ბარათის შენახვა, callback-ის ხელმოწერა, receipt, განახლება, გაუქმება) | **BUILT** — main-შია და Production-ზე უკვე გაშვებულია |
| Production ბაზის სქემა (bog_orders, subscriptions-ის BOG სვეტები, 3 RPC + credit_wallet_gel + grant_subscription_allowance) | **PROVEN** — read-only შემოწმება Production-ზე |
| ფულის ფუნქციები (ერთხელ ჩარიცხვა, რბოლა, განახლება, უარი, upgrade) | **PROVEN (ლოკალურად)** — Production-ის იდენტურ ფუნქციებზე, ნამდვილ Postgres-ში |
| სრული გზა route-ებიდან ბაზამდე, ყალბი BOG-ით | **PROVEN (ლოკალურად)** — 11/11 |
| BOG Sandbox-თან რეალური კავშირი | **BLOCKED_OWNER** — sandbox credentials არ გვაქვს; ამ გარემოდან bog.ge-ის ჰოსტები მიუწვდომელია |
| Production-ში ერთი წარმატებული გადახდა | **MISSING** — არასდროს მომხდარა; 4 მცდელობა `init_failed` (10-03 … 10-06) |
| **Production Readiness** | **NOT READY — BLOCKERS REMAIN** (იხ. §6) |

## 2. Phase 0 — აუდიტი (რა დამხვდა)

**კოდი (main = Production `30be5a2`):**
- `lib/billing/bogClient.ts` — api.bog.ge-ის ახალი API (არა ძველი iPay): OAuth client-credentials, `POST /ecommerce/orders`, `PUT /orders/:id/subscriptions` (ბარათის შენახვა), `POST …/subscribe` (განახლება), `GET /receipt/:id`, `DELETE /charges/card/:id`, SHA256withRSA callback-ის შემოწმება BOG-ის გამოქვეყნებული გასაღებით, Idempotency-Key ჩვენი შეკვეთის id-დან.
- `app/api/billing/bog/checkout` — ჯერ წერს შეკვეთის რიგს სერვერის ფასით (ბრაუზერის თანხას არ ენდობა), მერე ქმნის BOG შეკვეთას. უარისას `reject_reason`-ში წერს მიზეზს (საიდუმლოს გარეშე) — ეს გასწორება უკვე main-შია.
- `webhook` → ხელმოწერა → `settleBogOrder` → `bog_fulfill_order` RPC (ერთი ტრანზაქცია, row lock, idempotent).
- `orders/[id]` (დაბრუნებისას reconcile), `subscription` (GET/DELETE), `cron/bog-billing` (ყოველ 10 წთ: reconcile, expire, renew).
- 29 სატესტო ფაილი, 346 ტესტი — **მწვანე** ცვლილებამდე.

**Production ბაზა (read-only, 2026-10-12):**
- `bog_orders` 19 სვეტით, 7 ინდექსით (მათ შორის `bog_orders_renewal_period_uniq` — ერთი განახლება ერთ პერიოდზე).
- `subscriptions`-ზე `provider`, `bog_parent_order_id`, `amount_gel`, `card_mask`, `renewal_failures`, `next_attempt_at`.
- 5 ფულის ფუნქცია SECURITY DEFINER, `anon`/`authenticated` ვერ იძახებს — **PROVEN**.
- 4 შეკვეთა, ოთხივე `init_failed`, `reject_reason = null` (მიზეზის ჩაწერა მათ შემდეგ დაემატა). 10-06-ის შემდეგ ახალი მცდელობა არ ყოფილა, ამიტომ მიზეზი ჯერ არსად წერია.

**დასკვნა:** კოდი სრულია და სწორი; ჩავარდნა BOG-ის მხარესაა (credentials-ის წყვილი, `BOG_ENV`, ან მერჩანტი არ არის ჩართული Online Payments API-ზე). ეს კოდიდან ვერ გამოსწორდება — საჭიროა ბანკი (§5).

## 3. რა გავაკეთე (ამ branch-ზე)

1. **Production-ის ზუსტი ასლი ლოკალურ Postgres-ში** — `tests/sql/bog/00_base.sql` (ცხრილების ფორმა Production-ის კატალოგიდან) + რეპოს მიგრაციები. 6 ფულის ფუნქციის კოდი Production-ისას **ემთხვევა** (md5, კომენტარების გარეშე) — ანუ ტესტები Production-ის ლოგიკას ამოწმებს და არა მის ასლს.
2. **SQL სცენარები** `tests/sql/bog/10_scenarios.sql` — 36 შემოწმება.
3. **რბოლის ტესტი** `tests/sql/bog/20_concurrency.sh` — 16 პარალელური სესია.
4. **სრული E2E** `__tests__/integration/bog-payments.e2e.test.ts` — ნამდვილი route-ები → supabase-js → ლოკალური PostgREST → Postgres; BOG-ის ნაცვლად ყალბი API, რომელიც callback-ს ხელს აწერს RSA გასაღებით ზუსტად ისე, როგორც BOG. ჩვეულებრივ `jest`-ში ავტომატურად გამოტოვდება; ეშვება `npm run test:bog-e2e`-ით.
5. **ადმინის „BOG მზადყოფნა"** — `GET/POST /api/admin/billing/bog` + ბარათი Admin → Billing-ში: ჩანს credentials არის თუ არა, `production`/`sandbox`, client id-ის ბოლო 4 სიმბოლო, callback URL, ცხრილები, `CRON_SECRET`, ბოლო შეკვეთები მიზეზით. ღილაკი **„Test credentials with BOG"** აგზავნის მხოლოდ ერთ OAuth მოთხოვნას — შეკვეთა არ იქმნება, თანხა არ ჩამოიჭრება — და ამბობს, რა უპასუხა BOG-მა და რა უნდა გაკეთდეს. ეს `init_failed`-ის მიზეზს checkout-ის გარეშე ასახელებს. (Deploy-ის შემდეგ მუშაობს; Deploy შენს თანხმობას ელოდება.)
6. **Sandbox smoke სკრიპტი** `scripts/bog-sandbox-smoke.mjs` — უარს ამბობს ყველაფერზე, რაც `BOG_ENV=sandbox` არ არის; `oauth` → `order` (1 ₾ sandbox, ტესტ-ბარათით გადასახდელი ბმული) → `receipt`.
7. `lib/billing/BOG_INTEGRATION.md` — დაემატა დიაგნოსტიკა და ტესტირება.

**რას არ შევეხე:** PR #58-ის ფაილები (`bogClient.ts`, checkout route, `cronAuth.ts`, `vercel.json`, schema-drift, api-lockdown) — Video Core-ის branch იგივე ფაილებს ატარებს. ფასები, ფულის ფუნქციები, მიგრაციები — უცვლელია.

## 4. ტესტების შედეგები

| ნაკრები | შედეგი |
|---|---|
| BOG/billing unit ტესტები (არსებული) | 29 suite, 346/346 ✓ |
| ახალი unit (დიაგნოსტიკა, ადმინ route, UI ბარათი) + api-lockdown/api-security | 5 suite ✓ |
| SQL სცენარები (ნამდვილი Postgres 16) | 36/36 ✓ |
| რბოლა: 16 პარალელური ჩარიცხვა / 16 განახლების claim / 16 განახლების ჩარიცხვა | 1 / 1 / 1 ✓ |
| Route-level E2E (ყალბი BOG) | 11/11 ✓ |
| TypeScript (`tsc --noEmit`) | 0 შეცდომა ✓ |
| ESLint (ახალი/შეცვლილი ფაილები) | 0 ✓ |
| სრული jest (876 suite) | 13 198 ✓ · 86 ✕ — ყველა ✕ FFmpeg-ის რენდერის ტესტია (sandbox-ში ffmpeg-static ბინარი არ ჩამოიტვირთა; ერთი main-ზეც იგივენაირად ვარდება); billing-ს არ ეხება — `evidence/full-jest-2026-10-12.txt` |

**E2E სცენარები:** E1 top-up 20 ₾ → 200 კრედიტი ზუსტად ერთხელ (callback-ის განმეორება, დაბრუნება, cron); E2 დაკარგული callback → დაბრუნებისას reconcile; E3 დაკარგული callback, მომხმარებელი არ ბრუნდება → cron; E4 ყალბი/შეცვლილი callback → 401, 0 კრედიტი; E5 სხვა თანხა ან USD → `amount_mismatch`, 0 კრედიტი, „review"; E6 უარყოფილი ბარათი → `rejected`; E7 BOG უარყოფს credentials-ს → 502, მიზეზი რიგში, საიდუმლო `[redacted]`; E8 სხვისი შეკვეთა → 404; E9 Starter 54 ₾ → 230 კრედიტი, ორი გადაფარული cron = ერთი ჩამოჭრა, განახლება → 460, გაუქმება → ბარათი წაიშალა, აღარ ჩამოიჭრება; E10 3 უარი → `past_due`, მე-4 ჩამოჭრა არ ხდება; E11 კატალოგს გარეთ თანხა → 400, BOG-მდე არ მიდის.

**SQL სცენარებში აღმოჩენილი:** ფულის ლოგიკაში დეფექტი **არ** აღმოჩნდა. ერთი ტესტის შეცდომა იყო ჩემი (ერთ დღეს ორი პერიოდის დასრულება, რეალურად შეუძლებელი) — ტესტი გავასწორე, კოდი არა.

## 5. რა უნდა მოითხოვო Bank of Georgia-სგან (გადაუგზავნე ასე)

1. დაადასტურეთ, რომ მერჩანტი **MyAvatar.ge** ჩართულია **Online Payments API-ზე (api.bog.ge, `POST /payments/v1/ecommerce/orders`)** — ახალ API-ზე და არა ძველ iPay-ზე.
2. ამ API-ის **Production client_id და client_secret** (Business Manager-იდან) და დადასტურება, რომ ეს წყვილი სწორედ Production-ისაა.
3. **Sandbox client_id და client_secret** იმავე API-სთვის — სრული ტესტისთვის ტესტ-ბარათებით.
4. **ბარათის დამახსოვრება ავტომატური გადახდებისთვის** (subscriptions / recurring, `PUT /orders/{id}/subscriptions` და `POST /ecommerce/orders/{id}/subscribe`) — ჩართვა ჩვენს მერჩანტზე. ამის გარეშე გამოწერა ერთთვიანად იყიდება და არ განახლდება.
5. გადაამოწმეთ თქვენს ლოგებში ჩვენი 4 წარუმატებელი მცდელობა: **2026-10-03 07:38, 15:51 (ორჯერ) და 2026-10-06 14:02 UTC** — რა უპასუხა თქვენმა OAuth-მა ან შეკვეთის სერვისმა და რატომ.
6. დაადასტურეთ callback-ის ხელმოწერის **საჯარო გასაღები** (Production და Sandbox) და იგეგმება თუ არა მისი შეცვლა; **იმეორებთ თუ არა callback-ს** წარუმატებლობისას.
7. callback-ის **გამგზავნი IP მისამართები** (არასავალდებულო დამატებითი ფილტრისთვის).
8. დაადასტურეთ, რომ დაშვებულია ჩვენი URL-ები: callback `https://myavatar.ge/api/billing/bog/webhook`, დაბრუნება `https://myavatar.ge/{ka|en|ru}/dashboard?...`.
9. დასაშვები გადახდის მეთოდები (ბარათი, Apple Pay, Google Pay, BOG ანგარიში) და შეიძლება თუ არა გამოწერის პირველი გადახდა მხოლოდ ბარათით (`payment_method: ["card"]`).
10. **Refund API-ზე** წვდომა (სრული/ნაწილობრივი დაბრუნება API-ით), თუ ავტომატური დაბრუნება გვინდა.
11. საკომისიო (%), ანგარიშსწორების ანგარიში და გრაფიკი — Unit Economics-ის SSoT-ისთვის.
12. ტრანზაქციის მინიმალური/მაქსიმალური თანხა, 3-D Secure-ის წესი, ბარათის ამონაწერზე რა სახელი გამოჩნდება.
13. ტექნიკური კონტაქტი ინტეგრაციის საკითხებზე.

## 6. დარჩენილი ბლოკერები

| # | ბლოკერი | ვისზეა | რა უნდა მოხდეს |
|---|---|---|---|
| B1 | Production credentials / მერჩანტის აქტივაცია — ყველა checkout `init_failed` | ბანკი + GG | §5 პუნქტები 1, 2, 5; შემდეგ Vercel env `BOG_CLIENT_ID`, `BOG_SECRET_KEY` (Production), redeploy |
| B2 | Sandbox-ში რეალური გადახდა არ შემოწმებულა | GG (sandbox წყვილი) | §5 პ.3 → `scripts/bog-sandbox-smoke.mjs` შენს Mac-ზე, ან Preview-ზე `BOG_ENV=sandbox` |
| B3 | ავტომატური განახლება | ბანკი | §5 პ.4 |
| B4 | Refund-ის დროს კრედიტები ავტომატურად არ ბრუნდება (მხოლოდ ლოგი) | GG-ის გადაწყვეტილება | ავტომატური ჩამოჭრა თუ ხელით კორექცია — პოლიტიკა |
| B5 | ეს PR (დიაგნოსტიკა + ტესტები) | GG | Merge + Deploy მხოლოდ შენი ცალკე თანხმობით |
| B6 | ერთი ცოცხალი 1 ₾-იანი Production ტრანზაქცია | GG | B1-ის შემდეგ, შენი ცალკე თანხმობით |

**მცირე შენიშვნა (არ გამისწორებია, PR #58-ის ფაილშია):** `bogClient.ts`-ში `refund_requested` სტატუსი ითვლება როგორც `refunded` — შეკვეთა „დაბრუნებულად" მოინიშნება, სანამ დაბრუნება რეალურად დასრულდება. ფულს არ ეხება (კრედიტები ავტომატურად არ იკლებს); PR #58-ის შერწყმის შემდეგ ცალკე გასწორდება.

## 7. Production Readiness — რეალური სტატუსი

**NOT READY — BLOCKERS REMAIN.**

ჩვენი მხარე (კოდი, ბაზა, ჩარიცხვის უსაფრთხოება, დაკარგული callback, რბოლა, განახლება, გაუქმება) დამტკიცებულია ლოკალურად Production-ის იდენტურ ფუნქციებზე. რაც არ არის დამტკიცებული და ჩემზე არ არის დამოკიდებული: BOG უარს ამბობს ჩვენს შეკვეთებზე (B1), sandbox-ში ნამდვილი გადახდა არ გაკეთებულა (B2), და Production-ში ერთი გადახდაც არ მომხდარა (B6).

**უმოკლესი გზა „მზადაა"-მდე:** ბანკიდან §5 → Vercel env → (ამ PR-ის deploy-ის შემდეგ) ადმინში „Test credentials with BOG" = `ok` → sandbox smoke → შენი თანხმობით 1 ₾ ცოცხალი top-up → ადმინ ბარათზე `completed`.

## 8. როგორ გავიმეოროთ ტესტები

```bash
npm ci
npx jest lib/billing app/api/billing app/api/cron/bog-billing app/api/admin/billing/bog components/admin
# სრული E2E (ლოკალური Postgres + PostgREST v12):
PGURL=postgres://postgres@localhost:5432/postgres POSTGREST_BIN=/path/to/postgrest npm run test:bog-e2e
```
