# Image Studio v1.0 — საბოლოო საინჟინრო ანგარიში
2026-10-14, Asia/Tbilisi. **GO: საინჟინრო review; NO-GO: საჯარო/Production გაშვება.**

## შენარჩუნებული მდგომარეობა
Branch: `codex/image-studio-v1`; [Draft PR #60](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/60).
Worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`.
საინჟინრო commit: `ed9ebfda971a196e6acb6b60d8841d8bdb09dbfe`.
მშობლები: Image `5b43b26c6e3f11a14f42c749d89b45279479406c` და main `fef867a6ebad67a2a0a56a24e0b15c683a353d79`.
შემდგომი certification commit მხოლოდ ანგარიშებს/მტკიცებულებებს შეიცავს; მისი SHA და უახლესი CI PR-ის აღწერაშია.

main შემოვიდა მხოლოდ სამუშაო branch-ში. main-ზე PR merge, Production deploy/DB mutation და ფასიანი provider call არ შესრულებულა. არსებული commit-ები ორივე მშობლის ისტორიაში შენარჩუნებულია; reset/discard/force-push არ გამოყენებულა.
Recovery checkpoint: `ed0dd85339b710219ca62eccad2b14dcdc3a4293`; backup branch: `codex/image-studio-recovery-20261014` → `5b43b26c`.
ახალი backup:3768 regular ფაილი; SHA256 `22d9316abe139ce329d2ba23c3176da77f8e01e5ca45f63c6f18cc5be59a9ef1`. თავდაპირველი88ფაილის სამუშაო და109ფაილის recovery snapshot შენარჩუნებულია. `node_modules` ადგილობრივი symlink-ია და Git-ში არ შედის.

## განხორციელებული შესაძლებლობები / release notes
- One Window EN/KA/RU: prompt, references, quote, ცალკე confirmation, პროგრესი, cancel, refresh recovery, preview და Library.
- Generate/edit კონტრაქტები, owner-resolved references, character/outfit/product როლები, parent/child Versions და საწყისი სურათის უცვლელობა.
- ხელმოწერილი quote; idempotent confirm/debit; lease/CAS, late-output fencing და durable refund debt.
- Agent G ამზადებს quote-ს trusted draft-იდან; მოდელი ვერ ადასტურებს ხარჯს.
- private result paths და დროებითი signed URL-ები; ownership შემოწმება API, DB RLS და Storage ფენებში.
- limiter-ის module interval შეიცვალა request-time cleanup-ით; upload timer იწმინდება finally-ში; preview URL cleanup გასწორდა.
- Bounded CI, logs/artifacts, isolated DB, უფასო real-service checks და ცალკე თანხმობით gated paid harness.
- Capability რჩება `liveOperationVerified:false` / `operationVerifiedAt:null`; კატალოგი არ არის რეალური Google შედეგის მტკიცებულება.

## გამოსწორებული დეფექტები და Video Core თავსებადობა
1. PR58 QC fixture ძველ MemoryStore-ს კითხულობდა რეალური PostgREST queue-ის ნაცვლად. ზუსტად გადმოვიდა upstream fix `954e3859`: `leaseIsolation.pg.test.ts` და `testing/fakeMontageDeps.ts`. Port `84764dca`; stable patch ID `670f75e6b64ac963c7766835d5b3704d630c7d37`. Assertions არ შესუსტებულა.
2. Image Redis admission ძველ ცვლადებს ანიჭებდა უპირატესობას და არასრული წყვილების შერევა შეეძლო. `5b43b26c` იყენებს main-ის არსებულ `upstashRestEnv`-ს: სრული Marketplace წყვილი პირველია, სრული legacy წყვილი fallback-ია, შერეული არასრული წყვილები fail-closed. Before6PASS/2FAIL; after30/30PASS. საერთო helper და მისი ტესტები main-ის იდენტურია.
3. ახალი free Image E2E მხოლოდ local Supabase-ს ამოწმებს; ცალკე hosted Preview რეჟიმში აშკარად გამოტოვებულია. ეს hosted acceptance-ის PASS არ არის.

PR58 საბოლოო head `aa0de1f7` უკვე main-შია; მიმდინარე main ასევე შეიცავს PR63-ს. ექვს საერთო ფაილში ცვლილებები ავტომატურად თავსებადად შეერთდა. ახალი source tree `5305d0c4c1e1f785b74bb8ab65ed452421ed5fd6` **ზუსტად ემთხვევა** წარმატებით შემოწმებულ GitHub integration commit `2edaafd5c9c121cc85ca44ba8c0ca53d79768a77`-ს. ეს tree-equivalence ცალკე JSON-შია. Video runtime-ის ხელახალი იმპლემენტაცია არ შესრულებულა.

## ზუსტი შედეგები
| შემოწმება | შედეგი | გარემო / მტკიცებულება |
|---|---|---|
| სრული Jest |909 suite PASS,8 skipped;13,928 tests PASS,70 skipped;372.914წმ|[CI](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305928), Linux/Node24, main+5b43b26c |
| TypeScript / Build |PASS / PASS|იგივე CI |
| ESLint შეცვლილ ფაილებზე |0 warnings/errors|current-main disposable source, main-redis-lint.result.json |
| Image/საერთო focused regression |156PASS/3DB-env skips; Redis fix შემდეგ30/30PASS|ცალკე test selection-ები; ჯამად არ ითვლება |
| One Window browser |5/5PASS|Chromium, EN/KA/RU,390×844 mobile viewport; intercepted APIs |
| Image Acceptance DB |Lease7/7 before+after; Ledger7PASS+1phase-skip თითოეულში; Image3/3; Runs6/6; Outbox4/4|[head-only run](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454306171), real PostgreSQL16/PostgREST12.2.3; provider/Storage injected |
| მიმდინარე main-ის DB regression |Lease9/9 before+after; Ledger7+1skip თითო ფაზაში; Runs6; Outbox4; idempotency1before/7after|[billing job](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305911), რეალური disposable DB |
| უფასო real Image boundaries |3/3PASS|რეალური Auth/RLS/private Storage/Versions/Library; synthetic PNG; credit balance/ledger უცვლელი |
| სრული Video+Image local E2E |38/38PASS,17.9წთ|[run attempt2](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305911/attempts/2), desktop და Chromium iPhone13 emulation |
| Offline paid-harness contracts |5/5PASS|0 provider call |
| Preview Contract |PASS|[run](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454306107); ეს hosted real Image lifecycle არ არის |

Image head-only7/7 და main integration9/9 სხვადასხვა inventory-ია: main-ს2დამატებითი Lease test აქვს. Synchronization შემდეგ branch-ში ორივე დამატებითი ტესტიც შენარჩუნებულია. საბოლოო branch CI-ის ზუსტი შედეგები PR-ის აღწერასა და Evidence Ledger-ის შესაბამის revision-ში მოწმდება; მიმდინარე source-ის მტკიცებულება ზემოთ დასახელებული იდენტური tree-ა.
Legacy Video billing runner-ის forceExit არ არის timer cleanup-ის მტკიცებულება. ამისთვის Image Acceptance-ის natural-exit suites გამოიყენება.

## next/font დიაგნოსტიკა
პირველი local-Supabase build ჩავარდა `next/font/google/loader.js:112`-ში URL-ის extension regex-ზე: `Cannot read properties of null (reading '1')`. Image ტესტები მაშინ არ დაწყებულა.
იმავე commit-ის მხოლოდ failed job განმეორდა; კოდის ან dependencies-ის შეცვლის გარეშე build და38E2E წარმატებით დასრულდა. ცალკე ძირითადმა CI build-მაც გაიარა. მიმდინარე Google Fonts CSS-ის სამივე ოჯახის55URL loader-ის extension მოთხოვნას აკმაყოფილებდა.
პირველი failure არ იმალება. მტკიცებულება მხარს უჭერს არაგანმეორებულ build-dependency/გარემოს ხარვეზს; მუდმივი აპლიკაციის დეფექტი ან ზუსტი ქსელური მიზეზი არ არის დადასტურებული. Font code/workaround არ შეცვლილა.

## Regression და skipped inventory
ისტორიული macOS full run:13,346PASS/18FAIL/25pending.18FFmpeg failure ზუსტად დაემთხვა clean30be5a2d-ს:16gradient fixture/binary incompatibility,1loudnorm/aresample channel-layout defect იმავეFFmpeg6-ზე,1diagnostic portability. Linux CI-ში ისინი არ განმეორდა; ძველი macOS შედეგი მიმდინარე main-ის native certification არ არის.
Clean baseline lease:6PASS/1knownFAIL და interval timeout. მკაცრი diagnostic checker მხოლოდ ამ ისტორიულ შედეგს ადარებს; მისი PASS არ ნიშნავს baseline ტესტების PASS-ს.

70skipped საერთო Jest-ში:37DB,17nativeFFmpeg,2public-MDN audio,14BOG integration. DB სცენარები ცალკე isolated jobs-ში მოწმდება (before/after mutually-exclusive cases განსხვავდება);3longform და2audio ძველ recovery-ში გაიარა.14ახალი native Video opt-in სცენარი და14BOG integration ამ Image ფაზაში არ გაშვებულა; ისინი PASS-ად არ ითვლება. Google-ის live ტესტები საერთოდ სხვა acceptance gate-ია.

## ფაილები / მტკიცებულება / ვერდიქტი
[CHANGED_FILES.txt](CHANGED_FILES.txt) შეიცავს Image-ის სხვაობას მიმდინარე main-თან; main-ის უკვე მიღებული სხვა სერვისების ცვლილებები Image-ის ავტორობას არ მიეწერება.
[Evidence Ledger](EVIDENCE_LEDGER.md), [E2E Matrix](FINAL_E2E_MATRIX.md), [Release checklist](RELEASE_READINESS_CHECKLIST.md), [Next actions](NEXT_ACTIONS_KA.md), [Live plan](PHASE_6_RUNBOOK.md).
Compact evidence Git-შია; სრული logs/artifacts ადგილობრივ evidence root-ში და GitHub run-ებში (14დღიანი retention). Secrets/signed URLs ანგარიშში არ იწერება.
ძველი ჩატების cancellation დაუდასტურებელია: durable host ვერ მოიძებნა. შესაბამის worktree-ში concurrent writer არ გამოვლენილა; ძველი approvals არ უნდა განახლდეს.

**NO-GO საჯარო გაშვებისთვის:** რეალური Google generate/edit/cost/call-count, reference visual fidelity, სრული paid lifecycle, Redis/worker restart/cancel/refund-outage და Production policy/rollback review ჯერ BLOCKED-ია. წინარე synthetic outputs და mocked UI ამ მოთხოვნებს არ ანაცვლებს.
