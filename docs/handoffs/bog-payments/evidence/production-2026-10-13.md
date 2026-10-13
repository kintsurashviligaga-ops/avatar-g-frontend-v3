# Production — 2026-10-13 (merge-ის შემდეგ)

ყველა ბაზის შემოწმება: read-only `SELECT`, Supabase project `zwksnayknzggdcenqqxy`. Vercel: მხოლოდ metadata (env-ის მნიშვნელობები არ წამიკითხავს). საიდუმლოები, Merchant / Terminal ID და მომხმარებლის მონაცემები აქ არ არის. Owner-ის ბალანსი და ledger-ის რიგების baseline თრედშია.

## ქრონოლოგია (UTC)

| დრო | მოვლენა | წყარო |
|---|---|---|
| 03:20 | Claude: `BOG_CHECKOUT_MODE=admin`, `BOG_ENV=production` (Production scope) | Vercel env metadata |
| 05:42 | Owner-მა განაახლა მხოლოდ `BOG_SECRET_KEY` | Vercel env `updatedAt` |
| 05:43 | Owner-ის Redeploy: `dpl_9oAMEXe73byKnwiie2sPijLDVsyZ` (`n50i7vipo`) — **ძველი `30be5a2`** | Vercel deployment |
| 05:47–05:57 | ძველმა კოდმა (`BOG_CHECKOUT_MODE`-ს არ კითხულობს) BOG ყველა შესულ მომხმარებელს აჩვენა ახალი საიდუმლოთი; 05:50 ანონიმური capabilities → `bog:true`. შეკვეთა არ შექმნილა | Firecrawl GET 05:50; `bog_orders` (4 ძველი `init_failed`) |
| 05:50:55 | Owner-მა დააჭირა „ახლავე merge“ (პლატფორმის მიერ დადასტურებული) | thread |
| 05:51 | PR #59 → `main` = `883a013` | GitHub |
| 05:51–05:57 | `dpl_9m6Up2f5bMJQDav6Vsz6JjU5wkGJ` (`lo0mlcifz`) READY, myavatar.ge-ზე | Vercel |
| ≈05:58 | Smoke run `38354130571`: 9/9 ✓ (`bog:false` ანონიმურად) | GitHub Actions |
| 06:10 | ადმინ ბარათი „მონაცემების შემოწმება BOG-თან“ → `credentials_refused · HTTP 400 · production`, BOG: `invalid_client` | Owner-ის ფოტო |
| 06:23 | Owner-მა ხელახლა ჩაწერა `BOG_CLIENT_ID` (06:23:14) და `BOG_SECRET_KEY` (06:23:42), Sensitive, მხოლოდ Production | Vercel env `updatedAt` |
| 06:24 → 06:28:39 | Owner-ის Redeploy: `dpl_Gduf2SkotvazFoQp3qX1TeBQCX6M` (`7b4c2tmix`), `883a013`, READY, myavatar.ge / www | Vercel |
| 06:37 | ადმინ ბარათი → `ok · HTTP 200 · production · 1073 ms` = **OAuth PROVEN** | Owner-ის ფოტო |
| ≈06:37 | Smoke run `38357706277`: ✓ | GitHub Actions |
| 06:39:51 | Owner-მა დაადასტურა ცოცხალი 10 ₾ ტესტი („ახლა“) | thread |
| 06:44:10 | მცდელობა 1: `myavatar-topup-26dd83920675af9c`, 10 ₾, BOG-მა შეკვეთა შექმნა, Owner გადავიდა BOG-ის გვერდზე | `bog_orders` |
| 06:45:33 | `rejected`, `reject_reason` = „Payment declined due to insufficient funds in the account“; კრედიტი არ ჩარიცხულა | `bog_orders`, `wallet_topups`, `credit_ledger` |
| 06:48:25 | Owner: „თავიდან ვცდი“ — **ერთი** მეორე მცდელობა შევსებული ბარათით, მესამე არა | thread |
| 07:19 | Owner: ჯერ ბარათს შეავსებს, მერე მოწერს | thread |

PR #59-ის merge Owner-მა OAuth-ის შედეგამდე დაადასტურა (05:50:55). ეს 19:39Z-ის პირობა №3-ის განზრახ გამოტოვება იყო, რადგან ძველი კოდი BOG-ს ყველას აჩვენებდა. OAuth მოგვიანებით (06:37) დადასტურდა.

## 06:10-ის 400 — მიზეზი

ბარათი აჩვენებს `client …XXXX` = `BOG_CLIENT_ID`-ის ბოლო 4 სიმბოლოს (`lib/billing/bogDiagnostics.ts`, `clientIdTail`). 05:42-ზე მხოლოდ Secret შეიცვალა, Client ID ძველი დარჩა (2026-10-02). 06:23-ზე ორივე ერთად ჩაიწერა და OAuth 200 დაბრუნდა, იმავე `client …XXXX`-ით. დასკვნა: 400 = Client ID-ისა და Secret-ის შეუსაბამობა.

## Production ბაზა (07:21 და 07:24, read-only)

| | შედეგი |
|---|---|
| `bog_orders` | 5: topup `rejected` 1 (მცდელობა 1), topup `init_failed` 1, subscription `init_failed` 3 (ყველა ძველი, 2026-10-03…06). `pending` / ღია 0 |
| `wallet_topups` ref `bog:%` | 0 |
| `credit_ledger` BOG-ის ჩანაწერები | 0 |
| `subscription_allowance_grants` BOG | 0 |
| `subscriptions` BOG | 0 |
| Owner-ის ბალანსი / ledger-ის რიგები | უცვლელი 06:38-ის baseline-თან (თრედში) |
| 6 ფულის ფუნქციის md5 | უცვლელი ([production-parity-v1.3](production-parity-v1.3-2026-10-12.md)): `bog_fulfill_order` 05cb3dc8…, `bog_claim_renewal` ec2d5510…, `bog_record_renewal_failure` 713af6ab…, `credit_wallet_gel` 87a4aaea…, `grant_subscription_allowance` a44bc3ef…, `update_credits_balance` 45e2665e… |

## რა დადასტურდა Production-ში და რა არა

- **PROVEN:** OAuth ცოცხალი წყვილით; BOG-ში შეკვეთის შექმნა (ძველი 4 მცდელობა `init_failed` იყო); გადახდის გვერდზე გადასვლა; ბანკის უარის სწორად ჩაწერა (`rejected` + მიზეზი) და კრედიტის არ-ჩარიცხვა; არა-ადმინის შეზღუდვა (smoke); ხელმოუწერელი callback → 401 (smoke).
- **არ განვასხვავე:** 06:45:33-ის განახლება callback-მა გააკეთა თუ დაბრუნების გვერდმა (`/api/billing/bog/orders/[id]` BOG-ის receipt-ს თავად კითხულობს). ორივე გზა BOG-თან ამოწმებს და ერთსა და იმავე ჩარიცხვის ფუნქციას იყენებს. Vercel-ის runtime ლოგები ჩემთვის დახურულია (403).
- **NOT RUN:** წარმატებული გადახდა, +100 კრედიტი, ერთი ledger ჩანაწერი, `completed` შეკვეთა. ელოდება მცდელობა 2-ს.

## Refund / გამოწერები / ლიმიტები (Phase 7–8, ცვლილების გარეშე)

- Refund-ის პოლიტიკა უცვლელია: სტატუსები BOG-ს მიჰყვება, კრედიტი ავტომატურად არ იკლებს. Production-ში refund-ის შეკვეთა 0 → რეალური refund NOT RUN.
- გამოწერები: ავტომატურ გადახდებს ბანკი ჯერ არ ადასტურებს (UNCONFIRMED); BOG გეგმა მხოლოდ ადმინისთვისაა; აქტიური BOG გამოწერა 0.
- ლიმიტები: 500 ₾ / ტრანზაქცია კოდით იზღუდება. 1 000 ₾ / 24სთ და 5 000 ₾ / 30 დღე მხოლოდ ჩანს; უარყოფილი შეკვეთა ჯამში არ ითვლება (ადმინ სტატისტიკა მხოლოდ `completed`, refund-ის სტატუსებს და `amount_mismatch`-ს ითვლის, `lib/billing/bogDiagnostics.ts` `PAID_STATUSES`).
