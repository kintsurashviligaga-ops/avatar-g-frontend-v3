# Video Core v1.0 — ქართული ანგარიში, რაუნდი 2 (2026-10-12)

**Branch** `claude/video-core-v1-6gh97e` (main 30be5a2-დან) · **Draft PR #58** → main, არ არის merge-ული ·
**Vercel Preview არ აშენდა** (`vercel.json` ამ branch-ზე build-ს თიშავს; ყოველი push-ის შემდეგ 0 Vercel status: 4812b0a, 2923fa0,
71a6ec7, ამ დოკუმენტების commit-ი (PR #58-ის head, 71a6ec7-ის შემდეგ)) · **კოდის commit-ები რაუნდ 2-ში** 4812b0a (QC-კარიბჭე), 2923fa0 (სტორიბორდის რევიზია/approval),
71a6ec7 (კონტრაქტების რეესტრი + single-clip `qc_rejected`), ამ დოკუმენტების commit-ი (PR #58-ის head, 71a6ec7-ის შემდეგ) (AC-06 ფიქსტურა, evidence, დოკუმენტები).
**შეზღუდვები დაცულია:** არც merge, არც deploy/ახალი Preview, არც Production migration (ცხრილი კვლავ SQL წინადადებაა), არც ფასიანი
Veo გამოძახება (ყველა provider mocked), არც provider/pricing/flag/secret-ის ცვლილება, არც force-push, Image Studio-ს branch და
სხვა Studio-ები არ შეხებია. რაუნდი 1-ის ანგარიში (15/28) ამ ფაილის წინა ვერსიაშია (`git log -- docs/handoffs/video-core/report-ka.md`).

## 1. Production Readiness Verdict

**ვერდიქტი: NOT PRODUCTION READY (NO-GO) ვიდეო-ბირთვისთვის მთლიანობაში. კოდის დონეზე ბირთვი PROVEN T1 + T3-ია; T4–T6 ცარიელია.**

რა **დადასტურებულია** (რეალური ffmpeg, დეკოდირებული კადრები, რეალური saga):
- საბოლოო მასტერი, რომელიც კრიტიკულ QC-ს ვერ გადის (`frame_count_mismatch`, `silent_master`, `empty_master`), **არ ქვეყნდება**: assembler-ი
  აგდებს `MasterQaRejected`-ს hosting-ამდე, route-ის saga `dispatch`-ზე ვარდება, კომპენსაცია ერთხელ (`assemble-rollback:<sagaId>` idempotent refund),
  idempotency გასაღები თავისუფლდება, ფილმი FAILED-ად იწერება, პასუხი `502 qc_rejected` — არც 200, არც დარჩენილი დარიცხვა. გაზომილია: 890/891 → უარყოფა,
  არაფერი დაჰოსტდა; single-clip 149/150 → უარყოფა. განმეორებითი Start = ახალი saga, refund ერთხელ (`assembleQcGate.test` რეალურ `runSaga`-ზე).
- სტორიბორდის ყოველი ცვლილება ნომრიანი რევიზიაა; Generate ამტკიცებს **იმ** რევიზიას (fingerprint); სერვერი ბორდს ხელახლა თვლის და არაშესაბამის რენდერს
  `400 revision_mismatch`-ით უარყოფს დისპეტჩამდე და დარიცხვამდე. Database migration **არ გაშვებულა** — binding მოთხოვნაში, fingerprint-ში და job-ის metadata-შია.
- AC-06 ერთ ჯაჭვად: 5 კლიპი + მუსიკა 0:59-დან + 29.7 წმ + 9:16 + ქართული ტექსტი ბოლოში → **891 კადრი** მონტაჟის შემდეგაც და რედაქტირების შემდეგაც,
  720×1280, ხუთივე წყარო მასტერშია, მარკერი 0:59 პირველ კადრზე, ტექსტი ბოლო 3 წამში (დეტალები §3).
- 12 ვიდეო-lane-ის კონტრაქტი და 15 უარყოფის კოდი ერთ რეესტრშია (`lib/video/contracts.ts`), 45 ტესტით მიბმული რეალურ კატალოგზე, ხელსაწყოებზე,
  capability-ებზე, ფაილებზე და კოდის გამომცემ ფაილებზე.

რატომ **არა** Production Ready:
1. **T5 არ არის**: Veo/Vertex-ის არც ერთი რეალური გამოძახება (ბიუჯეტი არაავტორიზებული) — კლიპის რეალური სიგრძე vs კონტრაქტი, V1–V6 ცოცხალ მოდელზე გაუზომავია.
2. **T4 არ არის**: Preview-ზე არც ერთი ბრაუზერული შემოწმება (ბარათები, Retry, პროექტის გადართვა, reload, რევიზიის ნაკადი ეკრანზე) — ახალი Preview აკრძალულია, არსებულზე შენ არ გაგიშვებია.
3. **T6 არ არის**: Production-ზე არაფერი; PR #58 draft-ია.
4. სტორიბორდის რევიზიების ცხრილი მხოლოდ წინადადებაა (B3) — binding კოდის დონეზეა, DB-ში ისტორია არ იწერება; director-run გზა approval-ს ჯერ არ ატარებს.
5. AC-23-ის მონტაჟის ხარვეზები (კლიპების დამატება, მუსიკის in-place ჩანაცვლება, უხმო ექსპორტი, მუსიკის დაგვიანებული დაწყება, წყაროს ხმა ჩატიდან) **არ გაკეთებულა**:
   თითოეული ხელმოწერილი quote/manifest კონტრაქტის (PR #57) გაფართოებაა — Shared Contract-ის ცვლილება, შენი სიტყვის გარეშე არა.
6. Long-form (240 წმ) დახურულია სახელით (B1 + B4); 60 წმ-ის encode არ გაზომილა (დროის გამო; გზა იგივეა, რაც 29.7-ის).
7. შვიდი გადაწყვეტილება (D1–D7, §7) შენია; ორი მათგანი (D5 spelling, D6 legacy pad) ქცევის ცვლილებაა, რომელიც ჩუმად არ გავაკეთე.

რა გახდის მზად (თანმიმდევრობით): (a) შენი Preview-ზე A–D გაშვება არსებულ Preview-ზე ან ახალი Preview-ის ნებართვა (B2); (b) მინიმალური Veo ბიუჯეტი
ერთი 8 წმ და ერთი 29.7 წმ რენდერისთვის Vertex-ზე (B1); (c) B3 ცხრილის გადაწყვეტილება; (d) D1–D7; (e) merge-ის გადაწყვეტილება (B8). ამის გარეშე ვერდიქტი არ იცვლება.

## 2. შენი 7 პუნქტი — რა გაკეთდა

| # | შენი პუნქტი | შედეგი | Commit · ტესტი |
| --- | --- | --- | --- |
| 1 | `frame_count_mismatch` → Assemble Route-მა უარყოს, Settlement არა, Idempotency + Refund | **გაკეთდა, PROVEN T1 + T3.** სამი ფენა: assembler აგდებს hosting-ამდე; single-clip cut თავის კადრებს თვლის hosting-ამდე (`FinalCutRejected`); route `502 qc_rejected`, saga კომპენსაცია ერთხელ, idempotency გასაღების გათავისუფლება, FAILED ჩანაწერი. ყველა კრიტიკული კოდი ბლოკავს; დაუთვლელი კადრები = warn → მიწოდება „გადაუმოწმებლად“ (ნათქვამია). GPU/RunPod გზა QA-ს არ აბრუნებს — კონტრაქტიანი ფილმები CPU-ზეა. | 4812b0a, 71a6ec7 · `masterQa.test` +4, `assembleQcGate.test` (NEW), `ffmpeg-assembly.ffmpeg.test` e_withheld/f_single_cut_gate (T3) |
| 2 | Storyboard Revision Fingerprint/Approval კოდის დონეზე, migration-ის გარეშე | **გაკეთდა კოდის დონეზე (EXECUTABLE T1).** `renderScriptsFor` (სცენის ტექსტების ერთი წყარო), `inferOrigin`, `approvalForRender`, `validateRenderApproval` (board_changed / frames_differ / scripts_differ / scene_count / clip_sec / bad_fingerprint), `describeApprovalRefusal` (ka/en/ru); OmniStudio snapshot ყოველ ცვლილებაზე, approval tap-ზე; orchestrate route ამოწმებს დისპეტჩამდე. **PARTIAL**: director-run გზა approval-ს არ ატარებს; ცხრილი წინადადებაა. | 2923fa0 · `revision.test` 36/36, `orchestrate/storyboardApproval.test` 6/6, `videoCoreWiring.test` +4 |
| 3 | ვიდეო-ფუნქციების კონტრაქტების გაერთიანება + Video Studio Consolidation Plan, სხვა Studio-ების შეუცვლელად | **გაკეთდა.** `lib/video/contracts.ts`: 12 lane (film, single-clip, music-video, product-ad, longform, storyboard, montage, editing, remix, motion, swap, vfx) × {service/tool/capability id, routes, modules, სიგრძის კონტრაქტი, approval, QC, billing, უარყოფები, სტატუსი, tier}; `VIDEO_REFUSALS` 15 კოდი. `consolidation-plan.md`: დღევანდელი სურათი, სამიზნე (Create / Edit / Montage / Extend), სტადიები 0–5 (ფაილები, რას არ ეხება, done-when, rollback), D1–D7, acceptance. Image Studio და სხვა Studio-ები **არ შეცვლილა**; კანონიკური id-ები შენარჩუნებულია. რეესტრმა იპოვა: `/montage` ტაილის გვერდი ხეში არ არსებობს (UNVERIFIED T2), `#omni` Music-თან გაზიარებულია, `assemble_failed`/`assembly_failed` ორი spelling. | 71a6ec7 · `contracts.test` 45/45 |
| 4 | დარჩენილი უსაფრთხო Montage დეფექტები | **გაკეთდა, რაც Shared Contract-ს არ არღვევდა:** AC-06 ერთიანი ფიქსტურა (ადრე PARTIAL — „ერთ რენდერად არ გაშვებულა“) → PROVEN T3; #17 single-clip QC-მისი აღარ არის ზოგადი 500; რეგისტრის სტრიქონები 9, 11, 16 განახლდა, 17–18 დაემატა. **არ გავაკეთე ჩუმად** (აღწერილია ბლოკერად/გადაწყვეტილებად): legacy 30 წმ pad კონტრაქტის გარეშე ფილმებზე (D6), `assemble_failed` spelling (D5), single-clip 24 fps conform (D7), AC-23 მონტაჟის ხარვეზები (quote/manifest კონტრაქტი). | AC-06 commit ამ დოკუმენტების commit-ი (PR #58-ის head, 71a6ec7-ის შემდეგ) · `videoCoreAc06.ffmpeg.test` 1/1 (56 წმ) |
| 5 | Regression, FFmpeg Evidence, TypeScript, Lint | **გაშვებულია** — რეალური რიცხვები §4-ში. | — |
| 6 | AC-01…AC-28 მატრიცა ზუსტი სტატუსებით | **განახლდა**: PASS 16 · PASS + NOT RUN ქვეპუნქტი 3 · PARTIAL 8 · BLOCKED 1 (§5; სრულად `acceptance-matrix.md`). | — |
| 7 | GitHub Actions-ის საბოლოო სტატუსი + ბლოკერები | **შემოწმდა**: `verify` (ci.yml) და `preview-e2e` (e2e.yml) **success** 2923fa0-ზე (09:37Z / 09:28Z) და 71a6ec7-ზე (09:56Z / 09:51Z); ამ ბოლო commit-ზე (AC-06 ტესტი + დოკუმენტები) გაშვება წერის მომენტში მიმდინარეობს — შედეგი PR #58-ის Checks-ში და ჩატის პასუხში. Vercel status 0 ყველა head-ზე. ბლოკერები §6. | — |

## 3. გაზომვები (რეალური ffmpeg 7.0.2-static, დეკოდირებული კადრები; `evidence/README.md`)

| შემთხვევა | მოთხოვნილი | Native | საბოლოო | კადრები | მოლოდინი |
| --- | --- | --- | --- | --- | --- |
| ფილმი 4×8 წმ cuts | 29.7 | 32 | 29.7 | **891** (encode 90 წმ) | 891 |
| ფილმი 4×6 წმ cuts | 24 | 24 | 24 | **720** | 720 |
| იგივე კონტრაქტის გარეშე (legacy, D6) | — | 24 | 30 (გაყინული pad) | 720 @ 24 fps | — |
| ფილმი 4×8 წმ crossfade (29 წმ) | 29.7 | 29 | **უარყოფა** `longer_than_master` | 0 encode, 0 upload | — |
| **ფილმი, მასტერი 890 კადრით (QC-კარიბჭე)** | 29.7 | 32 | **უარყოფა** `MasterQaRejected` (`frame_count_mismatch`, F) | **არაფერი დაჰოსტდა** | 891 |
| ერთი კლიპი 6 წმ → 5 წმ | 5 | 6 | 5 | **150** | 150 |
| **ერთი კლიპი, დათვლა 149 (QC-კარიბჭე)** | 5 | 6 | **უარყოფა** `FinalCutRejected` | **არაფერი დაჰოსტდა** (უიძულებო cut: 150 დაჰოსტდა) | 150 |
| **AC-06 ჯაჭვი**: 5 კლიპი, მუსიკა 0:59-დან (130 წმ ტრეკი), 29.7 წმ, 9:16, ქართული ტექსტი ბოლო 3 წმ | 29.7 | — | 29.7 | **891** მონტაჟის შემდეგ, **891** ტექსტის შემდეგ; 720×1280; წყაროები 6.5/6/6/6/5.2 წმ (195/180/180/180/156 კადრი) | 891 |
| მონტაჟი 70 წმ, მუსიკა 0:58-დან (რაუნდი 1) | 70 | — | 70 | **2100** | 2100 |
| „მარტო ბოლო ხუთი“ 7-დან (რაუნდი 1) | 10 | — | 10 | 300; გამორიცხულები **0** | 300 |

AC-06-ის ხმა და ტექსტი: 0:59-ის მარკერი მასტერის პირველ 0.4 წმ-ში (−6.9 dB), სიჩუმე 0.42–0.46 (−91 dB), პირველი kick 0.5-ზე (−9.6 dB), ბოლო წამი −21.3 dB;
ტექსტი 26.4 წმ-ზე არ არის (სხვაობა 1.33), 29.4 წმ-ზე დახატულია (117.42) layer QC-ის ყუთში 98,938 524×86; მშობელი ფაილი უცვლელი (891).

## 4. შემოწმებები (საბოლოო tree, ამ დოკუმენტების commit-ი (PR #58-ის head, 71a6ec7-ის შემდეგ))

| შემოწმება | შედეგი |
| --- | --- |
| სრული jest (`npx jest`) | **881 suite გავლილი**, 5 გამოტოვებული (საკუთარი Postgres სჭირდება); **13,583 ტესტი გავლილი, 36 გამოტოვებული, 0 ჩავარდნილი**; 546 წმ (2026-10-12 09:56–10:05Z, sandbox). ერთი jest worker-ის force-exit გაფრთხილება (teardown leak) — არა ჩავარდნა, რაუნდ 1-შიც იყო |
| Video Core-ის unit suite-ები (masterQa, assembleQcGate, finalCut, revision, storyboardApproval, videoCoreWiring, contracts) | 181/181 |
| ფილმის evidence ტესტი (opt-in `VIDEO_CORE_FFMPEG_IT=1`) | **6/6**, 320 წმ (a_29_7, b_24, c_refusal, d_single_cut, e_withheld, f_single_cut_gate) |
| AC-06 ერთიანი ფიქსტურა (`videoCoreAc06.ffmpeg.test`) | **1/1**, 56 წმ |
| `tsc --noEmit` | 0 შეცდომა (exit 0) |
| `next lint` | 0 შეცდომა; 34 warning — ყველა წინა baseline-ისაა (react-hooks OmniStudio/StudioLibraryGrid, `<img>`, aria-description), ამ branch-ზე არც ერთი ახალი |
| GitHub Actions | `verify` + `preview-e2e` **success** 2923fa0-ზე და 71a6ec7-ზე; ამ ბოლო commit-ზე (AC-06 ტესტი + დოკუმენტები) გაშვება წერის მომენტში მიმდინარეობს — შედეგი PR #58-ის Checks-ში და ჩატის პასუხში |
| Vercel | 0 status ყველა push-ზე (Preview არ აშენებულა) |
| HawkScan | NOT RUN (`HAWK_API_KEY` არ არის sandbox-ში, გაშვებული აპი არ არის — B7) |
| T4 Preview / T5 Veo / T6 Production | NOT RUN (აკრძალული / არაავტორიზებული) |

## 5. AC-01…AC-28 (სრულად: `acceptance-matrix.md`)

PASS **16** (01, 02, 05, **06**, 07, 08, 09, 10, 11, 16, 17, 20, 21, 22, 25, 27) · PASS + NOT RUN ქვეპუნქტი **3** (03: 60 წმ encode; 04: ღია long-form;
**14**: ბრაუზერი და director-run გზა) · PARTIAL **8** (12, 13 ბრაუზერში, 15, 18, 19, 23, 26, 28) · BLOCKED **1** (24). რაუნდი 1 იყო 15 · 2 · 10 · 1.
გადაადგილდა: AC-06 → PASS (T3 ჯაჭვი), AC-14 → PASS კოდის დონეზე (სერვერული რევიზიის შემოწმება); AC-16 ფილმის saga-ს refund-once მტკიცებულება.
არ გადაადგილდა, რადგან შენია: 03/04 (B1, B4), 13/15/18/26 (B2 Preview), 23 (მონტაჟის კონტრაქტი), 24 (B5), 12 (სამსაფეხურიანი E2E deployed build-ზე).
Mocked provider-ის PASS რეალური provider-ის PASS-ად არსად არის ჩათვლილი.

## 6. ბლოკერები — რა გჭირდება შენგან (B1–B8 უცვლელი; `blockers-and-deferred.md`)

1. **B1 Veo/Vertex ბიუჯეტი** (T5): ერთი 8 წმ და ერთი 29.7 წმ რენდერი Vertex-ზე საკმარისია კონტრაქტის ცოცხალ მოდელზე შესამოწმებლად.
2. **B2 Preview-ზე შემოწმება** (T4): არსებულ Preview-ზე ან ახალი Preview-ის ნებართვით — ბარათები (AC-01/13/26), რევიზიის ნაკადი (AC-14 ეკრანზე), პროექტის გადართვა (AC-15), reload (AC-18).
3. **B3 Migration** `proposals/20261012a_storyboard_revisions.sql` — მხოლოდ შენი სიტყვით (Preview Production Supabase-ს იზიარებს); მის გარეშე binding კოდის დონეზე რჩება.
4. **B4 Long-form ჩამრთველი** (`LONGFORM_ORDER_WIRED`) + B1 → AC-04 ღია გზა.
5. **B5 29+ ფაილი**: სეგმენტური ingestion + 600 წმ-ზე გრძელი worker (ფასიანი infra).
6. **B6 remix/avatar provider პოლიტიკა** (`MEDIA_GOOGLE_ONLY`) — არ შეცვლილა.
7. **B7 HawkScan key** + გაშვებული აპი.
8. **B8 PR #58-ის merge/deploy** — შენი ცალკე სიტყვით; draft-ად რჩება.

## 7. გადაწყვეტილებები შენთვის (D1–D7; `consolidation-plan.md` §5) — არცერთი არ ბლოკავს ამ PR-ს

| # | კითხვა | ნაგულისხმევი, თუ არ მიპასუხებ |
| --- | --- | --- |
| D1 | ერთი შესასვლელის ფორმა: path თითო mode-ზე (`/video/create` …) თუ ერთი path mode query-ით | ერთი path mode query-ით |
| D2 | Remix ტაილი დატოვებს `#omni` hash-ს (Music-ს დარჩება) | კი, სტადია 1-ზე |
| D3 | სიგრძის მცვლელი remix ოპერაციები კადრზუსტი იყოს ფილმის მსგავსად | კი |
| D4 | remix ოჯახი დარიცხვამდე quote-ს აჩვენებდეს | კი |
| D5 | `assemble_failed` (500, single clip) და `assembly_failed` (502, saga) ერთ spelling-ად — wire ცვლილება | ორივე რჩება სტადია 1-მდე; `qc_rejected` უკვე ერთი სიტყვაა ორივე გზაზე |
| D6 | legacy 30 წმ pad კონტრაქტის გარეშე ფილმებზე: მოიხსნას (სერვერი კონტრაქტს stitch-ის სიგრძით ივსებს) თუ დარჩეს | რჩება სტადია 1-მდე — ყველა ხის კლიენტი კონტრაქტს აგზავნის, pad-ს მხოლოდ უცნობი კლიენტი მიიღებს |
| D7 | ერთი კლიპი, რომლის საბოლოო სიგრძე = native (8 წმ შეკვეთა 8 წმ კლიპზე), 24 fps-ზე რჩება (სიგრძე ზუსტი, ბადე არა); conform = კიდევ ერთი encode და დარიცხვა, რომელიც დღეს „no work, no charge“-ით არ ხდება | რჩება როგორც არის |

## 8. რისკიანი ცვლილებები, რომლებიც არ გავაკეთე ჩუმად

- Legacy pad-ის მოხსნა (D6) და spelling-ის გაერთიანება (D5): სერვერის პასუხის ცვლილება უცნობი კლიენტებისთვის.
- AC-23 მონტაჟის ხარვეზები: ხელმოწერილი quote/manifest კონტრაქტის გაფართოება (PR #57-ის Media Studio v2 lane „როგორც არის“).
- Single-clip 30 fps conform (D7): ახალი დარიცხვა უფასო შემთხვევაში.
- Director-run გზაზე approval-ის გატარება: `app/api/video/director` (Preview admin flag-ის უკან) — გადადებულია #10-ად, რომ ამ PR-ის საზღვრები არ გაფართოვდეს.

## 9. ფაილები

`docs/handoffs/video-core/`: `report-ka.md` (ეს), `consolidation-plan.md` (NEW), `acceptance-matrix.md`, `defect-register.md` (18 სტრიქონი), `capability-matrix.md`,
`contracts.md`, `blockers-and-deferred.md`, `storyboard-revisions.md`, `proposals/20261012a_storyboard_revisions.sql`, `evidence/` (README, `t3-film-frame-counts.json`
6 შემთხვევა, `t3-ac06-one-chain.json` NEW, მონტაჟის T3 JSON-ები). კოდი: `lib/video/contracts.ts` (NEW), `lib/video/finalCut.ts` (`FinalCutRejected`),
`lib/orchestrator/masterQa.ts` (`MasterQaRejected`), `lib/orchestrator/ffmpeg-assembly.ts`, `app/api/video/assemble/route.ts`, `lib/video/storyboard/revision.ts`,
`app/api/chat/orchestrate/route.ts`, `lib/chat/filmStudioClient.ts`, `components/studio/OmniStudio.tsx`. ტესტები: `assembleQcGate.test`, `contracts.test`,
`storyboardApproval.test`, `videoCoreAc06.ffmpeg.test` (NEW), +gate/approval შემთხვევები არსებულებში.
