# BOG Payments — Handoff (v1.3)

2026-10-13 09:15Z · ვერდიქტი: **ADMIN-ONLY BOG PROVEN — საჯარო გახსნა NO-GO ცალკე gate-ებამდე.** PR #59 Production-შია (`883a013`), BOG მხოლოდ ადმინისთვისაა, OAuth ცოცხალი წყვილით 200-ს აბრუნებს. Owner-ის ცოცხალი 10 ₾ გადახდა (მცდელობა 2, 09:09:27Z) `completed`-ია და ზუსტად +100 კრედიტი ერთხელ ჩაირიცხა; მცდელობა 1-ის ბანკის უარი სწორად ჩაიწერა. ერთი რამ ცალკე დაუმტკიცებელია: ჩარიცხვა ხელმოწერილმა callback-მა გააკეთა თუ დაბრუნების გვერდმა ([E2E Report](BOG_PRODUCTION_E2E_REPORT.md), კრიტერიუმი 7).

## სად რა არის

| | |
|---|---|
| კოდი | `main` (`883a013`, PR #59 merged 2026-10-13 05:51Z). `lib/billing/bogClient.ts` (OAuth, შეკვეთა, receipt, ხელმოწერა, `bogCheckoutMode`), `bogSettlement.ts` (ჩარიცხვა, refund-ის მდგომარეობები, sandbox-ის დაცვა), `bogCatalog.ts` (ფასები, 500 ₾), `bogDiagnostics.ts` + `components/admin/BogReadiness.tsx` (ადმინ ბარათი); route-ები `app/api/billing/bog/*`, `app/api/checkout/capabilities`, `app/api/cron/bog-billing`, `app/api/admin/billing/bog` |
| Production | `dpl_Gduf2SkotvazFoQp3qX1TeBQCX6M` (`883a013`), READY 06:28:39Z |
| ტესტები | route / unit ტესტები ფაილების გვერდით; `tests/sql/bog/` (Production-ის ასლი); `__tests__/integration/bog-payments.e2e.test.ts` (`npm run test:bog-e2e`) |
| ინტეგრაციის აღწერა | `lib/billing/BOG_INTEGRATION.md` |
| Production smoke | `scripts/bog-production-smoke.mjs`; GitHub → Actions → „BOG Production smoke (read-only)“ (`expect_bog=false`) |
| v1.3 დოკუმენტები | [E2E Report](BOG_PRODUCTION_E2E_REPORT.md) · [Security](BOG_SECURITY_VERIFICATION.md) · [Release Checklist](BOG_PAYMENT_RELEASE_CHECKLIST.md) · [Rollback](BOG_ROLLBACK_PLAN.md) · [Owner Actions](BOG_OWNER_ACTIONS.md) · [2026-10-13 მტკიცებულება](evidence/production-2026-10-13.md) |
| ისტორია | [v1.2 ანგარიში](2026-10-12-bog-payments-v1-ka.md), `evidence/` |

## რა გაკეთდა v1.3-ში

- Phase 0 აუდიტი: 15 პუნქტი, კრიტიკული დეფექტი არ არის. გამკაცრება `93ec307`: Preview / Development-ზე BOG checkout ყოველთვის დახურულია.
- Production ბაზის თავსებადობა (read-only): მიგრაცია არ სჭირდება; 6 ფულის ფუნქცია merge-ის შემდეგაც უცვლელია.
- Vercel Production env (Claude, 03:20Z): `BOG_CHECKOUT_MODE=admin`, `BOG_ENV=production`; override-ები არ არის.
- Merge Owner-ის 05:50:55Z-ის დადასტურებით, OAuth-ის შედეგამდე: Owner-ის 05:43Z-ის Redeploy-მ ძველი `30be5a2` ააშენა და BOG ყველა შესულ მომხმარებელს აჩვენა ≈10 წუთით (შეკვეთა არ შექმნილა). merge-მა ეს დახურა 05:57Z-ზე.
- OAuth: 06:10Z 400 (Client ID / Secret შეუსაბამობა) → Owner-მა ორივე ხელახლა ჩაწერა 06:23Z → 06:37Z **200**.
- Smoke GitHub-ის runner-ზე: 9/9 (05:5xZ) და ✓ (06:37Z).
- ცოცხალი მცდელობა 1 (06:44Z): BOG-მა შეკვეთა შექმნა, ბანკმა უარყო („insufficient funds“), კრედიტი არ ჩარიცხულა.
- Phase 7–8 (07:21Z, read-only): refund, გამოწერა, allowance, BOG ledger, ღია შეკვეთა — ყველა 0; პოლიტიკა უცვლელი.
- ცოცხალი მცდელობა 2 (09:08Z → `completed` 09:09:27Z): ერთი `wallet_topups` რიგი, ერთი ledger ჩანაწერი +100, ბალანსი baseline + 100, ღია შეკვეთა 0, 6 ფულის ფუნქციის md5 უცვლელი (read-only, 09:11Z).

## შემდეგი ნაბიჯები (თანმიმდევრობით)

1. ~~Owner: მცდელობა 2~~ ✓ 09:09Z. ~~Claude: ერთჯერადი read-only შემოწმება~~ ✓ 09:11Z.
2. **Owner:** ამ დოკუმენტების PR #61-ის merge (მხოლოდ დოკუმენტებია, კოდი არ იცვლება).
3. შემდეგი gate-ები (ცალკე, Owner-ის სიტყვით): საჯარო checkout (`BOG_CHECKOUT_MODE`-ის წაშლა; ამ დროს გეგმის ღილაკიც იხსნება, ამიტომ ჯერ ბანკის პასუხი ავტომატურ გადახდებზე ან გეგმის ცალკე ჩამკეტი), ავტომატური განახლებები, refund-ის კრედიტ-პოლიტიკა, ლიმიტების გაზრდა. ცოცხალი გადახდა ამაზე მეტად Owner-ის ახალი სიტყვის გარეშე არ კეთდება.
4. ბანკი: კითხვები 2–5 ([Owner Actions](BOG_OWNER_ACTIONS.md)).

## წესები, რომლებიც არ უნდა დაირღვეს

- საიდუმლოს არ ვითხოვთ, არ ვბეჭდავთ და არ ვწერთ; OPAY წყვილს მხოლოდ Owner წერს Vercel-ში.
- env-ის შეცვლის შემდეგ Redeploy მხოლოდ მიმდინარე Production deployment-ზე (`883a013`), არასდროს ძველზე.
- Production ბაზა მხოლოდ read-only-ა; მიგრაცია მხოლოდ Owner-ის ცალკე სიტყვით.
- ცოცხალი გადახდა მხოლოდ Owner-ის სიტყვით და მხოლოდ Owner-ის მიერ; გაურკვეველ მდგომარეობაში ხელახლა ცდა არ ხდება.
- ფასები, კრედიტის კურსი და refund-ის პოლიტიკა უცვლელია.
