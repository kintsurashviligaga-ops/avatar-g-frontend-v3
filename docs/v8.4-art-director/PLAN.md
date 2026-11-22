# Phase 8.4 — Art Director image pipeline

Full gap analysis and UI/UX plan: https://claude.ai/artifact/BeuhTzzfLKZEf9iGvfYP48 (GG approved 2026-11-15 05:44Z).

## What Vertex really supports (gemini-3.1-flash-image, checked 2026-11-15)
- 14 ratios (1:4, 4:1, 1:8, 8:1 new), 1K / 2K / 4K, up to 14 references (identity ~5 people).
- Imagen 3 (all Imagen) discontinued on Vertex: never used.
- No mask parameter → brush mask sent as a red "guide" picture, then the original is pasted back outside the mask on our
  server (sharp): pixels outside the brush are byte-identical (unmaskedDigest proves it).
- No deterministic upscaler → "Upscale (Re-render)" / „გაუმჯობესება (ხელახლა დახატვა)": a re-render at 2K/4K.
- One image per call → a grid of 2 or 4 is that many calls (max 2 parallel), charged per delivered image.
- No negative-prompt field → "Avoid: …" line (best effort). Seed is sent and saved, best effort.

## Prices (65 % engine, GG approved): 1K ✦8 · 2K ✦12 · 4K ✦17 per image (today's book: ✦5, 1K only).

## PRs (all drafts, IMAGE_ART_DIRECTOR off, no live billing/BOG, no DB change)
- A: lib/image/artDirector (this PR) — spec, flag, price, prompt, body, grid, mask, intent, request, library, labels.
- B: routes (quote + run, Vertex only) + UI (grid card, control panel, reference tray A–N, brush), mounted behind the flag.
- C: Library save + PNG/JPG download + chat edit intent wiring; ~$1 paid check after Supabase is back (GG approved).
