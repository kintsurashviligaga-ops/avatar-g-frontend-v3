# Image Studio — შემდეგი მოქმედებები
2026-10-14. Branch `codex/image-studio-v1`, [Draft PR60](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/60).

## ავტონომიურად დასრულებული
შენარჩუნდა recovery/backups; გამოსწორდა timers და QC fixture; შესრულდა real PG CI, Image3DB და free real Auth/RLS/Storage/Library3E2E. ახალი main-ის Redis არჩევანის პრობლემა რეგრესიით დადასტურდა და გასწორდა. main სამუშაო branch-ში შემოვიდა ორივე ისტორიის შენარჩუნებით; source tree ემთხვევა წარმატებულ13,928Jest/38E2E integration tree-ს. განახლებულია reports/matrix/evidence/PR. main-ზე merge/Production deploy/migration/paid call არ შესრულებულა.

## Owner-ის რეალური ჩარევა
1. გამოყავით ან დაასახელეთ verified nonproduction app+Supabase+Redis და2disposable user. Supply runbook variables უსაფრთხო secret channel-ით; token-ები ჩატში ან Git-ში არ ჩასვათ. წინა CI stack უკვე გაუქმებულია.
2. ცალკე დაამტკიცეთ Google model/transport, მაქსიმუმ2საწყისი paid job (generate+edit), credit cap და მისაღები provider cost. Credits არ უდრის დადასტურებულ USD ხარჯს.
3. Actual outputs-ის visual review; reference/character/outfit/product დამატებითი ექსპერიმენტები ცალკე ბიუჯეტით.
4. იზოლირებულ გარემოზე real Redis/worker restart/cancel/refund-outage და Agent G session acceptance.
5. მხოლოდ წარმატებული gates-ის შემდეგ reviewed rollout/access policy/rollback target და ცალკე main merge/Production deployment approval.
ძველი ჩატების pending approvals არ განაახლოთ; cancellation ტექნიკურად დაუდასტურებელია, მაგრამ worktree-ში სხვა writer არ გამოვლენილა. Stop ღილაკზე განმეორებითი მოთხოვნა საჭირო არ არის.

## ზუსტი ბრძანებები / UI
```sh
cd /Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af
git status --short
git log -3 --oneline
git merge-base --is-ancestor fef867a6ebad67a2a0a56a24e0b15c683a353d79 HEAD
node scripts/image-studio/live-e2e.mjs config
```
Config mode ქსელს არ იყენებს. Verified isolated ცვლადების მიწოდების შემდეგ:
```sh
node scripts/image-studio/live-e2e.mjs preflight
```
GET-only; წარმატება `PREFLIGHT_PASS_NOT_E2E`. Paid ბრძანება მხოლოდ owner-ის ცალკე თანხმობის შემდეგ, [Phase6 runbook](PHASE_6_RUNBOOK.md)-ის guard/cap-ებით. გაურკვეველი POST-ის შემდეგ ხელახალი generation არ დაიწყოთ; შენახული job ID შეაჯერეთ.

```sh
gh pr checks 60 --repo kintsurashviligaga-ops/avatar-g-frontend-v3
gh run view 38454305928 --repo kintsurashviligaga-ops/avatar-g-frontend-v3 --log-failed
gh run view 38454305911 --repo kintsurashviligaga-ops/avatar-g-frontend-v3 --attempt 2
```
gh authentication-ის გარეშე გამოიყენეთ PR60→Checks→run→Artifacts. მხოლოდ ჩავარდნილი job გაიმეორეთ, როცა მიზეზი ამას ამართლებს. უკვე გავლილი ტესტები source ცვლილების გარეშე არ მეორდება ხელით.

## დაუდასტურებელი ვარაუდები
Google project/model availability, actual generation/edit/cost/call count; მთლიანი paid lifecycle; real Redis admission; provider outage/crash settlement; hosted Preview; ordinary-user rollout; Production bucket/RLS/config state; visual fidelity და rollback drill.
მხოლოდ seeded PNG-ებით შესრულებული Auth/Storage ტესტები ამ ვარაუდებს არ ამტკიცებს.
70plain-Jest skip-ის გაშლა [Evidence Ledger](EVIDENCE_LEDGER.md)-შია. Video native14 და BOG14 ამ Image continuation-ში არ არის გადამოწმებული; მათ შედეგებს არ ვიგონებთ.
**საჯარო გაშვება: NO-GO**, სანამ live gates და owner approvals არ დაიხურება.
