# 11 — Prioritized backlog

P0 = production breaks or money lost soon · P1 = safety/money correctness · P2 = capability · P3 = cleanup.
Each item needs its own founder approval unless marked **approved**.

| # | Pri | Item | Why / deadline | Migration step | Size | Status |
|---|---|---|---|---|---|---|
| 1 | P0 | Read-aloud → 3.8 Flash TTS | 2.5 preview TTS 500s; Developer API shutdown 2026-11-17 | M-0a | S | **approved**, PR #288 |
| 2 | P0 | Remove `gemini-3.6-flash` | Vertex retirement 2026-11-19 | M-0b | S | **approved**, PR #289 |
| 3 | P0 | GG runs plan-3 probe (3.8 TTS Georgian + D-03 entitlement checks) | proves #1 on real Vertex; ~$0.02 | — | XS | waiting on GG (Terminal) |
| 4 | P0 | Live relay → `gemini-3.8-live` | 2.5 native-audio retires 2026-12-13 (B-07); target 2026-12-06 | M-2 | M | needs GG |
| 5 | P0 | Browser snapshot refresh | expires 2026-12-12; refresh by 12-05 | M-0c | XS | operational |
| 6 | P1 | Legacy ledger: act on GG's `01_introspect.sql` result | two ledgers, possible free/double charge (B-02) | M-10 | M | waiting on GG data |
| 7 | P1 | Capability registry v1 + CI retirement guard + alarms | stops the next silent retirement | M-1 | M | needs GG |
| 8 | P1 | Price book + promo end alarms | Argon promo ends 11-30; Flash/TTS 12-31 | M-5 | M | needs GG |
| 9 | P1 | Billed-on-failure settlement + worst-case reservation | timeout-is-billed from 11-13 (Argon) | M-5 | M | needs GG; prerequisite for D-06 |
| 10 | P1 | Staging Supabase project | Previews share prod DB + wallet | M-6 | M | needs GG (cost) |
| 11 | P1 | Cross-user access matrix test | isolation not proven by a matrix | S-1 | S | needs GG |
| 12 | P2 | Omni 1.1 preview → 1.2 GA | GA model, preview risk | M-3 | M | **approved** D-07 (Phase 2, ~$2) |
| 13 | P2 | VALIDATE stage in engine | no entitlement/lifecycle check before quote | M-4 | M | needs GG |
| 14 | P2 | Approval center (one record type) | A2/A3 approvals scattered | M-7 | M | needs GG |
| 15 | P2 | Reconciliation with Cloud Billing export | no real-cost check | M-9 | M | needs GG + owner enables export |
| 16 | P2 | BOG sandbox certification | never run (B-03) | M-11 | M | Phase 5, creds from GG |
| 17 | P2 | Parallel DAG, pause/resume/cancel | Manus-like runs | M-8 | L | needs GG |
| 18 | P2 | Computer Use measurement pilot (10 tasks, < $1) | D-09 evidence | M-13 prep | S | needs GG |
| 19 | P2 | Gemini 4 Carbon/Argon for deep tasks | quality | M-12 | M | blocked by D-06 until #8, #9 |
| 20 | P2 | Nano Banana 2.1 as Photo candidate | GA on Vertex, no retirement posted | — | S | needs GG + paid compare |
| 21 | P3 | Prune Imagen 4 path, legacy vendor routes, CSP hosts, 2.5 labels in `chatModes.ts` | dead code | M-14 | S | needs GG |
| 22 | P3 | Safety identifier + AI-content label | abuse handling, disclosure | S-14/S-15 | S | wording from GG |
| 23 | P3 | Privacy text: Google keeps call state 7 days (C4) | accuracy | S-13 | XS | wording from GG |
| 24 | P3 | Signed link 7-day expiry for old chat media | old clips stop playing | — | S | offered earlier |
