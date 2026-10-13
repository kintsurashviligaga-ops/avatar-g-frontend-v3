# Video Core v1.0 — Production Deployment Report (2026-10-13)

**შედეგი:** PR #58 merge-ულია და Production-ში გაშვებულია. myavatar.ge ემსახურება commit **`e46c35c`**-ს. ყველა
უსაფრთხო შემოწმება გავიდა: Production smoke 9/9, Credits, Auth, Video API და Job Recovery დახურულია ანონიმურისთვის და
მუშაობს, ახალი შეცდომა არ გაჩენილა. Rollback არ დასჭირდა. Video Core საჯაროდ **არ** გახსნილა (admin-only რჩება).
ეს არ არის „Production Ready" საჯარო Video Core-ისთვის: B1 (Veo) და R2 (idempotency) ჯერ ღიაა (§6).

| | |
| --- | --- |
| Commit SHA | **`e46c35c50aabea407ac2bc5a473aee594ff92f2b`** — merge commit (main `ba2e0a4` + PR-ის თავი `aa0de1f`), 13:20:19Z |
| ვისი სიტყვით | შენი, 13:18:10Z: „PR #58 merge." (მხოლოდ ამ PR-ზე) |
| Production deployment | **`dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ`**, target production, build 4 წთ შეცდომის გარეშე, READY 13:25:44Z |
| myavatar.ge | alias → `dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ` (ასევე www.myavatar.ge); `/api/health` → `"commit":"e46c35c"` |
| Rollback-ის წერტილი | `dpl_EhS6Jvgm7uKdrMudSsDTChvxuGmy` (ba2e0a4, 09:31Z-დან) — Vercel **Instant Rollback**, არასოდეს „Redeploy" |
| რა არ შეცვლილა | მიგრაცია 0, env ცვლადი 0, flag 0, ფასი 0, provider 0. Image Studio PR #60 და BOG PR #62 არ შეხებულა. ფასიანი Veo/Vertex არ გამოძახებულა. Production-ში შესვლა და ჩაწერა არ ყოფილა |

## 1. Merge-მდე შემოწმება

| შემოწმება | შედეგი |
| --- | --- |
| main-ის მდგომარეობა | main = `ba2e0a4` (PR #61, docs), უკვე შერწყმული იყო PR-ში (`179e10e`), კონფლიქტი არ ყოფილა |
| CI ბოლო commit-ზე `aa0de1f` | verify [38400469574](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38400469574) ✅ · Video Core E2E 35/35 + billing რეალურ Postgres-ზე [38400469679](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38400469679) ✅ · Preview Contract [38400469434](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38400469434) ✅ |
| Vercel Preview E2E (კოდის თავი `f1e3358`) | 35/35 [38394841616](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394841616) ✅ |
| Review-ს ღია თემები | 0 |
| PR-ის შემადგენლობა | 217 ფაილი; `supabase/migrations`-ში 0 ფაილი; `lib/billing`, BOG, checkout, middleware და auth ფაილები არ შეცვლილა (Video-ს საკუთარი ჩამოჭრის წესი შეიცვალა და billing E2E-ით რეალურ Postgres-ზე შემოწმდა) |
| Production-ის საწყისი შეცდომები (12:20–13:20Z) | მხოლოდ `/api/app/worker/tick` 500 (30/სთ, ყოველ 2 წთ-ში; Upstash host `ENOTFOUND` + `service_jobs` ცხრილი არ არსებობს — 2026-09-25-დან, ამ PR-მდე) |

## 2. Merge-ის შემდეგ შემოწმებები (Production, read-only, ანონიმური)

ყველა მოთხოვნა ანონიმურია: შესვლა და cookie არ ყოფილა, Production-ში არაფერი ჩაწერილა, არაფერი ნაყიდია და
არაფერი დაგენერირებულა. სტატუსები დადასტურებულია Vercel-ის request-ების სტატისტიკით.

| სფერო | შემოწმება | მოსალოდნელი | შედეგი |
| --- | --- | --- | --- |
| Deployment | `/api/health` | 200, commit e46c35c | ✅ 200 `"commit":"e46c35c"` |
| CI main-ზე | `e46c35c`: verify [38404146917](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38404146917), Preview Contract [38404146670](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38404146670) | მწვანე | ✅ ორივე success |
| გვერდები | `/ka`, `/en`, `/ru` | 200 | ✅ 200 / 200 / 200 |
| BOG Payments | smoke [38404904224](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38404904224) (GitHub runner, 13:26:14Z) | 9/9 | ✅ **9/9**: capabilities `{"stripe":true,"bog":false}` (BOG admin-only რჩება), checkout 401, ხელმოუწერელი callback 401, order 401, admin 403, cron 403 |
| BOG cron | `/api/cron/bog-billing` (ყოველ 10 წთ-ში) | 200 | ✅ 200 (13:30Z; BOG-ის კოდი ამ PR-ს არ შეუცვლია) |
| Credits | `GET /api/credits/balance` | 401 | ✅ 401 |
| Auth | `/api/auth/whoami` | 200, მომხმარებელი არ არის | ✅ 200 `hasUser:false` |
| Auth | `/ka/auth` → შესვლის ფანჯარა სტუდიაში | 200 | ✅ 200 (`/ka/dashboard?auth=login`) |
| Video API | `GET /api/agent/media/montage`, `/edit` | 200 `{"enabled":false}` ანონიმურისთვის | ✅ ორივე `{"enabled":false}` |
| Video API | `GET /api/tasks?id=…` | 401 | ✅ 401 |
| Job Recovery | `/api/agent/media/sweep` საიდუმლოს გარეშე | 403 | ✅ 403 |
| Job Recovery | Vercel Cron → sweep, ყოველ წუთში | 200, შეცდომის გარეშე | ✅ 200 ყოველ წუთში: 13:26–13:38Z 13 გაშვება, 13 × 200, შეცდომა 0 |
| სხვა cron-ები (PR-მა `fetchCache` დაუმატა) | studio-sweep, research-sweep, deliveries, drain-renders | 200 | ✅ studio-sweep 13/13, research-sweep 13/13, deliveries 13/13, drain-renders 1/1 (13:30Z) — ყველა 200 |

## 3. Feature Flags (Vercel Production env)

მნიშვნელობები არ წამიკითხავს, გარდა `BOG_CHECKOUT_MODE`-ისა (plain). env-ში ბოლო ცვლილება 06:23Z-ზეა (BOG-ის წყვილი),
ანუ deploy-ს დროს არაფერი შეცვლილა (Vercel connector-მა 112 ჩანაწერიდან 100 აჩვენა; დანარჩენი 12 ყველაზე ძველია, 2026-02-14-მდე
შექმნილი).

| Flag | მდგომარეობა |
| --- | --- |
| `BOG_CHECKOUT_MODE` | `admin` (Production) — runtime-შიც `bog:false` ანონიმურისთვის |
| `AGENT_G_MEDIA_EXEC` | უცვლელი (ბოლოს 11.10-ს შეიცვალა; sensitive-ია, მნიშვნელობას ვერ ვკითხულობ, ჩანაწერებით `admin`) — runtime: ანონიმურისთვის `enabled:false` |
| `VIDEO_DIRECTOR_RUNS`, `GEMINI_TRANSPORT`, `VEO_TRANSPORT` | მხოლოდ Preview-ზე |
| `MEDIA_GOOGLE_ONLY`, `BOG_SUBSCRIPTION_MODE` | არ არის დაყენებული |
| `CRON_SECRET` | არის (Preview + Production) |
| ახალი flag | არცერთი |

## 4. Runtime შეცდომები deploy-ის შემდეგ

| | deploy-მდე (12:20–13:20Z) | deploy-ის შემდეგ (13:26–13:41Z) |
| --- | --- | --- |
| 5xx პასუხები | მხოლოდ `/api/app/worker/tick` 500, ყოველ 2 წთ-ში | მხოლოდ `/api/app/worker/tick` 500, ყოველ 2 წთ-ში — იგივე |
| შეცდომების ჯგუფები | 2: Upstash `ENOTFOUND mature-gazelle-134029.upstash.io` და `public.service_jobs` არ არსებობს | იგივე 2, ახალი ჯგუფი **0** |
| Video / Credits / BOG / Auth route-ების 5xx | 0 | **0** |

ორივე ძველი შეცდომა 2026-09-25 / 2026-10-02-დან მოდის და ამ PR-ისგან დამოუკიდებელია (§6 #8). Rollback-ის ნიშანი არ ყოფილა.

## 5. დეფექტები 39 და 40

| # | რა იყო | სტატუსი |
| --- | --- | --- |
| **39** | admin-ის Trim / Volume / Adjust / Erase / Layer edit-ი worker-ზე უარყოფილი იყო („the stored plan is not valid"), რადგან JSONB გასაღებებს ალაგებს | **გასწორებული Production-ის კოდში** 13:25:44Z-დან (`c130532`, ახლა `e46c35c`-ში). დადასტურებულია CI E2E-ზე და Vercel Preview E2E-ზე (trim 90 კადრი, volume −16.6→−11.2 dB, brightness 117.1→131.1, desktop + iPhone 13). Production-ში ცოცხლად ჯერ არ გაშვებულა: ამისთვის admin-ის შესვლაა საჭირო, რასაც მე არ ვაკეთებ. დადასტურება = შენი ერთი უფასო Trim (§6 #1) |
| **40** | cron-ის GET route-ები DB-ს Next-ის Data Cache-იდან კითხულობდა, ამიტომ გაჩერებული job-ის მე-2 ცდა იღუპებოდა | **გასწორებული Production-ის კოდში** (`717231c`, `fetchCache = 'force-no-store'` ყველა cron-ზე, გარდა `cron/bog-billing`-ისა, რომელიც BOG-ის thread-ისაა). Production-ში sweep ყოველ წუთში 200-ით მუშაობს (13:26–13:38Z: 13 გაშვება, ყველა 200, შეცდომა 0). თავად აღდგენა მხოლოდ ნამდვილად გაჩერებულ job-ზე ჩანს; ის Vercel Preview-ზე დადასტურდა (sweep 200 137.8 წმ-ში, attempt 2, 600 კადრი, არაფერი ჩამოჭრილა). განზრახ არ გამოვიწვიე |

## 6. დარჩენილი სამუშაოები

| # | რა | ვისზეა |
| --- | --- | --- |
| 1 | ერთი admin Trim საკუთარ მონტაჟზე (`kintsurashviligaga@gmail.com`, უფასო) — დეფექტი 39-ის Production დადასტურება | შენ (სურვილისამებრ) |
| 2 | B1: Veo-ს მინიმალური ცოცხალი ტესტი (Vertex, L1 ≈ $0.40) | შენი ბიუჯეტის სიტყვა; საჯარო გახსნამდე |
| 3 | B3: `storyboard_revisions` Production მიგრაცია | შენი ცალკე სიტყვა; მის გარეშე ფუნქცია სახელით უარს ამბობს |
| 4 | R2: Upstash (ფასიანი) ან DB idempotency ცხრილი (მიგრაცია) | შენი გადაწყვეტილება საჯარო გახსნამდე |
| 5 | R3: refund-პოლიტიკა ფასიანი კლიპების ჩავარდნილ აწყობაზე | შენი გადაწყვეტილება |
| 6 | D1–D8, D12 და `HAWK_API_KEY` (R7) | შენი გადაწყვეტილებები |
| 7 | Video Core-ის საჯაროდ გახსნა | **NO-GO** სანამ B1 და R2 არ დაიხურება; `AGENT_G_MEDIA_EXEC` admin რჩება |
| 8 | `/api/app/worker/tick` 500 ყოველ 2 წთ-ში (Upstash host `mature-gazelle-134029` აღარ არსებობს + `service_jobs` ცხრილი Production-ში არ არის) | ძველი პრობლემა, ამ PR-ისგან დამოუკიდებელი; გადაწყვეტა R2-სა და სქემის ratchet-ზეა მიბმული |
| 9 | სატესტო Vercel პროექტი `avatar-g-video-core-e2e` | არაფერი სასწრაფო: placeholder-ებზეა და დაცულია; შეიძლება წაიშალოს ან დარჩეს შემდეგი Preview E2E-სთვის |
