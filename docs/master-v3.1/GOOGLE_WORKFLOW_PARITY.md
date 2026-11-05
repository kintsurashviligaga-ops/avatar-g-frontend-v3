# Google workflow parity matrix (v2, Phase 6, 5 November 2026)

v1 (Phase 0, 22 October, draft PR #114) mapped each service against the Google AI Studio flow (prompt → configure →
approve → generate → preview → use/download) and found Developer API transports, unverified model ids and no
Google-native avatar. This v2 is the state on `d8420a5d` (= Production). "Studio reference behaviour" is the observable
flow, not Google's private implementation. Model status words follow `CAPABILITY_MATRIX.md`.

Since 2026-10-26 every service is started from one chat composer (the owner's "chat-first" request, #204 inside #209);
the per-service studios remain as the engines behind it.

## Lifecycle by service

| Step (v3.1 §2.1.1) | Music (Lyria) | Photo / Image | Video (Veo, Omni Flash) | Avatar (Live, Veo avatar) |
|---|---|---|---|---|
| Transport | Vertex only | Vertex only | Vertex only (Veo `us-central1`, Omni `global`) | Vertex Live via the EU relay; Veo on Vertex |
| 1. Intake (prompt kept) | chat brief → `buildMusicBrief`; song directions (lead vocal, language from the script, lyrics, structure) since #222 | prompt kept exactly; owner-scoped references | chat brief; photo becomes the first frame | built-in avatar picked in the call or preset |
| 2. Native controls only | instrumental / sung chip, length tier, genre, tempo; refused: covers, trained voices | one Google row, no size (#146, #147) | one clip 4–10 s, resolution 720p/1080p, aspect; no music-video, no extra toggles (#209) | persona and language; no custom avatar |
| 3. Approval with a price | chat card with the credit price, tap or a spoken "yes" | signed quote → job | price chip (✦28/42/55/69 at 720p, ✦42/62/82/102 at 1080p for Omni) → approve | Live: daily session allowance; Veo avatar: price before render |
| 4. Native submission | `:generateContent` (sync) | `generateContent` image | `:predictLongRunning` / `interactions` (background) | Live websocket via relay; Veo LRO |
| 5. Operation handling | idempotency mutex, replay refused, one reserve | jobs + lease | attempt journal, operation persisted, never resubmitted while polling | relay session cap (5 min avatar, 15 min session) |
| 6. Result delivery | silent-track QC, private Storage, Library, chat bubble kept after reopen (#223) | QC, versions, Library | QC, private Storage, Library, result bubbles saved as their own rows (#223) | in-call; Veo avatar → Library |
| 7. Reuse vs new spend | the same job id and body is a replay (409), a re-roll is a new job | versions | "continue" (`გააგრძელე`) extends the chat's clip as a multi-turn edit (#221), a new prompt is a new clip | — |
| Cancellation | Music Studio job cancel settles once (CI: Music Studio E2E); chat path stops at the reserve | job cancel | lease cancel; a provider-side LRO cannot be recalled | hang up ends the session |
| Owner-verified in Production | sung track 2026-10-26 | — | scenarios and continue 2026-10-26 | Live E2E 2026-10-26, iPhone 2026-10-31, boy preset 2026-10-31 |

## Gaps that remain against Studio parity

| Service | Gap | Why it is open |
|---|---|---|
| Music | Pro (up to 184 s) has no owner-verified run; ka/ru vocals are owner-accepted, not Google-documented | needs a budgeted run; Google's language list |
| Music | Music Studio v1 (quote → approve → job page) is off in Production; the chat path serves users | the owner has not asked to turn it on |
| Photo | `gemini-3.1-flash-image` has no contract fixture; mask editing and reference customisation have no separate verified contract | needs a budgeted contract call |
| Video | `veo-3.2-*`, `-preview` and `lite` ids exist in code without verification | they are not offered; delete or verify |
| Video | new dialogue on an uploaded speaking video | Omni keeps uploaded speech (unsupported) |
| Avatar | own-photo Live avatar; lip-sync to the user's own audio | `BLOCKED_EXTERNAL`; `CAPABILITY_UNAVAILABLE` |
| All | the catalog and capability registry describe some refused services as `live` and some engines by their old vendor | see `CAPABILITY_MATRIX.md`, last section |

## Acceptance evidence on this release candidate

- Contract and lifecycle tests for every service run in the full Jest suite (1118 suites, 0 failed, `VERIFICATION.md` §1).
- Browser: Preview-contract E2E (mocked providers), Image Studio browser acceptance, Music Studio and Video Core E2E on
  an isolated local Supabase, and the Phase 6 matrix (languages, sizes, keyboard/touch, reduced motion, guest
  boundary, fast navigation). Results per job in `VERIFICATION.md` §3.
- Live paid runs: only the owner-approved ones listed above. Nothing was bought to make a row look verified.
