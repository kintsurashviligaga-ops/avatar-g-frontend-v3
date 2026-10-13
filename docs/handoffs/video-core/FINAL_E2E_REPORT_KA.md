# Video Core v1.0 — საბოლოო E2E ანგარიში (Release Candidate), 2026-10-13

**Branch** `claude/video-core-v1-6gh97e` (main 30be5a2-დან) · **Draft PR #58** → main, merge არ ყოფილა · საბოლოო head **⟨HEAD⟩** ·
პროდუქტის კოდი ბოლოს 38a6167-ში შეიცვალა (საკუთარი storage host-ის ამოცნობა, დეფექტი 38; Production-ზე ქცევა უცვლელია);
სხვა შემდგომი commit-ები მხოლოდ ტესტები, CI workflow და დოკუმენტებია.
შენი დავალებები: 18:17Z (Final Completion), 18:29Z, 19:05Z (Isolated CI E2E), 19:07Z (Owner hands-off).

## 1. ვერდიქტი

**⟨VERDICT⟩**

კრიტიკული ბლოკერი (გახსნილი პროდუქტის დეფექტი, ფულის ან უსაფრთხოების ხარვეზი) არ დარჩა. დარჩენილი კარიბჭეები გარეა და შენს
სიტყვას საჭიროებს: ცოცხალი Veo/Vertex (ბიუჯეტი), Vercel runtime შემოწმება (ახალი Preview-ის ნებართვა), Production მიგრაცია (B3)
და merge/deploy. ამიტომ "Production Ready" **არ** ვაცხადებ.

## 2. ოთხი ფენა ცალ-ცალკე (როგორც მოითხოვე)

| ფენა | სტატუსი | რას ეყრდნობა |
| --- | --- | --- |
| **CI E2E** (იზოლირებული ლოკალური Supabase GitHub Actions-ში, რეალური backend, რეალური ffmpeg, desktop + iPhone 13) | ⟨CISTATUS⟩ | run ⟨R4RUN⟩, `evidence/ci-e2e/` |
| **Vercel Runtime E2E** | **NOT RUN** | ახალი Preview შენს ნებართვას საჭიროებს; არსებული Preview Production Supabase-ზეა მიბმული, იქ მხოლოდ read-only შემოწმებაა დაშვებული |
| **Vertex / Veo Live** | **NOT RUN** | ფასიანი გამოძახება ავტორიზებული არ არის; Veo/director-ის unit ტესტები და კონფიგურაციის მიმოხილვა (`VERTEX_LIVE_TEST_PLAN.md`) mocked provider-ია და ცოცხალ შემოწმებად **არ** ითვლება |
| **Production E2E** | **NOT RUN** | Production არასოდეს არის სატესტო გარემო; არაფერი merge-ული ან deploy-ული |

## 3. CI E2E — რა გაიარა რეალურ backend-ზე

როგორ მუშაობს (დეტალები `SUPABASE_TEST_ENV.md`): GitHub Actions-ის runner-ზე `supabase start` აწყობს ერთჯერად სტეკს (Auth, Storage,
PostgREST, Postgres 17), Test Schema Baseline რეპოს ფაილებიდან აშენებს Production-ის ფორმის სქემას (RLS, RPC, Auth Triggers, Storage
Policies, Billing), `900_verify.sql` ამოწმებს მას ტესტებამდე, `next start` ემსახურება ამ branch-ს, Playwright მართავს desktop-ს და
iPhone 13-ს სინთეტიკური მომხმარებლებით. Production dump, GitHub Secret ან შენგან ფაილი **არ** დასჭირდა. Fail-closed guard ორჯერ
ამოწმებს, რომ მისამართი მხოლოდ ამ მანქანის სტეკია (Production-ის ref სახელით იბლოკება). ყველაფერი runner-თან ერთად ნადგურდება.

| სცენარი | Desktop | iPhone 13 | რა გაიზომა |
| --- | --- | --- | --- |
| Login (რეალური ფორმა, რეალური GoTrue) | ⟨S-LOGIN⟩ | ⟨S-LOGIN-M⟩ | სესია cookie-ში |
| Upload → Agent G → Quote → Confirm (ორჯერ დაჭერილი Start) → FFmpeg → QC → Library → Download | ⟨S-MONT⟩ | ⟨S-MONT-M⟩ | ერთი job ორ დაჭერაზე; master დეკოდირდა: ⟨R4FRAMES⟩; ბალანსი უცვლელი (ადმინის მონტაჟი უფასოა); Library ჩამოთვლის; Download ჩანს |
| Stop → Retry → ახალი Quote → სრული master | ⟨S-STOP⟩ | ⟨S-STOP-M⟩ | შეჩერებული job `cancelled`, არაფერი ჩამოჭრილა; მეორე job სრული სიგრძის |
| Error recovery: არა-აუდიო ფაილი / გაუხსნელი კლიპი | ⟨S-ERR⟩ | ⟨S-ERR-M⟩ | upload-ზე უარი; quote-ზე უარი სახელით; არაფერი გაეშვა |
| Agent G-ის მიწოდებული 5 წმ ვიდეო → Trim 1–4 წმ → 90 კადრი | ⟨S-TRIM⟩ | ⟨S-TRIM-M⟩ | desktop: „Trim the previous video from 1 to 4 seconds."; ტელეფონი: „წინა ვიდეო 1-დან 4 წამამდე მოჭერი"; დეკოდირებული კადრები, 0 ჩამოჭრა |
| იგივე → Speed 2× → 75 კადრი | ⟨S-SPEED⟩ | ⟨S-SPEED-M⟩ | „…2x speed." / „წინა ვიდეო 2-ჯერ ააჩქარე"; დეკოდირებული კადრები, ხმით |
| იგივე → Slow motion (0.5×) → 300 კადრი | ⟨S-SLOW⟩ | ⟨S-SLOW-M⟩ | „…slow motion." / „წინა ვიდეო ნელ მოძრაობაში გადაიყვანე"; დეკოდირებული კადრები, ხმით |
| სხვა მომხმარებელი: job, master, upload, quote | ⟨S-OTHER⟩ | ⟨S-OTHER-M⟩ | RLS 0 სტრიქონი, task route 403/404, storage უარი, უცხო ფაილით quote უარი |

მონაცემთა ბაზისა და წვდომის კონტრაქტები (ბრაუზერის გარეშე, იგივე სტეკზე): ⟨R4CONTRACTS⟩ — ახალი მომხმარებელი იღებს ზუსტად ერთ 50-კრედიტიან
საწყის გრანტს; RLS: მომხმარებელი მხოლოდ თავისას კითხულობს და ფულს/job-ებს ვერ წერს; anon გასაღები ვერაფერს ხედავს; `deduct_credits*`,
`refund_credits`, `auth_account_status` anon-სა და მომხმარებელს უარს ეუბნება; service role-ით ერთი ref = ერთი ჩამოჭრა, 6 პარალელური
ტყუპი = ერთი ჩამოჭრა, refund ერთხელ; Agent G media ჩვეულებრივი მომხმარებლისთვის დახურულია (404), ადმინისთვის ღია; uploads/renders
bucket-ები private-ია.

Billing რეალურ Postgres-ზე (ცალკე job): **38 PASS**, 2 skip (დიზაინით) — lease takeover მკვდარი worker-ის შემდეგ და ერთხელ ჩამოჭრა, ორჯერ
მომკვდარი job-ის refund ერთხელ, Stop კლავს ffmpeg-ს და აბრუნებს ერთხელ, 8 worker → ერთი job, 8 ტყუპი → ერთი debit, სხვა მომხმარებელი
run-ს ვერ მართავს, outbox ერთხელ.

Storyboard ნაბიჯი CI E2E-ში **NOT RUN**: მას image model (provider) სჭირდება. დაფარულია T1/T2 დონეზე (mocked) — ცოცხალ შემოწმებად არ ვთვლი.
B3-ის ცხრილის წინადადება (`storyboard_revisions`) გადამოწმდა **მხოლოდ** CI-ის ერთჯერად ბაზაზე: ეშვება, RLS მუშაობს.

## 4. ტესტების კარიბჭე საბოლოო head-ზე

| კარიბჭე | შედეგი |
| --- | --- |
| TypeScript | PASS, 0 შეცდომა (sandbox + CI) |
| ESLint | PASS, 0 შეცდომა, 34 warning (ახალი არცერთი) |
| Jest | PASS: 884/889 suite, 13 650 ტესტი, 44 skip, 0 fail (CI "verify") ⟨VERIFYKA⟩ |
| Build | PASS (CI + live job-ის `next start`) |
| Playwright mocked (T2) | PASS: 92 / 6 skip / 0 fail |
| Playwright რეალური backend (CI E2E) | ⟨R4LIVE⟩ |
| რეალური FFmpeg | PASS: 29.7 წმ = 891, 60 წმ = 1800, 70 წმ = 2100 კადრი; AC-06 ერთ ჯაჭვად; speed ცვლილებები 30 fps ბადეზე |
| Billing/Security რეალურ Postgres-ზე | PASS 38 / 2 skip |
| Job Recovery | DB PASS; ბრაუზერში Stop → Retry ⟨R4STOPKA⟩ |
| AC-01…AC-28 | ⟨ACTOTALSKA⟩ (`FINAL_ACCEPTANCE_MATRIX.md`) |
| HawkScan (DAST) | NOT RUN — `HAWK_API_KEY` არ არის (B7) |

## 5. რა იპოვა და გამოასწორა ამ ეტაპმა

| # | რა | Root cause | გამოსწორება | რეგრესია / ხელახალი გაშვება |
| --- | --- | --- | --- | --- |
| 34 | ტელეფონზე (390×664) მცურავი job tray ფარავდა ახალი მონტაჟის ბარათის Start-ს | thread-ს tray-სთვის ადგილი არ ჰქონდა (`JobTray.tsx`, fixed z-60) | tray აქვეყნებს `--job-tray-h`-ს, thread ამ სიმაღლის spacer-ით მთავრდება (be10500) | T2 92/6/0, `flows.spec` [phone] |
| 35 | CI E2E run 3: Stop → Retry → Start ორივე viewport-ზე `429 rate_limited` | ტესტი ერთ წუთში 6-ჯერ ეძახდა quote/run-ს; პროდუქტის `EXPENSIVE` ლიმიტი 5/წთ-ია — პროდუქტი სწორად იქცეოდა | ტესტები ახლა ლიმიტის ქვეშ მიდიან (4620ac5); serial describe გაიყო, რომ ერთმა ჩავარდნამ 8 ტესტი არ დამალოს | run 4: Stop → Retry PASS ორივეზე (600 კადრი, 0 ჩამოჭრა) |
| 36 | CI E2E run 1: "სხვა მომხმარებლის" შემოწმება მფლობელის cookie-ით მიდიოდა | ტესტის კონტექსტი | cookie-ს გარეშე API კონტექსტი (5d52b1b) | run 3, 4, 5 და ⟨R6RUN⟩ |
| 37 | CI E2E run 4: ექვსი edit ტესტი (Trim / 2× / Slow motion) 90 წამს ელოდა edit quote-ს, რომელიც არ მოვიდა | ტესტი ახალ, **მიმაგრებულ** ფაილზე ითხოვდა Trim-ს; პროდუქტი მიმაგრებულ ფაილზე trim/speed სიტყვებს ჩატის მოდელს (remix) აძლევს (Media Studio v2), CI-ში კი მოდელის გასაღები არ არის (`Gemini chat failed: auth`) | ტესტი ჯერ 5 წმ მონტაჟს აკეთებს და მერე Agent G-ის **მიწოდებულ** ვიდეოს არედაქტირებს (AC-11), desktop ინგლისურად, ტელეფონი ქართულად (9d7e95b) | run 38341155145: edit ხაზი მიღწეულია, წყარო უარყოფილია (→ 38) |
| 38 | CI E2E run 5: Agent G-მა edit-ი სწორ ხაზზე დაგეგმა, მაგრამ edit quote-მა მისივე მონტაჟი უარყო: `unreadable` „The file cannot be read." | `parseSupabaseObjectUrl` ჩვენს storage ფაილს მხოლოდ `*.supabase.co`-ზე ცნობდა; CI-ის სტეკი სხვა სახელზეა და http-ით ლაპარაკობდა, აპი კი ჩვენს storage ბმულს მხოლოდ https-ით იღებს (როგორც Production-ში) | parser ახლა ამ deployment-ის საკუთარ Supabase host-საც ცნობს (Production-ში მიღებული host-ები უცვლელია); CI სტეკი https-ით მუშაობს, ამ run-ისთვის შექმნილი CA-თი, რომლის გასაღებიც მაშინვე იშლება (38a6167) | unit: storage-adapter, callerMedia, guard; run ⟨R6RUN⟩: ⟨R6EDIT⟩ |

CI E2E-ის ოთხი ჩავარდნიდან სამი ტესტებში იყო, ერთი (38) კი პროდუქტის ფარული დეფექტი: Production-ს ის არ ეხებოდა, რადგან
Production-ის storage host `*.supabase.co`-ზეა, მაგრამ custom domain-ზე ან self-hosted Supabase-ზე Agent G-ის საკუთარი ვიდეოს
რედაქტირება ჩავარდებოდა. გამოსწორებულია, რეგრესიის ტესტით, რომელიც Production-ის ფორმის env-ზე ამტკიცებს, რომ მიღებული host-ები
ზუსტად იგივე დარჩა. ორმა ჩავარდნამ შენი გადაწყვეტილება გამოაჩინა და ჩუმად **არ** შემიცვლია: **D11** — ლიმიტი (abuse/cost პოლიტიკა); **D12** — Trim/Speed სიტყვები ახლად მიმაგრებულ
ვიდეოზე მოდელზეა დამოკიდებული, Agent G-ის საკუთარ შედეგზე კი არა (წინადადება: ორივე Agent G-ის edit-მა მიიღოს).
წინადადებები `RELEASE_READINESS_CHECKLIST.md` §3-შია. evidence-ის redaction-მა რიცხვითი სტატუსიც დაფარა (`sweepWithoutSecret`) — გასწორდა
(რიცხვი/boolean აღარ იმალება, სტრიქონი ისევ იმალება).

## 6. მიგრაციები: 114 / 35 (ცალკე საკითხი)

რეპოს 114 მიგრაციიდან 35 ცარიელ ბაზაზე ვერ ეშვება (`evidence/round3-final/migration-replay-fresh-db.tsv`), ამიტომ CI სქემას
მიგრაციებიდან კი არა, Test Schema Baseline-დან აშენებს. ეს Video Core-ს გარეთაა; სრული გამოსწორება (squashed baseline + forward-only
მიგრაციები) საერთო ისტორიას ცვლის და მხოლოდ წინადადებაა (`SUPABASE_TEST_ENV.md`). Production-ის მიგრაციები არ შემიცვლია.

## 7. რა რჩება შენზე (მხოლოდ ის, რასაც მე ვერ გავაკეთებ)

1. **Veo ბიუჯეტი (B1)** — L1 ≈ $0.40, L2 ≈ $1.92, L3 ≈ $3.84 (`VERTEX_LIVE_TEST_PLAN.md` §3); თითოეულს ცალკე სიტყვა სჭირდება.
2. **Vercel runtime შემოწმება** — ახალი Preview-ის ნებართვა.
3. **B3 Production მიგრაცია** (`storyboard_revisions`) — CI-ზე გადამოწმებულია.
4. **D1–D12** პროდუქტის/ფინანსური/კონტრაქტის გადაწყვეტილებები (`RELEASE_READINESS_CHECKLIST.md` §3).
5. **Merge / deploy (B8)** — PR #58 draft-ად რჩება.

## 8. დაცული წესები

Production Database, Auth, Storage და Credentials ტესტებში არ გამოყენებულა; მონაცემები მხოლოდ სინთეტიკურია; fail-closed guard;
Production schema dump არ მოთხოვნილა; GitHub Secret არ დამატებულა (CI-ის დროებითი გასაღებები runner-თან ერთად კვდება); საჯარო CI log-ში
evidence redacted-ია; ფასიანი Veo/Vertex გამოძახება არ ყოფილა; merge, deploy, ახალი Preview, Production მიგრაცია არ ყოფილა; force-push არ
ყოფილა; PR #59 (BOG) და Image Studio არ შეხებია; mock ცოცხალ შემოწმებად არ გამოცხადებულა.

## 9. ფაილები

`FINAL_ACCEPTANCE_MATRIX.md` · `RELEASE_READINESS_CHECKLIST.md` · `DEFECT_REGISTER_FINAL.md` · `VIDEO_CORE_HANDOFF.md` ·
`SUPABASE_TEST_ENV.md` · `evidence/ci-e2e/` · `evidence/t2-round3-final/summary.md` · `FFMPEG_EVIDENCE.md`
(ყველა `docs/handoffs/video-core/`-ში).
