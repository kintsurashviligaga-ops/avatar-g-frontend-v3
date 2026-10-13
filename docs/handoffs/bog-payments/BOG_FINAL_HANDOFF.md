# BOG Payments — Handoff (v1.3)

2026-10-12 · ვერდიქტი: **NOT READY — merge Owner-ის ორ მოქმედებას ელოდება** (Vercel კონექტორი / env და OAuth 200). კოდი, ტესტები, Production ბაზის თავსებადობა და rollback მზადაა.

## სად რა არის

| | |
|---|---|
| ბრენჩი / PR | `claude/bog-payments-master-task-yjxq59` → PR #59 (draft) → `main` |
| კოდი | `lib/billing/bogClient.ts` (OAuth, შეკვეთა, receipt, ხელმოწერა, `bogCheckoutMode`), `bogSettlement.ts` (ჩარიცხვა, refund-ის მდგომარეობები, sandbox-ის დაცვა), `bogCatalog.ts` (ფასები, 500 ₾), `bogDiagnostics.ts` + `components/admin/BogReadiness.tsx` (ადმინ ბარათი); route-ები `app/api/billing/bog/*`, `app/api/checkout/capabilities`, `app/api/cron/bog-billing`, `app/api/admin/billing/bog` |
| ტესტები | route / unit ტესტები ფაილების გვერდით; `tests/sql/bog/` (Production-ის ასლი); `__tests__/integration/bog-payments.e2e.test.ts` (`npm run test:bog-e2e`) |
| ინტეგრაციის აღწერა | `lib/billing/BOG_INTEGRATION.md` |
| Production smoke | `scripts/bog-production-smoke.mjs` (ანონიმური მოთხოვნები, ჩაწერის გარეშე); GitHub → Actions → „BOG Production smoke (read-only)" |
| v1.3 დოკუმენტები | [E2E Report](BOG_PRODUCTION_E2E_REPORT.md) · [Security](BOG_SECURITY_VERIFICATION.md) · [Release Checklist](BOG_PAYMENT_RELEASE_CHECKLIST.md) · [Rollback](BOG_ROLLBACK_PLAN.md) · [Owner Actions](BOG_OWNER_ACTIONS.md) |
| ისტორია | [v1.2 ანგარიში](2026-10-12-bog-payments-v1-ka.md), `evidence/` |

## რა გაკეთდა v1.3-ში

- Phase 0 აუდიტი მიმდინარე HEAD-ზე: 15 პუნქტი, კრიტიკული დეფექტი არ არის.
- გამკაცრება `93ec307`: Preview / Development deployment-ზე BOG checkout ყოველთვის დახურულია (+3 ტესტი, რომლებიც გამოსწორების გარეშე ვარდება).
- Production ბაზა (read-only): 6 ფულის ფუნქცია, `bog_orders`-ის სვეტები, constraint-ები და ინდექსები, ledger-ის იდემპოტენტობის ინდექსები ემთხვევა. მიგრაცია არ სჭირდება.
- ტესტები: 438/438, SQL 39/39, E2E 14/14, სრული jest 13 326 ✓ (16 ✕ მხოლოდ sandbox-ის ffmpeg-ის გამო, CI-ში მწვანე).
- PR #58-თან (head `4620ac5`, 2026-10-13) და Image Studio-ს ბრენჩებთან საერთო ფაილი 0.
- Production smoke-ის სკრიპტი და ხელით გასაშვები GitHub Actions workflow (+7 ტესტი): ჩემი sandbox-იდან myavatar.ge 2026-10-13-დან აღარ იხსნება, ამიტომ deploy-ის შემდეგ smoke GitHub-ის runner-ზე ეშვება.

## შემდეგი ნაბიჯები (თანმიმდევრობით)

1. **Owner:** Vercel კონექტორის ხელახლა დაკავშირება გუნდით `kintsurashviligaga-ops-projects` (ან env-ის ხელით შეცვლა + ფოტო).
2. **Claude:** override-ების წაშლა, `BOG_CHECKOUT_MODE=admin`, `BOG_ENV=production`, `CRON_SECRET` / `NEXT_PUBLIC_SITE_URL` / scope-ების შემოწმება.
3. **Owner:** `bog-oauth-check.mjs` → `✓ ok · HTTP 200`, შემდეგ OPAY წყვილი Vercel Production-ში (Sensitive).
4. **Claude:** env metadata → Release Checklist-ის 10 პირობა → PR #59 ready → merge → deployment ID / SHA → smoke (GitHub Actions) + read-only SQL.
5. **Owner (ცალკე სიტყვით):** ცოცხალი 10 ₾ → **Claude:** შეკვეთა, ზუსტად +100 კრედიტი, ერთი ledger ჩანაწერი (read-only SQL) → E2E Report-ის განახლება.
6. შემდეგი gate-ები (ცალკე): საჯარო checkout, ავტომატური განახლებები, refund-ის კრედიტ-პოლიტიკა, ლიმიტების გაზრდა.

## წესები, რომლებიც არ უნდა დაირღვეს

- საიდუმლოს არ ვითხოვთ, არ ვბეჭდავთ და არ ვწერთ; OPAY წყვილს მხოლოდ Owner წერს Vercel-ში.
- Production ბაზა მხოლოდ read-only-ა; მიგრაცია მხოლოდ Owner-ის ცალკე სიტყვით.
- ცოცხალი გადახდა მხოლოდ Owner-ის სიტყვით და მხოლოდ Owner-ის მიერ; გაურკვეველ მდგომარეობაში ხელახლა ცდა არ ხდება.
- ფასები, კრედიტის კურსი და refund-ის პოლიტიკა უცვლელია.
