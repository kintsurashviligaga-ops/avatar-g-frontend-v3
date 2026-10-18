# Video Core: next-phase handoff (after v1.0)

For whoever picks up Video Core after the v1.0 release of 2026-10-15. Read this with `VIDEO_CORE_FINAL_PRODUCTION_REPORT.md`
(what is proven) and `RELEASE_READINESS_CHECKLIST.md` (B1–B8, D1–D12 in full).

Labels: **VERIFIED FACT** · **INFERENCE** · **NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**.

## 1. Where things are

| Thing | State |
|---|---|
| Production | main **b46bb44** (PR #69), deployment `dpl_6AaKtWBNgxyvjZSv4eF48DdSdTE7`; rollback = Instant Rollback to `dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD` (3516a61) |
| Veo in Production | Vertex AI via Workload Identity Federation (pool `vercel`, provider `vercel-oidc`, service account `myavatar-veo`; no key); `/api/video/engine` → `transport: vertex`, `googleOnly: true`, `audioToggle: true` |
| Film billing | up-front debit with a `filmpay:<token>` ledger reference and a `film_billing` lease (migration 20261014a, applied 2026-10-15); the admin is never billed (`founderBypass`); a film ≤ 8 s uses the free slot when unused; R3-A refunds a scene Google failed after a server check |
| Switches | `AGENT_G_MEDIA_EXEC=admin` in Production; `VIDEO_DIRECTOR_RUNS` unset (director off); `LONGFORM_ORDER_WIRED = false` in code (B4); `VIDEO_GOOGLE_ONLY` unset = on; `GEMINI_TRANSPORT` absent in Production (other Gemini services unchanged) |
| Follow-up branch | `claude/video-core-v1-6gh97e`, restarted from main b46bb44: 66fdc69 (row 45), 54fb0f7 (row 46), the release documents; its PR needs GG's word to merge |
| Evidence of the paid test | `VIDEO_CORE_PAID_E2E_EVIDENCE.md`; raw files (redacted log, screenshots, both MP4s) stay on the owner's Mac, `~/Movies/myavatar-e2e-20261015/out/`, never in the repository |

## 2. Open items, in the order they unblock things

| # | Item | Why it matters | Who | Next action |
|---|---|---|---|---|
| 1 | Merge of the follow-up PR (rows 45, 46) | the 8 s label on a 4 s film is still in Production | GG's word | merge with a merge commit; free smoke (`/api/health` commit, engine `vertex`) |
| 2 | Paying-user test in Production | the debit, the stitch not charging twice, the `filmpay:` row and a multi-scene stitch have never run in Production | GG's word + GG signs in | one 16 s film (2 × 8 s) on GG's normal account, quote 50 credits, ≈ $1.92 Vertex at 1080p list price (`VIDEO_CORE_FINAL_PRODUCTION_REPORT.md` §8 step 1); reconcile with `FINANCIAL_INTEGRITY_REPORT.md` §4 |
| 3 | Veo spend ceiling | films are open to every signed-in user with credits and now reach Vertex; the app's own envelope is `DAILY_COST_LIMIT` / `MONTHLY_COST_LIMIT` (code defaults $10 / $300; whether Production overrides them was not read) and it lets a call run if the guard itself fails | GG | name a daily figure; add a Google Cloud budget alert on the Vertex project (B1) |
| 4 | Public opening of Video Core | `AGENT_G_MEDIA_EXEC` from `admin` to `on` | GG's word, after 2 and 3 | §8 step 2 of the final report |
| 5 | Veo failure refund in Production (R3-A) | proven only with a mocked failure at the CI and DB tiers | nobody can force a Google failure on purpose; observe the first real one | when a scene fails in Production, check the refund row with `FINANCIAL_INTEGRITY_REPORT.md` §4 |
| 6 | B3 storyboard revision table | Library cannot show "revision N"; the binding lives in the request | GG ("ჯერ არა", 10:18Z) | `proposals/20261012a_storyboard_revisions.sql`, preflight done |
| 7 | B4 long form (> 96 s) | 240 s is refused by name | GG (≈ $28.80 for 240 s on Fast 1080p) | flip `LONGFORM_ORDER_WIRED` on a Preview, one paid run |
| 8 | B5 29+ assets in one montage | refused by count | GG (paid host) | segmented ingestion, longer worker host |
| 9 | B6 provider policy for remix / avatar | `MEDIA_GOOGLE_ONLY` off, Replicate / HeyGen still called there | GG | the provider-strip decision |
| 10 | B7 DAST | no dynamic scan of the changed routes | GG (StackHawk key + plan) | `HAWK_API_KEY` + `stackhawk.yml`; scan the CI job's `next start` |
| 11 | D1–D12 | product, money and contract choices; current behaviour stays | GG | `RELEASE_READINESS_CHECKLIST.md` §3; D7 observed again (a single clip is delivered at 24 fps) |
| 12 | Legacy fields in the film dispatch (`videoModel: "runway"`, `voiceLanguage`, `voicePersona`, `narratorGender`) | harmless (the operation is Veo on Vertex) but misleading in logs | Claude | remove from the chat route's film dispatch with a test that the Veo body is unchanged (F3) |
| 13 | `frameSources` not kept by the paid-test runner | the frame provider is INFERENCE from code for that run | Claude | record `frameSources` from the storyboard response in the next runner |
| 14 | Quiet native Veo sound (mean −43.7 dB on the test clip) | users may find a single clip quiet | GG (D7-like: normalising = one more encode) | the free Volume tool already fixes it (+6.0 dB measured) |
| 15 | The director path (`VIDEO_DIRECTOR_RUNS`) | off in Production; not certified there | GG | Preview admin run first |

## 3. How to re-run the checks

- Unit and component tests: `npx jest <path>`; the release's own: `components/studio/video/VeoParametersPanel.test.tsx`,
  `lib/chat/promptAgent.test.ts`, `app/api/film/storyboard/*.test.ts`, the billing suites named in
  `FINANCIAL_INTEGRITY_REPORT.md`.
- Browser (mocked routes): `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c
  playwright.video-core.config.ts --reporter=list` against `next dev -p 3000`; the run rewrites
  `evidence/t2-round3-final/`, so restore it with `git checkout` unless the evidence is meant to change.
- CI: "verify", "Video Core E2E" (billing on real Postgres + live E2E desktop and phone on a throwaway Supabase), "E2E
  Preview Contract".
- Production, free and read-only: `/api/health` (commit, database, redis), `/api/video/engine`, the "BOG Production smoke
  (read-only)" workflow, anonymous `/api/credits/balance` 401 and `/api/tasks` 401.

## 4. Rules that still hold

No Production test rows by hand; any paid Production call needs GG's word naming it and a budget; no retry on an unclear
paid outcome; rollback only by Instant Rollback; no new Vercel Preview without GG's approval; BOG, Image Studio (PR #60)
and prices untouched by Video Core work; no secrets, user data, emails or signed URLs in the repository or CI artifacts.
