# Video Core v1.0 — final certification (2026-10-15)

On the owner's brief of 2026-10-15 15:02:41Z ("VIDEO CORE v1.0 FINAL PRODUCTION CERTIFICATION & RELEASE") and the
daily Veo ceiling GG chose at 15:29:42Z ("$10").

Evidence labels: **PROVEN_PRODUCTION** (seen on myavatar.ge), **PROVEN_REAL_PROVIDER** (a real Google call),
**PROVEN_ISOLATED** (CI on a throwaway Supabase / Postgres, never Production), **PROVEN_MOCK** (unit tests with mocked
providers), **UNVERIFIED**, **BLOCKED**. A mock never proves a live provider or a payment.

## Verdict

**CONDITIONAL GO.** Video Core v1.0 is released and its paying-user path is now proven once in Production: an ordinary
(non-admin) account paid 50 credits for one 16 s, two-scene film on Vertex Veo, was charged exactly once, and received a
clean 1080×1920 MP4 in its Library. The conditions:

1. The storyboard put an uninvited person into the film (§12, D-C1). The fix is built and tested (PR #73) and is
   shipped to Production on the brief's defect-fix permission once its CI is green; until then the defect is live.
2. Opening Agent G's paid media lanes to everyone (`AGENT_G_MEDIA_EXEC=on`) is a separate decision of GG's and was not
   made here (§14).
3. What Google actually billed for the test is not visible from here yet (§7, UNVERIFIED).

Not claimed: a certified public launch of Agent G's media lanes, creative quality beyond what §8 describes, or any bank
movement (no BOG payment or refund was made).

## 1. main SHA

`f498ee27da7a878057835b9fe44db9053d878125` (merge of PR #71). PROVEN_PRODUCTION: `/api/health` answered
`commit: f498ee2` before and after the paid film (runner steps P1, P2, 16:09Z).

## 2. Merged PRs (Video Core)

#58 (e46c35c), #63 (fef867a), #69 (b46bb44), #71 (f498ee2). Open: #73 (this document, the browser evidence, the
storyboard fix D-C1). Untouched: #68 Voice v2, #60 Image Studio, the BOG PRs.

## 3. Deployment

`dpl_53tGzqumFicBQPEvpHxJHzwpvNs7`, READY 2026-10-15 15:57:55Z, Production, Vertex transport, daily ceiling on.
Rollback: Vercel **Instant Rollback** to `dpl_5kNkFQWWfxju5Q4V1FBVpi92ako5` (4fc0377, PR #70); never a Redeploy of old
code (`ROLLBACK_AND_RECOVERY_PLAN.md`).

## 4. Tests and CI

| Gate | Where | Result | Label |
|---|---|---|---|
| tsc, jest (incl. API security guard), next build | CI run [38760758242](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38760758242) on 04a5664 (PR #71 head) | success | PROVEN_MOCK |
| Live E2E on a throwaway Supabase, desktop + iPhone 13; schema baseline with RLS / RPC / triggers / storage / billing checks; anon-key exposure check | run [38760758620](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38760758620), job "live E2E" | success | PROVEN_ISOLATED |
| Ledger, lease queue, ffmpeg runs, outbox on Postgres 16 + PostgREST (film billing, 20 parallel presses → one charge) | same run, job "billing on real Postgres" | success | PROVEN_ISOLATED |
| Preview contract E2E | run [38760758549](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38760758549) | success | PROVEN_MOCK |
| Playwright Video Core suite, desktop + mobile, on f498ee2 | local run, 2026-10-15; screenshots in `evidence/t2-round3-final/` | exit 0 (only `test.fail` cases marked ✘) | PROVEN_MOCK |
| BOG read-only smoke after the deploy | run [38765032221](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38765032221) on f498ee2 | success | PROVEN_PRODUCTION (read-only) |
| D-C1 fix: tsc, eslint, the storyboard suites, full jest | local, then CI on PR #73 | see PR #73 | PROVEN_MOCK |
| HawkScan DAST | — | not run: `HAWK_API_KEY` is not set (B7) | BLOCKED |

## 5. Non-admin Production E2E

PROVEN_PRODUCTION + PROVEN_REAL_PROVIDER. Runner on GG's Mac (Chrome for Testing, fresh profile, deleted when it stopped),
GG signed in by email code as the ordinary test account (`isAdmin: false`, not a founder address).

| Step | Time (UTC) | What was seen |
|---|---|---|
| Sign-in | 16:08:56 | user present, not admin |
| Preflight | 16:09:03 | f498ee2; engine `transport: vertex`, `googleOnly: true`, `dailyCap: true`; balance 50; free films left 1 |
| Video panel | 16:09:39 | Veo 3.1 Fast, sound on, music off, 0:16, Generate price 50 = sheet price 50 |
| Storyboard | 16:10:13 | 2 scenes, tiles "⏳8s" each, script model `gemini-3.8-flash`, 2 frames |
| Generate pressed (once) | 16:11:15 | one dispatch |
| Debit | 16:11:18 | one `usage` row, −50 |
| Clips | 16:13:15 / 16:13:45 | scene 1, then scene 2 succeeded |
| Assemble | 16:16:09 | HTTP 200, one call, QA and vision QA ran |
| Delivered | 16:16:10 | 295 s wall clock |
| Preview and download | 16:16:37 | plays (readyState 4, 16 s); the download is byte-identical to the delivered file |
| Library | 16:16:38–16:16:50 | saved, listed (API and page) |
| Status | 16:16:42 | durable, phase `assembled` |
| After | 16:17:02 | balance 0; free films left 1 |

No 5xx, no page error, no runner error.

## 6. Credits actually deducted

**50**, exactly the server quote (`videoCredits`, 16 s Fast). Balance 50 → 0. History: one row, `usage −50` at
16:11:18.652Z, after the 2026-10-08 `bonus +50`. The stitch charged nothing (the film was already paid:
`filmAlreadyBilled` → `skipBilling`), so there is no second row. The free-film slot was not used (1 before, 1 after).
No card, no subscription, no BOG movement. PROVEN_PRODUCTION.

Not read directly: the `filmpay:<token>` ledger row and the `film_billing` row. They need a read-only Production SQL query
(GG's SQL Editor, `FINANCIAL_INTEGRITY_REPORT.md` §4). The user-visible history and balance agree with exactly one
debit of 50. UNVERIFIED at row level.

About the assemble response's `freeFilm: true`: on a paid film it means "this stitch is covered by the payment", not
"the free film was used" (the slot stayed at 1, and the failure path returns nothing for a covered stitch:
`app/api/video/assemble/route.ts` compensate returns before `restoreFreeFilm` when billing was skipped). No screen reads
the field. A misleading name only (D-C4).

## 7. Vertex billing evidence

- Transport: Vertex (engine read-out, both before and after). Model `veo-3.1-fast-generate-001`, `us-central1`, WIF,
  no key. PROVEN_PRODUCTION (read-out) + PROVEN_REAL_PROVIDER (two clips came back).
- List price: 2 × 8 s at 1080p with audio, $0.12/s → **≈ $1.92**. INFERENCE (the clips are 1080×1920, which is the
  1080p tier). Within the $2 limit.
- What Google billed: **UNVERIFIED.** Cloud Billing shows usage with a delay and this session has no GCP read access;
  GG can see it under Billing → Reports, filter "Vertex AI", 2026-10-15.
- Storyboard images and the script ran on the Gemini API (two frames, one portrait, a few text calls): cents, not Veo.

## 8. Multi-scene evidence

PROVEN_PRODUCTION (ffprobe / ffmpeg on the downloaded files):

- Final film: 16.0 s, 480 frames, 30 fps, 1080×1920, H.264 High, AAC 48 kHz stereo, 15,640,920 bytes,
  sha256 `015f92ce…8e16`. No decode errors, no black, no freeze, no timestamp gaps or repeats, no identical consecutive
  frames, no silence; mean −15.4 dB, peak −1.5 dB. One cut, at 8.0 s.
- Scenes: 8 s each, 192 frames at 24 fps, 1080×1920, AAC.
- Order: the film at 1 s matches scene 1 (0.894) not scene 2 (0.587); at 9 s it matches scene 2 (0.895) not scene 1
  (0.626).

Visual inspection (contact sheet and the frames either side of the cut, `Q-*.png` on the runner): the boat, the pond,
the dock and the grey cat are there in both scenes. **Defects seen:** a woman the brief never mentioned appears in both
scenes (top right of scene 1; standing on the dock at the start of scene 2) — D-C1, root cause in §12. The light also
jumps from a sunset silhouette to a misty daylight morning at the cut (D-C2). A technically clean MP4 is not a claim of
creative quality.

## 9. Refund, recovery and idempotency (Phase 4)

No extra Vertex spend; nothing here touched a bank. Media-credit refunds only (never BOG refunds).

| Brief's case | How it is handled | Evidence | Label |
|---|---|---|---|
| Provider failure | every scene refused at dispatch → full refund once on `filmpay:<t>:refund` | `lib/chat/filmUpfrontCharge.test.ts` (R3 rows 3, 13) | PROVEN_MOCK |
| Scene refund once | a scene Google failed after accepting it → its share back once on `:refund:scene:<n>`, server-checked | `lib/chat/filmSceneRefund.test.ts`, `filmPollSceneRefund.test.ts`, `filmSceneRefund.pg.test.ts` | PROVEN_MOCK + PROVEN_ISOLATED |
| Partial failure | refused scenes' share refunded once; the film goes on | `filmUpfrontCharge.test.ts`; PG "partial refund net" | PROVEN_MOCK + PROVEN_ISOLATED |
| Interrupted render | stitch lease 660 s lapses → waiver back; abandoned tray rows reaped after 30 min | `lib/chat/filmBilling.pg.test.ts` (crash recovery, lease); `app/api/cron/drain-renders` | PROVEN_ISOLATED |
| Redis down | film billing: the durable table decides, a paid film with no witness STOPS (no second charge); daily ceiling: the ledger decides, neither readable → refused | `lib/chat/filmBilling.test.ts` (DEFECT 44), `filmBilling.pg.test.ts`; `lib/veo/dailyCap.test.ts` | PROVEN_MOCK + PROVEN_ISOLATED |
| Duplicate Generate | same start key → one claim; 20 parallel presses → one charge | `filmUpfrontCharge.test.ts`; `filmBilling.pg.test.ts` "20 parallel presses → one claimed" | PROVEN_ISOLATED |
| Duplicate Assembly | 20 parallel stitches on two instances → one waiver, 19 busy, nothing charged | `filmBilling.pg.test.ts` | PROVEN_ISOLATED |
| Worker restart / cold instance | the instance without the cache stops instead of billing; a lost row is rebuilt from the ledger | `filmBilling.pg.test.ts` (two instances, self-heal); `filmStatusStore.instances.test.ts` | PROVEN_ISOLATED |
| Lost status | durable status (Upstash) across instances; this film's status was `durable: true` | `filmStatusStore.test.ts`; runner P10 | PROVEN_MOCK + PROVEN_PRODUCTION |
| Failed upload | render failure → waiver back, saga compensates once, retry free | `lib/orchestrator/assembleQcGate.test.ts` | PROVEN_MOCK |
| QC failure | nothing hosted, film FAILED, waiver back, retry free | `assembleQcGate.test.ts` | PROVEN_MOCK |
| Retry after completion | a replay of the same film is not charged again; stitch free while a waiver is left; a new Generate is a new film | `filmUpfrontCharge.test.ts`, `filmBilling.pg.test.ts` | PROVEN_MOCK + PROVEN_ISOLATED |

R3 (refund of a scene Google failed) is intact and in Production since b46bb44 (PR #69); no scene failed in this film,
so it has not been seen live. `R3_REFUND_MATRIX.md` row 5 now says so (it still read "not in Production").

## 10. Security and RLS

- Migration 20261014a in Production: `film_billing`, `film_scenes` with RLS on, no policies, six SECURITY DEFINER
  functions with `search_path=public`, closed to anon/authenticated (read from GG's screen at ~11:32Z). PROVEN_PRODUCTION.
- RLS 52/52 on the application tables (earlier audit); the isolated run re-checks RLS, RPC, triggers and storage on a
  throwaway stack. PROVEN_ISOLATED.
- Every storyboard mode is signed-in only (`app/api/film/storyboard/auth.test.ts`). `/api/admin/veo-budget` answers 404
  to anyone but an admin. Admins are never billed; the test account was not an admin. PROVEN_MOCK.
- No secret was read, printed or committed; the runner redacts signed URL tokens.

## 11. Agent G and One Window

- One Window Video panel → storyboard → Generate (with its price) → render → Library: PROVEN_PRODUCTION (this film).
- Chargeable actions need an explicit press: the debit came 3 s after the Generate press, never before. A spoken yes
  cannot bypass billing: `start_generation` needs the user's own words after the price, a cancelable countdown, a server
  record, and then runs through the studio's own paid path (`lib/voice/liveTools.ts`, `liveTools.test.ts`). PROVEN_MOCK.
- Agent G's media lanes (montage, edit, audio) stay `AGENT_G_MEDIA_EXEC=admin` in Production; the admin chat montage was
  proven earlier. PR #68 (Voice v2) is not part of this release.
- Credits, Supabase, Storage, FFmpeg, Library: each was on the path of this film (§5, §8). PROVEN_PRODUCTION.

## 12. Unresolved defects

| # | Defect | Severity | State |
|---|---|---|---|
| D-C1 | A brief with no person ("a red paper boat… a grey cat watches") got an invented woman in both scenes. Cause: the storyboard always drew a "character reference portrait" (`characterAnchor`) when no photo was uploaded; the image model can only answer that with a human, and every frame was then drawn "featuring the EXACT same person as the reference image", so the woman went into the frames and from the frames into the Veo clips. The script agent itself had it right (its locked character was the cat). | High (creative, user-visible, paid) | **Fixed in PR #73**: one Gemini check before the portrait (`lib/chat/storyPerson.ts`); a clear "no person" skips it and the frames are drawn from text alone; an unknown answer keeps the old behaviour. Tests fail without the fix and pass with it. Production after merge; a live storyboard check (no Veo, no credits) is pending the next sign-in. |
| D-C2 | Light and time of day jump at the cut (sunset silhouette → misty morning). | Medium (creative) | Open; each scene's start frame is drawn separately. |
| D-C3 | The studio's progress row for the film stayed `running` after delivery; the runner closed the page ~50 s after delivery. The Library row is `completed`. Probable cause: the post-delivery steps had not settled when the page closed (INFERENCE). No money effect (the row carries no reserve); the tray hides it after 30 min. | Low | Open, cause unverified. |
| D-C4 | Assemble's `freeFilm: true` on a paid film is a misleading name (§6). | Cosmetic | Open. |
| D-C5 | The film's score prompt repeats the style word ("cinematic, cinematic"). | Cosmetic | Open. |

D1–D12 and B3–B7 stand as recorded in `DEFECT_REGISTER_FINAL.md`.

## 13. Daily spend protection

`VEO_DAILY_LIMIT_USD=10` in Production (GG's choice). Every Veo submit reserves the clip's price first in one Redis
script; racing films cannot pass $10 together; the day is seeded from the ledger; Redis down → the ledger decides;
neither readable → refused; a refusal is a non-retryable `quota` failure that refunds the scene at dispatch. The engine
reports `dailyCap: true` in Production (PROVEN_PRODUCTION, before and after the film). Behaviour: PROVEN_MOCK
(`lib/veo/dailyCap.test.ts`, `lib/veo/engine.test.ts`). The counter's value today: UNVERIFIED (admin-only read-out at
`/api/admin/veo-budget`). Google budget alerts remain an extra, not the control.

## 14. Public access

Films were already open to every signed-in user with credits before this release; their clips go to Vertex since
b46bb44 and are now under the $10 daily ceiling. Unchanged: `AGENT_G_MEDIA_EXEC=admin`, director off, BOG admin-only,
prices. Opening Agent G's media lanes to everyone is GG's separate word and was not given.

## 15. Rollback

Instant Rollback to `dpl_5kNkFQWWfxju5Q4V1FBVpi92ako5` (4fc0377). To stop Veo spend without a rollback: set
`VEO_DAILY_LIMIT_USD` to a tiny figure (or `GEMINI_VEO_ENABLED=off`) and Redeploy the current Production deployment
(same commit, new env). After the D-C1
merge, its own deployment becomes the newest and f498ee2's (`dpl_53tGzqum…`) the rollback target.

## 16. GO / CONDITIONAL GO / NO-GO

**CONDITIONAL GO** for Video Core v1.0 as released (signed-in users with credits, admin-only Agent G media lanes),
on the three conditions at the top. **NO-GO** for calling Agent G's paid media lanes publicly launched until GG gives
that word.

## 17. Addendum: the ad film test (GG, 16:49Z)

GG's ask of 16:49:10Z: fix everything, then make one 9:16 advert from GG's photo: an actor in a black T-shirt and black
jacket on a black background presents the MyAvatar.ge chat (scene 1) and explains Agent G taking a spoken task and
doing all of it (scene 2), in Georgian. That counted as GG's word for one paid run; GG's tap "კი, ერთხელ" at 19:47:34Z
allowed one more after the fix below reached Production. The photo stays on GG's Mac and in the studio's own upload;
it is not in GitHub or CI.

### Fixes shipped (each: CI green, merge commit, Production verified with `/api/health`, engine `vertex`, `dailyCap: true`)

| PR | main | Production | What |
|---|---|---|---|
| #73 | e1dbf30 | `dpl_4gYXPWEzruPweyCyonr6WXQT9X1o` | D-C1: no invented person in a storyboard without one (§12) |
| #75 | b21506b | `dpl_2bSktQyb9CrcLZZxWTyZNCd82PBG` | A photo-led advert keeps the brief's scene, clothes and light (the photo locks the face only); with Veo's sound on the actor says the typed lines in-clip (no narrator cue, no HeyGen talking head, no +20 add-on); music-video graphics only for music videos (probably the cause of D-C3; INFERENCE); the style word once (D-C5) |
| #76 | de15464 | `dpl_8qNq6QVjjM4sHy6assiYjPTD2KPm` | Defects 47/48: a film id from the client cannot take over another account's film (403 `film_not_owned` before any charge); a brief naming clothes or a background re-stages the photo (the check's token budget was too small) |
| #77 | 5517047 | `dpl_vKQqsez4BP8vRpi33HM8E3GGmBsR` (READY 20:46:39Z) | D-C6 below: the card names the scene Google declined, the rule and the code; the scenes that rendered are handed over; the server logs Google's reason |

BOG read-only smoke after #77: run [38804987664](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38804987664), success.
Rollback now: Instant Rollback to `dpl_8qNq6QVjjM4sHy6assiYjPTD2KPm` (de15464); never a Redeploy of old code.

### Run 1 (admin account, 19:29:11Z): no film

PROVEN_PRODUCTION + PROVEN_REAL_PROVIDER. GG signed in as the admin account (admins are not charged film credits).
The storyboard frames were black-on-black and not the raw photo. One press. Scene 1 rendered. Scene 2 came back from
Vertex with `raiMediaFilteredCount: 1` and support code **15236754**, which Google files under "Celebrity" (the filter
judged the face to look like a well-known person; scene 1 with the same face passed). Google states that blocked videos
are not billed. Credits 892 → 892. The daily ceiling kept the scene's reservation (conservative). List price of the one
rendered clip: 8 s × $0.12 ≈ $0.96 (INFERENCE; Google's bill not visible here).

**D-C6 (fixed in #77).** The studio said "Video generation failed — the service may be busy" and showed nothing of
scene 1. Cause: with `NEXT_PUBLIC_PARALLEL_CINEMA=1` (Production) the film runs as a queued job; the job's throw landed
in the studio's own catch, which painted the generic line over the honest reason already on the card. A rendered scene
of a failed film was also never shown. Now: the card reads, for example, "Google-მა სცენა 2 უარყო. მისმა ფილტრმა
ადამიანი ცნობილ საჯარო პირს მიამსგავსა (კოდი 15236754)." (KA/EN/RU, ≤ 160 characters), and the rendered scenes are
links under it. Tests: unit (`lib/veo/safetyCodes.test.ts`, `serviceManagerVeo.test.ts`, `filmPollSceneRefund.test.ts`,
`filmStudioClient.test.ts`; 178 suites, 3,363 tests) and a browser test on desktop and phone with and without the
queued mode; with the old throw restored the browser test fails showing exactly the Production card. PROVEN_MOCK.

Not controllable by us: Google's likeness filter. Not built (would touch billing; a proposal, not a fix): an automatic
retry of a declined scene, or re-rendering only the missing scene.

### Run 2

Admin account, paid button pressed once at 23:05:54Z (GG's consent 19:47Z, "yes, once"). Production: 5517047 (PR #77).

| What | Result | Label |
|---|---|---|
| Film | Not made: Google declined scene 1 (category "Celebrity", code 15236754); in run 1 it declined scene 2 | FAILED (Google's filter, not our code) |
| New card (D-C6, PR #77) | Named scene 1, the filter's reason and the code; "▶ Scene 2" offered below it | PROVEN_PRODUCTION |
| Server log | "[veo] scene declined by Google (Celebrity) …" with category and codes | PROVEN_PRODUCTION |
| Scene 2 (file) | 8.000 s, H.264 1080×1920 (9:16), 24 fps, AAC stereo; audio mean −22.1 dB, max −6.0 dB | PROVEN (technical) |
| Scene 2 (picture) | Black background, black jacket and tee, gesturing speaker, nothing else in frame | Matches the brief visually; a valid MP4 does not prove creative quality |
| Scene 2 (Georgian speech) | whisper medium could not transcribe it (degenerate repeated output) | NOT PROVEN |
| Credits | 0 (admins are not charged) | PROVEN |
| Cost | Vertex ≈ $0.96 for the rendered scene (estimate; Google does not bill blocked videos); today's reservations $6.16 of $10 | INFERRED |

Cause: in both runs Google's likeness filter reacts to the reference photo (the face), in a different scene each time. No setting on our side turns it off.

The "yes, once" consent is used up. Any further paid run needs GG's new word.

New low defects: D-C7, the film icon overlaps the text of the error card; D-C8, the decline log line repeats on every poll (6× for one operation).

Proposals (not built): re-render only the declined scene (touches billing, needs GG's decision); make the film without the photo, with an invented actor.

Still open: D-C2 (light jump at the cut); an English brief with "speaks"/"dialogue" still routes typed lines to a
narrator.

### Run 3 (no photo, invented actor): film made

GG chose "without the photo" on the decision card at 04:46:14Z on 2026-10-16: one more paid try, the same two scenes,
an invented actor. Admin account, Production 5517047 (PR #77). No photo was attached, so the studio made its own
Gemini character anchor (`googleOnly: true`, no other image provider) and used it for both frames and both scenes.
Gates before the press: preflight (Vertex, sound, daily cap on, director off), served commit, panel (9:16, 16 s, Fast,
sound on, music off, both lines typed, price 50), storyboard (anchor made, two frames, neither the raw anchor portrait).
Claude viewed both frames (same presenter, black T-shirt and black blazer, dark background, nothing else in frame),
then pressed Generate once at 05:15:20Z.

| What | Result | Label |
|---|---|---|
| Film | Delivered 05:19:26Z, 247 s after the press; both scenes rendered, one dispatch, no scene declined | PROVEN_PRODUCTION + PROVEN_REAL_PROVIDER |
| Vertex | Two `veo-3.1-fast-generate-001` operations, us-central1, 9:16, 8 s, 1080p (Production log 05:15:27Z) | PROVEN_PRODUCTION |
| File | 16.000 s, 480 frames at 30 fps, H.264 1080×1920, AAC 48 kHz stereo, 32.2 MB; no decode errors, no PTS gaps, no frozen or repeated frames; the downloaded file is byte-identical to the delivered one (sha256 7279b756…) | PROVEN (technical) |
| Sound | No silence; mean −16.7 dB, max −0.9 dB (scene 1 −17.3, scene 2 −16.1); no narrator, no music (the actor speaks in-clip) | PROVEN (technical) |
| Picture | The same invented presenter in both scenes, black T-shirt and black blazer, gesturing, nothing else in frame | Matches the brief visually; a valid MP4 does not prove creative quality |
| Georgian speech | Whisper medium, auto mode, detects the language of both scenes as Georgian (`ka`) but cannot transcribe it (degenerate output), so the words are not verified | PARTIAL |
| Library / history | Saved and listed in the Library; the film's status is `assembled`, durable | PROVEN_PRODUCTION |
| Credits | 892 → 892 (admins are not charged; the quote was 50) | PROVEN |
| Cost | Ceiling log: reserved $0.96 twice, today 2026-10-16 $1.92 of $10; Vertex list price 2 × 8 s × $0.12 ≈ $1.92 | Reservation PROVEN; Google's bill INFERRED |

Observations: scene 1 has a smoky dark-blue backdrop and scene 2 is near-black, so the background changes at the cut
(D-C2, still open); the first 4 frames (0.13 s) are black. Production errors in the window: only the known
`service_jobs` worker-tick line (a missing table, pinned by the schema-drift ratchet), nothing from this film.

Consistent with the cause given for runs 1–2 (INFERENCE from one run each way): with the reference photo Google's
likeness filter declined one scene each time; with an invented actor both scenes passed.

D-C7 (one icon on the error card) and D-C8 (a Google refusal logged once per operation) are fixed with regression
tests in PR #78.

The "without the photo" consent is used up. Any further paid run needs GG's new word.
