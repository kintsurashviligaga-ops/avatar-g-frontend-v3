# Phase 8.8 — 3D Studio (Google-first, own GPU worker)

Plan doc (gap analysis, UI/UX, viewer, prices, infra, decisions D1–D6): https://claude.ai/artifact/LcmMkvp7x8Mhm6vLFr6oro

## GG decisions (2026-11-15, all approved)
- D1 engine: TRELLIS.2 on our own Cloud Run GPU job (RTX PRO 6000, europe-west4).
- D2 prices: photo → 3D ✦14, text → 3D ✦8 + ✦14, high detail ✦20, new look ✦8 + ✦13.
- D3 deploy + paid probe (~$2, 5 test models): only after Supabase is back and the launch runbook runs.
- D4 uploads of people: Gemini (Vertex) looks at the photo first. Objects pass; a selfie passes only with the user's
  "This photo is of me" tick; other real people, more than one person, anyone who looks under 18, or unsafe content
  are refused before any charge or GPU second. Any unclear answer or error refuses (`lib/studio3d/prompts.ts`).
- D5 viewer: extend the R3F viewer, no AR this phase. D6 STL: 100 mm default with the "not guaranteed printable" note.

## Why this engine
- Vertex AI has **no 3D model** (checked 2026-11-15). Google bought CSM (Jan 2026) but there is no API yet.
- Imagen is retired on Vertex; pictures come from **gemini-3.1-flash-image** (Vertex).
- "Many views + NeRF / Gaussian splats" gives inconsistent views and a splat is not a mesh (no STL, no game use).
- So: one Gemini reference picture → **TRELLIS.2-4B** (MIT, open weights) on **our own Cloud Run GPU job**
  (europe-west4, RTX PRO 6000 96 GB, billed only while running). No Replicate, no third-party inference.

## Flow
`check (Gemini safety) → reference (text/retexture only, ✦8, charged on delivery) → user approves → queued (model held)
→ starting → shape → texture → export → done (model charged)`; any failure releases the hold (`studio3d:<id>:refund`).

## Prices (65 % margin, 104.38 credits per $1 of full cost)
| Action | GPU s (est.) | Full cost | Credits |
|---|---|---|---|
| Reference picture | – | $0.0705 | ✦8 |
| Model, standard (1024³) | 130 | $0.1321 | ✦14 |
| Model, high detail (1536³) | 190 | $0.1906 | ✦20 |
| Retexture | 120 | $0.1224 | ✦13 |
| Downloads, turntable, Use in Video | – | – | free |

## PRs (all draft, `STUDIO_3D_V2` off)
- **A — foundation** (`lib/studio3d`): flag, validation, prices, prompts, pipeline state machine + admission, Cloud Run
  job client (injected fetch/token, never called in tests), GLB reader, GLB→STL, GLB→OBJ/MTL, ka/en/ru intent, labels.
- **B — routes + worker + viewer**: `/api/studio3d/*` (404 while off), `services/studio3d-worker` (Dockerfile, TRELLIS.2,
  trimesh, turntable MP4; not deployed), viewer upgrade (wireframe, full screen + iPhone fallback, pan, spin, reset,
  light presets, stats), 3D chat card, service page.
- **C — integration**: download route (GLB / OBJ zip / STL height), Use in Video → Director's Workflow / Montage,
  Agent G intent → 3D card, Library 3D row, Add to scene.

## Env (none set in prod)
`STUDIO_3D_V2=off|admin|everyone` (server), `NEXT_PUBLIC_STUDIO_3D_V2` (same values; while unset the chat's 3D panel
does not even ask the server), `STUDIO_3D_GCP_PROJECT`, `STUDIO_3D_REGION=europe-west4`, `STUDIO_3D_JOB`,
`STUDIO_3D_TIMEOUT_SEC=600`, `STUDIO_3D_DAILY_CAP=200`.

## Turn-on (GG only)
1. GG says GREEN → build + deploy the worker job (~$2 incl. one probe), measure GPU seconds, re-check prices.
2. GG runs `supabase/migrations/20261115a_studio3d_jobs.sql` (table + private bucket).
3. Merge A→B→C, set `STUDIO_3D_V2=admin` + `NEXT_PUBLIC_STUDIO_3D_V2=admin`, redeploy, test on myavatar.ge, then
   `everyone` by GG card.
