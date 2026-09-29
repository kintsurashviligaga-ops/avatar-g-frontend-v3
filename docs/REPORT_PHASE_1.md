# ანგარიში · Phase 1 — პროვაიდერის ფენა (backend) · 2026-09-29

ბრენჩი `feat/studio-phase1`. მისი საფუძველია `fix/p0-db-lockdown`, რადგან settle/refund ლოგიკა იყენებს იმ ბრენჩის ledger-helper-ებს. main-ში პირდაპირ არაფერი შესულა. ბრიფი: §4. წინა ფაზა: [`REPORT_PHASE_0.md`](REPORT_PHASE_0.md).

## 0. ამ ფაზის დროს ნაპოვნი და უკვე გასწორებული — P0 უსაფრთხოება

Phase 1-ის billing saga ledger-ზე დგას, ამიტომ მასზე მუშაობამდე live ბაზა გადავამოწმე. აღმოჩნდა ორი კრიტიკული პრობლემა. ორივე გასწორებულია live-ზე, GG-ს თანხმობით, მიგრაციით `20260929a` (ბრენჩი `fix/p0-db-lockdown`).

1. **საჯარო anon key-ით ნებისმიერს შეეძლო კრედიტის დარიცხვა**. ეს key ყველა გვერდის JavaScript-შია. ხვრელი იყო ორი:
   - SECURITY DEFINER ფუნქციებს (`add_credits`, `refund_credits`, `credit_wallet_gel`, `deduct_credits` და სხვ.) EXECUTE ყველასთვის ჰქონდათ;
   - „Service role full access …“ policy-ები `TO PUBLIC` იყო დაწერილი.

   ანონიმური მოთხოვნა კითხულობდა 39 პროფილს და 146 ledger-ჩანაწერს. სულ 15 ხვრელი იყო; `scripts/check-db-exposure.mjs` ახლა აჩვენებს **LOCKED DOWN**-ს.
2. **2026-08-02-დან არც ერთი გადახდა კრედიტს არ რიცხავდა.** `credit_wallet_gel` ორ overload-ად არსებობდა, ამიტომ ყოველ გამოძახებას PGRST203 ბრუნდებოდა. ეს ეხებოდა Stripe-ს, BOG-ს, Apple IAP-ს და film/music-video refund-ებს. დარჩა ერთი ფუნქცია; BOG და Stripe webhook-ები ჩავარდნილ ჩარიცხვაზე ახლა 5xx-ს აბრუნებენ.

⚠️ `fix/p0-db-lockdown` ბრენჩის **კოდის** ნაწილი ჯერ main-ში არ არის. ბაზა უკვე დაცულია, მაგრამ render drainer-ის refund-ი (`RENDER_DRAINER_ENABLED`-ის შემთხვევაში) merge-მდე ისევ row-ის ციფრს ენდობა.

## 1. რა გაკეთდა

| ფაილი | რას აკეთებს |
|---|---|
| `lib/providers/types.ts` | provider-neutral კონტრაქტი (D4): `ProviderAdapter`, `ProviderError` (code, ambiguous, non-enumerable `detail`) |
| `lib/providers/pricing.ts` | `usd × კურსი × მარჟა` (env `HF_USD_GEL_RATE` / `HF_GEL_MARGIN`, default fx.ts 2.7 × 1.35). ფასი ჯერ **მთელ კრედიტებში** ითვლება (1 კრ = 0.10 ₾), GEL მისგან გამოიყვანება — ღილაკზე ნაჩვენები „4.20 ₾“ ზუსტად 42 კრედიტია |
| `lib/providers/higgsfield/client.ts` | REST კლიენტი: estimate, **submit — მხოლოდ ერთხელ**, status, cancel, upload-url, X-Correlation-ID, შეცდომების რუკა დოკუმენტაციის მიხედვით |
| `lib/providers/higgsfield/models.ts` | endpoint-ები და zod სქემები **მხოლოდ დოკუმენტაციიდან** (`.strict()`, რადგან რამდენიმე endpoint-ს `additionalProperties: false` აქვს) |
| `lib/providers/registry.ts` | ჩვენი კატალოგი, 10 მოდელი: `label_ka`, ქართული აღწერა, tier, fallback (მხოლოდ იმავე ოჯახის ფარგლებში). `HF_ENABLED_MODELS` ზღუდავს სიას იმით, რაც ანგარიშზე რეალურად ჩართულია |
| `lib/providers/higgsfield/webhookAuth.ts` | webhook URL = credential: `?job=<uuid>&sig=HMAC(HF_WEBHOOK_SECRET)` |
| `lib/studio/saga.ts` | billing saga: quote → **დადასტურებული ფასი** → reserve → submit → webhook/poll → finalize/refund; `sweep()` — cron-ის უსაფრთხოების ბადე |
| `lib/studio/store.ts` + `20260929b_studio_jobs.sql` | ცხრილები `studio_jobs` და `provider_webhook_events` (live-ზე გაშვებულია, ცარიელია, RLS: მომხმარებელი მხოლოდ საკუთარს კითხულობს, წერს მხოლოდ service_role) |
| `lib/studio/semaphore.ts` | Upstash Lua semaphore, lease-ით. ანგარიშის concurrency (`HF_MAX_CONCURRENCY`, default 4) → ლოკალური `pending` რიგი |
| `lib/studio/outputs.ts` | D6: შედეგი მაშინვე კოპირდება private bucket-ში `studio`, SSRF-guard-ით და byte-cap-ით; მომხმარებელი იღებს მხოლოდ ჩვენს signed URL-ს |
| routes | `POST /api/estimate`, `POST /api/generate`, `GET/DELETE /api/generate/:id`, `GET /api/studio/models`, `POST /api/webhooks/higgsfield`, `/api/cron/studio-sweep` (ყოველ წუთს) |
| `components/studio/ui/serviceError.ts` | saga-ს 10 კოდი ka/en/ru-ზე: რა მოხდა და რა უნდა ქნას მომხმარებელმა |

**ბრიფის §4 წესები კოდში:**
- `request_id` ინახება დაუყოვნებლივ.
- Webhook-ი 2xx-ს აბრუნებს მხოლოდ ჩანაწერის შემდეგ; დუბლიკატზეც 2xx-ს. dedupe ხდება (provider, request_id, status)-ით.
- **Generation POST არასდროს მეორდება.** timeout გადადის `submit_unknown`-ში, რომელსაც webhook აგვარებს: მის URL-შია ჩვენი job id.
- 400 concurrency → `pending`. 403 → admin alert + refund. 404/423/503 → fallback, მაგრამ მხოლოდ თუ დადასტურებულ ფასზე ძვირი არ არის.
- 422 → refund. failed/nsfw/canceled → refund-ი ledger-იდან.
- Polling მხოლოდ fallback-ია, backoff-ით.
- `STUDIO_V2` flag ფარავს მომხმარებლის route-ებს. webhook და cron ყოველთვის მუშაობს, რომ დაწყებული job დასრულდეს ან თანხა დაბრუნდეს.

## 2. ბრიფიდან გადახვევები (მიზეზებით — GG-ს შეუძლია შეცვალოს)

1. **D1: `@higgsfield/client` SDK-ის ნაცვლად საკუთარი REST კლიენტი.** SDK 0.2.6-ის კოდი წავიკითხე. `subscribe()` generation POST-ს `retryWithBackoff`-ში ახვევს: default 3 retry ETIMEDOUT / ECONNRESET / 5xx-ზე. ეს ზუსტად ის ორმაგი ჩამოჭრაა, რასაც დოკუმენტაცია და ბრიფი კრძალავს. v2-ში ასევე არ არის estimate, cancel, status-by-id და upload-url. REST ზედაპირი 5 endpoint-ია და ის დოკუმენტაციის მიხედვით, ტესტებით არის დაწერილი.
2. **`generation_jobs`-ის ნაცვლად ახალი `studio_jobs`.** `generation_jobs` owner-writable-ია: RLS მომხმარებელს საკუთარი ჩანაწერის ჩაწერის უფლებას აძლევს, რასაც film pipeline იყენებს. ფულზე გადაწყვეტილება კი ისეთ ველზე არ უნდა ეყრდნობოდეს, რომელსაც მომხმარებელი წერს. ამავე მიზეზით render drainer-ით კრედიტის „დაბეჭდვა“ იყო შესაძლებელი. დასრულებული შედეგი `generation_jobs`-შიც იწერება (service role), ამიტომ Library ცვლილების გარეშე აჩვენებს.
3. **`agent_evolution_traces` ცხრილი უკვე არსებობს live-ზე** (2026-09-28-ს შემოწმდა). ბრიფის „დაკარგული ცხრილი“ მოძველებული ინფორმაციაა, ამიტომ მიგრაცია არ დასჭირდა.
4. **პირველ ტალღაში არ არის:**
   - Nano Banana, Seedream, GPT Image — Higgsfield-ის კატალოგში არ არიან;
   - Soul ID — endpoint ვერ დადასტურდა;
   - Genjutsu object-swap / video-edit — Phase 2-ია.
5. **ქართული prompt-ის ინგლისურად თარგმნა (§7) ჯერ არ არის.** prompt იგზავნება ისე, როგორც არის, ორიგინალი ინახება `prompt_original`-ში. თარგმანი Phase 2-ის ნაწილია.

## 3. ტესტები

| | შედეგი |
|---|---|
| typecheck | ✅ 0 შეცდომა |
| jest (სრული) | ✅ **230 suites · 2648 / 2648** (Phase 0-ზე იყო 2529). ახალი: saga 27, client 25, registry/pricing 30, webhookAuth 5, semaphore 4, webhook route 7, P0 guards 20, serviceError +2 |
| build | ✅ compiled, `BUILD_ID` შეიქმნა. client bundle-ში **არ არის** `HF_API_KEY_SECRET`, key-id ან `api.higgsfield.ai` |
| live DB | ✅ ორივე მიგრაცია გაშვებულია. store-ის ყველა sweeper query გაეშვა live PostgREST-ზე (read-only, ცხრილები ცარიელია). exposure check: LOCKED DOWN |
| guard-ების დამტკიცება | ✅ P0 guard-ები ძველ კოდზე წითელია, ახალზე მწვანე |
| Higgsfield-ზე რეალური გამოძახება | ⏳ **ვერ მოხერხდა — secret არ მაქვს** (მხოლოდ key ID) |

## 4. Higgsfield-ის ხარჯი

**0** — secret-ის გარეშე ვერც ერთი მოთხოვნა ვერ გაიგზავნება.

## 5. ღია საკითხები

1. **Higgsfield secret.** სანამ ის არ იქნება, estimate/generate აბრუნებს `not_configured` (503). მოსვლისთანავე: `npm run hf:smoke`, შემდეგ `--submit`.
2. **Vercel env (Preview):**
   - `STUDIO_V2=1`;
   - `HF_API_KEY_ID` + `HF_API_KEY_SECRET` (dev წყვილი);
   - `HF_WEBHOOK_SECRET` — ≥16 შემთხვევითი სიმბოლო, `openssl rand -base64 32`;
   - `CRON_SECRET` — sweep cron-ისთვის; ის უკვე სჭირდება drain-renders-საც.

   ⚠️ Vercel auth-ით დაცულ Preview-ს Higgsfield-ის webhook ვერ მიწვდება. Preview ამიტომ cron-ის polling-ით იმუშავებს, რაც ნელია, მაგრამ სწორი. სწრაფი webhook-ისთვის `HF_WEBHOOK_BASE_URL` უნდა მიუთითებდეს prod-ის origin-ზე.
3. **`fix/p0-db-lockdown` merge.** ამ ბრენჩის საფუძველია, ამიტომ ჯერ ის უნდა შევიდეს.
4. **წინა ხარვეზები, რომლებიც ამ სამუშაომ გამოაჩინა (არ გამისწორებია):**
   - `credit_wallet_gel` refund-ებს `wallet_topups`-ში წერს, ამიტომ admin financials-ის „შემოსავალში“ refund-იც ითვლება;
   - composite refund-ები ledger-ში `purchase`-ად იწერება;
   - `/api/stripe/webhook` (ძველი route) მომხმარებელს anon client-ით ეძებს და ვერ პოულობს;
   - ანონიმური ტესტერების Library ერთ საერთო DEMO user-ზეა, ამიტომ ერთი ანონიმური მომხმარებლის შედეგს სხვაც ხედავს.
5. **Phase 2:**
   - თითო სერვისის UI-დან რეალური ნაკადი;
   - prompt-ის თარგმანი;
   - Soul ID;
   - object-swap / video-edit;
   - Nano Banana-ს ჩასმა არსებული პროვაიდერით;
   - მომხმარებლის ფაილების ატვირთვა Higgsfield-ის presigned URL-ით (`createUpload` მზადაა).
