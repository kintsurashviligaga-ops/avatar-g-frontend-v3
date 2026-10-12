# Agent G Media Studio — 09 What the montage and the edit lacked (GG 2026-10-11 17:38Z)

GG, testing after PR #57's montage card:

> ეხლა ვამოწმებდი და მაგალითად თუ მუსიკა არ აუტვირთე ისე ვიდეოს დამონტაჟებას არ იწყებს, ასევე ვიდეოში სადმე რამე
> ტექსტი თუარის ან რამის წაშლა ამოღება ან მოშორება მინდა არ აკეთებს, ასევე სიტყვაზე ვიდეოში რომ იყის თავისი ხმაც და
> ზეკოდან მუსიკა დაედოს ან ნარაცია არც ამას აკეთებს, ქაფქათს და სხვა ფუნქვიებს რაც აკლია ისიც ჩასამატებელიაქვს და
> გასაკეთებელი რომ მომხმარებელს შეეძლოს სრულად გაკოყენება, ასევე სურათის მონტაჟსაც არ აკეთებს მაგალითად და ჯამში
> ბევრი ფუნქცია აკლია ამ მიმართულებით და ამ კატეგორიაში

Every part, where it is done, and the proof. All of it is FFmpeg on our own worker: free, no provider call, the
pricing table unchanged. Production (5481987) has none of it until GG's separate word; the Preview of PR #57 has all of it.

## 1. The asks and what they are now

| GG's words | Now | Label | Proof |
|---|---|---|---|
| „მუსიკა არ აუტვირთე ისე … დამონტაჟებას არ იწყებს" | No track: the clips are joined whole, in order, each with its own sound (`lib/services/montage/joinPlan.ts`); an asked length is binding | PROVEN T3 | `soundMontage.ffmpeg.test.ts` |
| „თავისი ხმაც და ზემოდან მუსიკა" | The clips' own sound leads, the track 10 dB beneath it (`montageSound`, one graph) | PROVEN T3 | own sound 0.0 dB, track −10.1 dB |
| „… ან ნარაცია" | A narration the user recorded (a second sound file): over the edit, the rest ducked under it; the edit grows to hold it when the pictures can, else the card says how much is not heard | PROVEN T3 | the rest ducked 18.7 dB |
| „სურათის მონტაჟსაც არ აკეთებს" | Photos alone: each 3 s with a slow zoom, or cut on the beat of a track | PROVEN T3 | photos in order, in their colours |
| „ტექსტი … ან რამის წაშლა ამოღება ან მოშორება" | `erase`: a logo, a watermark, a text or subtitles that stay in one place, filled from the pixels around (ffmpeg `delogo`), over the whole video or a stretch, on a video, a photo or a thumbnail | PROVEN T3 | `erase.ffmpeg.test.ts` E1–E4 |
| (same) a moving person, an object, the background | Needs AI fill (a paid provider call): said on the card and in the chat, never smeared over | BLOCKED_OWNER | — |
| „ქაფქათს … რაც აკლია" — transitions | Nine styles, a mix and a length, each paid for with footage the shots do not use, so beats and an asked length hold | PROVEN T3 | `transitions.ffmpeg.test.ts` |
| (same) — effects | §2 below: light and colour, mirror, quarter turns, zoom, shake, glitch, steadying, 9:16 over a blurred copy, noise out, even loudness | PROVEN T3 | `effects.ffmpeg.test.ts` F1–F12 |
| (same) — playing backwards | Not offered: ffmpeg's `reverse` holds the whole clip in memory. Said in the chat and named on a montage card | NOT BUILT | — |
| narration from typed text | ElevenLabs TTS is a paid call (and its voice probe is down since 2026-09) | BLOCKED_OWNER | — |

## 2. The effects (this change)

`lib/agent/media/editPlan.ts` gains seven edits and a third frame fit. Each is one plain `-vf` / `-af` step, so a phone
clip's rotation still applies; the plan has one order (steadied → turned → mirrored → framed → moved → light and colour
→ look → fades; sound: speed → noise out → loudness → volume → fades).

| Edit | Words (ka · en · ru, examples) | FFmpeg |
|---|---|---|
| `adjust` brightness, contrast, saturation, warmth (−100…100), sharpen, vignette (0…100) | „უფრო ნათელი", „თბილი ტონით", „ვინიეტით", "warmer", "more contrast", «ярче», «холоднее»; a % in the same clause sets the strength | `eq`, `colortemperature …:pl=1`, `unsharp`, `vignette` |
| `flip` horizontal / vertical | „სარკისებურად", "flip it upside down", «отзеркаль» | `hflip` / `vflip` |
| `rotate` 90 / 180 / 270 | „მოატრიალე 90 გრადუსით მარჯვნივ", "rotate it left", «поверни на 180» | `transpose=clock` / `cclock` / `hflip,vflip`; 90 and 270 swap the frame |
| `motion` zoom in/out, shake, glitch | „ზუმი გაუკეთე", "add a camera shake effect", «добавь глитч» | `zoompan` from a 2× picture (15 % over the result); a 1.12× window on two sines; `rgbashift` + `noise` in 0.2 s bursts every 1.6 s |
| `stabilize` | „კანკალი მოაშორე", "the video is shaky, fix it", «стабилизируй» | `deshake` |
| `denoise` | „ფონური ხმაური მოაშორე", "remove the background noise", «убери шум» | `highpass=f=80,afftdn=nf=-25` |
| `loudness` | „ხმა გაათანაბრე", "normalize the audio" | `loudnorm=I=-14:TP=-1.5:LRA=11` |
| `aspect` fit `blur` | „9:16 ბუნდოვანი ფონით", "9:16 with a blurred background" | `split` → a blurred cover copy behind the whole picture → `overlay`, inside the one `-vf` |

Limits, said before Start: a movement on a result up to 120 s, steadying up to 60 s (both slow), noise out and loudness
need a sound and contradict a mute, loudness and a volume change contradict each other. A photo takes a turn, a mirror
and light and colour. A word that only looks like an effect is not one: „ხმაური" (noise) never mutes, „თბილისი" is not
warm, „მიახლოებით" / «приблизительно» is no zoom, "it is shaky" asks for steadying, never a shake, "zoom transitions"
are the montage's.

Where they are read:
- In the chat (`lib/agent/chatTurn.ts` `effectStep`): one video or picture attached → Agent G's edit, with every other
  edit of the same words (the old remix door has no effects). Nothing attached, and the words name the video or picture
  („ამ ვიდეოს ზუმი დაუმატე", "add a glitch to the video") → Agent G's last result. Backwards → said not available.
- In a montage message: light and colour, mirror, zoom/shake/glitch are drawn on the finished montage by the run's
  second step (`runChat.ts` `AFTER_MONTAGE`); a blurred background behind a montage's shots is named on the card (a
  montage fills its frame with each shot).
- By voice (`bindLiveAgent.ts` `quote_media_edit`): the same typed fields, bounded.
- On Agent G's own result (a revision from the same source): the look adds to what the result shows — „brighter" again
  is brighter still, 90° more makes 180°, the same mirror twice is none and a mirror each way is a half turn, „and a
  glitch" keeps the zoom (`editExec.ts` `stackLook`).

## 3. Proof on real FFmpeg (T3, `lib/agent/media/effects.ffmpeg.test.ts`)

Each case runs the words → quote → queue → worker → QC → stored file, and is measured on the delivered file by the
test's own frame and sound reads. Numbers: `evidence-capcut/effects-evidence.json`; frames: `effects-landscape.jpg`
(before / light and colour / mirror; zoom start / end / a glitch burst) and `effects-tall.jpg` (turned, 9:16 over its
blur, photo turned, the combination at its start and end).

| Case | Words | Measured |
|---|---|---|
| F1 | „გააკეთე უფრო ნათელი, თბილი ტონით და ვინიეტით" | middle luma 95.3 → 108.6; r − b −22.5 → −3.8 (warmer); corner 71.8 → 57.8 (the vignette) |
| F2 | „სარკისებურად ამოაბრუნე" | the red marker 180,360 → 1100,360 |
| F3 | „მოატრიალე 90 გრადუსით მარჯვნივ" | 1280×720 → 720×1280; the left marker on top at 360,180 |
| F4 | „ზუმი გაუკეთე" | the middle square 120 → 137 px (×1.142); 6.01 s |
| F5 | "add a camera shake effect" | the square moves sd 32.1 / 18.4 px frame to frame; frame kept |
| F6 | «добавь глитч» | difference from the source 0.2 between bursts, 9.3 and 9.5 in them |
| F7 | «стабилизируй видео» | jitter 10.6 → 4.5 px (57 % less) |
| F8 | „9:16 ბუნდოვანი ფონით" | 1080×1920; bands detail 0.0 against 13.2 in the picture, not black (luma 157.6); both side markers kept (x 37 and 1041) |
| F9 | „ფონური ხმაური მოაშორე" | hiss −35.5 → −47.7 dBFS; tone −20.9 → −21.1; picture copied |
| F10 | „ხმა გაათანაბრე" | −51.8 → −14.0 LUFS |
| F11 | „ამ სურათს 90 გრადუსით მოატრიალე და გაანათე" | JPEG 1200×800 → 800×1200, luma 95.4 → 111.6 |
| F12 | "make it 9:16 with a blurred background, warmer, with a slow zoom in" | 1080×1920; band not black and warmer; zoom ×1.14 |

Two filters were wrong until measured, and are fixed: `afftdn` with noise tracking (`tn=1`) took nothing out on the
bundled ffmpeg 7.0.2 (−35.4 → −35.8 dB); `colortemperature` without `pl=1` made a warmer picture darker.

Re-run: `EFFECTS_DIR=<dir> npx jest lib/agent/media/effects.ffmpeg.test.ts` (about 40 s). Unit: `effects.test.ts`
(plan, chains, words ka/en/ru, card lines, chat), `editExec.test.ts` (stacking), `bindLiveAgent.test.ts`,
`askCoverage.test.ts`.

## 4. GG's Preview check (T4), PR #57's Preview, admin account, NOT myavatar.ge

https://avatar-g-frontend-v3-git-032054-kintsurashviligaga-ops-projects.vercel.app

1. Attach one video: „გააკეთე უფრო ნათელი, თბილი ტონით, ზუმით და ფონური ხმაური მოაშორე". Expect one plan card
   (light and colour, the zoom, the noise) and, after Start, the result.
2. Then, with nothing attached: „ამ ვიდეოს გლიჩი დაუმატე". Expect a plan on that result that keeps the zoom.
3. A horizontal video: „9:16 ბუნდოვანი ფონით". Expect a tall video with the whole picture in the middle.

## 5. Not done (never reported as done)

- Playing backwards; a blurred background behind a montage's shots; removing a moving person, object or background
  (paid AI fill, BLOCKED_OWNER); narration from typed text (paid TTS, BLOCKED_OWNER); captions of speech (paid
  transcription, BLOCKED_OWNER).
- A zoom, shake or glitch asked in a montage message is checked against its 120 s limit only when the montage is made
  (its length is known then): on a montage longer than that the edit step does not finish, with the reason, and the
  montage itself is kept.
- T4 on the Preview by GG; Production: nothing changes before GG's separate word (merge, deploy).
