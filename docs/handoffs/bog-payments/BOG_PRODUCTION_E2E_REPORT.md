# BOG Payments — Production E2E Report (v1.3)

2026-10-12 · მდგომარეობა: **merge-მდე** (ეს ფაილი deploy-ისა და ცოცხალი გადახდის შემდეგ განახლდება)

| | |
|---|---|
| ბრენჩი | `claude/bog-payments-master-task-yjxq59` |
| კოდის commit | `93ec307` (Preview-ის დაცვა). წინა: `fb29913`, `18b2a15`, `d72e40c`, `0fb1155` |
| PR | #59, **draft**, base `main` = `30be5a2` |
| Production | `30be5a2` (PR #57), deployment `ki5jp6998` (GitHub deployment `7005663769`, 03:12Z); PR #59-ის კოდი Production-ში **არ არის** |
| Vercel deployment (PR #59) | — (merge არ მომხდარა) |
| OAuth HTTP | **NOT RUN**: Owner-ის Mac-ზე შემოწმებას ველოდებით |
| ბაზის მიგრაცია | არ სჭირდება და არ გაკეთებულა |

სტატუსები: **PROVEN** · **PARTIAL** · **FAILED** · **BLOCKED** · **NOT RUN**. Mock / unit / ლოკალური E2E ტესტი რეალური საბანკო ტრანზაქციის მტკიცება **არ არის**.

## საბოლოო მიღების კრიტერიუმები (GG, v1.3)

| # | კრიტერიუმი | სტატუსი | მტკიცება / რას ველოდებით |
|---|---|---|---|
| 1 | Production Credentials სწორად არის კონფიგურირებული | **PARTIAL** | 2026-10-13 03:21Z (metadata): `BOG_CHECKOUT_MODE=admin`, `BOG_ENV=production`, override-ები არ არის, BOG მხოლოდ Production-ში. წყვილი 2026-10-02-ისაა, შემოწმებული არ არის: Owner-ის OAuth + OPAY წყვილი ([BOG_OWNER_ACTIONS.md](BOG_OWNER_ACTIONS.md)) |
| 2 | OAuth რეალურად აბრუნებს HTTP 200-ს | **NOT RUN** | Owner-ის `bog-oauth-check.mjs` ხაზი |
| 3 | PR #59-ის კრიტიკული ტესტები გავლილია | **PROVEN** (ლოკალურად `93ec307`); CI `93ec307`-ზე მიმდინარეობს | 438/438, SQL 39/39, E2E 14/14, tsc/eslint 0; CI `fb29913`-ზე მწვანე |
| 4 | Production Deploy წარმატებით დასრულებულია | **NOT RUN** | merge-ის პირობები 3–5 ჯერ არ შესრულებულა |
| 5 | `BOG_CHECKOUT_MODE=admin` მუშაობს | **PARTIAL** | კოდი და ტესტები PROVEN; Vercel Production env-ში ჩაწერილია (03:20Z); deploy-ის შემდეგ smoke NOT RUN |
| 6 | არა-ადმინის checkout შეზღუდულია | **PARTIAL** | ტესტები PROVEN (403 `BOG_ADMIN_ONLY`, `bog:false`); Production-ში NOT RUN. დღეს Production BOG-ს ყველას აჩვენებს (`{"stripe":true,"bog":true}`, 18:54Z) |
| 7 | Webhook / Settlement / Idempotency შემოწმებულია | **PARTIAL** | ლოკალურად PROVEN (E1–E5, E12–E13, C1–C3). Production ბაზაში ფუნქციები და იდემპოტენტობის ინდექსები იდენტურია (read-only). ნამდვილი callback Production-ში NOT RUN |
| 8 | Owner-ის 10 ₾ გადახდა წარმატებულია | **NOT RUN** | deploy-ის შემდეგ, Owner-ის ცალკე სიტყვით |
| 9 | ზუსტად 100 კრედიტი ერთხელ | **NOT RUN** (Production) | ლოკალურად: 20 ₾ → 200 კრედიტი ზუსტად ერთხელ (E1); 16 პარალელური ჩარიცხვა → ერთხელ (C1) |
| 10 | საბოლოო E2E Report მტკიცებულებებით | **PARTIAL** | ეს ფაილი; deploy-ისა და გადახდის ნაწილი ცარიელია |

## დეტალები

**Checkout-ზე წვდომა.** კოდი: `bogCheckoutMode()` (`lib/billing/bogClient.ts`). `admin` რეჟიმში არა-ადმინს 403, capabilities `bog:false`; Preview / Development-ზე ყოველთვის `off` (`93ec307`). PR #59-ის Preview (`ec790f1`, https://avatar-g-frontend-v3-mqub9c6fz-kintsurashviligaga-ops-projects.vercel.app, 2026-10-13 ~03:02Z): ანონიმური capabilities → `{"stripe":false,"bog":false}`. ეს თანხვედრაა და არა დაცვის ცალკე მტკიცება: Preview-ს არცერთი გადახდის წყვილი არ აქვს. Production: NOT RUN.

**Webhook.** ლოკალურად: ხელმოწერილი callback არიცხავს (E1), ყალბი ან შეცვლილი → 401 და არაფერი (E4), სხვა თანხა → `amount_mismatch` (E5), უარყოფილი → `rejected` (E6). Production: NOT RUN. callback URL: `https://myavatar.ge/api/billing/bog/webhook` (`NEXT_PUBLIC_SITE_URL`-იდან).

**კრედიტები.** Production ბაზა 19:45Z: `bog_orders` = 4 `init_failed`, გადახდილი 0. ჩარიცხვა `bog_fulfill_order`-ით ხდება (md5 = repo).

**ბანკზე დამოკიდებული:** OPAY წყვილის ტიპი (კითხვა 1); ლიმიტის ფორმა (2); ავტომატური გადახდები (3); sandbox წყვილი (4); 4 ძველი მცდელობის ლოგი (5).

**Refund Policy:** უცვლელია. სტატუსები BOG-ს მიჰყვება (`refund_requested` → `refunded_partially` → `refunded`), კრედიტები ავტომატურად არ იკლებს (B4, Owner-ის გადაწყვეტილება). რეალური refund: NOT RUN.

**Recurring:** **UNCONFIRMED** ბანკის მხრიდან. კოდი ლოკალურად PROVEN (E9, E10, C2, T5–T9). საჯაროდ არ იხსნება; admin რეჟიმში გეგმას მხოლოდ ადმინი ყიდულობს.

**დარჩენილი რისკები:**
- PR #58 ან სხვა deploy PR #59-მდე, OPAY წყვილის ჩაწერის შემდეგ → BOG ყველასთვის ([Release Checklist](BOG_PAYMENT_RELEASE_CHECKLIST.md)).
- BOG-ის უარის შემდეგ Stripe-ზე გადასვლა არ ხდება; Stripe Production-ში დაუმტკიცებელია.
- admin/off რეჟიმში BOG-ის არსებული გამომწერი ავტო-განახლების გაუქმებას Credits ფანჯარაში ვერ ხედავს (დღეს 0 გამომწერია).
- Refund-ის „მხოლოდ წინ" დაცვა TypeScript-შია, SQL-ში არა (მიგრაცია = Owner-ის სიტყვა).
- 24სთ / 30 დღის ლიმიტს კოდი არ ზღუდავს, მხოლოდ აჩვენებს.

**Smoke-ის გზა.** ჩემი sandbox-იდან myavatar.ge, vercel.com და api.bog.ge 2026-10-13-დან აღარ იხსნება (ქსელის პოლიტიკა, 403 proxy-ზე). deploy-ის შემდეგ smoke ეშვება GitHub Actions-ში: `scripts/bog-production-smoke.mjs` / „BOG Production smoke (read-only)" (ანონიმური მოთხოვნები, ჩაწერის გარეშე, 7 ტესტი).

დეტალური უსაფრთხოება: [BOG_SECURITY_VERIFICATION.md](BOG_SECURITY_VERIFICATION.md) · Rollback: [BOG_ROLLBACK_PLAN.md](BOG_ROLLBACK_PLAN.md).
