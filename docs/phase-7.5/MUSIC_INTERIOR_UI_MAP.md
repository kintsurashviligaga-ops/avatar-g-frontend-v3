# Phase 7.5 — Music (Lyria) and Interior: UI map

GG's next step 2 (2026-11-13 17:21Z): "Map out the UI changes for Music (Lyria) and Interior (same as Image) in a new draft PR."
This is the map only. No code here. Each row is sized to one small, flag-off PR in the pattern of #320 (Video), #321 (Image) and #322 (Read-aloud). None of the rows touches billing.

## Where they stand today (read from main)

| | Music | Interior |
|---|---|---|
| Model | Lyria 3 on Vertex. Default `lyria-3-clip-preview` (≤ 30 s). `lyria-3-pro` is used for longer lengths when the server says it can serve them (`lib/studio/musicEngines` `offeredMusicLengths`). Request is text only: `responseModalities: [AUDIO, TEXT]` (`lib/ai/lyriaMusic`) | `gemini-3.1-flash-image` through `/api/nanobanana/image`, the same route and price as Image (`shootCredits` = image price × renders) |
| Panel | `MusicCreatePanel`: style text, lyrics, instrumental toggle, up to 3 style chips, singer (auto/female/male/duet), Weirdness + Style influence sliders (labelled "approximate": Lyria has no such knobs, so each slider adds a fixed sentence), length 30/60/90/full, tempo, templates, an audio reference and recording, trained voice | `InteriorCreatePanel`: brief, 1–3 room photos (each photo is its own render), room type chips, style carousel, Advanced (model only), aspect (9 ratios) and count, Generate with price |
| Gaps vs AI Studio | No "you will get" line before Create. Lyrics have no section helpers even though Lyria reads `[Verse]`/`[Chorus]`. Nothing explains why Vocals can be locked. Two takes to compare need two presses | Wording still says "create" even though a room photo is always edited. No before/after view. No 1:4 / 4:1 / 1:8 / 8:1 (the route will take them behind #321's flag) |

## Music — proposed PRs (all flag `NEXT_PUBLIC_MUSIC_POLISH`, off)

| # | Change | Files | Server? | Paid check? |
|---|---|---|---|---|
| M1 | **Summary line** above Create: "You will get: 60 s · vocals (female) · Lyria 3 Pro · ✦ N". Built from the props the panel already has and the price it already shows (`musicQuote`) | `MusicCreatePanel.tsx`, `musicCreateCopy.ts` | No | No |
| M2 | **Lyrics section chips**: Verse · Chorus · Bridge · Outro insert `[Verse]` and so on at the cursor. The route already passes the tags (`generateLyriaTrack`: "the [Verse]/[Chorus] section tags the model understands") | `MusicCreatePanel.tsx` (lyrics box), new `lib/studio/lyricsTags.ts` + test | No | No |
| M3 | **Why Vocals is locked**: when the server reports vocals unverified (`MUSIC_LYRIA_VOCALS_VERIFIED` off, `lib/music/studio/capabilities`), the Instrumental lock gets a one-line reason instead of a silent disabled toggle | `MusicCreatePanel.tsx`, `useMusicEngines.ts` (read only) | No (reads the existing status) | No |
| M4 | **Approximate sliders, said once**: fold Weirdness + Style influence under an "Advanced" disclosure (same `Disclosure` as the Video fold), with a dot when moved off neutral | `MusicCreatePanel.tsx` | No | No |
| M5 | **Token pass**: replace any hard-coded colours in `MusicResult` / `MusicTitleBar` with `app-*` tokens (as #322 did for read-aloud) | those two files | No | No |

Not proposed: a native negative prompt or seed for music. Lyria 3 on Vertex takes one text input, so either one would become user text inside the brief. That needs its own sanitising and a paid check, so it is GG's call, not polish.

## Interior — proposed PRs (reusing #321's helpers)

| # | Change | Files | Server? | Paid check? |
|---|---|---|---|---|
| I1 | **Edit wording** with a room photo (flag `NEXT_PUBLIC_IMAGE_EDIT_MODE`, the same as #321): "Redesigning your room" banner, button "Redesign", placeholder "e.g. warm oak floor, linen sofa". Quick edits specific to rooms: brighter, declutter, new floor, new walls, add plants | `InteriorCreatePanel.tsx`, `newtools/copy.ts`, `lib/studio/imageExtras.ts` (room edits list) | No | No |
| I2 | **Extra ratios** (flag `NEXT_PUBLIC_IMAGE_EXTRA_RATIOS`): `SHOOT_ASPECTS` + 1:4 / 4:1 / 1:8 / 8:1, offered through an `shootAspectsOffered()` like `imageAspectsOffered()`; the route side is #321's `IMAGE_EXTRA_RATIOS` | `lib/studio/shootQuote.ts`, `newtools/shared.tsx` | Already in #321 | Shares #321's ~$0.05 check |
| I3 | **Before / after** on the result: a drag divider between the uploaded room and the render (pure client, both images are already on the page) | `newtools/ShootResultPane.tsx`, new `BeforeAfter.tsx` + test | No | No |
| I4 | **Summary line**: "You will get: 2 photos × 2 = 4 renders · 4:5 · ✦ N" (the same `shootTiles` / `shootCredits` it already uses) | `InteriorCreatePanel.tsx`, `newtools/shared.tsx` | No | No |

Not applicable to Interior: #321's 14-reference read. Each interior photo is a separate room and a separate render (photos × count), not references for one picture. Mixing a style reference photo into a room render would be a new feature, and its price would need GG.

## Order

I1 + I2 together (they reuse #321), then M1 + M2, then I3, M3, M4, M5. Each PR stays a draft with its flag off until GG says otherwise. Only I2 needs money: it shares #321's ~$0.05 check, which runs after the database is back.

## Out of scope here

Billing (`lib/credits`, `lib/orchestrator/ledger`, BOG). Files changed by open drafts #274, #306–#319. Slide decks and 3D (off). Product ad (removed).
