# 13 — Google lifecycle facts fetched for Phase 1 (2026-11-12)

Official Google pages only. Fetched live through Firecrawl (`maxAge 0`) from this container; plain `curl` to Google
docs is blocked by the container proxy. Times UTC.

| ID | URL | Fetched | Page "last updated" | Result |
|---|---|---|---|---|
| P1 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions | 2026-11-12 ~09:40 | 2026-11-11 | **Full tables read** (Phase 0 blocker B-05 resolved) |
| P2 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/computer-use | 2026-11-12 ~09:40 | 2026-11-11 | read (query mode) |
| P3 | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/interactions/developer-guide | 2026-11-12 ~09:55 | — | search excerpt from the official page |

## 1. Vertex (Agent Platform) retirement dates that touch MyAvatar (P1)

| Model id | In MyAvatar | Release | Retirement | Replacement | Action |
|---|---|---|---|---|---|
| `gemini-3.6-flash` | chat Flash chain #2, mic Gemini fallback default, Live quick steps, premium estimates | 2026-07-21 | **2026-11-19** | `gemini-3.8-flash` | **removed from every default, PR #289** (GG card 09:44Z) |
| `gemini-live-2.5-flash-native-audio` | Live relay `LIVE_RELAY_MODELS` (first), `DEFAULT_LIVE_MODEL` is its `-latest` alias | 2025-12-12 | **2026-12-13** | `gemini-3.8-live` | Phase 2 backlog P0 (B-07) |
| `gemini-3.7-flash` | STT allowlist; chat chain #2 after #289 | 2026-08-13 | 2027-01-28 | `gemini-3.8-flash` | registry watch |
| `gemini-3.8-flash` | chat default, Agent G | 2026-09-02 | 2027-09-02 or later | — | OK |
| `gemini-3.8-live` | Live relay, talking avatar | 2026-09-24 | 2027-09-25 or later | — | OK |
| `gemini-3.5-flash` | chat chain #3, mic fallback default after #289 | 2026-05-19 | 2027-05-19 or later | — | OK |
| `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` | chat Lite chain | 2026-07-21 / 2026-05-07 | 2027-07-21 / 2027-05-07 or later | — | OK |
| `gemini-3.1-flash-image` | Photo | 2026-05-28 | 2027-05-28 or later | — | OK |
| `gemini-nano-banana-2.1` | not used | 2026-10-06 | none announced (short-term table) | — | Vertex id **confirmed**; candidate |
| `gemini-omni-1.2-flash` | not used (we call `gemini-omni-1.1-flash-preview`) | 2026-11-05 | 2027-11-05 or later | — | D-07 Phase 2 |
| `veo-3.1-generate-001`, `veo-3.1-fast-generate-001` | Video | 2025-11-17 | 2027-05-04 or later | `gemini-omni-1.2-flash` | OK, plan |
| `gemini-4-argon` | not used | 2026-10-13 | 2027-10-13 or later | — | D-06 gate |
| `gemini-4-carbon` | not used | 2026-11-10 | none announced (short-term table) | — | D-06 gate |
| `gemini-2.5-flash`, `-pro`, `-flash-lite` | names only in `lib/chat/chatModes.ts` labels | — | **2026-10-20 (passed)** | 3.8 / 3.5 Flash | not served by any chain (verify in Phase 2) |
| `imagen-4.0-*` | dead opt-in path | — | 2026-06-30 (retired) | — | prune (backlog) |

Not on P1 (previews and speech models are not in these tables): `gemini-omni-1.1-flash-preview`, `gemini-3.1-pro-preview`,
`gemini-3.8-flash-tts`, `gemini-2.5-flash-tts`, Lyria ids, Chirp 3, `gemini-3.5-transcribe-preview`. Their retirement
stays **UNKNOWN**; the capability registry (`04`) treats "no published date" as a reason to probe, not as "safe".

The page states: "While retirement timelines may be extended, they won't be moved to an earlier date than what is
listed", and short-term models get "at least 45 days to migrate" once a date is posted. That is the rule the registry's
alarm uses (`04` §5).

## 2. Interactions API retention on Vertex (P3) — correction to Phase 0

Phase 0 (`docs/audit/04` §14) recorded "store=true default, 55 days paid (7/14/28/55 configurable), 1 day free". That
came from the **Developer API** docs. The **Vertex** developer guide says: stored interactions "persist for 7 days and
are automatically deleted after that time" (a fixed 7-day TTL from `created`); `store=false` is stateless, Zero Data
Retention compliant, and disables `previous_interaction_id` chaining and `background=True`; `interactions.delete`
removes a terminal interaction early.

Conflict recorded as **C4** (Developer API vs Vertex). Effect on D-04 ("keep store=true, 55 days"): the decision stands
(keep `store=true`), but on our Vertex transport the window is **7 days**, so „გააგრძელე" (Omni continue) of a clip
older than 7 days cannot chain from Google's stored state. This matches the 7-day signed-link life (`WEEK_SEC`) already
in the chat history. Not verified at runtime.

## 3. Computer Use (P2)

See `12-computer-use-evaluation.md`. Launch stage and date are **not stated** on P2 (Phase 0 recorded "GA 10-30" from a
release-note excerpt; keep as MEDIUM confidence).
