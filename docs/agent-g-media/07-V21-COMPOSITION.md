# Agent G Media Studio v2.1 — 07 Captions, typography, overlays and motion graphics

GG's v2.1 addendum (2026-10-11 13:31Z) and clarification (13:32Z) extend v2.0: Agent G itself puts text, a CTA, a logo,
a blur or mosaic and caption tracks on a video or a picture, and changes them later, through the SAME pipeline as every
other edit: the chat or Live Voice reads the words into typed asks → `/api/agent/media/edit` quote (free, signed) →
Start → Task API row → lease worker → ffmpeg → QC on the rendered file → `renders` bucket → Library. There is no second
editor and no new provider: the pixels are drawn with the bundled FiraGO font (resvg) and laid over with ffmpeg.

Labels: PROVEN (seen passing at the tier named) · BUILT_NOT_PROVEN · PARTIAL · MISSING · BLOCKED_OWNER · UNSUPPORTED.
Tiers as in 03: T1 unit · T3 real ffmpeg on synthetic fixtures · T4 authenticated Preview · T5 paid provider · T6 Prod.
Nothing below is above T3: no Preview, paid or Production run was made for v2.1.

## 1. Reconciliation against v2.0 (spec order) and what this branch adds

| v2.1 item | Before this branch (v2.0 / main) | Now | Best tier | Label |
|---|---|---|---|---|
| Text on a video, exact Georgian | one bottom caption (`caption` op), not changeable | text layers: place (9 anchors, safe area), size, 5 styles, role (title, CTA, price, lower third, label), time window | T3 | PROVEN (T3) |
| Text on a picture / design | MISSING (pictures were not a source) | the same layers on a still → JPEG (`design`) | T3 | PROVEN (T3) |
| Motion graphics | MISSING | fade, slide up, slide in, scale, typewriter, word by word; a CTA in the last N s | T3 | PROVEN (T3): slide-up measured |
| Words on the music's beats | MISSING | `motionIn: 'words'` + `beats` (words revealed on the result's own beats) | T1 | BUILT_NOT_PROVEN (no T3 beat measurement) |
| Logo / sticker overlay | MISSING | image layer from the user's own file (owner-checked twice) | T3 | PROVEN (T3) |
| Blur / mosaic mask | MISSING | mask layer, region and time | T3 | PROVEN (T3): detail kept ≤ 0.35 |
| Layering / stacking | MISSING | z order, later on top; overlaps reported in QC | T3 | PROVEN (T3) |
| Captions from typed lines or .srt/.vtt | MISSING | caption track (KA/EN/RU), burned on its times | T3 | PROVEN (T3) |
| With AND without captions | MISSING | `deliver: 'both'`: a second, clean copy from the same render | T3 | PROVEN (T3) |
| Subtitle export | MISSING | SRT + VTT with the job (card buttons) | T3 | PROVEN (T3) |
| Captions of what is SPOKEN | MISSING | refused in words: needs ElevenLabs Scribe (paid) | — | BLOCKED_OWNER |
| Translated captions | MISSING | refused in words: needs a paid model call | — | BLOCKED_OWNER |
| Karaoke word highlight | MISSING | contract field; needs word times from a transcript | — | BLOCKED_OWNER (with transcription) |
| Speaker labels | MISSING | contract field (`speakers`, `cue.speaker`); not set from words | T1 | PARTIAL |
| Revisions („move it", „remove the top logo") | MISSING (v2.0: revision store BLOCKED_OWNER) | a revision = the parent's request changed and rendered again from the ORIGINAL source; the parent stays; branches are independent | T3 | PROVEN (T3), no migration |
| Compare / restore between revisions | MISSING | each revision is its own Library item and card; no compare view | — | MISSING |
| Remove text or a logo printed in the source | MISSING | refused (`remove_from_source`): nothing is painted over | — | UNSUPPORTED (no approved inpainting) |
| Protect packaging / approved text | MISSING | by construction: only our own layers change; QC proves the rest of the frame unchanged (PSNR ≥ 30 dB outside every layer) | T3 | PROVEN (T3) |
| 9:16 / 1:1 / 16:9 re-layout of a design | aspect edit of videos only | pictures too; a design is padded (nothing cut) unless „crop" is said; layers re-placed in the tall safe area | T3 | PROVEN (T3) |
| Missing font fallback | — | characters the bundled fonts cannot draw (CJK, emoji) are named and refused at the quote; nothing is queued | T3 | PROVEN (T3) |
| Long Georgian text | — | broken at spaces on measured widths, up to 6 lines, set smaller to a floor, then refused (`text_too_long` > 160) | T3 | PROVEN (T3) |
| Object tracking (text that follows a moving thing) | MISSING | — | — | MISSING |
| Live Voice | PARTIAL (v2.0) | `quote_media_edit` takes the same typed layers / captions; a logo is an attached file by number; a track is the user's lines | T1 | BUILT_NOT_PROVEN (not run by voice) |
| iPhone / Safari playback | — | H.264 High 4:2:0, `moov` before `mdat`, AAC (probed) | T3 | PROVEN (T3); a real iPhone play is T4 for GG |

## 2. Contracts (code is the source)

- `lib/agent/media/layers.ts`: `TextLayer`, `ImageLayer`, `MaskLayer`, `CaptionTrack`, `CaptionDelivery`; the asks
  (`LayerAsk`, `LayerChange`, `LayerTarget`, `TimeAsk`) and `resolveLayers` / `resolveTrack`, which check every field
  against the result's own timeline. Limits: 12 layers, 160 characters a text, 600 caption lines.
- `lib/agent/media/editPlan.ts`: ops `layers` and `captions` beside the v2.0 ops; `COMPOSED_EDITS` run a second pass
  (`layerPass.ts`) over the first pass's file. The stored request keeps the resolved layers (with ids) and the track.
- `lib/agent/media/editExec.ts`: a quote on our own result (`…/edits/<uuid>(-clean).mp4|jpg`) is a REVISION: the parent
  job's request is merged with the new asks (`mergeAsks`) and rendered from the parent's source. A captions ask without
  lines keeps the parent's track; `off` takes it away. New refusals: `remove_from_source`, `no_captions`,
  `missing_glyphs`, `text_too_long`, `layer_not_found`, `layer_ambiguous`, `layer_picture`.
- `lib/agent/media/editWorker.ts`: picture layers are checked to be the caller's own again before ffmpeg; a QC FAIL is
  a failed job (never delivered); the clean copy gets its own format and length QC; the result carries `clean`, `subtitles`, `layerQc`,
  `parentJobId`.
- `lib/agent/media/layerWords.ts`: the words (KA/EN/RU) → `layers` / `captions` asks. Drawn words come only from
  quotes or after a colon, exactly as typed, and are taken out of the message before anything else is read as an edit.
- `lib/agent/chatTurn.ts` `compositionStep`: which file (an attached video; else the attached picture, a second picture
  being the logo; else Agent G's last result). Changes and removals on the last result only when it is an Agent G edit
  (`previousEdit`), so „make the text more premium" after a chat answer stays the chat's.
- `lib/agent/react/bindLiveAgent.ts`: the same asks by voice (strict shapes; a picture is a file number, never a link).

## 3. The owner's nine commands → typed actions (T1: `layerWords.test.ts`, `chatTurn.test.ts`)

| Command | Typed action |
|---|---|
| „ვიდეოს ქართული ქეფშენები დაამატე." | none: says captions of speech need Scribe (paid, owner's decision) and how to give the lines |
| „სიტყვები მუსიკის ბიტებზე გამოაჩინე." | `layers.change [{target: all text, motionIn: 'words', beats: true}]` |
| „ტექსტი უფრო პრემიუმ და მინიმალისტური გახადე." | `layers.change [{target: all text, style: 'premium'}]` (the premium look is thin and spaced) |
| „ზედა ლოგო მოხსენი, პაკეტის ლოგო შეინარჩუნე." | `layers.remove [{kind: 'image', where: 'top'}]`; the package clause changes nothing |
| „აქ დააწერე: მიტანის სერვისი თბილისში." | `layers.add [{kind: 'text', text: 'მიტანის სერვისი თბილისში'}]` |
| „ბოლო სამ წამში ანიმაციური CTA ჩასვი: …" | `layers.add [{kind: 'text', role: 'cta', text, lastSec: 3}]` (no words: it asks for them) |
| „ტექსტი მარცხნივ გადაიტანე და ზომა შეამცირე." | `layers.change [{target: text, moveH: 'left', sizeBy: 0.8}]` |
| „იგივე ვიდეო მომეცი ქეფშენებით და ქეფშენების გარეშე." | `captions {deliver: 'both'}` on the parent's track |
| „ეს დიზაინი 9:16 სტორად გადააკეთე." | `aspect {to: '9:16', fit: 'pad'}` (a design keeps all of it) |

## 4. QC on the rendered file (`lib/agent/media/layerQc.ts`)

Every layer and caption is measured on the delivered file at sampled instants: present when planned (difference to the
base ≥ 2), absent outside its window (≤ 2.5), the drawn pixels exact where nothing moves (luma PSNR ≥ 26 dB against the
same PNG composited), the rest of the frame unchanged (PSNR ≥ 30 dB outside every layer box), masks hide their region
(Laplacian-detail correlation ≤ 0.35), overlaps listed. Outcome PASS / PARTIAL (something could not be measured, e.g. a
moving layer's exact pixels) / FAIL (not delivered). The record is on the job (`result.layerQc`) and the card says it.

## 5. E2E-TX evidence (T3, `lib/agent/media/composition.ffmpeg.test.ts`, synthetic fixtures)

Re-run: `MEDIA_STUDIO_V21_DIR=/tmp/v21 node node_modules/.bin/jest lib/agent/media/composition.ffmpeg.test.ts --ci --forceExit`
(writes `evidence.json`, the SRT/VTT and a contact sheet per scenario; copies in `evidence-v21/`).

| # | Scenario | Measured | State |
|---|---|---|---|
| TX-01 | Exact Georgian text on a picture | „მიტანის სერვისი თბილისში", 77 px, exact PSNR 46 dB, package region diff 0.04 | PROVEN T3 |
| TX-02 | Georgian track burned on its times | 3 lines; each absent 0.06 s before (1.96–2.59), shown from 0.06 s in to its last frame (19.4–25.2), gone 0.06 s after (1.83–2.37); SRT 284 B | PROVEN T3 |
| TX-03 | The same video without captions | clean copy diff ≤ 1.02 in the caption box; lengths 8.00 / 8.01 s | PROVEN T3 |
| TX-04 | Remove our top logo, keep the package | logo region 26.5 → 1.28 (back to the source), package 2.13 → 2.12 (untouched), text kept (1.83); a second removal → `remove_from_source` | PROVEN T3 |
| TX-05 | Animated CTA in the last 3 s | absent before 5 s (1.24), sliding (top edge 624 px at 5.08 s → 584 px settled), held to the end | PROVEN T3 |
| TX-06 | Premium restyle, same words | text region changed (47), logo the same (1.17) | PROVEN T3 |
| TX-07 | The design as a 9:16 story | 1080×1920, text inside the tall safe area, exact PSNR 48.6 dB; a revision of TX-01 | PROVEN T3 |
| TX-08 | English typed track + SRT/VTT | shown at 4 s (10.2), gap at 2.95 s (2.1); translation BLOCKED_OWNER | PROVEN T3 |
| TX-09 | Logo moved right (concurrent with TX-06) | old place 1.29, new place 146.7; parent file byte-identical after both | PROVEN T3 |
| TX-10 | Several layers in time and stacking | title 0–3 s, logo 2–6 s, text 4–8 s on top of the logo (white over red at 5.5 s); overlap reported | PROVEN T3 |
| — | Reload | the stored job answers both copies, files and QC; another user gets `not_found` | PROVEN T3 |
| — | Missing glyphs | „你 好 😀" named and refused; nothing queued | PROVEN T3 |
| — | Long Georgian text | 136 letters fit 9:16 (asked size 70, fitted to 57 px, exact PSNR 38.8 dB); 161 refused | PROVEN T3 |
| — | Masks | mosaic and blur keep 0 of the detail (threshold ≤ 0.35); the unmasked control 1 | PROVEN T3 |
| — | Cancel mid-render | aborted at 1.5 s, returned 12 ms later, nothing delivered | PROVEN T3 |
| — | Phone playback | `ftyp moov free mdat`; H.264 High yuv420p; AAC | PROVEN T3 (device T4: GG) |

## 6. Not done, and why (never reported as done)

1. Captions of speech, translation and karaoke: BLOCKED_OWNER (a paid ElevenLabs Scribe / model call; GG decides).
2. Removing text or logos that are part of the source pixels: UNSUPPORTED; the chat says so and changes nothing.
3. Object tracking: MISSING.
4. Compare / restore view between revisions; a revision table: MISSING (the v2.0 migration decision still stands).
5. T4: no Preview run of v2.1 yet (GG's hands; 06 §3). T5/T6: none.
6. Speaker labels from words, `beats` measured on a real song at T3: not yet.
