# Video Core v1.0: final production report

State **2026-10-15**, after the Production release of PR #69 (main **b46bb44**, deployment
`dpl_6AaKtWBNgxyvjZSv4eF48DdSdTE7`) and the one paid Production test. Brief: GG 2026-10-13 17:34:41Z, "Video Core v1.0
final production hardening, paid E2E & release certification", Phases 0–7.

Labels: **VERIFIED FACT** (run or read, evidence named) · **INFERENCE** (from code or prices, not measured) ·
**NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**.

## მოკლედ

- Video Core v1.0 Production-შია (b46bb44): ფილმის გადახდა მდგრადია (ledger + `film_billing`), Production-ის Veo
  Vertex-ით მიდის (WIF, გასაღების გარეშე), Google-ის მიერ ჩავარდნილი სცენის კრედიტი ბრუნდება (R3-A). VERIFIED FACT.
- ერთი ფასიანი ტესტი ჩატარდა ადმინით: 4 წამი, Veo 3.1 Fast, Vertex-ის ერთი ოპერაცია, ხმიანი MP4 4.01 წმ,
  ჩამოტვირთვა, Library, ისტორია. ხარჯი ≈ $0.40 (INFERENCE ფასით), კრედიტები 0 (VERIFIED FACT).
- ნაპოვნია ორი დეფექტი, ორივე ჩვენების (ფულსა და ფაილზე გავლენა არ ჰქონია), ორივე გასწორდა ტესტებით; Production-ში
  მოხვდება ახალი PR-ის merge-ით.
- **Production Ready საჯარო გახსნისთვის: ჯერ არა.** დამტკიცებულია ადმინის ერთკლიპიანი გზა. არ არის დამტკიცებული:
  მრავალსცენიანი ფილმი Production-ში, ჩვეულებრივი (გადამხდელი) მომხმარებლის ჩამოჭრა და დაბრუნება Production-ში,
  Veo-ს ჩავარდნის refund Production-ში. საჯარო გახსნა მფლობელის ცალკე გადაწყვეტილებაა (§8).

## 1. Phases 0–7

| Phase | What it asked | Result | Label |
|---|---|---|---|
| 0 | re-verify the starting state from the repository, not from earlier reports | done: Production Veo was on the Gemini API, WIF trusted Preview only, films open to signed-in users, admin never billed, the paid-film marker lived in Redis | VERIFIED FACT |
| 1 | a durable paid-film marker | built: `filmpay:<token>` ledger reference + `film_billing` lease, migration 20261014a; billing tests on real Postgres in CI | VERIFIED FACT (CI); applied in Production 2026-10-15 ~11:32Z |
| 2 | Production Veo on Vertex | done on GG's card (10:05Z "კი") and word (10:43Z): WIF provider accepts this project's Preview and Production tokens only, `myavatar-veo`, no key; 8 env vars; `/api/video/engine` → `transport: vertex` | VERIFIED FACT |
| 3 | B3 storyboard revisions | preflight done; GG 10:18Z "ჯერ არა": stays a proposal, not applied | VERIFIED FACT |
| 4 | refund and credits integrity | `R3_REFUND_MATRIX.md`; GG 10:16Z "კი, დაუბრუნე" → R3-A built: a scene Google failed is refunded after a server check | VERIFIED FACT (T1, DB tiers) |
| 5 | one limited paid Production test | PASS (`VIDEO_CORE_PAID_E2E_EVIDENCE.md`): one press, one Vertex operation, one delivered 4 s film with sound, 0 credits, ≈ $0.40; the free Volume check +6.0 dB | VERIFIED FACT (≈ $0.40: INFERENCE) |
| 6 | QA, UX, security, D1–D12 | two display defects found and fixed (rows 45, 46); D1–D12 unchanged, all the owner's (§5); no new runtime error group; anonymous probes refused | VERIFIED FACT |
| 7 | release gates and reports | `PRODUCTION_RELEASE_CHECKLIST.md` all DONE; this report, `NEXT_PHASE_HANDOFF.md`, `FINANCIAL_INTEGRITY_REPORT.md`, `ROLLBACK_AND_RECOVERY_PLAN.md`, `FINAL_ACCEPTANCE_MATRIX.md`, `VIDEO_CORE_PAID_E2E_EVIDENCE.md` | VERIFIED FACT |

## 2. Release gates

All rows of `PRODUCTION_RELEASE_CHECKLIST.md` are DONE with their evidence: CI green on the PR head (P1), GCP trust (P2,
P3), migration preflight, recovery plan, apply and record (P4–P7), env vars and rollback point (P8, P9), merge with a merge
commit (M1), Production build with `gcp-auth-check … ok=true mode:wif` (M2, M3), health, engine, BOG smoke 38732005645,
runtime errors and anonymous probes after the deploy (V1–V5), the paid-test rules (L1–L6). VERIFIED FACT.

Rollback: Instant Rollback to `dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD` (3516a61, PR #62), never a Redeploy of old code
(`ROLLBACK_AND_RECOVERY_PLAN.md` R1). Not needed so far.

## 3. Money

| Item | Amount | Label |
|---|---|---|
| Vertex / Veo, the paid test | one 4 s Veo 3.1 Fast 720p clip with audio ≈ **$0.40** (budget ≤ $5) | INFERENCE (list price $0.10 a second); one operation VERIFIED FACT |
| Vertex, the earlier L1 call on Preview (2026-10-13) | one clip, reported then | VERIFIED FACT (then) |
| Own credits | **0** of the 50 allowed (admin is never billed; balance 892 → 892) | VERIFIED FACT |
| BOG / Stripe payment, subscription, refund, top-up | none | VERIFIED FACT |
| Storyboard frames and script for the paid test (Gemini) | a few cents | INFERENCE (not metered per call here) |

The Google Cloud invoice line for the day was not read from here (no billing access from the sandbox): OWNER ACTION
REQUIRED only if GG wants the invoice figure instead of the list-price estimate.

## 4. Defects found in this phase

| # | Defect | State |
|---|---|---|
| 45 | a 4 s film's storyboard tile said "⏳8s" and the "Scenes & camera" drawer "1 × 8s" (quote, dispatch and file were 4 s) | FIXED in 66fdc69 with a Jest test and a browser test, both red on b46bb44 |
| 46 | the storyboard response's `scriptModel` named a Claude model; the script is written by Gemini (`llmText` is Gemini only) | FIXED in 54fb0f7 with a Jest test |

Both reach Production with the follow-up PR's merge (OWNER ACTION REQUIRED: GG's word for that merge). Full rows:
`DEFECT_REGISTER_FINAL.md`.

## 5. Owner decisions D1–D12

Unchanged by this release; current behaviour stays until GG answers (`RELEASE_READINESS_CHECKLIST.md` §3).

| # | Question | Today | State |
|---|---|---|---|
| D1 | one Video entry (one path with a mode) | several tiles, navigation only | OWNER ACTION REQUIRED |
| D2 | Remix tile may leave `#omni` | stays in `#omni` | OWNER ACTION REQUIRED |
| D3 | remix length frame-exact like the film | remix not frame-gated | OWNER ACTION REQUIRED |
| D4 | remix quotes before it charges | some remix ops charge without a quote | OWNER ACTION REQUIRED (money) |
| D5 | one spelling of the stitch failure code | `assemble_failed` and `assembly_failed` both exist | OWNER ACTION REQUIRED |
| D6 | remove the legacy 30 s pad for callers with no length contract | pad kept, every in-tree caller sends the contract | OWNER ACTION REQUIRED |
| D7 | conform a single native clip to 30 fps | delivered at Veo's 24 fps; **observed again** on the paid test (96 frames at 24 fps, 4.01 s) | OWNER ACTION REQUIRED (one more encode = a charge question) |
| D8 | storyboard approval mandatory for every director run | checked when sent, accepted when absent | OWNER ACTION REQUIRED |
| D9 | a bare length sentence opens the Video tool | answered as chat | OWNER ACTION REQUIRED |
| D10 | AC-23 montage contract (music offset, add clips, replace music, per-clip audio) | unsupported and said, nothing charged | OWNER ACTION REQUIRED |
| D11 | rate limit for Agent G media (5 a minute shared by quote and run) | as is | OWNER ACTION REQUIRED |
| D12 | trim / speed words on an attached video | go to the chat model / remix | OWNER ACTION REQUIRED |

## 6. Blockers

| # | Blocker | State |
|---|---|---|
| B1 | live Veo on Vertex | **partly closed**: Production Veo on Vertex is PROVEN for one 4 s clip; multi-scene, 8 s clips and long form on Vertex in Production: NOT TESTED. A Google Cloud budget alert for Veo: OWNER ACTION REQUIRED |
| B3 | storyboard revision table | proposal, GG "ჯერ არა" (10:18Z) |
| B4 | long form (> 96 s) | closed by `LONGFORM_ORDER_WIRED = false`; refused by name, never cut |
| B5 | 29+ assets in one montage | refused by count |
| B6 | provider policy for remix / avatar | `MEDIA_GOOGLE_ONLY` off: Replicate / HeyGen still called there; OWNER ACTION REQUIRED |
| B7 | DAST (HawkScan) | `HAWK_API_KEY` unset; no dynamic scan; OWNER ACTION REQUIRED (key + plan) |

## 7. Providers in this release

| Step | Provider in Production | Label |
|---|---|---|
| Film clip | Veo on **Vertex AI** (WIF, no key; operation name under `projects/…/locations/us-central1/…`) | VERIFIED FACT |
| Storyboard script (director) | Gemini (`llmText` has no other provider) | VERIFIED FACT (code), label fixed in 54fb0f7 |
| Storyboard frames | Gemini image (`generateGeminiImage`, Google-only on) | INFERENCE (code + `googleOnly: true`; per-run `frameSources` not recorded) |
| Stitch, edits (Volume) | FFmpeg in our functions | VERIFIED FACT |
| Music bed | ElevenLabs when asked (the paid test asked for none) | NOT TESTED in this release |
| Remix, avatar legs | Replicate / HeyGen (B6) | outside this release |

No silent fallback to the Gemini Developer API for Veo in Production: the engine reports `transport: vertex`, and the
other Gemini services' transport was not changed (`GEMINI_TRANSPORT` absent in Production). VERIFIED FACT.

## 8. Verdict

- **PROVEN in Production:** the admin's single-clip film path end to end (storyboard → quote → one press → Vertex →
  storage → stitch → preview → download → Library → history), with Veo's own sound; the free Volume edit on it; the
  release's gates and rollback point. VERIFIED FACT.
- **Not proven in Production:** a multi-scene film (8 s and longer: stitch, joins, music bed, film QA); a paying
  non-admin user (the debit, the `filmpay:` ledger row, the stitch not charging twice); a Veo failure and its scene
  refund (R3-A); the director path (off). These are PROVEN only at the CI and Preview tiers
  (`FINAL_ACCEPTANCE_MATRIX.md`). NOT TESTED.
- **Production Ready for a public opening: NO.** Not because something is known broken, but because the paying-user path
  has not run once in Production.

Note on who can make films today: films were already open to every signed-in user with credits before this release; since
b46bb44 their clips go to Vertex. Video Core's Agent G media tools stay admin-only (`AGENT_G_MEDIA_EXEC=admin`), the
director stays off, BOG stays admin-only, prices are unchanged. VERIFIED FACT.

### The permission the public opening needs (OWNER ACTION REQUIRED)

Two steps, in this order, each its own word:

1. **One paying-user test in Production:** a normal (non-admin) account of GG's, signed in by GG, one **16 s film (two
   8 s scenes)**. It proves what the admin run could not: the up-front debit, the stitch not charging again, a
   multi-scene stitch with film QA, and the `filmpay:` ledger row. Quote **50 credits** (`videoCredits`, 16 s Fast;
   VERIFIED FACT from code), ≈ **$1.92** Vertex (INFERENCE from the list price: 8 s scenes render at 1080p, $0.12/s with audio; corrected 2026-10-15 from an earlier $1.60), no new card payment, no retry. An 8 s
   film would not do: it uses the account's free slot when unused, so nothing is debited. The account needs ≥ 50 credits
   already (no top-up in this test). Suggested wording: „ნებას გაძლევ Production-ში ერთი ფასიანი ფილმის ტესტი ჩემი
   ჩვეულებრივი ანგარიშით: 16 წამი (2 სცენა), ≤ 50 კრედიტი, ≤ $2 Vertex, ბარათით გადახდის გარეშე".
2. **The opening itself,** after step 1 passes: `AGENT_G_MEDIA_EXEC` from `admin` to `on` in Production (every signed-in
   user gets Agent G's montage and edit lanes, which are free) and a daily Veo spend ceiling GG names. Suggested wording:
   „ნებას გაძლევ Video Core გავხსნა ყველა შესული მომხმარებლისთვის: AGENT_G_MEDIA_EXEC=on Production-ში, Veo-ს
   დღიური ლიმიტი $N".

D1–D12, B3–B7 do not block either step; they stay as they are unless GG decides otherwise.
