# Agent G Media Studio v2.0 — 06 Handoff (phase 1)

- Branch `claude/agent-g-media-studio-v2-ekxxzp`, Draft PR #57 against `main` (not merged, not deployed).
- Preview of this branch: https://avatar-g-frontend-v3-git-032054-kintsurashviligaga-ops-projects.vercel.app
  (Vercel: Ready 13:55Z). It shares the Production Supabase project, like every Preview.
- Production is unchanged: it still serves 5481987 (PR #56). No migration, flag, price, secret or provider change.

## 1. Verdict

Phase 1 delivers the P0 timing and selection correctness the spec puts first, with real-ffmpeg proof (T3). It is
**not** a certified Media Studio: durable projects with revisions, 29+ file batches, silent exports, per-clip source
sound, targeted visual editing and the Veo reference flow are MISSING or BLOCKED_OWNER (00 §4, 03).

## 2. What changed for the user (BUILT, T3; T4 waits for GG)

1. „ჯამში 70 წამი" gives 70 s to the frame, or a refusal that says why (track ends too early: until m:ss; clips too
   short; more than 5 minutes). It is never shortened quietly.
2. „სიმღერა 0:58-დან" / „58-ე წამიდან" starts the song at exactly 0:58.
3. „მარტო ბოლო ხუთი", „მესამის გარდა", „მხოლოდ მე-2 და მე-5" (and EN/RU) choose the clips; the card names the
   files left out; the same words after a delivered montage plan it again from its files (new card, own Start).
4. Every montage job records `qc.outcome`, `qc.sources` and `qc.audio` (04).

## 3. GG's Preview check (T4) — about 5 minutes, admin account, NOT myavatar.ge

On the Preview link above, signed in as the admin (email code; Google sign-in on this new link needs the link in
Supabase Redirect URLs first):

1. Attach 7 short videos and one MP3 (the chat takes 8 files), write
   „ამ ვიდეოებით კლიპი გამიკეთე, მარტო ბოლო ხუთი გამოიყენე". Expect the card line „შენი თხოვნით არ ვიყენებ …"
   naming videos 1 and 2; press Start; the result shows only videos 3–7.
2. After it is delivered, write „სიმღერა 0:58-დან დაიწყე, ჯამში 20 წამი". Expect a new card (20 s, music from 0:58),
   Start; the result is 20 s and the song is heard from 0:58.
3. Write „სიმღერა 2:50-დან დაიწყე, ჯამში 30 წამი" (a song shorter than 3:20). Expect a new card that refuses and
   says the song must play until 3:20; nothing starts.

Typed wording that starts a montage: clips + one track and words about cutting, music or „კლიპი გამიკეთე"
(the last one recognised since this PR).

## 4. Owner decisions (each needs GG's separate word)

| Decision | Options |
|---|---|
| Merge PR #57 + deploy to Production | after the Preview check |
| Revision store (`media_revisions`, 01 §4) | apply the migration / keep re-plans prompt-based |
| 29+ files | segmented ingestion + a worker host beyond 600 s (paid infra) / keep 8 per message |
| Veo reference tests (E2E-09) | a per-test budget / keep BLOCKED_OWNER |

## 5. Tests in this phase

- Full jest: 852 suites / 12,903 tests passed, 0 failed (5 suites skipped: they need their own Postgres).
- After the last change (montageChat, intent, chatTurn) re-run: 174 / 174. tsc 0; eslint on changed files 0.
- Real ffmpeg: `mediaStudio.ffmpeg.test.ts` 3/3, `editLive.ffmpeg.test.ts` 9/9, `montageExec.ffmpeg.test.ts` green.
- Not run: HawkScan (no API key, no running app); Playwright (no UI change in this phase).

## 6. v2.1: captions, typography, overlays (same branch, same Draft PR)

Verdict: the v2.1 edits are **BUILT and PROVEN T3** (real ffmpeg, 16/16 scenarios, `07` §5, `evidence-v21/`). T4 (GG on
the Preview), iPhone/Safari playback and T6 are not run. Captions of what is *said*, translation and karaoke are
BLOCKED_OWNER (paid calls); removing what is printed in the source is UNSUPPORTED and refused by name.

### GG's Preview check for v2.1 (T4), same Preview link, admin account, NOT myavatar.ge

1. Attach one photo, write „აქ დააწერე: მიტანის სერვისი თბილისში". A card appears; press Start. The result carries
   exactly those words, and under it „შედეგზე შემოწმდა: …".
2. Write „ტექსტი უფრო პრემიუმ და მინიმალისტური გახადე." A new card, Start: the same words in a new look; the photo
   of step 1 stays as it was.
3. Write „ეს დიზაინი 9:16 სტორად გადააკეთე." A new card, Start: a tall picture, the words inside the frame.
4. Attach one video (8 s or longer) and write on one line
   „ქეფშენები დაადე: 0:00-0:02 გამარჯობა; 0:02-0:04 მიტანა უფასოა". Start: the lines show on their times; under the
   result the buttons SRT and VTT download the same lines.
5. Write „იგივე ვიდეო მომეცი ქეფშენებით და ქეფშენების გარეშე." Start: the result has a „ქეფშენების გარეშე" button.
6. Write „ბოლო სამ წამში ანიმაციური CTA ჩასვი: შეუკვეთე ახლავე". Start: the words slide in for the last 3 seconds.
7. Attach the video and a logo picture together, write „ლოგო ზედა მარცხენა კუთხეში დაადე". Start: the logo is top left.
   Then write „ზედა ლოგო მოხსენი". Start: the logo is gone, everything else the same.
8. On the iPhone, play one result in Safari.

### v2.1 owner decisions (each needs GG's separate word)

| Decision | Options |
|---|---|
| Captions of what is said (ElevenLabs Scribe) | a per-test budget for paid transcription / keep BLOCKED_OWNER (typed and .srt tracks work) |
| Translating a track (a model call) | allow it / keep BLOCKED_OWNER (a track typed in each language works) |
| Merge + deploy | together with the v2.0 phase 1 decision above, after the Preview checks |

### Tests for v2.1

- Full jest before the last fix: 854 suites / 12,954 tests passed, 0 failed (5 suites, 30 tests skipped: own Postgres).
- After the last fix (caption lines typed on one line): the affected suites re-run green (layerWords, editWords,
  editExec, chatTurn, bindLiveAgent: 205 / 205) and `composition.ffmpeg.test.ts` re-run: 16 / 16 (the evidence in `evidence-v21/` is from this run).
- tsc 0; eslint on the changed files 0. Not run: HawkScan (no API key, no running app); Playwright.


## 7. The owner's montage message (2026-10-11 15:27Z): the whole ask on one card

Verdict: **BUILT and PROVEN T3** (`08-OWNER-MONTAGE.md`): speed by the music on single shots (0.5× / 1.5×, measured
from the pictures), music from 0:59, the light-leak overlay, „myavatar.ge🚀" moving in (the rocket in colour) until 3 s
before the end, „გადმოდი საიტზე" in the last 3 s; anything not doable is named on the card. T4 and Production: not run.

### GG's Preview check (T4), same Preview link, admin account, NOT myavatar.ge

1. Attach five clips and one song (the song longer than 1:30), and send the same sentence as at 15:27.
2. Expect one card with two steps: the montage line ends „მუსიკა 0:59-დან · სიჩქარე მუსიკის მიხედვით: შენელება და
   აჩქარება"; the next line names the overlay and both texts. After a moment the montage line shows the numbers
   („… კადრი · … წმ · 9:16 · … BPM · მუსიკა 0:59-დან · N შენელ. 0.5× · N აჩქ. 1.5×").
3. Press Start once. The result: the song from 0:59, some shots slower and some faster, the warm light over it,
   „myavatar.ge🚀" sliding up at the bottom, and „გადმოდი საიტზე" on a blue button in the last 3 seconds.

### Tests for this change

- Full jest: 858 suites / 13,044 tests passed, 0 failed (5 suites / 30 tests skipped: own Postgres), including
  `ownerMontage.ffmpeg.test.ts` 1/1 and `composition.ffmpeg.test.ts`, `mediaStudio.ffmpeg.test.ts`,
  `montageExec.ffmpeg.test.ts`, `editLive.ffmpeg.test.ts` after the layers' length fix. `chatTurn.test.ts` (the owner's
  sentence → one run) added after that run: 62 / 62.
- New and changed unit suites: beatPlan, montagePlan, montageAsk, layerWords, askCoverage, runChat, runCard,
  montageChat, taskSteps, taskView, editChat, editWords, editPlan, overlayFx, emoji. tsc 0; eslint on changed files
  0 errors (14 old warnings in OmniStudio.tsx).


## 8. What the montage and the edit lacked (2026-10-11 17:38Z)

Verdict: **BUILT and PROVEN T3** (`09-CAPCUT-FEATURES.md`): a montage with no music (each clip's own sound), the clips'
own sound under a track, a recorded narration over the edit, photos alone; erasing a logo, a watermark, a text or
subtitles that stay in one place; transitions between shots; and the effects (light and colour, mirror, quarter turns,
zoom, shake, glitch, steadying, 9:16 over a blurred copy, background noise out, even loudness), in the chat, on Agent G's
last result and by voice. Not built: playing backwards, a blurred background behind a montage's shots. BLOCKED_OWNER:
removing a moving person / object / background (paid AI fill), narration from typed text (paid TTS). T4 (GG on the
Preview, 09 §4) and Production: not run.
