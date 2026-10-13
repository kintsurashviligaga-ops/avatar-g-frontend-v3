# BOG Payments — Production E2E Report (v1.3)

2026-10-13 07:25Z · მდგომარეობა: **merge და deploy დასრულდა; OAuth დადასტურდა; წარმატებული ცოცხალი გადახდა ჯერ არ არის** (მცდელობა 1 ბანკმა უარყო თანხის უკმარისობის გამო; მცდელობა 2 Owner-ის ბარათის შევსებას ელოდება)

| | |
|---|---|
| PR | #59, **merged** 2026-10-13 05:51Z (Owner-ის 05:50:55Z-ის დადასტურებით), merge commit `883a013` |
| Production | `883a013`, deployment `dpl_Gduf2SkotvazFoQp3qX1TeBQCX6M` (https://avatar-g-frontend-v3-7b4c2tmix-kintsurashviligaga-ops-projects.vercel.app), READY 06:28:39Z, myavatar.ge / www. წინა: `dpl_9m6Up2f5bMJQDav6Vsz6JjU5wkGJ` (`883a013`, 05:57Z) |
| Vercel env | `BOG_CLIENT_ID` 06:23:14Z, `BOG_SECRET_KEY` 06:23:42Z (Sensitive, მხოლოდ Production); `BOG_CHECKOUT_MODE=admin`, `BOG_ENV=production` (03:20Z) |
| OAuth HTTP | **200** (ადმინ ბარათი, 06:37Z: `ok · HTTP 200 · production · 1073 ms`) |
| ბაზის მიგრაცია | არ სჭირდება და არ გაკეთებულა |
| დეტალური მტკიცებულება | [evidence/production-2026-10-13.md](evidence/production-2026-10-13.md) |

სტატუსები: **PROVEN** · **PARTIAL** · **FAILED** · **BLOCKED** · **NOT RUN**. Mock / unit / ლოკალური E2E ტესტი რეალური საბანკო ტრანზაქციის მტკიცება **არ არის**.

## საბოლოო მიღების კრიტერიუმები (GG, v1.3)

| # | კრიტერიუმი | სტატუსი | მტკიცება / რას ველოდებით |
|---|---|---|---|
| 1 | Production Credentials სწორად არის კონფიგურირებული | **PROVEN** | წყვილი ხელახლა ჩაიწერა 06:23Z (Sensitive, მხოლოდ Production), OAuth 200 იმავე deploy-ზე; override-ები არ არის; `BOG_*` Preview / Development-ში არ არის |
| 2 | OAuth რეალურად აბრუნებს HTTP 200-ს | **PROVEN** | 06:37Z ადმინ ბარათი Production-ზე. 06:10Z-ის 400 (`invalid_client`) Client ID-ისა და Secret-ის შეუსაბამობა იყო: 05:42Z-ზე მხოლოდ Secret შეიცვალა |
| 3 | PR #59-ის კრიტიკული ტესტები გავლილია | **PROVEN** | ლოკალურად 438/438 (+7 smoke), SQL 39/39, E2E 14/14, tsc / eslint 0; CI საბოლოო head-ზე მწვანე |
| 4 | Production Deploy წარმატებით დასრულებულია | **PROVEN** | `883a013` READY 05:57Z, შემდეგ env-ით 06:28:39Z. Smoke `38354130571` 9/9, `38357706277` ✓ |
| 5 | `BOG_CHECKOUT_MODE=admin` მუშაობს | **PROVEN** | ადმინ ბარათი: „Checkout: admins only“; Owner-მა (ადმინმა) შეკვეთა შექმნა 06:44Z |
| 6 | არა-ადმინის checkout შეზღუდულია | **PROVEN** (ანონიმურად) | smoke: capabilities `bog:false`, checkout 401. ჩვეულებრივი შესული ანგარიშით Production-ში არ შემიმოწმებია (Production-ში სატესტო ანგარიშს არ ვქმნით); იგივე წესი ტესტებით PROVEN (403 `BOG_ADMIN_ONLY`) |
| 7 | Webhook / Settlement / Idempotency შემოწმებულია | **PARTIAL** | Production-ში: BOG-მა შეკვეთა შექმნა, უარი სწორად ჩაიწერა (`rejected` + მიზეზი), კრედიტი არ ჩაირიცხა; ხელმოუწერელი callback → 401. ვერ ვარჩევ, უარი callback-მა ჩაწერა თუ დაბრუნების გვერდმა (ორივე BOG-თან ამოწმებს). წარმატებული ჩარიცხვა Production-ში NOT RUN |
| 8 | Owner-ის 10 ₾ გადახდა წარმატებულია | **NOT RUN** | მცდელობა 1 (06:44Z, `myavatar-topup-26dd83920675af9c`): ბანკის უარი, „insufficient funds“, ფული არ ჩამოჭრილა. მცდელობა 2 Owner-ის ნებართვით (06:48Z), ბარათის შევსების შემდეგ; მესამე მცდელობა არ არის |
| 9 | ზუსტად 100 კრედიტი ერთხელ | **NOT RUN** (Production) | ლოკალურად PROVEN (E1, C1). Production-ში BOG-ის ledger ჩანაწერი 0 |
| 10 | საბოლოო E2E Report მტკიცებულებებით | **PARTIAL** | ეს ფაილი + evidence; წარმატებული გადახდის ნაწილი ცარიელია |

## დეტალები

**Checkout-ზე წვდომა.** `bogCheckoutMode()` (`lib/billing/bogClient.ts`): `admin` → მხოლოდ ადმინი; Preview / Development-ზე ყოველთვის `off`. Production-ში ანონიმური capabilities → `{"stripe":true,"bog":false}` (smoke).

**Webhook.** callback URL: `https://myavatar.ge/api/billing/bog/webhook` (ადმინ ბარათზე დადასტურდა). ხელმოუწერელი POST → 401, body არ მუშავდება (smoke). ხელმოწერილი callback Production-ში: იხ. კრიტერიუმი 7.

**კრედიტები.** 07:24Z: `wallet_topups` `bog:%` 0, BOG ledger 0, `pending` შეკვეთა 0; Owner-ის ბალანსი 06:38Z-ის baseline-ის ტოლია. ჩარიცხვა `bog_fulfill_order` → `credit_wallet_gel` (md5 = repo, 07:2xZ ხელახლა შემოწმდა).

**მცდელობა 2-ის შემოწმება (ერთხელ, read-only):** ახალი `bog_orders` რიგი `completed` + `credited_at`; `wallet_topups.ref = 'bog:<shop_order_id>'`; Owner-ის ledger +1 რიგი, +100 კრედიტი; ბალანსი baseline + 100. თუ შედეგი გაურკვეველია, ხელახლა ცდა არ ხდება.

**ბანკზე დამოკიდებული:** ლიმიტის ფორმა (კითხვა 2); ავტომატური გადახდები (3); sandbox წყვილი (4); 4 ძველი მცდელობის ლოგი (5). კითხვა 1 (წყვილის ტიპი) დაიხურა: OAuth 200 `oauth2.bog.ge`-ზე.

**Refund Policy:** უცვლელია (კრედიტი ავტომატურად არ იკლებს, B4). Production-ში refund 0 → რეალური refund NOT RUN.

**Recurring:** ბანკის მხრიდან **UNCONFIRMED**. კოდი ლოკალურად PROVEN. საჯაროდ არ იხსნება; BOG გამოწერა Production-ში 0.

**დარჩენილი რისკები:**
- ძველ კოდზე (`30be5a2`) დაბრუნება ახალი build-ით (`git revert` ან ძველი deployment-ის Redeploy) **მუშა** BOG-ს ყველა შესულ მომხმარებელს აჩვენებს, რადგან წყვილი ახლა მოქმედია. BOG-ის პრობლემაზე Rollback A; კოდის დაბრუნება მხოლოდ Instant Rollback-ით `n50i7vipo`-ზე ([BOG_ROLLBACK_PLAN.md](BOG_ROLLBACK_PLAN.md), B).
- Vercel-ის UI-დან „Redeploy“ ძველ deployment-ზე ძველ კოდს აშენებს (05:43Z-ის ინციდენტი). env-ის შეცვლის შემდეგ Redeploy მხოლოდ მიმდინარე Production deployment-ზე (`883a013`).
- BOG-ის უარის შემდეგ Stripe-ზე გადასვლა არ ხდება; Stripe Production-ში დაუმტკიცებელია.
- admin/off რეჟიმში BOG-ის გამომწერი ავტო-განახლების გაუქმებას Credits ფანჯარაში ვერ ხედავს (დღეს 0 გამომწერია).
- Refund-ის „მხოლოდ წინ“ დაცვა TypeScript-შია, SQL-ში არა (მიგრაცია = Owner-ის სიტყვა).
- 24სთ / 30 დღის ლიმიტს კოდი არ ზღუდავს, მხოლოდ აჩვენებს.

დეტალური უსაფრთხოება: [BOG_SECURITY_VERIFICATION.md](BOG_SECURITY_VERIFICATION.md) · Rollback: [BOG_ROLLBACK_PLAN.md](BOG_ROLLBACK_PLAN.md) · Owner: [BOG_OWNER_ACTIONS.md](BOG_OWNER_ACTIONS.md).
