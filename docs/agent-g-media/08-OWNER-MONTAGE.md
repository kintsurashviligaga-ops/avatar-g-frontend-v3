# Agent G Media Studio — 08 The owner's montage message (2026-10-11 15:27Z)

GG's message on myavatar.ge, with five clips and one song:

> დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59
> წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს
> ქართულად უნდა დაიწეროს გადმოდი საიტზე

The card on Production (5481987) showed a plain montage only („5 clips · 1 music; 95 BPM · on the beat · music from
0:59; 12 shots · 29.7 s · 9:16 · free"): the speed changes, the overlay, the moving text and the end text were dropped
without a word. GG: „the card does not show the full task; verify, fix everything, do it well".

## 1. What the message now becomes (BUILT, T1 + T3)

One plan of two steps (`lib/agent/run/runChat.ts` `runChainAsk`, kind `cut-edit`), shown on one card before Start:

| Part of the ask | Where it is done | On the card |
|---|---|---|
| „სადაც საჭიროა ააჩქარე … შეანელე" | montage: speed ramps by the music (`beatPlan.ts` `rampSpeeds`): the calmest quarter of the shots at 0.5×, the strongest quarter at 1.5×; cuts stay on the beat (a shot's length on the master is unchanged) | „სიჩქარე მუსიკის მიხედვით: შენელება და აჩქარება"; after the quote „3 შენელ. 0.5× · 3 აჩქ. 1.5×" |
| „მუსიკა დაადე 0.59 წამიდან" | montage: the track from 0:59 at the first frame | „მუსიკა 0:59-დან" |
| „დაადე ოვერლეი" | edit: light-leak overlay (`overlayFx.ts`, FFmpeg only, free) | „ოვერლეი: თბილი სინათლის ანარეკლები" |
| „ქებშენი … ლამაზად დააწერე მოუშენით myavatar.ge🚀" | edit: a text layer, cinematic, sliding up, until 3 s before the end; the emoji drawn in colour (Twemoji, CC-BY 4.0, `TWEMOJI-LICENSE.txt`) | „„myavatar.ge🚀“ ქვემოთ, ბოლო 3 წამამდე (კინემატოგრაფიული, ქვემოდან შემოდის)" |
| „ბოლოს … გადმოდი საიტზე" | edit: a CTA text on the brand button, the last 3 s | „„გადმოდი საიტზე“ ქვემოთ, ბოლო 3 წამში (ბრენდის ღილაკი, ქვემოდან შემოდის)" |

Anything a montage message asks that the plan cannot do is now named on the card before Start, with the reason
(`lib/agent/media/askCoverage.ts`): transitions between shots, zoom/shake/glitch, a logo without its picture, captions
of the song's words (automatic transcription is a paid call: BLOCKED_OWNER), translation, a stretch cut from the
middle, a whole-video speed change. Nothing is dropped silently any more. „ქებშენი" in this message is read as the text
„myavatar.ge🚀" that follows it; captions of the song's words would be the paid transcription above.

Edits and montage stay free; no price, provider, flag or migration changed.

## 2. Proof on real FFmpeg (T3, `lib/agent/media/ownerMontage.ffmpeg.test.ts`)

GG's exact sentence, five synthetic 9:16 clips (12 s each; each clip's centre brightness counts its own seconds), one
2:00 song (a 1 kHz marker at 0:59.0–0:59.4, then 120 BPM kicks, quiet until 1:14 and loud after). The whole way:
chat → plan → montage quote → queue → worker → QC → stored file → edit quote → queue → worker → overlay QC → layers →
layer QC → stored file. Measured on the delivered files by the test's own frame reads:

- Plan: montage `{musicStartSec 59, ramp mixed}`, edit `[overlay light-leak, layers [myavatar.ge🚀, გადმოდი საიტზე]]`,
  nothing left out. Quote: 10 shots, 30 s, 9:16, 119.96 BPM, music from 59, ramp 3 slow / 3 fast, by energy.
- Montage: 900 frames (30 s at 30 fps), 720×1280; the marker heard at −6.9 dBFS in the first 0.36 s and silence
  (−91 dBFS) right after it: the song starts at exactly 0:59. QC PASS.
- Speed, measured from the pictures for each of the 10 shots: asked 0.5 / 1 / 1.5 → measured 0.50 / 1.00 / 1.50 on
  every shot, and each shot starts within 0.03 s of the source second its plan names. The three slow shots fall in
  the quiet part (master 3.5–12.5 s), the three fast ones in the loud part (21.5–30 s).
- Edit: 900 frames (every frame of the montage; see §3). Overlay QC PASS (diff 5.3 / 3.6 / 6.4, correlation
  0.97 / 0.99 / 0.95); the light reaches the top, middle and bottom thirds over the video. Layer QC PASS.
  „myavatar.ge🚀" 0–27 s, sliding up: the rocket's own red (215 px) and blue (475 px) are in the text box, none in
  the overlay-only reference and none in the last 3 s. „გადმოდი საიტზე" 27–30 s on the blue brand button, absent before.
- Contact sheets: `evidence-owner-montage/owner-montage-slow-normal-fast.jpg` (a slow, a normal and a fast shot) and
  `owner-montage-edit.jpg` (montage, then the edit at 8 s, 26.6 s, 27.4 s and 28.8 s). Numbers: `evidence.json`.

Re-run: `OWNER_MONTAGE_DIR=<dir> npx jest lib/agent/media/ownerMontage.ffmpeg.test.ts` (about 2 minutes).

## 3. Defects found and fixed on the way

1. The run's plan line crashed on a text/logo ask (`chainEditsText` read `layers` from an ask that only has `add`): on
   this branch (v2.1, never on Production) a montage + text message threw in the browser instead of showing the card.
   Now `askLine` / `layerAskLine`.
2. A logo plus one quoted text dropped the text; English „write "Summer"" was not read as a text. Fixed in `layerWords.ts`.
3. The layers' pass cut the picture at the end of the sound (`-shortest`): an AAC track ends ~0.02 s before its video,
   so the last 2 frames, the end text's, were lost (898 of 900). It now ends at the plan's length (`layerCompose.ts`).
4. The overlay QC refused a plain frame (black, a white wall, a clear sky) as „the picture is lost" (correlation of a
   flat frame is 0). A plain frame is now left out of that one check; it still counts for the overlay showing.

## 4. Not done (never reported as done)

- T4: GG on the Preview (06 §7). T5/T6: none. Production is unchanged (5481987) until GG's separate word.
- Captions of the song's words: BLOCKED_OWNER (paid transcription), as in 07 §6.
- Transitions, zoom/shake/glitch: not built; named on the card when asked.
- Known misread, not fixed here: „ბოლო 5 წამი" in a montage message is read as a 5 s montage length (`minePlanParams`).
