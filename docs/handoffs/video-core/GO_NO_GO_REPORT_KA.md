# Video Core v1.0 — PR #58: საბოლოო Code Review და GO/NO-GO (2026-10-13)

> **განახლება 2026-10-13 13:25Z:** შენი სიტყვით (13:18:10Z) PR #58 merge-ულია (**e46c35c**) და Production-შია
> (`dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ`). შემოწმებები და დარჩენილი სამუშაოები: `PRODUCTION_DEPLOY_REPORT_KA.md`. ქვემოთ
> merge-მდე მდგომარეობაა; Rollback-ის წერტილი (§6) იგივეა: `dpl_EhS6Jvgm7uKdrMudSsDTChvxuGmy`.

**Branch** `claude/video-core-v1-6gh97e` · **Draft PR #58** → main (draft რჩება, merge არ ყოფილა) · კოდის head **f1e3358** (ამის შემდეგ მხოლოდ დოკუმენტები) ·
უახლესი main **ba2e0a4** (PR #61, BOG-ის დოკუმენტები; Production ემსახურება მას 09:31Z-დან, კოდი = 883a013) branch-შია
შერწყმული (179e10e; მანამდე 883a013 → 121c390), კონფლიქტის გარეშე.
შენი დავალებები: 2026-10-13 06:34Z (საბოლოო Code Review, იზოლირებული Preview E2E, GO/NO-GO, რისკები, Rollback), 08:52Z
(FINAL AUTONOMOUS COMPLETION DIRECTIVE) და 09:48Z (CI E2E + Preview E2E Desktop/Mobile დასრულება, ხარვეზების გასწორება
რეგრესიის ტესტებით, TS / ESLint / Jest / Build, GO/NO-GO მტკიცებულებებით).

## 1. ვერდიქტი

**Merge + Production deploy: GO — მხოლოდ შენი ცალკე სიტყვით** (სტატუსი: CONDITIONALLY READY — EXTERNAL GATES REMAIN).
**Video Core-ის საჯარო გახსნა ჩვეულებრივი მომხმარებლებისთვის: NO-GO**, სანამ B1 (Veo-ს ცოცხალი ტესტი) და R2 (დუბლიკატის
guard) არ გადაწყდება (§5, §8). „Production Ready"-ს არ ვაცხადებ.

რატომ GO merge-ისთვის:

- ყველა შემოწმება მწვანეა კოდის head **f1e3358**-ზე: CI E2E **35 / 35** და Vercel Preview E2E **35 / 35**, ორივე Desktop +
  iPhone 13 (§4); TypeScript, ESLint, Jest და Build (ცხრილი ქვემოთ).
- Production-ში ახლა ორი ცოცხალი დეფექტია: **39** (admin-ის Trim / Volume / Adjust / Erase / Layer edit-ები ვარდება) და
  **40** (გაჩერებულ media job-ს sweep ვერ ასრულებს). ორივე მხოლოდ ამ merge-ით სწორდება; ორივეში დღეს არაფერი ჩამოიჭრება.
- PR-ში მიგრაცია, env ცვლადი, flag ან ფასის ცვლილება არ არის: რაც დღეს Production-ში ღია ან დახურულია, ისევე დარჩება.
  დაბრუნება = Vercel **Instant Rollback**, ≈ 1 წთ (§6).
- Acceptance: 28-დან **19 PROVEN · 8 PARTIAL · 1 BLOCKED** (`FINAL_ACCEPTANCE_MATRIX.md`); PARTIAL / BLOCKED მხოლოდ იმას
  ეხება, რაც შენს გადაწყვეტილებას ან ფასიან ტესტს ელოდება.

| შემოწმება | შედეგი | სად / SHA |
| --- | --- | --- |
| TypeScript | **PASS**, 0 შეცდომა | CI verify [38394814005](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394814005) (f1e3358) და [38388562769](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388562769) (ec7f742); live spec-ები sandbox-ში f1e3358-ზე |
| ESLint | **PASS**, 0 შეცდომა, 34 warning (ახალი არცერთი) | sandbox 717231c-ზე; f1e3358-ის ერთადერთი შეცვლილი ფაილი (`tests/video-core-live/billing.spec.ts`) 0 შეცდომა |
| Jest | **PASS**: 894 / 900 suite, 13 814 PASS, 0 FAIL | CI verify 38388562769 (ec7f742); f1e3358 Jest-ის ფაილს არ ცვლის, CI verify კვლავ მწვანე |
| Build | **PASS**, 207 / 207 გვერდი | CI verify ორივე head-ზე; Vercel Preview build f1e3358 (READY) |
| CI E2E | **PASS 35 / 35** | [38394813999](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394813999) (f1e3358), [38388562682](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388562682) (ec7f742) |
| Vercel Preview E2E | **PASS 35 / 35** | [38394841616](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394841616) (f1e3358) |
| Billing რეალურ Postgres-ზე | **PASS** (40) | CI job „billing on real Postgres", ორივე CI E2E run-ში |

## 2. Code Review — რა შემოწმდა

| საკითხი | შედეგი | მტკიცებულება |
| --- | --- | --- |
| უახლეს main-თან თავსებადობა | **OK.** main ba2e0a4 შერწყმულია branch-ში (179e10e), კონფლიქტი არ იყო; PR #58 და PR #59 / #61-ს საერთო ფაილი არ აქვთ | `git merge-tree`; CI "verify" ყოველ push-ზე ტესტავს შერწყმულ ხეს |
| ყველა შეცვლილი ფაილი | **OK** 215 ფაილი main-თან შედარებით წაკითხულია; 7 ხარვეზი იპოვა და გასწორდა (§3) | `git diff 883a013..HEAD` |
| დეფექტი 39 | **გასწორებულია** (c130532): JSONB-დან წაკითხული edit-გეგმა key-ების რიგის მიუხედავად მოწმდება, შეცვლილი მნიშვნელობა ისევ უარყოფილია. Production-ში (883a013) **ჯერ კიდევ ცოცხალია** admin-ებისთვის და მხოლოდ merge-ით გასწორდება | unit (ძველ კოდზე წითელი) · რეალური Postgres (trim / volume / adjust) · CI E2E და Preview E2E-ში Trim / Volume / Adjust ორივე viewport-ზე (§4) |
| დეფექტი 40 (Job Recovery) | **გასწორებულია** (717231c), E2E-მ იპოვა: Next 14 GET-only route-ის `fetch`-ებს Data Cache-ში ინახავს (`force-dynamic` და `req.headers`-ის კითხვა ამას არ აჩერებს), ამიტომ sweep-ის heartbeat ხედავდა სტრიქონს claim-მდე, თვლიდა რომ „დაკარგა" და გაჩერებული მონტაჟი attempt 2-ზე კვდებოდა. ახლა sweep და ყველა cron route ცოცხლად კითხულობს (`fetchCache = 'force-no-store'`). **Production-ს ეხება** (883a013 / ba2e0a4-ში იგივე კოდია; დასკვნა კოდიდან და probe-იდან, Production არ წამიკითხავს): media sweep (ყოველ წუთს), cron/deliveries (ყოველ წუთს), cron/optimize-agents (დღეში ერთხელ). მხოლოდ merge-ით გასწორდება | `lib/api/cronFetchCache.test.ts` (ფიქსის გარეშე 9-დან 8 წითელი) · `leaseIsolation.pg.test` · ცოცხალი `recovery.spec`: CI E2E 38386271150 — 47.3 წმ, attempt 2, **600 კადრი**, 0 ჩამოჭრა; ფიქსამდე 10.4 წთ და ჩავარდნა; Vercel Preview run 5 და run 6 — sweep, როგორც Vercel function, იგივე შედეგით |
| Billing | **OK** ორი გამოსწორების შემდეგ (§3, #1–#2). `lib/billing`, `lib/credits`, `supabase/migrations`: main-თან შედარებით 0 ცვლილება; ფასები არ შეცვლილა; ფილმის აწყობა: ჯერ უფასო ფილმი, მერე ერთი ჩამოჭრა, ჩავარდნილი აწყობა 0-ზე გადის, ორი ერთდროული დაჭერა თითო მიწოდებულ ფილმზე ერთხელ იხდის | `tests/video-core-live/billing.spec.ts` (რეალური Supabase, რეალური ffmpeg) · billing რეალურ Postgres-ზე 40 PASS |
| Security | **OK** სამი გამოსწორების შემდეგ (§3, #3–#5) | unit + CI E2E |
| Image Studio (PR #60, `codex/image-studio-v1` 9cb14a7) | **კონფლიქტი არ არის.** საერთო ფაილი 2-ია (`components/studio/OmniStudio.tsx`, `lib/orchestrator/storage-adapter.ts`), ტექსტური merge სუფთაა; სამმხრივად შერწყმულ ხეზე tsc 0 შეცდომა და studio / orchestrator / video / agent media / image ტესტები: 223 suite, 3 360 PASS, 0 fail. Image Studio-ს branch-ს არ შევხებივარ | `git merge-tree`; ლოკალური worktree (5fa8f30) |

## 3. რა იპოვა review-მ და როგორ გასწორდა

| # | სფერო | რა იყო | გამოსწორება | რეგრესიის ტესტი |
| --- | --- | --- | --- | --- |
| 1 | Billing | ფილმის აწყობისას ერთი კლიპი რომ ჩამოვარდნილიყო (salvage), საბოლოო სიგრძის კონტრაქტი მაინც დაგეგმილ სიგრძეს ამოწმებდა და მოკლე, მაგრამ სწორ ფილმს უარყოფდა | salvaged cut კონტრაქტით აღარ მოწმდება, პასუხი ამბობს რამდენი კლიპი ჩამოვარდა (9810f7a) | `assembleQcGate.test` |
| 2 | Billing | ერთკლიპიანი ფილმის საბოლოო ჩავარდნისას უფასო ფილმი არ ბრუნდებოდა; უარის/ჩავარდნის ტექსტი არ ამბობდა, რა ჩამოიჭრა და რა არა | უფასო ფილმი ბრუნდება; ტექსტი ამბობს რა ჩამოიჭრა (9810f7a) | `assembleQcGate.test`, `billing.spec` |
| 3 | Security | ffmpeg-ს `concat:`, `subfile:`, `data:`, `file:` და მსგავსი protocol-ები შეიძლებოდა მიეღო მომხმარებლის მისამართიდან | assemble მხოლოდ https-ს იღებს (`invalid_media_url` ნებისმიერ სამუშაომდე), `ffmpegExec` ყველა input-ში უარყოფს ამ protocol-ებს (9810f7a) | `ffmpegExec.test`, assemble route ტესტები |
| 4 | Security | `/api/video/assemble` კლიპების მისამართებს HEAD-ით ამოწმებდა **მანამ**, სანამ ნახავდა ვინ იძახებს: anonymous მომხმარებელსაც შეეძლო სერვერისთვის 24-მდე სასურველ host-ზე მოთხოვნა გააგზავნინებინა | sign-in შემოწმება ახლა ამ probe-მდეა (04a512a) | `videoCoreWiring.test` |
| 5 | Security | იგივე probe ჩვეულებრივ `fetch`-ით მიდიოდა: შესულ მომხმარებელს შეეძლო სერვერს private/local მისამართზე (მაგ. metadata service) ან redirect-ით იქ შეეხედა | probe ახლა `lib/web/publicFetch`-ით მიდის (იგივე guard, რაც ffmpeg-ის download-ს აქვს): private host-ს საერთოდ არ ეხება, ყოველ redirect-ს თავიდან ამოწმებს (003b672) | `lib/pipeline/qaAgent.test.ts` (4) |
| 6 | Intent / სიგრძე | „მუსიკალური კლიპი საგანზე" მონტაჟად ითვლებოდა; რთული რიცხვები სიტყვით (ოცდახუთი, twenty five, двадцать пять), „9:16" საათად; „სიმღერის 30-ე წამიდან" ვიდეოს დაყოვნებად | intent, სიგრძის სიტყვები, track offset (9810f7a, C/D/H) | intent / durationWords / montageAsk ტესტები |
| 7 | სიგრძის კონტრაქტი / UI | native ბადე კადრამდე დამრგვალებულ სიგრძეზე არ ითვლებოდა (8.01 წმ → 16 წმ); ფილმის ჩავარდნის toast ინგლისურად | კადრზე დამრგვალება; ka/en/ru ტექსტი სერვერის მიზეზით (9810f7a, G/F) | durationContract / opFailure ტესტები |

## 4. E2E — ოთხი ფენა ცალ-ცალკე

| ფენა | სტატუსი | რას ეყრდნობა |
| --- | --- | --- |
| **CI E2E** (იზოლირებული Supabase GitHub Actions-ში, `next start`, რეალური ffmpeg) | **PROVEN** — ec7f742-ზე 35 / 35, Desktop + iPhone 13 | [run 38388562682](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388562682) (16.5 წთ): ბილინგი (უფასო ფილმი, ერთი ჩამოჭრა, ჩავარდნილის refund, ორი ერთდროული დაჭერა), RLS / RPC / წვდომა / bucket-ები, **Job Recovery** (attempt 2, 600 კადრი, 0 ჩამოჭრა), Storyboard-ის დამტკიცება, მონტაჟის სრული გზა, Stop / Retry, Trim / Volume / Adjust / 2× / slow motion, მუსიკა მითითებული წამიდან (RU / KA); იმავე run-ში „billing on real Postgres" PASS; CI verify (typecheck, Jest, build) PASS |
| **Preview E2E** (Vercel Runtime, იზოლირებული Supabase, Production-ის გარეშე) | **PROVEN** — f1e3358-ზე 35 / 35, Desktop + iPhone 13 | [run 6, 38394841616](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394841616) (24.5 წთ): იგივე ტესტები Vercel Preview-ზე ცალკე პროექტში; Desktop-ისა და iPhone 13-ის ყველა ტესტი, **Job Recovery** (sweep, როგორც Vercel function, 137.8 წმ-ში: attempt 2, 600 კადრი, 0 ჩამოჭრა), ბილინგი, RLS / RPC / წვდომა, არცერთი გაწყვეტილი კავშირი (`cuts: []`). Run 5 (ec7f742, იგივე პროდუქტის კოდი): 34 / 35, ერთადერთი ჩავარდნა ტესტის კლიენტის გაწყვეტა (დეფექტი 42, §4 მიგნება 2) |
| **Vertex / Veo Live** | **NOT RUN** | ფასიანი ტესტი ნებადართული არ არის (B1) |
| **Production E2E** | **NOT RUN** | Production სატესტო გარემო არ არის; merge / deploy არ ყოფილა |

### Preview E2E როგორ იყო იზოლირებული

| ფენა | რა არის | რა აშორებს Production-ს |
| --- | --- | --- |
| ბაზა | Supabase CLI-ის stack GitHub runner-ზე, ამ run-ისთვის შექმნილი JWT საიდუმლოთი (ანუ ახალი anon/service გასაღებები, runner-თან ერთად კვდება); მხოლოდ სინთეტიკური მომხმარებლები და მედია | `guard.ts` ნებისმიერ სხვა ბაზის host-ს უარყოფს; job უარყოფს CLI-ის ცნობილი default საიდუმლოთი ხელმოწერილ გასაღებებს |
| კავშირი | Cloudflare quick tunnel (ანგარიშის გარეშე) → `key-gate.mjs`, რომელიც მხოლოდ ამ run-ის ორ გასაღებს და stack-ის მიერ ხელმოწერილ storage URL-ებს უშვებს | დანარჩენი 403; tunnel და gate runner-თან ერთად ჩერდება |
| აპლიკაცია | Vercel **Preview** ცალკე პროექტში `avatar-g-video-core-e2e` | Preview გარემოში მხოლოდ 9 მნიშვნელობაა (6 ამ run-ის: tunnel ×2, stack-ის ორი გასაღები, quote და cron საიდუმლო; 3 მუდმივი flag); Production ცვლადი 0; Production Supabase-ის, AI-ის, გადახდის, Google-ის ან BOG-ის გასაღები არ აქვს. Custom domain არ აქვს (myavatar.ge მთავარ პროექტზეა, 12:45Z შემოწმდა), production build-ს უარყოფს. ყოველი deployment `target: preview`-ით შემოწმდა |
| Handshake | runner მნიშვნელობებს შიფრავს (AES-256 + RSA-OAEP) და check run-ში დებს; გასაშიფრი გასაღები მხოლოდ ჩემთანაა; ბოლოს ტექსტი `consumed`-ით იცვლება | მნიშვნელობა არც ლოგში, არც commit-ში, არც ჩატში არ ჩანს |
| ტესტამდე დამტკიცება | `preview-check.mjs` (fail-closed): alias Vercel-ზეა; browser-ის კოდი ამ run-ის tunnel-ს ასახელებს და Production-ის project ref-ს არასოდეს; `/api/credits/balance` token-ის გარეშე 401, ამ stack-ის token-ით 200 | ერთიც რომ ჩავარდეს, ტესტი არ ეშვება (run 5-სა და 6-ში PASS) |

### Trim, Volume, Adjust, Stop/Retry, Credits — Desktop და Mobile

| ფუნქცია | CI E2E (Desktop / iPhone 13) | Vercel Preview (Desktop / iPhone 13) | რა გაიზომა |
| --- | --- | --- | --- |
| **Trim** 1 → 4 წმ („Trim the previous video from 1 to 4 seconds." / „წინა ვიდეო 1-დან 4 წამამდე მოჭერი") | PASS / PASS | PASS / PASS | **90 კადრი**, 3.00 წმ, ხმით |
| **Volume** („louder" / „წინა ვიდეოს ხმა აუწიე") | PASS / PASS | PASS / PASS | +6 dB; გაზომილი საშუალო ხმა **−16.6 → −11.2 dB**; 150 კადრი |
| **Adjust** („brighter" / „წინა ვიდეო გაანათე") | PASS / PASS | PASS / PASS | brightness 25; გაზომილი სიკაშკაშე **117.1 → 131.1**; 150 კადრი |
| 2× / slow motion | PASS / PASS | PASS / PASS | **75** / **300** კადრი |
| **Stop / Retry** | PASS / PASS | PASS / PASS | Stop → „cancelled by the user", არაფერი ჩამოიჭრა → Retry → ახალი quote → **600 კადრი**, 20.00 წმ |
| **Credits** (მონტაჟი, edit-ები, Stop/Retry, მუსიკა 0:10-დან) | PASS / PASS | PASS / PASS | ყველა ტესტზე ბალანსი 50 → 50, ledger-ში მხოლოდ საწყისი 50 (ეს lane-ები უფასოა) |
| **Billing** (ფილმის აწყობა, API) | PASS | PASS | ჯერ უფასო ფილმი (ჩამოჭრა 0); შემდეგ ზუსტად ერთი −25; ჩავარდნილი აწყობა −25 და +25 (ჯამი 0); ორი ერთდროული დაჭერა: ორი ფილმი, თითო ერთხელ (75 → 25) |
| **RLS / RPC / წვდომა** | PASS | PASS | სხვისი სტრიქონი 0, client-ის ჩაწერა 403; money RPC anon 401 / user 403, `debitOnce` ერთხელ; სხვა მომხმარებელს 0 job, 404, storage 400, 403 `media_not_yours` |
| **Job Recovery** | PASS (40.8 წმ) | PASS (2.4 წთ) | გაჩერებული რენდერი sweep-მა attempt 2-ით დაასრულა: **600 კადრი**, არაფერი ჩამოიჭრა; sweep საიდუმლოს გარეშე 403 |

CI E2E: [run 38388562682](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388562682) (ec7f742) და [run 38394813999](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394813999) (f1e3358), ორივე 35 / 35.
Vercel Preview: [run 6, 38394841616](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38394841616) (f1e3358, 35 / 35); [run 5, 38388633377](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388633377) (ec7f742, 34 / 35, მიგნება 2).

### Preview გაშვებების მიგნებები

1. **დეფექტი 40 (Job Recovery) Preview-მ იპოვა** (run 3), გასწორდა 717231c-ში და run 5-მა და run 6-მა Vercel-ზევე დაადასტურეს: sweep-მა,
   როგორც Vercel function-მა, გაჩერებული რენდერი attempt 2-ით დაასრულა (600 კადრი, 0 ჩამოჭრა).
2. **38 წამზე გაწყვეტილი კავშირი ტესტის კლიენტის ბრალი იყო, არა აპლიკაციის** (დეფექტი 42, ტესტის harness). Playwright-ის HTTP
   კლიენტი TCP keepalive-ს ყოველ წამს აგზავნის და 10 უპასუხო probe-ის შემდეგ კავშირს თავად წყვეტს; runner → Vercel გზაზე ეს
   სამივე გაშვებაში 37.9–38.2 წამზე მოხდა. სერვერმა ფილმი ყოველთვის მიაწოდა და ფული სწორად დაითვალა; Node-ის კლიენტმა იმავე
   route-ზე 30–71 წამიანი პასუხები მიიღო, ბრაუზერის ყველა ტესტი გავიდა. გასწორება (f1e3358): ფილმის აწყობა ტესტში Node-ის
   კლიენტით მიდის; შემოწმება, რომ არცერთი გრძელი გამოძახება არ გაწყდა, დარჩა. Run 6-მა (f1e3358) დაადასტურა: უფასო ფილმმა Node-ის კლიენტით 51.0 წამში მიიღო 200, `cuts: []`, 35 / 35.
3. **Desktop Stop/Retry Preview-ზე** run 3-ში ერთხელ ჩავარდა (quote 90 წამში არ მოვიდა, არაფერი ჩამოიჭრა); run 2-ში, run 5-სა და run 6-ში
   გავიდა, ტელეფონზე ყოველთვის. ერთჯერადი შემთხვევის მიზეზი დადგენილი არ არის; აღარ განმეორებულა.
4. **ორი გარემოს ხარვეზი გასწორდა:** Supabase CLI-ის ინსტალაციამ GitHub-ის ანონიმური limit ამოწურა (დეფექტი 41, ec7f742 —
   ახლა job-ის საკუთარი token-ით); Vercel connector-ს გუნდი დაეკარგა და alias ვერ დაინიშნა — შენ 11:35Z-ზე თავიდან
   დააკავშირე და გუნდი აირჩიე.

## 5. დარჩენილი რისკები

| # | რისკი | გავლენა | ალბათობა | რა ამცირებს | ვისია |
| --- | --- | --- | --- | --- | --- |
| R1 | Veo/Vertex ცოცხლად არ გაშვებულა (B1) | ნამდვილი Veo კლიპებით ფილმის სიგრძე/სცენები ცოცხლად დაუმტკიცებელია | დაბალი-საშუალო: PR #58 Veo-ს მოთხოვნის კოდს (`lib/veo`, `/api/video/generate`) **არ ცვლის**; იცვლება მხოლოდ რამდენი სცენა/წამი ითხოვება და აწყობა | V1–V6 unit ტესტები; აწყობა რეალურ ffmpeg-ზე; ჩავარდნილი ფილმი ბრუნდება (ერთხელ) | GG: L1 ≈ $0.40 (`VERTEX_LIVE_TEST_PLAN.md` §3) |
| R2 | Production-ში Upstash/KV არ არის (env-ის **სახელებით** შემოწმდა): 60 წმ-იანი დუბლიკატის guard ღიაა, rate limiter თითო instance-ზეა | ორჯერ დაჭერილმა „Start"-მა შეიძლება ორი ფილმი ააწყოს და ორივე გადაიხადოს (თითოეული ერთხელ, ჩავარდნილი ბრუნდება) | დაბალი | UI ღილაკს ბლოკავს; ეს **main-ზეც ასეა**, PR #58-მა არ გააუარესა | GG: Upstash (ფასიანი infra) ან DB idempotency ცხრილი (მიგრაცია) |
| R3 | ფასიან კლიპებზე აწყობის საბოლოო ჩავარდნა | კლიპების საფასური რჩება, აწყობის Retry უფასოა | დაბალი | ტექსტი ამბობს, რა ჩამოიჭრა | GG: refund-პოლიტიკა |
| R4 | Storyboard-ის დამტკიცება სავალდებულო არ არის (D8) | director run დამტკიცების გარეშეც მიიღება | დაბალი (Production-ში director run-ები გამორთულია) | დამტკიცებით გაშვებული run მოწმდება (`revision_mismatch`) | GG: D8 |
| R5 | Image Studio (PR #60) იგივე 2 ფაილს ცვლის | merge-ის რიგზეა დამოკიდებული, კონფლიქტი დღეს არ არის | დაბალი | შერწყმულ ხეზე tsc + ტესტები გადის (§2) | ვინც მეორედ merge-ავს, ხელახლა გაუშვებს CI-ს |
| R6 | დეფექტები 39 და 40 Production-ში merge-მდე | 39: admin-ის Trim / Volume / Adjust / Erase / Layer edit ვარდება; 40: sweep-ის მიერ განახლებული გაჩერებული media job პირველ heartbeat-ზე კვდება, cron/deliveries შეიძლება პირველი გამოძახების რიგს ხედავდეს. ორივეში არაფერი ჩამოიჭრება (lane უფასოა) | უკვე ხდება | — | merge (GG) |
| R7 | HawkScan (DAST) არ გაშვებულა (B7) | changed route-ების დინამიკური სკანი არ არის | — | unit + E2E security შემოწმებები | GG: `HAWK_API_KEY` |
| R8 | B3 (`storyboard_revisions`), B4 (240 წმ+), B5 (29+ ფაილი), B6 (remix-ის provider-ები) | ფუნქციები სახელით უარყოფილია ან გამორთულია | — | ჩუმი შეკვეცა არსად | GG |

## 6. Rollback Plan

**ახლა (merge-მდე) დასაბრუნებელი არაფერია:** PR #58 merge-ული არ არის; Production ემსახურება ba2e0a4-ს
(`dpl_EhS6Jvgm7uKdrMudSsDTChvxuGmy`, 09:31Z-დან; კოდი = 883a013).

**PR #58-ში მიგრაცია, env ცვლადი, flag ან ფასი არ არის**, ამიტომ დაბრუნება მხოლოდ კოდისაა. Merge = Production deploy
(Vercel main-იდან თავად აშენებს).

| ნაბიჯი | რა | ვინ |
| --- | --- | --- |
| 1. Merge-მდე | ჩაიწერება მაშინდელი Production deployment-ის id (დღეს `dpl_EhS6Jvgm7uKdrMudSsDTChvxuGmy`, ba2e0a4) — ეს არის დაბრუნების წერტილი | Claude |
| 2. Deploy-ის შემდეგ | read-only smoke GitHub runner-იდან (`/en`, `/en/studio` 200, video capabilities, BOG-ის read-only smoke, რომ BOG არ დაზიანდა); admin-ის ერთი უფასო Trim საკუთარ მონტაჟზე (დეფექტი 39 გასწორდა თუ არა) | Claude (smoke) · შენ (admin Trim, kintsurashviligaga@gmail.com) |
| 3. დაბრუნების ნიშნები | `/api/video/*`, `/api/agent-g/*`, `/api/credits/*` 5xx-ის ზრდა; ledger-ში ჩამოჭრა მიწოდებული ფილმის გარეშე ან refund-ის გარეშე ჩავარდნა; ფილმის აწყობის ჩავარდნები ჩვეულებრივზე მეტი; BOG smoke წითელი | Claude ამოწმებს, შენ წყვეტ |
| 4. დაბრუნება (≈ 1 წთ) | Vercel → Deployments → ნაბიჯ 1-ის deployment → **Instant Rollback** (ძველ build-ს აბრუნებს, არაფერს აშენებს). **არა "Redeploy"**: Redeploy მიმდინარე commit-ს ააშენებს თავიდან (2026-10-13-ის გაკვეთილი) | შენ (ან Claude შენი სიტყვით) |
| 5. მუდმივი დაბრუნება | `git revert -m 1 <merge-commit>` ცალკე PR-ით, CI-ით, შენი სიტყვით | Claude |
| 6. მონაცემები | DB-ს დაბრუნება არ სჭირდება: ცხრილები, RPC-ები და ledger-ის ref-ები (`assemble:`, `assemble-rollback:`) იგივეა; ძველი კოდი ახლის დაწერილ სტრიქონებს კითხულობს. დაბრუნებამდე read-only შემოწმდება გაშვებული job-ები; ძველ კოდზე შენახული edit-job შეიძლება დეფექტი 39-ით ჩავარდეს (უფასოა, არაფერი იჭრება) | Claude (read-only) |
| 7. რა ბრუნდება დაბრუნებისას | დეფექტი 39 (admin-ის Trim / Volume / Adjust / Erase / Layer), დეფექტი 40 (cron-ის cached კითხვა); review-ს უსაფრთხოების გამოსწორებები (§3 #3–#5) | — |

**სატესტო Vercel პროექტი** (`avatar-g-video-core-e2e`): custom domain არ აქვს, Production build-ს უარყოფს, Production-ის
გასაღები არასოდეს ჰქონია. ყოველი გაშვების შემდეგ env placeholder-ებზე ბრუნდება, Vercel Authentication ირთვება, label
იხსნება, ბაზა და tunnel კი runner-თან ერთად ქრება, ამიტომ Preview-ის ბმული ვეღარაფერს აღწევს. გაჩერება (pause) Vercel-მა
არ დაუშვა (`400 Active production deployment does not exist`: მისი ერთადერთი production deployment სტატიკური გვერდია).
ნებისმიერ დროს შეიძლება წაიშალოს, myavatar.ge-ზე გავლენის გარეშე (myavatar.ge მთავარი პროექტის Production deployment-ზეა,
12:45Z შემოწმდა).

## 7. რა არ გაკეთებულა (შენი აკრძალვით)

Merge არ ყოფილა; Production Deploy არ ყოფილა; B3 Production მიგრაცია არ ყოფილა; ფასიანი Veo/Vertex გამოძახება არ ყოფილა;
Production Supabase, Auth, Storage, Credentials ტესტებში არ გამოყენებულა; GitHub Secret არ დამატებულა; force-push არ ყოფილა;
PR #59 (BOG) და Image Studio-ს branch-ს არ შევხებივარ; mock ცოცხალ შემოწმებად არ გამოცხადებულა.

**ერთი შემთხვევა, გულწრფელად:** 07:31Z-ზე სატესტო Vercel პროექტში პირველი საცდელი deploy (ბაზის გარეშე) Vercel-მა
**production** target-ად შექმნა (ახალი პროექტის პირველი deployment ასეა), და მის alias-ებში `myavatar.ge` ეწერა
(`vercel.json`-იდან). 8 წამში გავაუქმე, build-მდე (INITIALIZING); myavatar.ge 883a013-ზე დარჩა (შემოწმდა). ამის შემდეგ
პროექტი production build-ს უარყოფს და custom domain-ს თავად არ იღებს; შენი ნებართვით (07:49Z) იქ ერთი სტატიკური გვერდი
დაიდო production-ად, რომ შემდეგი deploy-ები preview იყოს.

## 8. რა რჩება შენზე

| # | რა | შენი ქმედება |
| --- | --- | --- |
| 1 | **Merge + Production deploy** (GO-ს შემთხვევაში) | ცალკე სიტყვა: „PR #58 merge". შემდეგ Claude: PR-ს draft-იდან ამოიყვანს, main-ს თავიდან შეამოწმებს, ჩაიწერს დაბრუნების წერტილს (§6), merge-ავს, deploy-ს და smoke-ს დააკვირდება |
| 2 | Merge-ის შემდეგ ერთი admin Trim საკუთარ მონტაჟზე | `kintsurashviligaga@gmail.com`-ით, უფასოა; ადასტურებს, რომ დეფექტი 39 Production-ში გასწორდა; დეფექტი 40 Production-ში მხოლოდ ნამდვილად გაჩერებულ job-ზე გამოჩნდება, მას ტესტით არ ვიწვევთ |
| 3 | B1: Veo-ს მინიმალური ცოცხალი ტესტი (L1 ≈ $0.40) | სურვილისამებრ, Video Core-ის საჯაროდ გახსნამდე; merge-ს არ ბლოკავს |
| 4 | B3: `storyboard_revisions` Production მიგრაცია | ცალკე სიტყვა; merge-ს არ ბლოკავს (ფუნქცია მის გარეშე სახელით უარყოფილია) |
| 5 | R2: Upstash (ფასიანი) ან DB idempotency ცხრილი (მიგრაცია) | გადაწყვეტილება საჯარო გახსნამდე |
| 6 | R3: refund-პოლიტიკა ფასიანი კლიპების ჩავარდნილ აწყობაზე | გადაწყვეტილება |
| 7 | D1–D7, D8, D12 (წინა ანგარიშიდან) და `HAWK_API_KEY` (R7) | გადაწყვეტილებები; merge-ს არ ბლოკავს |
| 8 | სატესტო Vercel პროექტი `avatar-g-video-core-e2e` | არაფერი: placeholder-ებზეა და დაცულია (pause Vercel-მა არ დაუშვა, §6); შეგიძლია წაშალო ან დატოვო შემდეგი Preview E2E-სთვის |
