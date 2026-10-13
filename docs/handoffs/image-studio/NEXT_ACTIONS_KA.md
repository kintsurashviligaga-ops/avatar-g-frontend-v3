# Image Studio v1.0 — შემდეგი მოქმედებები
## ავტონომიურად შესრულებული
შენარჩუნდა recovery/backup; გასწორდა timers; გაიარა staged Jest/typecheck/lint/build;18macOS FFmpeg failure შედარდა baseline-ს; შესრულდა5opt-in native test; დაემატა real PG CI და Image3DB tests; ზუსტად გადმოვიდა PR58 fixture fix; გაიარა Image Acceptance და finalVideo source/browser comparison. რეალურ local Supabase-ზე Image3/3 და სრული Video+Image38/38 გავიდა. PR60 და ოთხივე საბოლოო ანგარიში მომზადებულია.

## რაც owner-ს რეალურად სჭირდება
1. ძველი `continue` და `გააგრძელე წინა ჩათი` approval არ დაამტკიცოთ. თუ pending card ჩანს, Reject/Cancel. Lifecycle cancellation დაუდასტურებელია; Stop ღილაკის შესახებ განმეორებითი კითხვა საჭირო არ არის.
2. დაასახელეთ/გამოყავით verified nonproduction app+Supabase+Redis და2test user. უსაფრთხო secret channel-ით მიაწოდეთ runbook-ის ცვლადები; token-ები ჩატში/ანგარიშში არ ჩასვათ. ერთჯერადი CI stack დასრულების შემდეგ აღარ არსებობს.
3. ცალკე დაამტკიცეთ Google acceptance-ის მოდელი/transport, მაქსიმუმ2საწყისი paid job (generate+edit), credit cap და მისაღები provider cost. Credit ფასი არ უდრის დადასტურებულ USD ხარჯს.
4. დაამტკიცეთ მხოლოდ ცალკე პროცესით Production access policy/configuration, საჭირო DB/storage prerequisites, merge და deploy.
5. რეალური output-ის visual review, reference/identity/product fidelity და additional paid experiments საჭიროებს owner-ის მონაწილეობას/ბიუჯეტს.

## ზუსტი ბრძანებები / UI
```sh
cd /Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af
test "$(git branch --show-current)" = codex/image-studio-v1
git status --short
git log -5 --oneline
node --test scripts/image-studio/live-e2e.test.mjs
node scripts/image-studio/live-e2e.mjs config
```
მხოლოდ verified isolated ცვლადების მიწოდების შემდეგ:
```sh
node scripts/image-studio/live-e2e.mjs preflight
```
ეს GET-only ეტაპია; წარმატების სტატუსია `PREFLIGHT_PASS_NOT_E2E`. Paid ეტაპის ზუსტი guard/ბრძანება: [PHASE_6_RUNBOOK.md](PHASE_6_RUNBOOK.md); ამ სესიაში მისი ნებართვა არ გაცემულა.

```sh
gh pr checks 60 --repo kintsurashviligaga-ops/avatar-g-frontend-v3
gh run view 38413377277 --repo kintsurashviligaga-ops/avatar-g-frontend-v3 --log-failed
gh run view 38413376597 --repo kintsurashviligaga-ops/avatar-g-frontend-v3 --log-failed
```
თუ gh login არ გაქვთ, UI: PR60→Checks→Image Studio Acceptance / Video Core E2E. Actions run→Artifacts ჩამოტვირთეთ JSON/logs (14დღიანი retention). დასრულებულ run-ზე Re-run failed jobs მხოლოდ CI-ს იმეორებს.
ახალი Image runner იყენებს timeouts-ს და natural exit-ს. არსებული Video billing runner-ის legacy forceExit არ არის Image timer fix-ის მტკიცებულება; ამისათვის ცალკე Image Acceptance გამოიყენება.

## დაუდასტურებელი საზღვრები
რეალური Google generation/edit/cost/call-count, მთელი paid lifecycle, real Redis admission, worker restart/cancel/refund outage, ordinary-user rollout policy, Production bucket/RLS/config state და rollback drill. Synthetic seeded assets არ ითვლება provider outputs-ად. Hosted Preview რეჟიმში ახალი local-only Image suite გამოტოვებულია აშკარა მიზეზით; hosted acceptance ცალკე BLOCKED-ია.
ძველი sessions-ის lifecycle და მიმდინარე Production configuration არც tools-ის არარსებობით და არც mocked tests-ით არ დასტურდება.
**Production NO-GO** რჩება, სანამ live gates და owner approvals არ დაიხურება.

## Current-main compatibility update — 2026-10-13 19:22 UTC
Checked main: `fef867a6ebad67a2a0a56a24e0b15c683a353d79` (PR58+PR63). A disposable archive with the Image changes applies cleanly; no branch merge was performed. One Window browser5/5 PASS (54.2s), targeted integration156 PASS/3 DB-environment skips, TypeScript PASS.

A real Image-specific integration defect was found: admission preferred legacy Redis variables and could mix incomplete pairs. Image now reuses main's exact `upstashRestEnv` helper: complete Marketplace pair wins; complete legacy pair is fallback; crossed incomplete pairs fail closed. The helper and its tests are byte-identical to main, not a second implementation. Regression before:6 PASS/2 FAIL; after:30/30 PASS across Image adapter/engine/shared helper. Current-main TypeScript PASS17.15s; ESLint0 warnings/errors. No live Redis or provider call occurred.

The earlier09333d7a full CI/E2E results remain pinned historical evidence. The final PR description reports CI for the newer engineering commit; results must not be inferred from these local checks. Branch-history synchronization remains pending the No Merge clarification. Source review and GitHub integration-snapshot CI do not update the branch's ancestry.
