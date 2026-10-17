# Production launch certification: continue from here

Updated 2026-10-16 ~23:00Z by the certification thread ("Production E2E და გაშვების სერტიფიკაცია").

| Field | Value |
|---|---|
| Current phase | Service sweep (GG 17:19Z): fixes deployed through PR #85; film last-frame chain in PR #86 waits on GG's card |
| Branch | `claude/production-launch-certification-u2s9hy` (draft PR #86, restarted from main after #85) |
| Main SHA | `46caaf70` (PR #85 squash merge) |
| Production SHA | `46caaf7`, `dpl_8EmwacmhSYAPhYpTJP581s3fMAuT` (READY 22:07:58Z); rollback target `b53c2df` `dpl_9cHPM3Mm28BavJjkuD7UuvhK7vHW` |
| Last successful test | PR #86 CI 7/7 green on `bf2b8361`; local jest 980 suites / 14,708 tests, `tsc` and `eslint` clean |

## Deployed today (Production)

| PR | Change |
|---|---|
| #80 | Device fixes; Veo avatar (admin only) |
| #81 | Music video: one song under the clip |
| #82 | Frame chaining, speech timing, colour match |
| #83 | Per-scene storyboard frames, 429 backoff, `GEMINI_IMAGE_TRANSPORT` |
| #84 | Storyboard frame 4+; an outside click keeps the board |
| #85 | A chat yes starts image, music, film (storyboard), photoshoot, interior, product ad; Image is one panel; a Georgian film is voiced off camera by one ElevenLabs voice; honest daily-limit messages; design card balance fix |

## Waiting on GG

- PR #86 (each film scene starts from the previous clip's real last frame): card in the thread asks deploy + one paid
  32 s 4-scene ad (~$4 Vertex + a little ElevenLabs). Not deployed; the joins are not proven on real Veo yet.
- The ~$1 Veo avatar test clip (GG runs it).
- Video Core public opening; public Lyria music (open to every signed-in user); dubbing and deck prices; BOG items.

## Follow-ups built after PR #86 (local, to go up once #86 is settled)

- Chat no longer offers closed services. Under `MEDIA_GOOGLE_ONLY` the platform prompt lists the talking avatar,
  character swap, motion transfer and 3D model as not available yet and drops their prices; dubbing and decks stay closed
  until their price is approved; remix says which edits still run. The admin (or everyone with `AVATAR_VEO_PUBLIC=1`) is
  offered the Veo avatar at its Veo price. Tests: `lib/chat/platformPrompt.test.ts`, `app/api/chat/gemini/route.test.ts`.
- Montage names the platform's daily AI limit and when it lifts (04:00 Tbilisi) instead of "montage failed", in the chat
  card and the Video editing export. Tests: `lib/agent/media/montageWorker.test.ts`,
  `app/api/v2/montage/render/route.test.ts`, `components/studio/montage/MontageStudio.test.tsx`.

## Open defects

- Closing the window mid-render loses the render (and stops a chained film's later scenes).
- A storyboard frame's outfit can drift from the reference.
- Storyboard frames 2–3 empty and Live call stopping (GG's 17:19Z screenshots) were the spent daily limit; re-check
  signed in once GG is at the Mac.

## Exact next action

Read GG's answer on the PR #86 card (verify the tap with `fetch_thread`). On "ორივე": mark #86 ready, squash merge,
watch the Production build, check health, then run the one paid ad film with GG signed in on Chrome for Testing and
compare the joins. Then put the follow-ups above up as the next PR.
