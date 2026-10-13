# Image Studio v1.0 — Final E2E Matrix
2026-10-13. PASS ეხება მხოლოდ დასახელებულ გარემოს. Code source compatibility და mocked UI არ უდრის provider-backed E2E-ს.

| Scenario | Expected result | Actual result | Evidence | Verified environment | Status |
|---|---|---|---|---|---|
| Quote/Confirm | quote0ხარჯი; explicit confirm; signature/expiry checks | კონტრაქტები შესრულებულია | engine/http/client Jest | injected provider/ledger | PASS |
| References/character/outfit/product | role/order/digest, უცვლელი ტექსტი | კონტრაქტები/უარყოფები შესრულებულია | assets/prompt/provider tests | fixture images | PASS |
| Editing/Versions | owner source, parent/child isolation, immutable original | კონტრაქტები და UI edit/compare გავიდა | history/ImageWorkspace tests | mocked backend | PASS |
| Agent G/Georgian | trusted draft→quote; no model confirmation | registry/commands და ქართული ტექსტი გავიდა | Agent tests | injected dependencies | PASS |
| One Window EN/KA/RU | quote→confirm→refresh→cancel |3locale სცენარი გავიდა | browser-results.json | Chromium/intercepted API | PASS |
| Variants/mobile Library | sequential4variants; preview/edit/compare; keyboard |2სცენარი გავიდა | browser-results.json | Chromium390×844/intercepted API | PASS |
| Timer cleanup | ბუნებრივი exit | limiter28/storage8 და DB suites ბუნებრივად სრულდება | bounded logs | Node24; no forceExit | PASS |
| Image DB concurrency |8confirms/workers→1debit/job/render | შესრულებულია; fresh deps reads persisted row | image.json | PG/PostgREST; Google/Redis/Storage injected | PASS |
| Image DB refund/cancel/ownership | refund ერთხელ; foreign404; no late dispatch | შესრულებულია | image.json | real ledger/CAS; injected failure | PASS |
| Lease Before/After | retry deliver და fencing |7/7 ორივეჯერ, existing PR58 fixture fix | lease-before/after.json | real isolated DB | PASS |
| Ledger Before/After | ძველი race ხილულია; hardening შემდეგ once |7PASS+1phase-skip ორივეჯერ | ledger-before/after.json | real isolated DB | PASS |
| Multi-step runs / Outbox | persisted recovery/local FFmpeg/atomic delivery store |6/6 და4/4 | runs/outbox.json | real PG/FFmpeg; delivery mocked | PASS |
| Historical baseline diagnostic | ზუსტად ცნობილი წინა failure/interval გამოვლინდეს |6PASS/1knownFAIL +timeout; strict comparison matches | lease-baseline.json/log, baseline-verdict | clean30be5a2d | PASS (comparison only) |
| Real Auth identity / anonymous denial | owner identity; anonymous401 | owner identity და anonymous401 შესრულებულია | free E2E results | local Supabase Auth; synthetic admin users | PASS |
| Real DB RLS/Versions/Library | Aხედავს საკუთარ rows/assets/lineage; Bვერ ხედავს | A/B RLS, asset signing, Versions და Library შესრულებულია | free E2E results | local Postgres/RLS; seeded synthetic images | PASS |
| Private Storage | private bucket; signed PNG digest; foreign/public refusal | signed PNG digest და foreign/public denial შესრულებულია | free E2E results | real local Storage; synthetic PNG | PASS |
| Credits during free checks | balance/ledger unchanged | afterAll balance/ledger invariance შესრულებულია | afterAll assertions | real local DB; no quote/confirm | PASS |
| PR58 coexistence | Image runs beside finalVideo source | typecheckPASS;5ChromiumPASS | pr58-aa0-* | aa0de1f7 disposable combined snapshot | PASS |
| Hosted preflight |2users/private bucket/catalog verified | missing isolated origins/tokens;0requests | config/runbook | hosted environment absent | BLOCKED |
| Google generate/edit | actual output/edit/cost | არ შესრულებულა; no paid approval | Phase6 runbook | real Google required | BLOCKED |
| Full paid lifecycle |1provider request/debit, stored actual output | DB და Storage ნაწილები ცალ-ცალკეა | runbook AC06/15 | app+Redis+Google+DB+Storage required | BLOCKED |
| Distributed recovery | restart/cancel/refund outage safely settled | injected coverage მხოლოდ | runbook AC07–09 | isolated live worker/Redis required | BLOCKED |
| Visual references | identity/outfit/product/edit adherence | actual generated samples არ არსებობს | owner visual review | paid outputs required | BLOCKED |

რეალური უფასო სცენარები შესრულდა run38413376597-ში: Image3/3, სრული Video+Image38/38,15.8წთ. ეს ამოწმებს PR-ის იმდროინდელ integration snapshot-ს; ახალ main fef867a6-ზე შემოწმება ჯერ მიმდინარეობს.
ყველა ძველი25DB სცენარი და დამატებით Image3DB სცენარი დაფარულია; phase executions არ ითვლება ახალ უნიკალურ ტესტებად. Synthetic completed rows მხოლოდ fixture-ია, არა შესრულებული Google jobs. Free suite არ იძახებს quote/confirm/provider-ს და არ ცვლის RLS policies-ს.
