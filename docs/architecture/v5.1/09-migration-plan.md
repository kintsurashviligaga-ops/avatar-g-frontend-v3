# 09 — Migration plan

Each step is a separate PR and a separate founder approval unless it is listed as already approved. Order respects
dated Google retirements first, then money safety, then capability.

## 1. Dated deadlines (drive the order)

| Date (UTC) | Event | Step |
|---|---|---|
| 2026-11-13 | Argon >32K completions billed on timeout | none needed now (Argon not used; D-06) |
| 2026-11-17 | Developer API shutdown of `gemini-2.5-flash-preview-tts` | M-0a (#288) |
| 2026-11-19 | Vertex retires `gemini-3.6-flash` | M-0b (#289) |
| 2026-11-30 | Argon promo ends | M-5 price book before D-06 lifts |
| 2026-12-12 | Browser snapshot `snap_8jPItZEB…` expires | M-0c refresh by 2026-12-05 |
| 2026-12-13 | Vertex retires `gemini-live-2.5-flash-native-audio` | **M-2 Live → 3.8-live by 2026-12-06** |
| 2026-12-31 | 3.8 Flash / 3.8 TTS promos end | M-5 credit review |
| 2027-01-28 | Vertex retires `gemini-3.7-flash` | M-1 registry alarm (T-45 = 2026-12-14) |

## 2. Steps

| Step | What | Depends on | Approval | Proof of done |
|---|---|---|---|---|
| **M-0a** | read-aloud default → `gemini-3.8-flash-tts`, legacy kept as env rollback | — | **approved** (D-02) | #288 merged, prod health 6/6, GG's plan-3 probe: 3.8 TTS Georgian 200 + Chirp round-trip |
| **M-0b** | remove `gemini-3.6-flash` from chat/STT/Live/premium chains | — | **approved** (card 09:44Z) | #289 merged, prod health, no 3.6 id in served chains (grep test) |
| M-0c | browser snapshot refresh + calendar reminder | — | operational (D-10 pattern) | new snapshot id in env, Chromium + Georgian check exit 0 |
| M-1 | capability registry v1: `config/google-lifecycle.json`, `capability_state`, CI guard (fails build when a served model retires ≤ 21 days), alarms T-45/T-7 | — | needs GG | CI guard red on a fixture with a near date; `/api/capabilities` read-only |
| **M-2** | Live relay → `gemini-3.8-live` (drop 2.5 native-audio), relay redeploy, prompts re-tuned | M-1 helpful, not required | needs GG + small paid Live budget | Georgian call E2E on myavatar.ge by GG before 2026-12-06 |
| M-3 | Omni `gemini-omni-1.1-flash-preview` → `gemini-omni-1.2-flash` (Interactions) | — | **approved** D-07 (paid ~$2) — schedule in Phase 2 | create + continue clip E2E; 7-day chaining window noted (C4) |
| M-4 | VALIDATE stage: engine checks registry entitlement/lifecycle/audience before quote | M-1 | needs GG | step with retired model → `capability_unavailable` before any reserve |
| M-5 | price book `price_versions`, worst-case reservation, `billedOnFailure` settlement, promo `valid_to` alarms | M-1 | needs GG | ledger tests on real Postgres; no balance change in prod |
| M-6 | staging: separate Supabase project + Vercel env "staging" with own wallet; Previews point to it | — | needs GG (cost of second project) | paid tests run on staging, prod DB untouched |
| M-7 | approval center: one `approvals` table/API for all A2/A3 actions (wraps `lib/agent/approval.ts`) | M-4 | needs GG | voice/tap/panel approvals all produce the same record |
| M-8 | parallel DAG execution (3 workers/run, 1 sandbox/user), pause/resume/cancel | M-4, M-7 | needs GG | E2E with two parallel steps + cancel |
| M-9 | reconciliation: Cloud Billing export + labels + daily report | M-5; owner enables export | needs GG | first daily report with drift figure |
| M-10 | legacy ledger retirement | **B-02 data from GG** | needs GG | 8 callers on canonical ledger; `credits` writes stopped |
| M-11 | BOG sandbox certification | B-03 creds | Phase 5 | sandbox run green incl. replay |
| M-12 | Gemini 4 Carbon/Argon for deep tasks | M-5, D-06 lift | needs GG | quote shows worst-case incl. timeout; paid probe within budget |
| M-13 | Computer Use pilot (only if `12` recommendation is accepted) | M-7, D-08 | needs GG | admin-only pilot behind flag |
| M-14 | prune dead paths: Imagen 4 opt-in, legacy vendor routes, CSP legacy hosts, 2.5 labels in `chatModes.ts` | — | needs GG | grep tests |

## 3. Phase grouping (proposal)

- **Phase 2 (models + safety, near deadlines):** M-0c, M-1, M-2, M-3, M-14.
- **Phase 3 (engine):** M-4, M-7, M-8.
- **Phase 4 (staging):** M-6.
- **Phase 5 (money):** M-5, M-9, M-10, M-11, M-12.
- **Later:** M-13.

M-2 is the only step after Phase 1 with a hard external date; it should not wait for the rest of Phase 2.
