# Decisions (v5.1)

Updated 2026-11-12 (Phase 1). "Taken" = recorded founder decisions this audit relies on. "Open" = founder decisions required.

## Taken (carried from project records; still in force)

| Date | Decision | Source |
|---|---|---|
| 2026-11-12 09:24Z | Phase 0 approved. D-01 YES: Phase 1 = documents only (spec §22), stop for review | founder message |
| 2026-11-12 09:24Z | D-02 YES: read-aloud → `gemini-3.8-flash-tts` now + paid Georgian probe (~$0.05) | founder message → PR #288 |
| 2026-11-12 09:24Z | D-03 YES: free `models.list`/`countTokens` probes with prod creds, no generation | founder message → plan-3 |
| 2026-11-12 09:24Z | D-04 keep Interactions `store=true` for now (Vertex window = 7 days, C4) | founder message |
| 2026-11-12 09:24Z | D-05 NO Developer API (Vertex-only) | founder message |
| 2026-11-12 09:24Z | D-06 no Carbon/Argon until versioned pricing + timeout-cost rules (Phase 5) | founder message |
| 2026-11-12 09:24Z | D-07 YES Omni 1.1 → 1.2 in Phase 2, paid test ~$2 | founder message |
| 2026-11-12 09:24Z | D-08 code run + browser admin-only until E2E proof | founder message |
| 2026-11-12 09:24Z | D-09 evaluate Computer Use vs Playwright in Phase 1, no build | founder message → `docs/architecture/v5.1/12` |
| 2026-11-12 09:24Z | D-10 YES remake browser snapshot before 11-13 | founder message → done 09:35Z |
| 2026-11-12 09:24Z | B-02: do not touch legacy ledger code until owner's `01_introspect.sql` result; B-03 BOG creds at Phase 5; B-05 keep UNKNOWN, retry in Phase 1 | founder message |
| 2026-11-12 09:44Z | Retire `gemini-3.6-flash` now (small PR) | founder card → PR #289 |
| 2026-11-12 | v5.1 supersedes V4.0; this session = Phase 0 read-only only; stop for approval | founder message 2026-11-12 07:19Z |
| 2026-10-22 | Image engine = `gemini-3.1-flash-image`; server-side Cloud TTS allowed | v3.1 Phase 0 decisions |
| 2026-10-26 | A Georgian line → Gemini Omni at every length; Veo only without a Georgian line | founder card 10:55Z |
| 2026-10-31 | Live voice + talking avatar open to every user (non-admin 1 × 5 min/day) | #247 |
| 2026-11-01 | Mic engine = Chirp 3 for everyone, Gemini behind it | founder card |
| 2026-11-06 | Browser egress = public sites (deny private/metadata) | founder card 17:36Z |
| 2026-11-07 | Agent G autonomy with Google connectors; Premiere = XML export + cloud-browser login | founder cards 07:53Z, 08:02Z |

## Open — founder decisions required (Phase 1 review)

| ID | Question | Recommended |
|---|---|---|
| D-11 | Approve Phase 1 deliverables (`docs/architecture/v5.1/`)? | Yes |
| D-12 | Live relay → `gemini-3.8-live` (M-2) before 2026-12-06, with a small paid Live budget? | Yes, dated (2.5 native-audio retires 2026-12-13) |
| D-13 | Confirm lifecycle tail `VERIFY → DELIVER → SETTLE → RECONCILE` (PDF clipped)? | Yes |
| D-14 | Second Supabase project for staging (M-6)? | Yes, before Phase 5 money work |
| D-15 | Charge users for Google-billed failures? | No (we absorb, record as loss) |
| D-16 | Computer Use measurement pilot (10 tasks, < $1, admin-only)? | Yes, after Phase 2 |
| D-17 | Phase grouping in `09` §3 (Phase 2 = M-0c, M-1, M-2, M-3, M-14)? | Yes |
