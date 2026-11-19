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

## PR C — Library recipe, PNG/JPG download, chat edits (built 2026-11-15)

- `GET /api/image/art-director/download?path=&format=png|jpg` — only `art-director/<uid>/<uuid>.png` of the caller
  (`artResultId`); JPG is made on the fly (white behind transparency, q92); file name `myavatar-<id>-<size>.<ext>`.
- `GET /api/image/art-director/recipe?path=` — the JSON recipe stored next to the picture (no DB column, no migration).
  Reference storage paths are not returned; the card shows letters and roles.
- Library: rows filed with `params.subtype = 'art-director-v1'` carry `artPath` (own host, own folder only); the card gets a
  "Recipe" button with the recipe and PNG/JPG downloads.
- Chat (OmniStudio), behind `NEXT_PUBLIC_IMAGE_ART_DIRECTOR` = admin | everyone (client) **and** `IMAGE_ART_DIRECTOR`
  (server):
  - Image tool, no photo attached, no template → an Art Director grid at the chat's count and ratio, 1K unless the line
    names 2K/4K. A `feature_off` answer sends the line down the old `/api/nanobanana/image` path.
  - A line after an Art Director picture that asks to change it (`detectEditIntent`: edit / remove / background /
    upscale / extend / vary, ka/en/ru) → that operation on the newest picture, or on the tile picked with "Use as base".
    "a castle in 4K" names a size and is not an upscale.
  - Each tile: Upscale (Re-render) 2K/4K with GG's tooltip, Edit (brush, "keep everything else identical"), Vary, Use as
    base, PNG/JPG. Every press is its own bubble, price and charge.
- Turn-on (GG card, after Supabase is back and the ~$1 paid check passes): set `IMAGE_ART_DIRECTOR=admin` and
  `NEXT_PUBLIC_IMAGE_ART_DIRECTOR=admin`, redeploy. Prices follow `NEXT_PUBLIC_PRICING_V8` (off = today's book, 1K only).
