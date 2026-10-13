# Image Studio v1.0 — საბოლოო საინჟინრო ანგარიში
2026-10-13, Asia/Tbilisi. **Reviewable release candidate; Production NO-GO.**

## შენარჩუნებული სამუშაო და release notes
Branch: `codex/image-studio-v1`. [Draft PR #60](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/60).
Worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`.
საინჟინრო commit: `09333d7ab9a93922c1a39ea685d396cda508bc3f`. შემდგომი checkpoint მოიცავს ანგარიშებს და local-only suite-ის Preview scope guard-ს (TypeScript PASS); საბოლოო HEAD/CI PR-ის აღწერაშია.

შენარჩუნებულია თავდაპირველი 88 ფაილის სამუშაო, 109 regular ფაილის recovery snapshot და hash-იანი backup. Checkpoint: `ed0dd85339b710219ca62eccad2b14dcdc3a4293`. კოდი თავიდან არ დაწერილა. `node_modules` მხოლოდ ადგილობრივი symlink-ია და Git-ში არ შედის.

განხორციელებულია:
- ერთფანჯრიანი EN/KA/RU Image UI: prompt, რეჟიმები, references, quote, ცალკე confirm, პროგრესი, cancel და refresh recovery.
- Generate/edit კონტრაქტები, character/outfit/product/reference როლები, უცვლელი საწყისი ტექსტი და owner-resolved inputs.
- ხელმოწერილი quote, ვადის/მომხმარებლის/მოდელის/transport-ის შემოწმება; ერთჯერადი debit/dispatch, lease/CAS, refund debt და late-output fencing.
- Preview, Versions, parent/child lineage, source comparison, owner-scoped Library და დროებითი private URL-ები.
- Agent G-ის quote-only ინსტრუმენტი trusted draft-იდან; მოდელი ვერ ადასტურებს ხარჯს.
- Timer cleanup: limiter-ის module interval ჩანაცვლდა request-time cleanup-ით; upload timeout იწმინდება finally-ში; preview URL cleanup გასწორდა. Fix commit: `a7b34014961ce8a46ff1ed2a500c92a3babd4142`.
- Bounded CI, logs/artifacts, isolated DB tests, offline/preflight/paid-gated harness და უფასო Auth/Storage/Library სცენარები. Mock და synthetic output არ არის Google-ის რეალური შედეგის მტკიცებულება.

## აუდიტის აღმოჩენა და უკვე არსებული fix
PR #58-ის საბოლოო head: `aa0de1f732fa8f43172b88c0c66b92aff018a987`. GitHub მიუთითებს, რომ სხვა სესიიდან უკვე merge-ულია (2026-10-13 13:20:15 UTC); ამ სესიას merge არ შეუსრულებია.

არსებული fix `954e3859d752ae89ec56ca756f0d44598f68c447`-იდან ზუსტად გადმოვიდა ორი ტესტური ფაილი:
- `lib/agent/media/leaseIsolation.pg.test.ts`: QC master frames კითხულობს რეალურ processing row-ს.
- `lib/agent/media/testing/fakeMontageDeps.ts`: იგივე shot walk ექსპორტირებულია `shotSourceAt`-ად.

პორტის commit: `84764dca6682abe2ca481879fe2fe71aefaeec16`. ორივე patch-ის stable ID არის `670f75e6b64ac963c7766835d5b3704d630c7d37`. Assertions არ შეცვლილა; Video runtime-ის ცვლილებები არ გადმოტანილა.

## ზუსტი შემოწმებები
| შემოწმება | შედეგი | ფარგლები |
|---|---|---|
| Lease before / after | **7/7 + 7/7 PASS** | branch head, real ephemeral PostgreSQL16/PostgREST12.2.3 |
| Ledger before / after | **7 PASS +1 phase skip თითოეულ ფაზაში** | ორივე ურთიერთგამომრიცხავი ვარიანტი შესრულებულია შესაბამის ფაზაში |
| Image Studio DB | **3/3 PASS** | real CAS/ledger; provider, Redis, Storage injected |
| Multi-step runs / Outbox | **6/6 +4/4 PASS** | real DB/FFmpeg; local media, mocked delivery |
| Image browser / offline harness | **5/5 +5/5 PASS** | Chromium intercepted API / Node offline |
| Auth/Storage/RLS/Versions/Library free E2E | **3/3 PASS; საერთო Video+Image suite38/38 PASS (15.8წთ)** | real local Supabase, synthetic assets; no generation |
| სრული CI verify | **906 suites PASS /7 skipped;13,905 tests PASS /63 skipped;460.049წმ; typecheck/build PASS** | GitHub PR integration snapshot; typecheck/tests/build |
| Preview contract / Vercel status | **PASS / SUCCESS** | არსებული PR-preview ავტომატიზაცია; არა Production acceptance |
| PR58 საბოლოო source/browser compatibility | **PASS: typecheck22.147წმ; Chromium5/5,58.0წმ** | disposable aa0de1f7+Image snapshot; intercepted APIs |
| ახალი ტესტების local typecheck/lint | **PASS**, lint0 warnings/errors | fixture fix და free E2E |

[Image Acceptance run](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38413377277).
[საერთო CI](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38413376701).
[ადგილობრივი Supabase E2E](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38413376597).

ძველი 25 skipped DB სცენარი აღარ არის გარემოს გამო BLOCKED: ყველა ლოგიკური სცენარი შემოწმებულია. სულ branch DB ფაზებში41 წარმატებული assertion execution და2 ურთიერთგამომრიცხავი phase skip; rerun-ები უნიკალურ ტესტებად არ ითვლება. Image-ის3 ახალი DB ტესტი ამ41-შია.

## Regression evidence
- ადრინდელი bounded macOS inventory:884 suite file;13,346 PASS/18 FAIL/25 pending. სამივე longform FFmpeg და ორივე public-MDN audio opt-in შემდგომ წარმატებით შესრულდა; 25 DB pending ზემოთ დაიხურა.
- macOS-ის18 ჩავარდნა ზუსტად დაემთხვა clean `30be5a2d`-ს:16 `gradients speed=0` fixture/binary incompatibility;1 loudnorm/aresample channel-layout runtime defect FFmpeg6-ზე;1 diagnostic-text portability. Linux CI-ში ეს18 არ გამეორდა. macOS binary-ის ხარვეზი ამ Image PR-ში არ გამოსწორებულა.
- Fix-მდე real-DB lease შედეგი6 PASS/1 FAIL იყო როგორც branch-ზე, ასევე clean baseline-ზე. Baseline დამატებით ტოვებდა `rate-limit.ts:62` interval-ს. Fix-ის შემდეგ branch7/7 ბუნებრივად სრულდება, `--forceExit`-ის გარეშე.
- ისტორიული baseline CI-ში განზრახ უცვლელია:6 PASS/1 ცნობილი FAIL და bounded timer timeout. ცალკე diagnostic checker ზუსტად ამ failure name/count/stack/exit-ს ამოწმებს და სხვა შედეგზე თვითონ FAIL ხდება. მისი წარმატება **არ ნიშნავს baseline tests PASS-ს** და არ ცვლის release assertions-ს.
- საერთო CI-ის წინა დასრულებული `bc93e594`:886 suites PASS/7 skipped;13,440 tests PASS/47 skipped,429.669წმ; typecheck/build PASS. დამატებითი skips მოიცავდა შემდგომ main ინტეგრაციას; ახალი შედეგი ზემოთ ცალკეა.

## მტკიცებულებები, ცვლილებები და დარჩენილი საზღვრები
ფაილთა სრული სია: [CHANGED_FILES.txt](CHANGED_FILES.txt). Compact JSON: `evidence/phase8-20261013/`; სრული logs/ZIP/trace ადგილობრივ evidence root-ში და GitHub artifacts-ში (14დღიანი retention).
[მატრიცა](FINAL_E2E_MATRIX.md), [readiness checklist](RELEASE_READINESS_CHECKLIST.md), [შემდეგი ნაბიჯები](NEXT_ACTIONS_KA.md).

ერთჯერადი CI Auth/Storage შემოწმება synthetic seed-ებით არ ამტკიცებს Google generation→paid ledger→private Storage-ის სრულ lifecycle-ს. რეალური Google/edit/reference visual quality, actual provider cost/call count, Redis admission და რეალური worker restart/cancel/refund-outage ჯერ BLOCKED-ია.

Phase6 hosted preflight-ის ცვლადები არ არის მოწოდებული; config mode ქსელამდე ჩერდება. Supabase connector-ის ბოლო inventory-ში მხოლოდ INACTIVE პროექტი ჩანდა, რომლის nonproduction სტატუსი არ დამტკიცებულა; ის არ გააქტიურებულა.

ძველი ჩატების ბოლო ცნობილი მდგომარეობა waitingOnApproval იყო; საბოლოო refresh-ზე durable host მიუწვდომელი აღმოჩნდა. Cancellation დაუდასტურებელია; ძველი approvals არ დაამტკიცოთ. ადგილობრივი concurrent Git/Jest writer არ ჩანდა და backup SHA256 შემოწმება წარმატებულია.

CI-ს პირველი2ფაილიანი commit `ee426751` detached checkout-ში შეიქმნა და ზუსტად გადმოვიდა სწორ branch-ზე `5566e61b`-ით; უცხო checkout-ის კოდი PR-ში არ მოხვედრილა. ისტორიული სამუშაო/commit შენარჩუნებულია.

**ვერდიქტი:** ტექნიკური RC reviewable-ია; Production Ready არ არის. არ შესრულებულა merge, Production deploy/DB mutation ან paid provider call. CI-ის test schema მხოლოდ ერთჯერად ლოკალურ DB-ში შეიქმნა. საბოლოო rollout და ფასიანი acceptance ცალკე owner approval-ს საჭიროებს.

## Main refresh — მიმდინარეობს
მიმდინარე main: `fef867a6ebad67a2a0a56a24e0b15c683a353d79` (PR58 და შემდგომი PR63). 2026-10-13-ის წარმატებული CI ზემოთ ძველ09333d7a-ს ეხება. Branch სინქრონიზაციის merge მეთოდის owner დაზუსტება მოთხოვნილია, რადგან ისტორიის შენარჩუნება/No Force Push და No Merge ერთდროულადაა მითითებული. მანამდე main არ შეცვლილა და ახალი main-ისთვის PASS არ გამოცხადებულა.

## Current-main compatibility update — 2026-10-13 19:22 UTC
Checked main: `fef867a6ebad67a2a0a56a24e0b15c683a353d79` (PR58+PR63). A disposable archive with the Image changes applies cleanly; no branch merge was performed. One Window browser5/5 PASS (54.2s), targeted integration156 PASS/3 DB-environment skips, TypeScript PASS.

A real Image-specific integration defect was found: admission preferred legacy Redis variables and could mix incomplete pairs. Image now reuses main's exact `upstashRestEnv` helper: complete Marketplace pair wins; complete legacy pair is fallback; crossed incomplete pairs fail closed. The helper and its tests are byte-identical to main, not a second implementation. Regression before:6 PASS/2 FAIL; after:30/30 PASS across Image adapter/engine/shared helper. Current-main TypeScript PASS17.15s; ESLint0 warnings/errors. No live Redis or provider call occurred.

The earlier09333d7a full CI/E2E results remain pinned historical evidence. The final PR description reports CI for the newer engineering commit; results must not be inferred from these local checks. Branch-history synchronization remains pending the No Merge clarification. Source review and GitHub integration-snapshot CI do not update the branch's ancestry.
