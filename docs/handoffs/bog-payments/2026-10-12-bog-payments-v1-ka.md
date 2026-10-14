# BOG Payments v1.2 — ანგარიში (2026-10-12: ბანკის პასუხი + საბოლოო უსაფრთხოების შესწორებები)

> **v1.3 (2026-10-12 19:39Z-დან):** მიმდინარე მდგომარეობა და შემდეგი ნაბიჯები — [BOG_FINAL_HANDOFF.md](BOG_FINAL_HANDOFF.md), [BOG_PRODUCTION_E2E_REPORT.md](BOG_PRODUCTION_E2E_REPORT.md), [BOG_OWNER_ACTIONS.md](BOG_OWNER_ACTIONS.md). ეს ფაილი v1.0–v1.2-ის ისტორიაა.

**Branch:** `claude/bog-payments-master-task-yjxq59` (main `30be5a2`-დან) · **PR:** #59, **draft** → main (შენი 18:23Z მითითებით draft რჩება) · Merge / Deploy / Migration / რეალური ტრანზაქცია **არ** გაკეთებულა. Production-ის credentials არ შემიცვლია და არ წამიკითხავს.

> v1.0 (დილით) იყო Phase 0 აუდიტი და ტესტები; v1.1 დაამატა ბანკის პასუხი (§0–§6), კოდი (§7) და ბლოკერები (§11); **v1.2 (18:23Z code review) — სამი შესწორება და დამატებითი შემოწმებები: §A**, ტესტები §8, ბლოკერები §11. Owner-ის ნაბიჯები ცალკე ფაილშია: [`OWNER_ACTION_CHECKLIST_ka.md`](OWNER_ACTION_CHECKLIST_ka.md).

## A. v1.2 — საბოლოო უსაფრთხოების შესწორებები (GG, 18:23Z)

კოდი: commit `18b2a15` (PR #59, draft). SQL / მიგრაცია / ფასი / `vercel.json` უცვლელია. Production-ს არ ეხება merge + deploy-მდე.

### A1. Sandbox Callback Isolation — გამოსწორდა (PROVEN ტესტებით)

- **იყო:** `scripts/bog-sandbox-smoke.mjs order` sandbox შეკვეთის `callback_url`-სა და დაბრუნების ბმულებს `NEXT_PUBLIC_SITE_URL`-იდან იღებდა, ანუ Production-ის webhook-ს (`myavatar.ge`).
- **ახლა, სკრიპტი:**
  - default მისამართია `https://bog-sandbox-smoke.invalid`. `.invalid` დომენი არასდროს იხსნება, ამიტომ callback ვერსად მივა.
  - `BOG_SANDBOX_RETURN_BASE` მიიღება მხოლოდ https-ით და მხოლოდ თუ ჰოსტი არ არის `myavatar.ge`, `*.myavatar.ge`, ნებისმიერი `*.vercel.app` ან გარემოში დასახელებული საიტი (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `VERCEL_*`).
  - BOG ჰოსტების ჩანაცვლება მხოლოდ ამ კომპიუტერზე (localhost) შეიძლება, ცოცხალ `api.bog.ge`-ზე ვერ მიუთითებს.
  - შეკვეთის id `sandbox-smoke-…`-ით იწყება. ჩვენი webhook მას საკუთარად არ თვლის (`isBogOrderId` → false), ამიტომ შემთხვევით მისული callback-იც ვერაფერს ჩარიცხავს.
  - ყველა შემოწმება ხდება პირველ მოთხოვნამდე. უარი = exit 2, BOG-თან 0 მოთხოვნა.
- **ახლა, აპლიკაცია (მეორე ფენა):** sandbox წყვილი ნებისმიერ Vercel deployment-ზე (Production ან Preview: ორივე Production-ის ბაზას იყენებს) იბლოკება:
  - checkout → `503 BOG_SANDBOX_BLOCKED`, webhook → 503, cron → `skipped`;
  - capabilities → `bog:false`; დაბრუნების გვერდი BOG-ს არ ეკითხება;
  - ადმინ ბარათზე წითელი ხაზი.
  
  ლოკალურად და CI-ში sandbox მუშაობს, callback კი იმ deployment-ზე მიდის, საიდანაც შეკვეთა შეიქმნა.
- **ტესტები:**
  - `scripts/bog-sandbox-smoke.test.ts` — 17 ✓. სკრიპტი ნამდვილად ეშვება ყალბი BOG-ის წინააღმდეგ. `NEXT_PUBLIC_SITE_URL=https://myavatar.ge`-ის დროსაც შეკვეთის body-ში არც `myavatar.ge` ჩანს და არც `vercel.app`. ოთხ უარის შემთხვევაში BOG-თან 0 მოთხოვნაა.
  - route-ტესტები: checkout 3, capabilities 1, webhook 1, settlement 2, diagnostics 1, ადმინ ბარათი 1.
  - E2E **E14** (`VERCEL_ENV=preview` + sandbox): checkout 503, webhook 503, cron skip, BOG-თან 0 მოთხოვნა, ბაზაში 0 ახალი რიგი.

### A2. Refund Status Consistency — გამოსწორდა

BOG-ის რეალური სტატუსები (receipt `order_status.key`, docs) და `purchase_units.refund_amount`:

| BOG სტატუსი | იყო | ახლა | კრედიტები |
|---|---|---|---|
| `created`, `processing`, `auth_requested`, … | `pending` | `pending` (უცვლელი) | — |
| `completed` | `completed` | `completed` | ერთხელ ჩაირიცხება (უცვლელი) |
| `refund_requested` (მოთხოვნილი / მიმდინარე) | **`refunded` ✗** | `refund_requested` | უცვლელი |
| `refunded_partially` (ნაწილობრივ) | `refunded` | `refunded_partially` (+ `refund_amount`) | უცვლელი |
| `refunded` (სრულად) | `refunded` | `refunded` | უცვლელი |

BOG-ს ცალკე „refund pending" სტატუსი არ აქვს: მიმდინარე დაბრუნება = `refund_requested`.

**Settlement-ისა და კრედიტების თავსებადობა:**
- სტატუსი მხოლოდ წინ მოძრაობს: `completed → refund_requested → refunded_partially → refunded`. ჩანაწერი პირობითია (`status in (…)`), უკან დაბრუნება შეუძლებელია.
- **ნაპოვნი დეფექტი (PROVEN):** დაბრუნების შემდეგ განმეორებითი ან დაგვიანებული `completed` receipt ხელახლა უშვებდა `bog_fulfill_order`-ს.
  - top-up-ზე ფული უსაფრთხო იყო (`wallet_topups.ref` dedup);
  - გეგმაზე RPC ხელახლა წერდა გამოწერას (`cancel_at_period_end`, `bog_parent_order_id`), ანუ გაუქმებული გეგმის ავტო-განახლება შეიძლებოდა ისევ ჩართულიყო.
  - E13 დაცვის გარეშე ვარდება. გამოსწორდა TypeScript-ში, SQL-ის შეცვლის გარეშე.
- **კრედიტების ლოგიკა და Refund Policy უცვლელია:** ავტომატური ჩამოჭრა არ ხდება (B4, შენი გადაწყვეტილება). დაბრუნება, რომელიც ჩვენ არასდროს ჩაგვირიცხავს (`pending`), მხოლოდ ლოგში იწერება.
- ადმინ ბარათის ლიმიტის ჯამი დაბრუნებულ შეკვეთებსაც ითვლის (ფული ბანკმა აიღო).
- დაბრუნების გვერდზე თითო სტატუსს თავისი ტექსტი აქვს (ka/en/ru).
- **ტესტები:**
  - bogClient 27 ✓ და settlement 24 ✓ (მათ შორის 4 refund); orders route, კლიენტის შეტყობინებები.
  - E2E **E12**: top-up 20 ₾ → `refund_requested` → `refunded_partially` → `refunded` → განმეორებითი `completed`. ბალანსი 200, ერთი ჩანაწერი.
  - E2E **E13**: გაუქმებული გეგმა → დაბრუნება → განმეორებითი `completed`. `cancel_at_period_end` რჩება true, ერთი grant.

### A3. OAuth Checklist Security — გამოსწორდა

- **იყო (PROVEN, zsh 5.9):** `read -r -p` zsh-ში ვარდება (`read: -p: no coprocess`). ცვლადები ცარიელი რჩებოდა და შემოწმება ყალბ `401`-ს აჩვენებდა. `sed` მხოლოდ `"access_token":"…"`-ს მალავდა.
- **ახლა checklist §2:**
  - პირველ რიგში `bog-oauth-check.mjs`: ჩამოტვირთვა commit `18b2a15`-ზე მიბმული ბმულით, SHA-256 `3be96bb8…55c93be` (ან თრედში მიმაგრებული ფაილი).
  - Node-ის გარეშე: zsh-ის ვარიანტი, რომელიც მხოლოდ HTTP კოდს ბეჭდავს. საიდუმლო `curl -K -`-ით stdin-ში გადადის (ბრძანების ხაზში და `ps`-ში არ ჩანს), BOG-ის პასუხი არ იბეჭდება.
- **სკრიპტის შემოწმება:**

  **Secret Input:**
  - Secret Key-ის prompt დამალულია.
  - ნამდვილ ტერმინალში (pty) დამტკიცდა: id ჩანს, Secret Key არ ჩანს (პირველი 4 სიმბოლოც კი).
  - Ctrl+C → exit 130, მოთხოვნა არ იგზავნება.
  - ტერმინალის გარეშე → exit 2.
  - ტესტი ვარდება, თუ echo-ს ჩავრთავთ (შემოწმდა).

  **Output Redaction:**
  - Secret იშლება ყველა ფორმით: პირდაპირ, JSON-escaped, URL-encoded, base64(id:secret).
  - `access/refresh/id_token` ველები და JWT-ის მსგავსი სტრიქონები იმალება.
  - 2xx token-ის გარეშე → მხოლოდ ველების სახელები.
  - წარმატებისას BOG-ის პასუხიდან არაფერი იბეჭდება.
  - `BOG_OAUTH_URL` მხოლოდ localhost-ზე.

  `scripts/bog-oauth-check.test.ts` — 9 ✓ (2 pty-ტესტი).
- ადმინის „Test credentials with BOG" (`bogDiagnostics`) იგივე გაძლიერებულ scrub-ს იყენებს.

### A4. დამატებითი შემოწმებები

| საკითხი | სტატუსი | საფუძველი |
|---|---|---|
| `BOG_CHECKOUT_MODE=admin` | **PROVEN (ტესტები)** | არა-ადმინს: capabilities `bog:false`, checkout 403. ადმინს: `bog:true`. `off` ან უცნობი მნიშვნელობა → `off`. ჩარიცხვა (callback / დაბრუნება / cron) რეჟიმზე არ არის დამოკიდებული |
| Admin Authorization | **PROVEN (კოდი + ტესტები)** | checkout, capabilities და ადმინ route ერთსა და იმავე წესს იყენებს (`isAdminIdentity`: role claim, დადასტურებული ელფოსტა allowlist-ში ან ბაზის ადმინ სიაში; მომხმარებელი სერვერზე Supabase-იდან). `/api/admin/billing/bog` არა-ადმინს 403-ს აძლევს |
| Stripe-ის ალტერნატიული გზა | **BUILT_NOT_PROVEN** | `bog:false`-ისას Credits ფანჯარა და ჩატის საფულე Stripe-ს სთავაზობს (`CreditsModal` rails, `WalletRefill`). Production: `{"stripe":true,"bog":true}` (18:54Z). Stripe-ით Production-ში გადახდა ჯერ არ დასრულებულა. BOG-ის უარის შემდეგ Stripe-ზე გადასვლა არ ხდება. შენიშვნა: Stripe-ის ძველი გეგმები USD-ის 15/99/299 tier-ებია და BOG-ის ₾ გეგმებს არ ემთხვევა (ფასები არ შემიცვლია) |
| 24სთ / 30 დღის სტატისტიკა | **გამოსწორდა** | იყო: ბოლო 200 შეკვეთიდან (ნებისმიერი სტატუსით) ითვლიდა მხოლოდ `completed`/`refunded`-ს; ახალი refund სტატუსები და `amount_mismatch` გამოვარდებოდა, 200-ზე მეტი რიგის დროს კი ჯამი მცირდებოდა. ახლა ცალკე query: გადახდილი სტატუსები (`completed`, სამივე refund, `amount_mismatch`), ბოლო 31 დღე, ასაკი `credited_at`-დან, მოძრავი ფანჯრები, 1 000 რიგამდე `capped` ნიშნით. ცდომილება მხოლოდ მეტისკენ შეიძლება. ტესტი: 554 / 682 ₾ მაგალითი |
| PR #58-თან გადაფარვა | **არ არის** | PR #58 head `357926b` (18:47Z): 126 ფაილი; PR #59: 42 ფაილი; საერთო 0. `vercel.json`-ს მხოლოდ PR #58 ცვლის. merge-ის თანმიმდევრობა ნებისმიერი შეიძლება; ორივე main `30be5a2`-დან იწყება |


### A5. დარჩენილი რისკები (ვიცი, არ გამისწორებია)

- `BOG_CHECKOUT_MODE=admin`/`off`-ის დროს Credits ფანჯარა BOG-ის გეგმას არ კითხულობს, ამიტომ BOG-ის არსებული გამომწერი „ავტო-განახლების გაუქმებას" იქ ვერ დაინახავს. ახლა ასეთი გამომწერი 0-ია. საჯარო გაშვებამდე, თუ რეჟიმი დიდხანს დარჩა, გასასწორებელია.
- Refund-ის „მხოლოდ წინ" დაცვა TypeScript-შია, SQL-ში არა. ორი ერთდროული receipt-ის მცირე რბოლამ შეიძლება სტატუსი გადაწეროს. ფულს ეს არ ეხება (`ref` / `invoice_id` dedup). სრული SQL დაცვა მიგრაციას საჭიროებს, ანუ შენს სიტყვას.
- თუ BOG-ში დაბრუნდა შეკვეთა, რომელიც ჩვენ არასდროს ჩაგვირიცხავს (`pending`), ის ლოგში იწერება და მერე `expired` ხდება.
- BOG-ის მიერ უარყოფილი დაბრუნება შეკვეთას `refund_requested`-ში ტოვებს. BOG-ს ამისთვის ცალკე სტატუსი არ აქვს.
- ნამდვილი refund BOG-ის სისტემაში ჯერ არ შემოწმებულა; ის ცოცხალი გადახდის შემდეგ შეიძლება.

## 0. ბანკის პასუხი და სტატუსები

ბანკი, 2026-10-12, 18:49 (თბილისის დროით): *"The service is fully activated on our side, you can proceed to the integration stage."* მერჩანტი MyAvatar.ge; Business Manager https://manager.bog.ge/login; დოკუმენტაცია https://api.bog.ge/docs/payments/introduction; Merchant ID და Terminal ID მოწოდებულია; OPAY CLIENT ID და OPAY SECRET KEY Business Manager-შია. ლიმიტები: 500 ₾ ერთ ტრანზაქციაზე, 1 000 ₾ 24 საათში, 5 000 ₾ 30 დღეში.

| საკითხი | სტატუსი | საფუძველი |
|---|---|---|
| Merchant Activation (E-commerce) | **BANK_CONFIRMED** (არა END_TO_END_PROVEN) | ბანკის წერილი. ჩვენი მხრიდან ამ წყვილით ჯერ არც OAuth და არც გადახდა არ გაკეთებულა |
| OPAY Client ID / Secret ↔ ჩვენი OAuth | **BUILT_NOT_PROVEN** (სავარაუდოდ თავსებადია) | §1. მტკიცება = ერთი OAuth მოთხოვნა |
| Production-ში BOG credentials ჩაწერილია | **PROVEN** | `GET https://myavatar.ge/api/checkout/capabilities` → `{"stripe":true,"bog":true}` (2026-10-12, სამჯერ; ბოლოს 18:54Z) |
| რომელი წყვილია Production-ში (OPAY თუ სხვა) | **UNVERIFIED** | Vercel env ჩემთვის დახურულია (API 403); ადმინ ბარათი client id-ის ბოლო 4 სიმბოლოს deploy-ის შემდეგ აჩვენებს |
| BOG ღილაკი Production-ში | **PROVEN — ჩართულია ყველა შესულ მომხმარებელზე** | იგივე capabilities; Credits ფანჯარა BOG-ის ჩავარდნისას ბარათზე (Stripe) **არ** გადადის, მხოლოდ შეცდომას აჩვენებს (§6) |
| დოკუმენტაცია ↔ `bogClient.ts` | **PROVEN — დეფექტი არ არის** | §2 (ერთი მცირე შენიშვნა) |
| 500 ₾ ერთ ტრანზაქციაზე | **BUILT** ამ PR-ში (+ტესტები) | §4 |
| 1 000 ₾ / 24სთ, 5 000 ₾ / 30 დღე | **PARTIAL** — ადმინ ბარათზე ჩანს (v1.2: ზუსტი, ცალკე query), კოდი არ ზღუდავს | §4, §A4; ბანკს უნდა ვკითხოთ მერჩანტზეა თუ ბარათზე |
| ავტომატური გამოწერები (ბარათის შენახვა) | **UNCONFIRMED** | E-commerce-ის აქტივაცია ამას არ ადასტურებს (§5) |
| BOG Sandbox | **BLOCKED_OWNER** | sandbox წყვილი არ გვაქვს. v1.2: sandbox შეკვეთა Production-ს ვეღარ მიმართავს (§A1) |
| Refund სტატუსები | **BUILT** (+ტესტები, E12/E13) | §A2; რეალური დაბრუნება BOG-ში ჯერ არ შემოწმებულა |
| OAuth შემოწმება (checklist §2) | **გამოსწორდა** (+ტესტები, ნამდვილი ტერმინალი) | §A3 |
| ერთი რეალური გადახდა ბოლომდე | **MISSING** | 4 მცდელობა, ოთხივე `init_failed` (§6) |
| **Production Readiness** | **NOT READY — BLOCKERS REMAIN** | §12 |

## 1. OPAY Client ID / Secret Key — შეესაბამება თუ არა ჩვენს ინტეგრაციას

- ჩვენი კოდი (`lib/billing/bogClient.ts`) იყენებს BOG Online Payments API-ს: OAuth client-credentials `https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token`-ზე (`Authorization: Basic base64(client_id:secret)`, `grant_type=client_credentials`), შემდეგ `https://api.bog.ge/payments/v1`.
- ბანკმა მიგვითითა ზუსტად ამ API-ის დოკუმენტაციაზე, ამიტომ **OPAY CLIENT ID = `BOG_CLIENT_ID`**, **OPAY SECRET KEY = `BOG_SECRET_KEY`**. სხვა ცვლადი არ სჭირდება.
- **Merchant ID და Terminal ID API-ში არ გამოიყენება** (დოკუმენტაციაში მხოლოდ რამდენიმე POS-ის შემთხვევაში ჩნდება `config.account.tag`; ჩვენ ერთი გვაქვს). Vercel-ში არ იწერება.
- დარჩენილი რისკი: „OPAY" ძველი iPay/OPay პროდუქტის სახელს ჰგავს. თუ ეს წყვილი ძველი პროდუქტისაა, `oauth2.bog.ge` მას არ მიიღებს. ამიტომ თავსებადობა **BUILT_NOT_PROVEN**-ია, სანამ ერთი OAuth მოთხოვნა `200`-ს არ დააბრუნებს. ამისთვის: `bog-oauth-check.mjs` (checklist §2-ა; შეკვეთა არ იქმნება, თანხა არ ჩამოიჭრება, საიდუმლო ეკრანზე არ ჩანს).

## 2. ოფიციალური დოკუმენტაცია ↔ `bogClient.ts` და Checkout API

შემოწმებულია api.bog.ge/docs/payments-ის გვერდებთან, 2026-10-12.

| დოკუმენტაცია | ჩვენთან | შედეგი |
|---|---|---|
| OAuth: `oauth2.bog.ge/.../token`, Basic, `grant_type=client_credentials` | იგივე; token ქეშდება, 401-ზე ერთხელ განახლდება | ✓ |
| `POST /ecommerce/orders`; headers `Idempotency-Key` (UUID v4), `Accept-Language` ka/en | იგივე; Idempotency-Key ჩვენი შეკვეთის id-დან | ✓ |
| body: `callback_url` (HTTPS, სავალდებულო), `external_order_id`, `capture: automatic`, `purchase_units {currency: GEL, total_amount, basket[]}`, `redirect_urls`, `ttl` 2–1440 წთ, `payment_method` | ყველა ველი; `ttl: 30`; გამოწერისთვის `payment_method: ["card"]` | ✓ |
| პასუხი: `id`, `_links.redirect.href` | ორივე იკითხება | ✓ |
| ბარათის შენახვა ავტ. გადახდებისთვის: `PUT /orders/:id/subscriptions` (202) | იგივე, redirect-მდე | ✓ (`/cards` ვარიანტს არ ვიყენებთ) |
| შენახულ ბარათზე ჩამოჭრა: `POST /ecommerce/orders/:parent_order_id/subscribe` (თანხა, ვალუტა, მყიდველი მშობლისგან) | იგივე | ✓ |
| ბარათის წაშლა: `DELETE /charges/card/:order_id` (202) | იგივე (გაუქმება/upgrade) | ✓ |
| `GET /receipt/:order_id`; `order_status.key` | იგივე | ✓, შენიშვნით ↓ |
| callback: `POST {event: order_payment, zoned_request_time, body}`, `Callback-Signature` = SHA256withRSA raw body-ზე; პასუხი HTTP 200 | იგივე; Production-ის საჯარო გასაღები **ემთხვევა** დოკუმენტაციისას | ✓ |
| `external_order_id`-ის პირველი 25 სიმბოლო ამონაწერზე ჩანს | `myavatar-topup-3f9a1c0b2e` | ✓ |
| callback-ის განმეორება, გამგზავნი IP-ები | დოკუმენტაციაში არ წერია | დაკარგულ callback-ს ვფარავთ: დაბრუნების გვერდი + cron ყოველ 10 წთ |

**v1.1-ის შენიშვნა `refund_requested` → `refunded` — v1.2-ში გამოსწორდა** (§A2): სამი refund სტატუსი ცალ-ცალკე, `refund_amount` იკითხება.

## 3. Production Environment Variables (მხოლოდ სახელები)

| სახელი | საჭიროა? | რა უნდა იყოს | Production-ში (რაც ვხედავ) |
|---|---|---|---|
| `BOG_CLIENT_ID` | დიახ | OPAY Client ID | **არის** (capabilities); რომელი წყვილი — UNVERIFIED |
| `BOG_SECRET_KEY` | დიახ, Sensitive | OPAY Secret Key | **არის**; რომელი — UNVERIFIED |
| `BOG_ENV` | არა | არ უნდა არსებობდეს, ან `production` | უცნობი (Vercel 403) |
| `BOG_CHECKOUT_MODE` | ახალი, არასავალდებულო | `admin` ტესტის დროს; შემდეგ წაშლა | ამ PR-ის deploy-მდე არაფერს აკეთებს |
| `NEXT_PUBLIC_SITE_URL` | დიახ | `https://myavatar.ge` | უცნობი; callback URL აქედან იგება |
| `CRON_SECRET` | დიახ | ნებისმიერი გრძელი შემთხვევითი | უცნობი; deploy-ის შემდეგ ადმინ ბარათი აჩვენებს |
| `BOG_CALLBACK_PUBLIC_KEY` | **არ** უნდა იყოს | — (ჩაშენებული = დოკუმენტაციისა) | უცნობი |
| `BOG_API_BASE`, `BOG_OAUTH_URL` | **არ** უნდა იყოს | — (მხოლოდ ტესტებისთვის) | უცნობი |
| `BOG_CALLBACK_IP_ALLOWLIST` | არა | არ ჩაწეროთ (BOG IP-ებს არ აქვეყნებს) | უცნობი |
| Merchant ID, Terminal ID | **არა** | — | — |

Preview / Development scope-ში ცოცხალი წყვილი **არ** უნდა იყოს: Preview-ები Production-ის ბაზას იყენებს, Preview-ზე გადახდა რეალურ ანგარიშს დაარიცხავდა. სახელების შესამოწმებლად (მნიშვნელობების გარეშე): `vercel env ls production` (checklist §3).

## 4. ლიმიტები და გავლენა Credits / Subscriptions-ზე

**რას ვყიდით (≤ 500 ₾ ყველაფერი):**
- გეგმები: Starter 54 ₾, Creator 108 ₾, Business 216 ₾ (თვეში).
- Credits ფანჯრის პაკეტები: 10 / 20 / 50 ₾.
- ჩატის საფულე: 5, 9, 10, 20, 29, 50, 89, 500 ₾ (Production-ში `pricing_tiers` ცარიელია → ეს default-ები მოქმედებს; read-only შემოწმდა).
- ადმინს შეუძლია ფასი 10 000 ₾-მდე დააყენოს. **ამ PR-ში** 500 ₾-ზე მეტი შეკვეთა BOG-მდე არ მიდის: `400 BOG_LIMIT` (ჩატის საფულე ასეთ თანხას ბარათით/Stripe-ით შესთავაზებს).

**24 საათი (1 000 ₾) და 30 დღე (5 000 ₾), თუ ლიმიტი მერჩანტზეა:**
- ერთი 500 ₾-იანი შევსება დღის ლიმიტის ნახევარია.
- დღეში მაქსიმუმ ≈ 18 Starter, ან 9 Creator, ან 4 Business.
- 30 დღეში ≈ 92 Starter, ან 46 Creator, ან 23 Business. ანუ BOG-ით თვიური შემოსავალი ≈ 5 000 ₾-ს ვერ გადააჭარბებს.
- **განახლებები:** cron ერთ დღეს ყველა ვადაგასულ გეგმას ჩამოჭრის. თუ დღის ლიმიტი ამოიწურა, BOG დანარჩენს უარყოფს → 24სთ-იანი პაუზა → 3 უარის შემდეგ გეგმა `past_due`. მომხმარებელი გეგმას დაკარგავს **ჩვენი** ლიმიტის გამო და არა მისი ბარათის გამო.
- თუ ლიმიტი ბარათზეა, საშუალო მომხმარებელს ეს არ ეხება.

**რა გავაკეთე:** 500 ₾-ის დაცვა კოდში; ადმინ ბარათზე ჩანს ბოლო 24სთ / 30 დღის გადახდილი ₾ ლიმიტთან შედარებით (v1.2: ცალკე query, მოძრავი ფანჯრები, ყველა გადახდილი სტატუსი, §A4).

**რა არ გამიკეთებია (არქიტექტურული წინადადება):** cron-ში დღიური ბიუჯეტი (ლიმიტთან მიახლოებისას განახლებები მეორე დღეზე გადადის და არ ჩაითვლება უარად). ჯერ ბანკმა უნდა გვითხრას, ლიმიტი მერჩანტზეა თუ ბარათზე. საჯარო გაშვებამდე ლიმიტის გაზრდა უნდა ვითხოვოთ.

## 5. ავტომატური გამოწერები — UNCONFIRMED

- ბანკმა დაადასტურა E-commerce სერვისი; ბარათის შენახვა ავტომატური გადახდებისთვის ცალკე არ უხსენებია. დოკუმენტაციაში ცალკე აქტივაციის მოთხოვნა არ წერია, მაგრამ ამას დადასტურებად ვერ ჩავთვლით.
- ჩვენი კოდი უსაფრთხოა ორივე შემთხვევაში:
  - გეგმის ყიდვისას redirect-მდე ვითხოვთ ბარათის შენახვას. უარის შემთხვევაში გეგმა იყიდება როგორც **ერთი თვე განახლების გარეშე** (`autoRenew: false`).
  - განახლება ხდება მხოლოდ მაშინ, როცა BOG-ის receipt ამბობს `saved_card_type = subscription`.
  - შენახული ბარათის გარეშე არაფერი ჩამოიჭრება. რისკი მხოლოდ ის არის, რომ გეგმა არ განახლდება.
- **დასამტკიცებლად:**
  1. ბანკის წერილობითი დადასტურება.
  2. ერთი რეალური გეგმის ყიდვა, სადაც `card_saved = true`.
  3. 30 დღის შემდეგ ერთი წარმატებული განახლება.

## 6. ოთხი `init_failed` — შესაძლო მიზეზები (არცერთი არ არის დადასტურებული)

| UTC | თბილისი | რა | ხანგრძლივობა |
|---|---|---|---|
| 2026-10-03 07:38 | 11:38 | top-up 10 ₾ | 0.5–1.7 წმ |
| 2026-10-03 15:51:37 | 19:51 | Starter 54 ₾ | ″ |
| 2026-10-03 15:51:45 | 19:51 | Starter 54 ₾ | ″ |
| 2026-10-06 14:02 | 18:02 | Starter 54 ₾ | ″ |

ოთხივეზე `reject_reason = null` — მიზეზის ჩაწერა მათ შემდეგ დაემატა. სწრაფი ჩავარდნა (წამზე ნაკლები) შეესაბამება იმას, რომ BOG-მა OAuth ან შეკვეთა უარყო; timeout ან ქსელი არ ჩანს.

**ჰიპოთეზები (სავარაუდოობის მიხედვით):**
- **H1:** მერჩანტი მაშინ ჯერ არ იყო გააქტიურებული. ბანკმა აქტივაცია მხოლოდ 10-12-ს დაადასტურა; ეს ხსნის ოთხივეს სამ დღეში.
- **H2:** Vercel-ში სხვა, ძველი ან sandbox წყვილია.
- **H3:** `BOG_ENV` არ ემთხვევა წყვილს (sandbox წყვილი production ჰოსტზე, ან პირიქით).
- **H4:** წყვილი სხვა პროდუქტისაა (ძველი iPay/OPay), რომელსაც `oauth2.bog.ge` არ იღებს.

**დადასტურება ტრანზაქციის გარეშე:**
- Vercel-ში ჩაწერილი წყვილით ერთი OAuth შემოწმება.
- ბანკისგან ამ 4 მცდელობის ლოგი.

შემდეგი ნებისმიერი რეალური მცდელობა მიზეზს თავად ჩაწერს (კოდი main-შია).

**მნიშვნელოვანი (PROVEN, კოდიდან + capabilities):** სანამ BOG უარს ამბობს, Credits ფანჯარაში გეგმის/პაკეტის ყიდვა ყველასთვის ჩავარდება შეცდომით; ბარათზე (Stripe) გადასვლა ამ ფანჯარაში არ ხდება (`components/studio/CreditsModal.tsx` startPlan/startTopup). ჩატის საფულე BOG-ის ჩავარდნისას Stripe-ზე გადადის. 10-06-ის შემდეგ ახალი მცდელობა არ ყოფილა.

## 7. რა გავაკეთე ამ რაუნდში (PR #59, Production-ს არ ეხება merge + deploy-მდე)

1. **500 ₾-ის დაცვა** — `BOG_LIMITS_GEL` (`lib/billing/bogCatalog.ts`); checkout 500 ₾-ზე მეტს `400 BOG_LIMIT`-ით უარყოფს, სანამ რიგს ან BOG-ის შეკვეთას შექმნის.
2. **`BOG_CHECKOUT_MODE`** — checkout-სა და capabilities-ში:
   - არ არის ჩაწერილი → ყველა (დღევანდელი ქცევა);
   - `admin` → მხოლოდ ადმინი; სხვებს BOG ღილაკის ნაცვლად ბარათის (Stripe) გზა ეთავაზებათ (BUILT_NOT_PROVEN, §A4); ადმინის გარდა სხვა თუ მაინც სცადა → 403;
   - `off` → არავინ;
   - ნებისმიერი სხვა მნიშვნელობა (მაგ. შეცდომით აკრეფილი) → `off`.
   ჩარიცხვა (callback, დაბრუნება, cron, განახლებები) ამაზე **არ** არის დამოკიდებული.
3. **ადმინ ბარათი** — დაემატა checkout-ის რეჟიმი და ბოლო 24სთ / 30 დღის გადახდილი ₾ ბანკის ლიმიტთან.
4. **`scripts/bog-oauth-check.mjs`** — ერთი OAuth მოთხოვნა; Secret Key-ს ბრმად კითხულობს, ქართულად ამბობს შედეგს და რა უნდა გაკეთდეს; token-ს და საიდუმლოს არასდროს ბეჭდავს.
5. `lib/billing/BOG_INTEGRATION.md` — OPAY სახელები, `BOG_CHECKOUT_MODE`, ლიმიტები, Preview-ის გაფრთხილება.

ფასები, ფულის ფუნქციები, მიგრაციები და `vercel.json` უცვლელია. PR #58-ის ფაილებთან გადაფარვა არ არის (ხელახლა შემოწმდა 18:5xZ, §A4).

v1.2-ის კოდი (commit `18b2a15`) — §A.

## 8. ტესტების შედეგები

**v1.2 (ამ რაუნდის, commit `18b2a15` + cron-ტესტის შესწორება):**

| ნაკრები | შედეგი |
|---|---|
| billing + BOG + admin + checkout + `scripts/bog-*` + api-lockdown/api-security (unit) | 35 suite, **436/436 ✓** |
| `scripts/bog-sandbox-smoke.test.ts` (Security: sandbox → Production არა) | **17/17 ✓** |
| `scripts/bog-oauth-check.test.ts` (Security: Secret Input, Output Redaction, 2 pty-ტესტი) | **9/9 ✓** |
| SQL სცენარები / რბოლა (Postgres 16) | **36/36 ✓** / **3/3 ✓** |
| Route-level E2E (Integration) | **14/14 ✓** (ახალი: E12 top-up refund, E13 გეგმის refund, E14 sandbox Vercel-ზე) — `evidence/bog-e2e-run-v1.2-2026-10-12.txt` |
| სრული jest (Regression) | 13 324 ✓ · 16 ✕ · 44 skipped. ყველა ✕ ერთ suite-შია: `lib/agent/media/composition.ffmpeg.test.ts`. ის billing-ს არ ეხება და ამ PR-ში არ შეცვლილა: ამ გარემოს ffmpeg ფიქსჩერის `speed=0`-ს არ იღებს. პირველმა გაშვებამ ჩვენი ერთი რეგრესიაც იპოვა: cron-ის ტესტის mock-ს `bogSandboxBlocked` აკლდა (5 ✕) → გასწორდა + 1 ახალი ტესტი, 8/8 — `evidence/full-jest-v1.2-2026-10-12.txt` |
| TypeScript `tsc --noEmit` | 0 შეცდომა ✓ |
| ESLint (ყველა შეცვლილი ფაილი, `--max-warnings=0`) | 0 ✓ |
| zsh 5.9: ძველი `read -r -p` | ✕ `read: -p: no coprocess` (PROVEN დეფექტი); ახალი ვარიანტი ✓ `HTTP 200` / `401` ყალბი BOG-ის წინააღმდეგ, Secret Key არ ჩანს |

**v1.1 (წინა რაუნდი, ცნობისთვის):**

| ნაკრები | შედეგი |
|---|---|
| billing + BOG + admin + checkout + api-lockdown/api-security (unit) | 34 suite, **400/400 ✓** (ახალი: 500 ₾, რეჟიმები, capabilities, ლიმიტების ჯამი) |
| SQL სცენარები (Postgres 16) | 36/36 ✓ |
| რბოლა: 16 პარალელური ჩარიცხვა / განახლების claim / განახლების ჩარიცხვა | 1 / 1 / 1 ✓ |
| Route-level E2E (ყალბი BOG, ლოკალური PostgREST) | **11/11 ✓** (ამ ცვლილებების შემდეგ ხელახლა) |
| `bog-oauth-check.mjs` ლოკალური ყალბი BOG-ის წინააღმდეგ | ✓ 200 / 401 / 403 / პასუხი არ არის / sandbox / ბრმა შეყვანა: საიდუმლო და token გამოტანაში არ ჩანს |
| TypeScript `tsc --noEmit` | 0 შეცდომა ✓ |
| ESLint (შეცვლილი ფაილები) | 0 ✓ |
| სრული jest (v1.0) | 13 198 ✓ · 86 ✕ — ყველა ✕ FFmpeg-ის რენდერია (sandbox-ში ffmpeg-static არ არის), billing-ს არ ეხება — `evidence/full-jest-2026-10-12.txt` |

**E2E:** E1 top-up 20 ₾ → 200 კრედიტი ზუსტად ერთხელ; E2/E3 დაკარგული callback → დაბრუნება / cron; E4 ყალბი callback → 401; E5 სხვა თანხა/ვალუტა → `amount_mismatch`; E6 უარი → `rejected`; E7 credentials უარყოფილი → 502, მიზეზი რიგში, საიდუმლო `[redacted]`; E8 სხვისი შეკვეთა → 404; E9 Starter → 230 კრედიტი, ერთი განახლება, გაუქმება; E10 3 უარი → `past_due`; E11 კატალოგს გარეთ თანხა → 400; **v1.2:** E12 top-up: `refund_requested` → `refunded_partially` → `refunded`, განმეორებითი `completed` არაფერს ცვლის; E13 გაუქმებული გეგმის დაბრუნება: ავტო-განახლება აღარ ცოცხლდება; E14 sandbox წყვილი Vercel-ზე: შეკვეთა, ჩარიცხვა და cron არ ხდება.

## 9. Phase 0 აუდიტი (v1.0, მოკლედ)

- **კოდი:** main = Production `30be5a2`. api.bog.ge-ის ახალი API (არა iPay). Checkout ჯერ სერვერის ფასით წერს რიგს, მერე ქმნის BOG შეკვეთას. Callback → ხელმოწერა → `bog_fulfill_order` (ერთი ტრანზაქცია, row lock, idempotent). Cron ყოველ 10 წთ-ში.
- **Production ბაზა (read-only):**
  - `bog_orders` — 19 სვეტი.
  - 5 ფულის ფუნქცია SECURITY DEFINER; `anon`/`authenticated`-ს მათი გამოძახება არ შეუძლია.
  - 6 ფუნქციის კოდი რეპოსას ემთხვევა (md5).
- **ლოკალური ინსტრუმენტები:**
  - Production-ის ზუსტი ასლი ლოკალურ Postgres-ში: `tests/sql/bog`.
  - E2E: `__tests__/integration/bog-payments.e2e.test.ts`.
  - ადმინ „BOG მზადყოფნა" + „Test credentials with BOG".
  - `scripts/bog-sandbox-smoke.mjs` — მხოლოდ sandbox, 1 ₾ sandbox შეკვეთა.

## 10. ბანკისგან უკვე მიღებული და ჯერ ღია კითხვები

**მიღებულია:** აქტივაცია (E-commerce); credentials Business Manager-შია; ლიმიტები.

**ჯერ ღიაა (გაუგზავნე ბანკს):**
1. OPAY Client ID / Secret Key არის თუ არა Online Payments API-ის (`oauth2.bog.ge`, `api.bog.ge/payments/v1`) წყვილი და არა ძველი iPay/OPay-ის?
2. 1 000 ₾ / 24სთ და 5 000 ₾ / 30 დღე **მერჩანტის ჯამია თუ ერთ ბარათზე**? 24სთ მოძრავია თუ კალენდარული დღე? დაბრუნება ლიმიტს აღადგენს? როგორ გავზარდოთ ლიმიტი საჯარო გაშვებამდე?
3. ჩართულია თუ არა **ბარათის შენახვა ავტომატური გადახდებისთვის** (`PUT /orders/{id}/subscriptions` და `POST /ecommerce/orders/{id}/subscribe`)?
4. **Sandbox** client id / secret იმავე API-სთვის.
5. ჩვენი 4 წარუმატებელი მცდელობის ლოგი: 2026-10-03 11:38, 19:51 (ორჯერ), 2026-10-06 18:02 (თბილისის დროით) — რა უპასუხა OAuth-მა ან შეკვეთის სერვისმა.
6. callback-ს იმეორებთ თუ არა წარუმატებლობისას; რომელი IP-ებიდან იგზავნება.
7. გადახდის მეთოდები (ბარათი, Apple Pay, Google Pay); 3-D Secure; ამონაწერზე რა სახელი ჩანს; საკომისიო და ანგარიშსწორება; Refund API; ტექნიკური კონტაქტი.

## 11. დარჩენილი ბლოკერები

| # | ბლოკერი | ვისზეა | რა უნდა მოხდეს |
|---|---|---|---|
| B1 | Production-ში ჩაწერილი წყვილი დაუმოწმებელია; 4 მცდელობა ჩავარდა | **GG** (ბანკის ნაწილი დასრულდა) | checklist §1–§3: OPAY წყვილი → `bog-oauth-check.mjs` → `✓ ok · HTTP 200` → Vercel Production |
| B2 | Sandbox-ში გადახდა არ შემოწმებულა | ბანკი → GG | §10 პ.4 → `scripts/bog-sandbox-smoke.mjs` ლოკალურად (v1.2: Production-ს ვეღარ მიმართავს; sandbox წყვილი Vercel-ში არასდროს) |
| B3 | ავტომატური განახლება | ბანკი | §10 პ.3 |
| B4 | დაბრუნებისას კრედიტები ავტომატურად არ იკლებს (სტატუსი ზუსტია, §A2; პოლიტიკა უცვლელი) | GG-ის გადაწყვეტილება | ავტომატური ჩამოჭრა თუ ხელით კორექცია |
| B5 | PR #59-ის merge + deploy (`BOG_CHECKOUT_MODE`, 500 ₾, დიაგნოსტიკა, v1.2 შესწორებები) | GG | 18:23Z-ის შემდეგ PR draft რჩება; merge მხოლოდ შენი ახალი სიტყვით „PR #59 merge", OAuth 200-ის და Vercel env-ის შემდეგ |
| B6 | ერთი ცოცხალი გადახდა: 10 ₾ პაკეტი (+100 კრედიტი) | GG | B1-ის შემდეგ, შენი ცალკე სიტყვით |
| B7 | 24სთ / 30 დღის ლიმიტი მერჩანტზე თუ ბარათზე; ლიმიტის გაზრდა | ბანკი | §10 პ.2; შემდეგ, საჭიროების შემთხვევაში, cron-ის დღიური ბიუჯეტი (§4) |

## 12. Production Readiness — რეალური სტატუსი

**NOT READY — BLOCKERS REMAIN.**

v1.2-ის სამი შესწორება კოდში და ტესტებში დასრულებულია (§A). ვერდიქტს ის არ ცვლის: ბლოკერები გარე და შენს ხელშია (B1–B7).

ბანკის მხარე **BANK_CONFIRMED**-ია, ჩვენი კოდი დოკუმენტაციას ემთხვევა და ლოკალურად სრულად დამტკიცებულია. Production-ში კი ჯერ არცერთი გადახდა არ გასულა. Production-ში ჩაწერილი წყვილიც დაუმოწმებელია, მაშინ როცა BOG ღილაკი უკვე ყველასთვის ჩანს.

**შემდეგი მდგომარეობა — READY FOR CONTROLLED LIVE TESTING** — დგება, როცა:
1. OPAY წყვილი OAuth შემოწმებაზე `200`-ს დააბრუნებს.
2. ის Vercel Production-ში ჩაიწერება.
3. შენი ახალი სიტყვით („PR #59 merge") PR #59 deploy-დება `BOG_CHECKOUT_MODE=admin`-ით.

**READY FOR PRODUCTION** — როცა:
1. ადმინის 10 ₾ გადახდა ადმინ ბარათზე `completed`-ად და +100 კრედიტად ჩანს.
2. ბანკი ავტომატურ გადახდებს და ლიმიტების ფორმას დაადასტურებს.
3. `BOG_CHECKOUT_MODE` წაიშლება.

## 13. როგორ გავიმეოროთ

```bash
npm ci
npx jest lib/billing app/api/billing app/api/cron/bog-billing app/api/admin/billing app/api/checkout components/admin scripts/bog- __tests__/api-lockdown __tests__/api-security
# სრული E2E (ლოკალური Postgres + PostgREST v12):
PGURL=postgres://postgres@localhost:5432/postgres POSTGREST_BIN=/path/to/postgrest npm run test:bog-e2e
# credentials-ის შემოწმება (ერთი OAuth მოთხოვნა, თანხა არ ჩამოიჭრება; Secret Key ბრმად):
node scripts/bog-oauth-check.mjs
# sandbox (მხოლოდ ლოკალურად, sandbox წყვილით; Production-ს ვერ მიმართავს):
node --env-file=.env.sandbox.local scripts/bog-sandbox-smoke.mjs order   # ფაილში: BOG_ENV=sandbox, BOG_CLIENT_ID, BOG_SECRET_KEY (sandbox წყვილი); .env*.local git-ში არ ხვდება
```
