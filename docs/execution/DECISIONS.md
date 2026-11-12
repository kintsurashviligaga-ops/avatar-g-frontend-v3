# Decisions (v5.1)

Updated 2026-11-12. "Taken" = recorded founder decisions this audit relies on. "Open" = founder decisions required.

## Taken (carried from project records; still in force)

| Date | Decision | Source |
|---|---|---|
| 2026-11-12 | v5.1 supersedes V4.0; this session = Phase 0 read-only only; stop for approval | founder message 2026-11-12 07:19Z |
| 2026-10-22 | Image engine = `gemini-3.1-flash-image`; server-side Cloud TTS allowed | v3.1 Phase 0 decisions |
| 2026-10-26 | A Georgian line → Gemini Omni at every length; Veo only without a Georgian line | founder card 10:55Z |
| 2026-10-31 | Live voice + talking avatar open to every user (non-admin 1 × 5 min/day) | #247 |
| 2026-11-01 | Mic engine = Chirp 3 for everyone, Gemini behind it | founder card |
| 2026-11-06 | Browser egress = public sites (deny private/metadata) | founder card 17:36Z |
| 2026-11-07 | Agent G autonomy with Google connectors; Premiere = XML export + cloud-browser login | founder cards 07:53Z, 08:02Z |

## Open — founder decisions required

| ID | Question | Recommended |
|---|---|---|
| D-01 | Approve Phase 1 (target architecture and migration plan, documents only)? | Yes |
| D-02 | Fix read-aloud now (B-01) as a small approved change before Phase 2, with one paid Georgian probe (~$0.05)? | Yes, it is dated (2026-11-17) |
| D-03 | Allow a free entitlement probe (`models.list` / `countTokens`, no generation) with production credentials for Carbon, Argon, Omni 1.2, Nano Banana 2.1, 3.8 TTS? | Yes |
| D-04 | Interactions retention policy: keep default `store=true` (55 days) for Omni continuation, or set a shorter retention / `store=false` where continuation is not needed? | Shortest retention that keeps „გააგრძელე" working |
| D-05 | Allow a Developer-API call path for Gemini Decision (it is not on Vertex)? | No for now; revisit if Vertex lists it |
| D-06 | Adopt Gemini 4 Argon/Carbon for Agent G deep tasks, given Argon ×2 price from 2026-12-01 and Carbon Vertex price unpublished? | Not before versioned pricing + timeout-cost rule (Phase 5) |
| D-07 | Plan Omni 1.1 preview → 1.2 Flash GA migration with a paid test (~$2)? | Yes, in Phase 2 |
| D-08 | Keep code run / browser admin-only until E2E proof? | Yes |
| D-09 | Use Google Computer Use (GA 2026-10-30) instead of / beside our Playwright browser? | Evaluate in Phase 1, no build before approval |
| D-10 | Remake the browser snapshot (B-04) before it lapses ~2026-11-13? | Yes |
