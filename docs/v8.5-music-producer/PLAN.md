# Phase 8.5 — Music Producer pipeline

Full gap analysis and UI/UX plan: https://claude.ai/artifact/7KfeZugtvUWc9ZPxtwkst2 (2026-11-15).

## What Lyria on Vertex really supports (Google's Lyria 3 model page + prompt guide, updated 2026-11-12)
- Only `lyria-3-clip-preview` (always 30 s) and `lyria-3-pro-preview` (up to 184 s). Preview, global, 10 requests/min.
  Lyria 3.5 is Gemini Developer API only: excluded by the Vertex-only rule.
- Genre, mood, instruments, BPM, key, intensity and timed sections `[mm:ss - mm:ss]` are prompt text (Pro follows timed
  sections; Clip does not). No duration, BPM, seed or negative-prompt parameter.
- Vocals or "Instrumental"; own lyrics after `Lyrics:` or written by the model. Lyrics text comes back, no word timings.
- Sung languages listed: en, de, es, fr, hi, ja, ko, pt. Georgian is not listed (GG's paid test 2026-10-26 passed).
- No extend, edit, inpainting, stems or audio input. Up to 10 reference images.

## Workarounds (labels say what really happens)
- Extend → "Add 30 s (new section, same style)": a new 30 s clip with the same choices + a 2-bar crossfade on a bar line.
- Remix → "Restyle (new take)": keeps lyrics, structure and tempo; new melody.
- Karaoke → line sync from our own section plan (or the returned text's timestamps), "Synced by section".
- Stems → not built. ffmpeg cannot separate a mix; open-source Demucs on our own Cloud Run is a GG decision.

## Prices (65 % engine): 30 s ✦6 (69.5 %), 1 min / 2 min / full song ✦11 (67.6 %), Add 30 s ✦6. Today's book: ✦3 / ✦6.

## PRs (all drafts, MUSIC_PRODUCER_V2 off, no live billing/BOG, no DB change, no paid call)
- A: `lib/music/producer` (this PR) — spec, flag, timeline, brief, lyric sync, extend plan, waveform peaks, prices, intent, labels.
- B: quote + run + extend routes on the existing music charge path (Vertex Lyria only), Producer controls, Music Card.
- C: Agent G "add it to Scene N" plan card, Use in Video (Director's Workflow / Montage), Library metadata.
- Paid check (~$0.30) only after Supabase is back and with GG's OK.

## GG decisions (2026-11-15 06:34Z)

1. "Add 30 s (new section, same style)" approved. 2. "Restyle (new take)" approved. 3. Stems rejected for now: no Demucs,
no stems control anywhere (revisit after launch). 4. 1 min / 2 min / full song at a flat ✦11 approved. 5. Georgian vocals
enabled with a small "Beta" tag.

## PR B (routes + UI) — built

- `POST /api/music/producer` (generate / restyle / extend) and `POST /api/music/producer/quote` (free), both 404 unless
  MUSIC_PRODUCER_V2 allows the user. Vertex Lyria only (`lyriaRequest`), platform budget asked first.
- Billing: balance check → one Lyria call → charge ONCE only after the track arrived (`music-producer:<id>`) → save;
  a save miss refunds (`:refund`). A Lyria miss or a failed join is never charged. Uses the existing ledger RPCs only.
- Extend: parent recipe + MP3 read back from the caller's own `renders/music-producer/<uid>/`, new Clip, ffmpeg join on a
  bar with a crossfade, parent's lyric lines kept up to the cut, new lines shifted to cut − crossfade. Cap 8 min.
- Restyle: parent's lyrics (word for word, even when Lyria wrote them), tempo, length and vocals kept; new genre/mood/instruments.
- Sung language picker (Auto + Lyria's 8 + Georgian "Beta"). Spec field `language` (optional, default auto).
- UI: ProducerControls, WaveformPlayer (Web Audio peaks, click/arrow-key seek), LyricsPane ("Synced by section",
  active line lit, click to seek), MusicCard, MusicProducerPanel; admin page `/{locale}/admin/music-producer`.

## PR C (Agent G + Use in Video + Library) — built

- `lib/music/producer/placement.ts` (pure): a scene's place in the film = the sum of the scenes before it (same order as
  the Director's Workflow cut). Scene N trimmed to that scene by default, or "until the end", or the whole film. 0.5 s
  fades, music 6 dB under the film, dipped further under speech (sidechaincompress from the film's own audio), dialogue
  untouched (amix normalize=0), picture stream-copied. A short track under a whole film plays once and fades (never looped).
- `POST /api/music/producer/place` (free, ffmpeg only): own track (recipe), own-storage film only, scene must exist
  (422 no_scene), new film saved as `mpfilm_<project>_<track>` in the Library (subtype director-music); original kept.
- `GET /api/music/producer/recipe?id=`: recipe + fresh signed link for the Library card / reopening the Music Card.
- Agent G (`lib/music/producer/agent.ts` + `MusicPlanCard`): "Create a sad piano track, 1 minute long, and add it to
  Scene 3 of my video." → one card: 1. make (✦11) 2. put under Scene 3 (0:16 – 0:22), free. Refused on the card before any
  charge when there is no film or no such scene. Offers "30 s is enough · ✦6" when the scene is shorter (user's choice).
  A place miss after the track keeps the track and says so.
- Use in Video sheet on every Music Card: scenes of the newest films, "this scene only / until the end", whole film,
  Open in Montage (hands `musicUrl, musicStartSec 0, musicGainDb -6` to /api/v2/montage/render).
- The seam with Director's Workflow: `registerFilmTarget({ projectId, title, filmUrl, scenes, sceneTitles })` from
  `lib/music/producer/videoTargets` — ONE call in FinalCutPanel after a successful cut (#355), to add once #355 and this
  stack are both merged. Neither side imports the other until then.
- Chat: `NEXT_PUBLIC_MUSIC_PRODUCER_V2` ('admin'|'everyone') shows the plan card for a music line in the Music tool, or a
  music line naming a video anywhere. Server `MUSIC_PRODUCER_V2` still decides per user. Turn both on together.

### Turn-on (after Supabase GREEN + GG OK)
1. Merge order: #359 → #360 → PR C (then the one-line #355 hook).
2. Set `MUSIC_PRODUCER_V2=admin` and `NEXT_PUBLIC_MUSIC_PRODUCER_V2=admin`, redeploy.
3. Paid check (~$0.30): one 30 s clip, one 1 min Pro, one Add 30 s, one place on a scene (free). Verify charges 6/11/6
   (v8) or 3/6/3 (today), refunds on a forced miss, Library rows.
