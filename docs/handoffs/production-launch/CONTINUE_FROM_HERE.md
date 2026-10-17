# Production launch certification: continue from here

Updated 2026-10-17 ~08:55Z by the certification thread ("Production E2E და გაშვების სერტიფიკაცია").

| Field | Value |
|---|---|
| Current phase | Service sweep: GG's two chat reports of 07:39Z ("make it better" and the Georgian talking avatar) fixed in the next PR |
| Branch | `claude/production-launch-certification-u2s9hy` (continues from main after #87 by a merge, no force-push) |
| Main SHA | `6b02fb54` (PR #87 squash merge) |
| Production SHA | `6b02fb5`, `dpl_ErD4amVXoEEbHio1kFvFN7BcxCSS` (READY 06:25Z 2026-10-17); rollback target `dpl_55TeQMG894UCehXedFaFBfPpzaEX` (a71dacf with the new ElevenLabs key) |
| Last successful test | Local jest, `tsc`, `eslint` and the Playwright specs listed in the PR, on this branch |

## GG's two reports (07:39Z 2026-10-17) and their root causes

| Report | Root cause | Fix |
|---|---|---|
| After a delivered 4 s film, "უკეთესად გააკეთე" started a different film | The Video mode stays on after a film, and the focus gate read the two words as a new brief; the single-clip film bubble kept no brief to improve (`remixCarry` only when ≥ 2 clips landed); `isAffirmation` even read "make it better" as a yes | `lib/chat/refineRequest.ts` recognises a short improve request with no new subject; the studio plans the SAME brief again (same length, frame, references) with an "improve" clause; the board is free and nothing renders before Generate. An image refine gets a card at one image's price; an avatar refine gets a retake card at the avatar's price |
| "შექმენი ავატარი რომელიც ამბობს ქართულად: …" ended on "ეს ხელსაწყო დროებით შეჩერებულია" | With no photo and no preset picked, the avatar went to the HeyGen presenter (`/api/heygen/presenter`), which the Google-only boundary refuses (503 `google_only`); the card also quoted 20 credits while Veo charges 25 | Where the Veo avatar is open to the caller (`GET /api/avatar/veo`), a ready presenter matched to the voice and frame is used; Agent G's card names the line, voice, face, frame and the Veo price; its yes starts the Veo avatar. HeyGen is never called |

GG's choice (tap 07:54:29Z): a Georgian line is spoken by ElevenLabs; Veo renders the person with no sound and the lips
follow the voice only approximately. The voice is made BEFORE the charge (no voice → 503 `voice_unavailable`; a line
longer than 8 s → 422 `speech_too_long`; nothing charged either way). The signed job id carries `::v`, and the status
route lays the line over the silent clip (`lib/avatar/voicedClip.ts`, ffmpeg traced for `/api/genjutsu/status`) before
it is shown and filed as an avatar in the Library. A voiced avatar is never delivered silent; one that never gets its
voice is refunded at the hard cap.

## Not proven yet

- A real Veo + ElevenLabs avatar in Production (needs GG's word on a priced card: 25 credits; admin is not charged;
  about $1 Vertex for an 8 s fast clip plus a small ElevenLabs charge).
- Real speech inside a paid film (PR #87's voice-first path) still waits on a priced card too.

## Deployed today (Production)

| PR | Change |
|---|---|
| #80 | Device fixes; Veo avatar (admin only) |
| #81 | Music video: one song under the clip |
| #82 | Frame chaining, speech timing, colour match |
| #83 | Per-scene storyboard frames, 429 backoff, `GEMINI_IMAGE_TRANSPORT` |
| #84 | Storyboard frame 4+; an outside click keeps the board |
| #85 | A chat yes starts image, music, film (storyboard), photoshoot, interior, product ad; one Image panel; Georgian film voiced by ElevenLabs; honest daily-limit messages; design card balance fix |
| #86 | Each film scene starts from the previous clip's real last frame |
| #87 | Film voice before render and charge, a declined scene re-sent once, closed services not offered, montage names the daily limit |

## Waiting on GG

- Deploy of the next PR (merge + Production), on a card.
- Optional: one priced paid avatar test, then one priced ad film to prove sound.
- Video Core public opening; public Lyria music; dubbing and deck prices; BOG items.

## Open defects

- Server salvage floor (`FILM_MIN_SALVAGE_CLIPS`, default 4) and client floor (2) disagree for a 4-scene film with 3 clips.
- Closing the window mid-render loses the render (and stops a chained film's later scenes).
- A storyboard frame's outfit can drift from the reference.
- Live call: re-check signed in once GG is at the Mac.

## Exact next action

Drive the next PR to green; ask GG on a card before deploying it, and before any paid avatar or film test.
