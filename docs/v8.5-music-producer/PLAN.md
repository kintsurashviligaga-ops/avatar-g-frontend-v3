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
