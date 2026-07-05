# MyAvatar.ge — 60-Second Premium Showcase Commercial
### Production Blueprint v1 · "One Chat. Infinite Creation."

---

## 0. Project Sheet

| Field | Spec |
|---|---|
| **Runtime** | 60.000s exact (1,440 frames @ 24fps) |
| **Master format** | 16:9 · 3840×2160 (UHD) · 24fps · Rec.709 |
| **Timeline fps** | 24.000 (cinematic cadence; UI/MoGraph inserts authored at 60fps, conformed) |
| **Reframe deliverables** | 9:16 · 1080×1920 (Reels/TikTok/Shorts, ~30s cutdown) · 1:1 · 1080×1080 (feed) |
| **Audio** | Stereo, VO + score + SFX, mastered to **−14 LUFS integrated**, −1 dBTP ceiling |
| **Captions** | On-brand kinetic Georgian captions, word-synced to VO (dogfoods your own caption engine) |
| **Brand lock** | Deep-space base `#0A0A0F` · primary accent **cyan `#00D4FF`** · secondary depth violet `#7A5CFF` (sparingly) |
| **Concept line** | Raw idea → multi-agent fan-out → parallel pipeline → finished cinematic. The product *is* the hero. |

---

## 1. Three Production Decisions (read before generating anything)

These change *how* you execute, so they're up top rather than buried.

**1.1 — Go hybrid, not fully generative, for every UI shot.**
A premium SaaS showcase lives or dies on legible, on-brand, *real* interface. Current text-to-video models hallucinate garbled UI text, wrong layouts, and inconsistent chrome — the opposite of "8k crisp UI." So split the sources:
- **Real screen capture + motion-graphics polish** for anything showing the actual product (the chatbot input, the six service tiles, Image grid, Music Composer, Character Swap panel, the final player). Record your redesigned dark-mode UI at 60fps, then add the glow/cursor/ease in After Effects. This is the single biggest quality lever in the whole spot.
- **AI-generated** for the *environmental and abstract* shots only: the cold-open particle field, the abstract 3D pipeline, and the hero desk pull-out. These have no legible text and benefit from generative richness.

The prompts below are tagged **[CAPTURE]**, **[MOGRAPH]**, **[AI-GEN]**, or **[HYBRID]** so you know which engine each shot goes to.

**1.2 — "Apple-style" → concrete craft, minus the trademarks.**
"Apple-style" is a legitimate aesthetic target: extreme negative space, restrained motion, single-hero framing, premium materials, buttery eases, and near-silence that lets one sound land. All of that is baked into the shot direction below. What you should *not* do in a shipping commercial: render an actual Apple logo, a recognizable "Studio Display" with its badge, or anything implying endorsement. The hero desk shot (S15) therefore specifies an **unbranded studio-grade monitor** — keeps the spot legally clean and keeps 100% of the brand attention on *MyAvatar*.

**1.3 — Georgian VO wants breathing room.**
The premium look fights dense narration. Your four lines are strong but run near 100% of their time budgets; Apple-cadence ads sit closer to 60–70% VO density with silence around the key words. Section 6 gives each line **as-written (cleaned)**, a **lightly-polished** default, and a **tightened variant** so you can dial density to taste. I'd ship the tightened variants for beats 2–3.

---

## 2. Visual Bible (consistency kit — lock this first)

Everything below references these constants so all 16 shots feel like one film.

- **Backgrounds:** deep-space `#0A0A0F` (never pure black — keeps shadow detail and the premium "lit void" feel). Optional radial vignette to `#050508` at frame edges.
- **Accent system:** cyan `#00D4FF` for all active/energy states (cursor, focus rings, waveforms, track lights, progress fills, logo sweep). Violet `#7A5CFF` only for depth/secondary glow in the pipeline beat — max ~15% of accent presence.
- **Type:** one geometric sans for UI/wordmark (your existing product font); Georgian captions in your caption typeface. Tracking slightly open on the logo lockup.
- **Motion language:** every move is `ease-in-out` with a long tail (think 0.22, 1, 0.36 cubic-bezier). No linear moves, no snaps except the two intentional impact cuts (ignite @ 0:08, logo @ 0:55).
- **Glow discipline:** bloom is *targeted* — only neon/cursor/waveforms/tracks. No global bloom (that reads cheap). See §8.
- **Logo lockup:** clean "MyAvatar" wordmark, cyan underline sweep, `MyAvatar.ge` URL beneath. Appears *only* at S16 — resist the urge to brand earlier; the restraint is the premium.

---

## 3. Master Cut-List (frame-accurate, 24fps)

TC = `MM:SS:FF`. 60s = frames 0–1440. Beat boundaries: 0:00 / 0:10 / 0:30 / 0:50 / 1:00.

| # | In | Out | Dur (f) | Beat | Shot | Source |
|---|-----|-----|------|------|------|--------|
| S01 | 00:00:00 | 00:01:12 | 36 | HOOK | Cold-open void + single cyan particle drift | AI-GEN / MOGRAPH |
| S02 | 00:01:12 | 00:06:00 | 108 | HOOK | Macro push-in: cyan caret types Georgian prompt, char-by-char | **CAPTURE** |
| S03 | 00:06:00 | 00:08:12 | 60 | HOOK | Prompt completes; input border pulses; send affordance lights | CAPTURE / MOGRAPH |
| S04 | 00:08:12 | 00:10:00 | 36 | HOOK | **IGNITE** — light-speed streak launches inward (hard hit) | MOGRAPH |
| S05 | 00:10:00 | 00:13:00 | 72 | SERVICE | Dashboard resolves; 6 tiles (Chat/Image/Music/Video/Avatar/Remix) breathe in | CAPTURE / MOGRAPH |
| S06 | 00:13:00 | 00:17:00 | 96 | SERVICE | **Image** — grid fills, tiles blur→sharp, cyan focus ring on hover | **HYBRID** |
| S07 | 00:17:00 | 00:21:12 | 108 | SERVICE | **Music Composer** — lyrics + Trained-RVC input; cyan waveform pulses; track renders L→R | CAPTURE / MOGRAPH |
| S08 | 00:21:12 | 00:26:00 | 108 | SERVICE | **Character Swap** — before/after face blend, clean wipe, identity-lock indicator | **HYBRID** |
| S09 | 00:26:00 | 00:30:00 | 96 | SERVICE | Rapid 3-mode montage; tiles collapse toward one pipeline entry point | MOGRAPH |
| S10 | 00:30:00 | 00:34:00 | 96 | PIPELINE | Abstract 3D pipeline; data blocks (scene thumbs) slide onto cyan tracks | AI-GEN / 3D |
| S11 | 00:34:00 | 00:38:12 | 108 | PIPELINE | **Cap-3 Node** queue; blocks split into 4 concurrent lanes (`mapWithConcurrency`); 4 bars fill | **MOGRAPH** (precise labels) |
| S12 | 00:38:12 | 00:43:00 | 108 | PIPELINE | Under-the-hood assembly: scenes stitch, music layer slides under, waveform aligns, levels balance | MOGRAPH |
| S13 | 00:43:00 | 00:47:00 | 96 | PIPELINE | Bars hit 100%; unified "master clip" crystallizes from the lanes | MOGRAPH |
| S14 | 00:47:00 | 00:50:00 | 72 | PIPELINE | Master clip flies toward workspace (transition out) | MOGRAPH |
| S15 | 00:50:00 | 00:55:00 | 120 | CTA | Pull-back reveal: premium desk + **unbranded** studio display playing the finished cinematic | **AI-GEN** + screen comp |
| S16 | 00:55:00 | 01:00:00 | 120 | CTA | Push to screen → **MyAvatar** logo lockup, cyan sweep, URL + tagline, sonic-logo sting, hold to black | MOGRAPH |

Frame audit: HOOK 240 · SERVICE 480 · PIPELINE 480 · CTA 240 = **1,440 ✓**

---

## 4. Beat-by-Beat Direction + Generation Prompts

Each AI/hybrid shot has a **model-ready prompt** and a **negative prompt**. Keep a fixed seed per beat for continuity; vary only within a beat if you need coverage.

### BEAT 1 — HOOK · 0:00–0:10 · "The Prompt Entry"

**Intent:** Silence and void, then one human idea. The audience should feel the *before* — the blank canvas — so the fan-out later feels explosive.

**S01 [AI-GEN / MOGRAPH]** — Cold open.
```
Prompt: Extreme minimalist dark void, near-black #0A0A0F, a single tiny luminous
cyan particle drifting slowly through deep negative space, subtle volumetric haze,
soft depth-of-field, cinematic, premium tech commercial, ultra-clean, 8k, HDR,
gentle film grain, no text.
Negative: text, logos, UI, clutter, bright colors, banding, harsh light, busy background.
```

**S02 [CAPTURE]** — Macro on the chatbot input. *This is a real screen recording of your redesigned chat container*, shot with a slow push-in (or add the push in AE). A glowing cyan caret blinks, then types the Georgian prompt character-by-character. Zero-flash workspace (no loading jank). Add subtle key-tick SFX (§7).
- On-screen (typed): a real, on-brand Georgian creative prompt, e.g. „კინემატოგრაფიული რგოლი ზამთრის თბილისზე, ნისლიანი დილა…"

**S03 [CAPTURE / MOGRAPH]** — Prompt completes. A soft cyan glow travels the input border (AE stroke-reveal on the captured frame); the send affordance illuminates. Beat of stillness — let it breathe.

**S04 [MOGRAPH] — IGNITE.** The prompt "fires": a light-speed cyan streak launches into the screen depth. **This is a hard cut on the music impact** (0:08:12). Motion-blurred, single decisive gesture. Transitions us into the dashboard.

---

### BEAT 2 — SERVICE CORE · 0:10–0:30 · "The Multi-Agent Fan-out"

**Intent:** One window → a full studio. Show breadth fast but never cluttered — one mode in focus at a time, each with a signature micro-interaction.

**S05 [CAPTURE / MOGRAPH]** — Dashboard resolves out of the streak. The six locked services — **Chat · Image · Music · Video · Avatar · Remix** — breathe in with staggered ease (40ms offsets). Cyan idle-glow on the active tile.

**S06 [HYBRID]** — **Image mode.** Real UI frame (captured), AI-generated art *inside* the tiles. Grid fills top-left→bottom-right, each tile resolving blur→sharp; cursor glides, cyan focus ring snaps to a hovered tile.
```
Prompt (for tile art only): grid of photorealistic AI-generated images, diverse
premium subjects (portrait, landscape, product, abstract), crisp 8k detail,
consistent cinematic color, gallery-quality, cohesive palette with cyan undertone.
Negative: watermark, text, garbled detail, low-res, duplicate, distorted faces.
```

**S07 [CAPTURE / MOGRAPH]** — **Music Composer.** Lyrics field + a labeled **Trained-RVC** voice input. As "generate" fires, a cyan waveform pulses audio-reactively and a track bar renders left→right. Sync the visual waveform to the actual score beat (§7).

**S08 [HYBRID]** — **Character Swap.** Before/after face panel; a clean vertical wipe reveals a flawless swap; an "identity lock" indicator confirms. **Use synthetic / model-released faces, not identifiable real individuals** — avoids any likeness issue and keeps the demo evergreen.
```
Prompt (for face art only): studio-lit portrait of a synthetic, non-identifiable
human face, photorealistic, neutral expression, even soft key light, high detail
skin texture, premium headshot, cohesive with cyan-accented dark set.
Negative: real celebrity, recognizable person, distortion, artifacts, extra fingers, watermark, text.
```

**S09 [MOGRAPH]** — 3-mode montage (image → music → swap in ~1s each), then all tiles collapse and stream toward a single glowing entry point → hand-off to the pipeline beat.

---

### BEAT 3 — PIPELINE MATRIX · 0:30–0:50 · "Concurrency & Queue"

**Intent:** Make the invisible engineering *feel* premium. This is where your actual architecture (`Cap-3` queue, 4-concurrent `mapWithConcurrency` pool, auto scene/music/audio assembly) becomes cinema. Author labels in AE for legibility; use AI only for the abstract 3D environment plate.

**S10 [AI-GEN / 3D]** — Abstract high-tech pipeline space; clean data blocks — each stamped with a tiny scene thumbnail — slide onto glowing cyan tracks.
```
Prompt: abstract 3D data-pipeline interface floating in dark space, sleek glowing
cyan tracks receding into depth, clean minimalist data blocks gliding along rails,
soft volumetric light, reflective floor, premium tech trailer, studio lighting,
8k, photorealistic render, shallow depth of field.
Negative: text, readable labels (added in post), clutter, cartoonish, low-poly, noise, banding.
```

**S11 [MOGRAPH]** — **Cap-3 Node.** The queue label resolves; blocks distribute into a **4-lane concurrent pool**; four progress bars fill in parallel. Small, precise, on-brand labels — `Cap-3 · mapWithConcurrency · 4 workers`. Neon pulses travel each lane on the beat.

**S12 [MOGRAPH]** — Under-the-hood assembly as elegant stacking layers: scene clips stitch end-to-end, a music layer slides underneath, an audio waveform snaps into alignment, level meters auto-balance to a target. Reads as "the system is doing the hard part for you."

**S13 [MOGRAPH]** — All four bars hit 100% together; the lanes converge and a single unified **master clip** crystallizes at center — a cyan pulse ripples outward on the convergence.

**S14 [MOGRAPH]** — The master clip flies toward the viewer/workspace → transition into the CTA reveal. Slight motion blur; energy carries forward.

---

### BEAT 4 — CALL TO ACTION · 0:50–1:00 · "The Unified Composite"

**Intent:** Land the payoff in the real world, then resolve to a clean brand hold. Warm room, cool screen — the one place we allow warmth, so the product screen pops cooler by contrast.

**S15 [AI-GEN + screen comp]** — Elegant pull-back / dolly reveal of a premium creative desk with an **unbranded** studio-grade display. On the screen, the MyAvatar dark platform plays the finished cinematic on its main player. Soft room light, cyan rim from the monitor.
```
Prompt: elegant slow dolly-back reveal of a premium minimalist creative studio
desk, a large unbranded studio-grade monitor (no logos) glowing softly, warm
ambient room light, cyan screen rim-light, shallow depth of field, cinematic,
photorealistic, 8k, high-end commercial finish, clean composition, no visible brand marks.
Negative: brand logos, apple logo, visible manufacturer badge, clutter, messy desk,
people, text, harsh light, lens dirt overload.
```
- **Comp note:** track/insert the real finished-video playback onto the monitor screen in post (corner-pin) — don't rely on AI to render legible playback.

**S16 [MOGRAPH]** — Push into the screen → **MyAvatar** logo lockup on deep-space; a cyan underline sweeps L→R; `MyAvatar.ge` URL + tagline resolve beneath; the **sonic-logo sting** hits on the lockup; hold ~1s, then gentle fade to black.

---

## 5. On-Screen Text / Caption Map

Kinetic Georgian captions, word-synced, in your caption typeface. Cyan keyword emphasis. Keep to lower-third safe area (critical for the 9:16 reframe).

| TC | On-screen |
|---|---|
| 0:02–0:09 | Caption of VO1 (idea line) |
| 0:11–0:29 | Caption of VO2, keywords `გამოსახულება · მუსიკა · ხმა · სახე` briefly highlighted as each mode shows |
| 0:31–0:49 | Caption of VO3, `Cap-3` / `4× parallel` micro-labels as UI text (not caption) |
| 0:51–0:59 | Caption of VO4; tagline + `MyAvatar.ge` lock on the logo frame |

---

## 6. Voiceover Master Sheet

Deliver via ElevenLabs (your cloned Georgian voice). **Direction:** warm, confident, unhurried; premium-ad restraint, not hype-y. Target ~130–145 WPM equivalent with deliberate pauses on the `…` and before the tagline. Record 2 takes: one "calm authority," one "slightly warmer." Leave ~0.4s of air at each line's head and tail for clean ducking.

> **Legend:** *As-written* = your line, typos cleaned · *Polished* = my default recommendation · *Tightened* = ship this for premium pacing.

### VO1 — HOOK (in ~0:02, out ~0:09)
- **As-written / Polished:** „ყველაფერი იწყება ერთი მარტივი იდეით…"
- **Romanization:** *Q'velaperi itsq'eba erti martivi ideit…*
- **English:** "Everything begins with one simple idea…"
- **Note:** already perfect for the beat. Land the trailing "…" into the ignite.

### VO2 — SERVICE CORE (in ~0:11, out ~0:29)
- **As-written (cleaned):** „ერთი ჩატის ფანჯრიდან შენ მართავ სრულფასოვან შემოქმედებით სტუდიას: უმაღლესი ხარისხის იმიჯები, პრემიუმ მუსიკა, ხმის სინთეზი და სახის მომენტალური შეცვლა."
- **Polished:** „ერთი ჩატის ფანჯრიდან შენ მართავ სრულფასოვან შემოქმედებით სტუდიას — უმაღლესი ხარისხის გამოსახულებები, პრემიუმ მუსიკა, ხმის სინთეზი და სახის მყისიერი ჩანაცვლება."
- **Tightened (ship this):** „ერთი ჩატიდან — მთელი შემოქმედებითი სტუდია: გამოსახულება, მუსიკა, ხმა და სახის ჩანაცვლება."
- **English (tightened):** "From one chat — an entire creative studio: image, music, voice, and face swap."
- **Note:** „გამოსახულება" is the native Georgian for *image*; „იმიჯები" (loanword) is fine if you prefer the casual tech register. `—` = a real breath, not a rushed colon.

### VO3 — PIPELINE MATRIX (in ~0:31, out ~0:49)
- **As-written (cleaned):** „ჩვენი ინოვაციური პარალელური მილსადენი ამუშავებს რთულ კინემატოგრაფიულ კადრებს. სისტემა ავტომატურად აწყობს სცენებს, ადებს მუსიკას, არეგულირებს ხმას და ქმნის მონოლითურ ნამუშევარს."
- **Polished:** „ჩვენი ინოვაციური პარალელური მილსადენი ამუშავებს რთულ კინემატოგრაფიულ კადრებს. სისტემა თავად აწყობს სცენებს, ადებს მუსიკას, არეგულირებს ხმას და ქმნის ერთიან, დასრულებულ ნამუშევარს."
- **Tightened (ship this):** „ჩვენი პარალელური მილსადენი თავად აწყობს სცენებს, მუსიკასა და ხმას — ერთიან, დასრულებულ ნამუშევრად."
- **English (tightened):** "Our parallel pipeline assembles scenes, music, and sound itself — into one finished piece."
- **Note:** I swapped „მონოლითურ" (monolithic — reads odd for a film) → „ერთიან, დასრულებულ" (unified, finished). Keep „მონოლითურ" only if you specifically want the "monolith" tech flavor.

### VO4 — CTA (in ~0:51, out ~0:59, tagline lands on logo ~0:56)
- **CTA line (keep):** „შემოუერთდი AI რევოლუციას დღესვე." — *"Join the AI revolution today."*
- **Tagline options** (pick one for the lockup):
  1. „MyAvatar.ge — ერთი ჩატი. უსასრულო შემოქმედება." (*one chat. infinite creation.*) ← my pick, matches the concept line
  2. „MyAvatar.ge — შენი შემოქმედება, გაძლიერებული AI-ით." (*your creativity, powered by AI*)
  3. „MyAvatar.ge — გააციფრული შემოქმედება." (*your original — punchy but abstract*)

---

## 7. Music & Sound Design

**Score arc (single cue, 60s):** rubato ambient pad intro (0:00–0:08) → tempo establishes on IGNITE → energy lift at the dashboard reveal (0:10) → steady driving pulse through service + pipeline → a deliberate ~1s pull-back before the CTA (0:49–0:50) for impact → resolve + sonic logo (0:55–1:00).

- **Tempo/key:** ~112–118 BPM, A-minor-ish modern cinematic-electronic (bright but not cheesy). Align BPM so downbeats fall on the cut points below.
- **Stems to render (MusicGen or your pipeline):** `pad`, `sub`, `pulse/arp`, `percussion`, `riser/impact FX`, `sonic-logo`.
```
Score prompt: modern cinematic tech-commercial score, ~115 BPM, A minor, starts as
an airy evolving synth pad, builds into a clean driving pulse with arpeggiated cyan-
bright synths and tight electronic percussion, premium Apple-launch energy, hopeful
and confident, a brief pull-back near the end then a triumphant resolve, ending on a
short bright signature sting. Polished, uplifting, uncluttered, high production value.
```
- **Sync hits (music must land on these frames):**
  - 0:08:12 (S04 IGNITE) — **impact + streak**
  - 0:10:00 (S05 reveal) — downbeat / energy lift
  - each mode intro (S06/S07/S08) — subtle tick/pluck
  - 0:30:00 (S10) — filter-open whoosh into pipeline
  - 0:47:00 (S13) — impact on "100% / crystallize"
  - 0:49–0:50 (S14→S15) — reverse-cymbal pull-back
  - 0:55:00 (S16) — **sonic-logo sting** on the lockup
- **SFX layer:** soft key-ticks (S02 typing), UI focus "tine" (S06 hover), waveform "bloom" (S07), clean wipe "shff" (S08), data-block "clicks" gliding on rails (S10–S11), lane "power-up" pulses (S11), a satisfying "lock/snap" (S13), airy "swoosh" (S14/S15). Keep SFX subtle — premium = you feel them more than hear them.
- **Mix:** VO always on top. Duck the score ~−6 to −8 dB under VO (sidechain or keyframed), recover in the gaps. Master to **−14 LUFS integrated, −1 dBTP**. SFX bus ~−12 to −10 dB under VO.

---

## 8. Color & Grade (LUT logic)

Base look, applied globally, then per-beat trims.

- **Curve:** filmic S-curve; lift blacks *slightly* off zero (crush lightly, retain shadow detail — this is what keeps `#0A0A0F` premium instead of muddy). Controlled highlight roll-off so neon glows without clipping.
- **Balance:** clean-neutral mids; a hair of teal in the shadows for the cosmic feel; cyan `#00D4FF` protected in saturation so it stays vivid, not neon-blown.
- **Bloom/glow:** **targeted only** — mask to neon/cursor/waveforms/tracks/logo. No global bloom.
- **Texture:** light film grain ~4–6% on environmental/AI shots for a filmic weight; near-zero on flat UI panels (grain on solid UI reads as noise). Very subtle chromatic aberration at extreme edges of the S15 hero shot only, for lens realism.
- **Per-beat trims:**
  - **HOOK** — darkest, most negative space; single cyan source is the only bright point.
  - **SERVICE** — nudge exposure up ~⅓ stop as the UI energizes; slightly higher accent saturation.
  - **PIPELINE** — highest neon saturation; allow the violet `#7A5CFF` depth glow here.
  - **CTA** — warm-neutral room vs. cool product screen (contrast sells the payoff), then settle to neutral on the logo hold.

---

## 9. Transitions & Motion Inventory

Map each transition to its cut so the editor/AE artist has no ambiguity.

| At | From→To | Transition |
|---|---|---|
| 0:08:12 | S03→S04→S05 | **Hard cut on impact** + light-speed streak carrying into dashboard |
| within B2 | S05→S06→S07→S08 | Smooth tab-toggle slides (matches real product tab motion), 12–14f eases |
| 0:26–0:30 | S08→S09 | Tiles collapse + stream (particle-ish) toward one point |
| 0:30:00 | S09→S10 | Filter-open whoosh / light-wipe into 3D pipeline |
| within B3 | S10→S13 | Continuous camera flow (feels like one move), pulses on the beat |
| 0:47–0:50 | S13→S14→S15 | Crystallize → clip flies forward → **match-cut** onto the monitor in the desk shot |
| 0:55:00 | S15→S16 | Push-in to screen → dissolve to logo void |

Global: all eases `cubic-bezier(0.22, 1, 0.36, 1)`. Only two snaps in the whole film (0:08 ignite, 0:55 logo).

---

## 10. Assembly & Delivery (scaffold)

Author the two impact-critical MoGraph beats + captions in After Effects; assemble the timeline in your NLE **or** stitch with FFmpeg. Reference commands below (adapt paths, use 24fps everywhere).

**10.1 — Crossfade-stitch example (three clips, 20f = ~0.83s dissolves):**
```bash
# offset = clipDuration - transitionDuration; transition here ~0.83s
ffmpeg \
 -i S01.mov -i S02.mov -i S03.mov \
 -filter_complex "\
  [0:v][1:v]xfade=transition=fade:duration=0.83:offset=1.5[v01]; \
  [v01][2:v]xfade=transition=fade:duration=0.83:offset=5.6[vout]" \
 -map "[vout]" -r 24 -c:v prores_ks -profile:v 3 stitched.mov
# (Use hard cuts for the 0:08 and 0:55 moments — no xfade there.)
```

**10.2 — Mix VO + score + SFX, duck the music under VO, normalize:**
```bash
ffmpeg -i score.wav -i vo.wav -i sfx.wav \
 -filter_complex "\
  [0:a]volume=0.9[music]; \
  [music][1:a]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=350[ducked]; \
  [ducked][2:a]amix=inputs=2:duration=longest:normalize=0[mixpre]; \
  [mixpre][1:a]amix=inputs=2:duration=longest:normalize=0[premaster]; \
  [premaster]loudnorm=I=-14:TP=-1:LRA=11[aout]" \
 -map "[aout]" -c:a pcm_s24le mix_master.wav
```

**10.3 — Burn word-synced Georgian captions (kinetic → render as ASS or as a pre-comped MOV overlay):**
```bash
# If captions are a rendered alpha overlay from AE (recommended for kinetic):
ffmpeg -i picture.mov -i captions_alpha.mov \
 -filter_complex "[0:v][1:v]overlay=0:0" -r 24 -c:v prores_ks -profile:v 3 picture_capped.mov
# If simple styled subs: -vf "ass=captions.ass"
```

**10.4 — Final encodes:**
```bash
# YouTube / landing-hero master (H.264, high bitrate, 4K)
ffmpeg -i final_master.mov -i mix_master.wav -map 0:v -map 1:a \
 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 24 \
 -c:a aac -b:a 320k -movflags +faststart MyAvatar_60s_4K_16x9.mp4
# Keep a ProRes 422 HQ master for archive/reversioning (do NOT ship H.264 as your master).
```

**10.5 — Reframes (author safe-area first, then crop/scale):**
```bash
# 9:16 (1080x1920) — center-crop from 4K then scale; re-frame subjects per shot
ffmpeg -i MyAvatar_60s_4K_16x9.mp4 -vf "crop=2160:3840:840:0,scale=1080:1920" \
 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy MyAvatar_9x16.mp4
# 1:1 (1080x1080)
ffmpeg -i MyAvatar_60s_4K_16x9.mp4 -vf "crop=2160:2160:840:648,scale=1080:1080" \
 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy MyAvatar_1x1.mp4
```

> For social cutdowns, don't just crop the 60s — cut a punchier ~30s (HOOK + best of SERVICE + CTA) with captions in the lower-third safe area, hook landing in the first 2s.

---

## 11. Distribution & Metadata

Georgian-primary (it's a Georgian-first product), English secondary for reach.

**Title (YouTube):**
`MyAvatar.ge — ერთი ჩატი, უსასრულო შემოქმედება | AI შემოქმედებითი სტუდია` *(EN alt: "MyAvatar.ge — One Chat, Infinite Creation | AI Creative Studio")*

**Description (open):**
> MyAvatar.ge — საქართველოს პირველი ნატიური AI შემოქმედებითი პლატფორმა. ერთი ჩატის ფანჯრიდან: გამოსახულებები, მუსიკა, ვიდეო, ხმის სინთეზი და სახის ჩანაცვლება — ავტომატური კინემატოგრაფიული პაიფლაინით.
> Create images, music, video, voice, and face-swaps from a single chat — powered by a real multi-agent pipeline. → MyAvatar.ge

**Chapters:** `0:00 იდეა · 0:10 შემოქმედებითი სტუდია · 0:30 პარალელური პაიფლაინი · 0:50 დასრულებული ნამუშევარი`

**Hashtags:** `#MyAvatarGe #AI #ხელოვნურიინტელექტი #საქართველო #კონტენტი #ვიდეო #მუსიკა #AIvideo #GenerativeAI`

**Thumbnail A/B (16:9 hero + text overlay):**
- **A —** macro cyan cursor mid-type on the dark input, bold Georgian hook „ერთი იდეა…" — curiosity play.
- **B —** the six-tile dashboard hero, tagline „ერთი ჩატი. უსასრულო შემოქმედება." — value play.
- Test A vs B for CTR; keep the winner as the landing-page poster frame.

**Platform matrix:**

| Platform | Deliverable | Notes |
|---|---|---|
| YouTube / landing hero | 16:9 4K, full 60s | primary; embed as hero video + poster = winning thumbnail |
| Reels / TikTok / Shorts | 9:16 1080×1920, ~30s | hook in first 2s, captions in safe area |
| LinkedIn | 16:9 (or 1:1), 60s | founder-story framing in the post copy |
| X | 16:9, 60s or 30s | lead with the concept line |

---

## 12. 10/10 QC Checklist (pass before ship)

- [ ] All in-frame UI is **real/legible** and on-brand — zero AI-garbled text anywhere.
- [ ] `#00D4FF` cyan is **consistent** across cursor, rings, waveforms, tracks, progress, logo sweep.
- [ ] Backgrounds are `#0A0A0F` (not pure black); shadow detail retained.
- [ ] No third-party trademarks in frame (S15 monitor is **unbranded**); no implied endorsement.
- [ ] Character-swap faces are **synthetic / released**, not identifiable real people.
- [ ] VO synced to captions; captions in lower-third safe area (verified in 9:16).
- [ ] Every music **sync hit** lands on its cut frame (esp. 0:08, 0:10, 0:47, 0:55).
- [ ] Only two intentional snaps (ignite, logo); everything else long-tail eased.
- [ ] Audio master **−14 LUFS / −1 dBTP**; VO ducking clean, no pumping.
- [ ] Timeline conformed to **24fps** end-to-end; no judder on MoGraph inserts.
- [ ] Encodes: ProRes master archived; H.264 4K shipped with `+faststart`.
- [ ] Reframes re-framed per shot (not blind center-crop); 30s cutdown hooks in 2s.

---

## 13. Knobs for You to Set

1. **Frame rate:** 24fps (cinematic, my rec) vs 30fps (a touch more "screen-native"). Blueprint is built for 24; say the word and I'll reframe the cut-list math to 30.
2. **Tagline:** pick from §6 VO4 (my pick: option 1).
3. **VO voice + take:** which cloned Georgian voice, and calm-authority vs warmer take.
4. **VO density:** ship the **tightened** VO2/VO3 (my rec) or the fuller polished versions.
5. **Capture vs full-AI:** confirm you'll screen-capture the real UI shots (strongly recommended) — if you truly want fully-AI UI, I'll rewrite S02–S08 prompts with much heavier consistency scaffolding, but expect a quality hit on text legibility.

Tell me your picks on 1–5 and I'll lock a v2 with the exact conformed frame math, a finalized single VO script sheet ready for ElevenLabs, and an AE-shot-list version of the MoGraph beats.
