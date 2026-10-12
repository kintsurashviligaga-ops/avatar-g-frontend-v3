# Video Studio Consolidation Plan (Video Core v1.0 §2.3 · GG 2026-10-12 item 3)

Scope: the VIDEO lanes only. The Image Studio, Music, Avatar (talking), Dubbing, Live Voice, Interior, 3D and Presentation
studios are **not touched** by this plan or by this PR; nothing here renames, reroutes or restyles them. The canonical
catalogue ids (`video`, `remix`, `montage`) and the studio tool ids (`video`, `remix`, `montage`, `product`, `motion`,
`swap`, `vfx`) are **kept**; consolidation changes where they land and what they share, not what they are called.

The lanes, their contracts and their refusals are the code registry `lib/video/contracts.ts` (pinned by
`lib/video/contracts.test.ts` against the catalogue, the tools, Agent G's capabilities, the files on disk and the codes the
routes emit). This document is the plan over that registry.

## 1. Where the video features live today (read from the tree, 2026-10-12)

| Lane (registry id) | Tile / tool / capability | Entry today | Server | Length | Approval | QC | Billing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| film | `video` / `video` / `video.generate` | chat → Video tool (`#film`) → storyboard → Generate | `/api/film/storyboard` → `/api/chat/orchestrate` → `/api/video/assemble` | contract (requested · native · final, 30 fps) | storyboard revision (fingerprint) | frame-exact + QC gate | single-charge saga | PROVEN T3 (Veo leg mocked) |
| single-clip | same | one-scene film | orchestrate → assemble (cutMasterToLength) | contract | storyboard revision | frame-exact | saga | PROVEN T3 |
| music-video | `video` / `video` / `video.music-video` | chat or the Video tool, music-video mode | same as film | contract | storyboard revision | frame-exact | saga | PROVEN T3 |
| product-ad | — / `product` / `video.product-ad` | Product tool | `/api/video/remix` (i2v) → assemble (`billingToken`) | native | panel | none | saga, one charge | UNVERIFIED (B6) |
| longform | `video` / `video` / `video.generate` ≥ 104 s | refused by name (`longform_closed`) | `/api/video/longform` (exists, not wired) | contract | panel | none | per act | DISABLED (B1 · B4) |
| storyboard | `video` / `video` / film capabilities | before every film | `/api/film/storyboard`, orchestrate check | — | revision → approval → server check | — | none | EXECUTABLE (code level; table B3) |
| montage | `montage` / `montage` / `video.editing` | chat with clips + track (Agent G), Montage tool | `/api/agent/media/montage`, `/api/v2/montage` | quote | signed quote token | av-sync frame-exact | quote → job, refund once | PROVEN T3 |
| editing | `montage` / `montage` / `video.editing` | chat on a delivered artifact | `/api/agent/media/montage` | native | quote token | av-sync | quote → job | PROVEN T3 (PR #57) |
| remix | `remix` / `remix` / `video.remix` | Remix tool (`#omni`, **shared with Music**), chat on an attached video | `/api/video/remix`, `/api/video/remix-intent` | native | panel | none | per op | UNVERIFIED (B6) |
| motion · swap · vfx | — / `motion` `swap` `vfx` / `video.motion` `video.character-swap` `video.vfx` | their tools | remix route ops | native | panel | none | per op | UNVERIFIED (B6) |

Three things this table shows that the user feels:

1. **Three doors, three vocabularies.** A film is approved on a storyboard revision and checked frame-exact; a montage is
   approved on a signed quote and checked frame-exact; a remix op is neither approved nor checked. The same user asks all
   three in the same chat.
2. **The entries are inconsistent.** `video` is a hash (`#film`), `remix` shares the `#omni` hash with Music, `montage` is a
   path (`/montage`) for which no `app/[locale]/montage` page file exists in the tree (the montage surface is a mode inside
   `OmniStudio`); how that tile lands is UNVERIFIED from here (a T2 browser check).
3. **Only the film and the montage have a QC that can refuse.** The remix family (remix, motion, swap, vfx, the ad's i2v
   step) delivers whatever the provider returns.

## 2. Target: one Video Studio, four modes, one contract

```text
Video Studio  (one surface, one entry per locale; the tiles video / remix / montage all land here, each on its mode)
 ├─ Create   (film · single clip · music video · long-form when open)      ← storyboard revision → render → frame-exact QC gate
 ├─ Edit     (remix ops: trim, captions, colour, swap, motion, vfx)        ← per-op quote → run → output QC (frames · audio present)
 ├─ Montage  (clips + track → beat-cut film; add / replace / re-export)    ← signed quote → job → av-sync QC
 └─ Extend   (an artifact's next revision: edit, re-cut, re-mix, re-export) ← parent kept, child = new artifact, lineage shown
 shared: durationContract (lengths said as requested · native · final) · revision/approval (fingerprint) · QC gate (withhold, refund once)
         · one refusal vocabulary (lib/video/contracts VIDEO_REFUSALS) · one Library lineage (parent → revisions)
```

What stays exactly as it is: the catalogue ids and names, the tool ids, the Agent G capability ids, the routes' URLs
(clients and the Library keep working), the billing rules (no price, provider or flag changes — §11), and every other
studio.

## 3. Stages (each one shippable, each one reversible)

| Stage | What | Files (expected) | Not touched | Done when | Rollback |
| --- | --- | --- | --- | --- | --- |
| 0 ✅ this PR | The registry and the refusal vocabulary; the QC gate; the storyboard approval checked server-side | `lib/video/contracts.ts`, `masterQa.ts`, `finalCut.ts`, assemble + orchestrate routes, `revision.ts` | everything else | `contracts.test`, `assembleQcGate.test`, `storyboardApproval.test` green (they are) | revert the two commits |
| 1 | **One entry.** The three tiles land on one surface with a mode: `video` → Create, `remix` → Edit, `montage` → Montage. The `#omni` hash stops being shared with Music for the remix tile; the `/montage` entry becomes an explicit, tested route (or an explicit hash) | `lib/services/serviceCatalogue.ts` (targets of the 3 video tiles only), `components/studio/OmniStudio.tsx` (mode switch), one page or hash handler | the Music tile's `#omni`, every other tile | a T2 browser run: each tile lands on its mode after a cold load and after a same-path click; `serviceCatalogue.test` updated | targets back to today's values (3 lines) |
| 2 | **One length contract for the edit lanes.** Remix ops that change length (trim, speed, extend) say requested · native · final and are checked on decoded frames like the film (`frameCount`, `masterQa`); outputs that lose audio are refused like `silent_master` | `lib/video/remixOps.ts`, `app/api/video/remix/route.ts`, `masterQa.ts` (facts only) | providers, prices | the remix ffmpeg suites measure frames; `qc_rejected` reachable from the remix route; refund once pinned | the gate behind a flag default-off for remix only |
| 3 | **One approval for anything charged.** The remix family quotes before it runs (credits, length, engine) and runs on a signed quote token like the montage; the ad's two steps become one quote | `lib/agent/media/quoteToken.ts` (reuse), remix route, Product tool | montage/edit (already there) | no charged op without a prior quote card; idempotent on retry (`produceBilling`) | per-op path kept behind the same flag |
| 4 | **One lineage.** Every delivered video is an artifact with a parent (none for a Create), the storyboard revision it came from (`storyboardApproval` in the job metadata, already carried), and its QC; the Library shows the chain | Library row writer (`recordCompletedFilm`), montage/edit job rows | Library UI of other studios | a Create → Edit → Montage chain is one lineage in the Library | additive columns in JSONB `result` — no migration (B3 names the only table proposal) |
| 5 | **Retire the duplicates.** `FilmStudioHome`, `RemixStudioConsole`, `FilmDirectorConsole` fold into the modes; the long-form order joins Create when B1/B4 open | the three components, `createPanel.ts` (`LONGFORM_ORDER_WIRED`) | — | no second surface for a video lane; `capability-matrix` has one row per lane | keep the components one release behind a flag |

Stage order is fixed; stages 1 and 2 can ship in one PR each. No stage needs a database migration, a new provider, a price
change or a new flag's public exposure; stage 1 needs a Preview run (B2) to be called done.

## 4. What is deliberately NOT in this plan

- The Image Studio branch and the Image, Music, Avatar, Dubbing, Interior, 3D, Presentation and Live Voice studios: not
  touched, not re-targeted, not restyled (GG: „სხვა Studio-ები არ შეცვალო“).
- Provider or model changes for the remix family (B6), prices, public flags, secrets (§11).
- Applying `proposals/20261012a_storyboard_revisions.sql` (B3); the approval is code-level until GG's word.
- Opening long-form (B1 budget + B4 switch).

## 5. Decisions for GG (none blocks stage 0)

| # | Decision | Default the plan takes if unanswered |
| --- | --- | --- |
| D1 | The one entry's shape: a path per mode (`/video/create`, `/video/edit`, `/video/montage`) or one path with a mode query (`/video?mode=edit`) | one path with a mode query (one page, no new routes) |
| D2 | Whether the Remix tile may leave the `#omni` hash (Music keeps it) | yes, at stage 1 |
| D3 | Whether a remix op that changes length must be frame-exact like the film (stage 2) | yes — one contract for the studio |
| D4 | Whether the remix family must quote before it charges (stage 3) | yes — no charged op without a quote |
| D5 | The single-clip path answers a failed fetch/cut as `assemble_failed` (500) while the saga path says `assembly_failed` (502): unify the spelling at stage 1 (a wire change clients may read) | keep both until stage 1; the registry names both, the QC refusal (`qc_rejected`) is already one word on both paths |

## 6. Acceptance for the whole consolidation (maps to AC-26 · AC-27)

1. One surface: every video tile and every `video.*` Agent G capability lands on the Video Studio, on its mode (T2).
2. One vocabulary: every refusal a user can see is in `VIDEO_REFUSALS`, and every lane can refuse before any charge (T1, `contracts.test`).
3. One QC: every lane that changes length is checked on decoded frames and withholds a failed master, refunding once (T3).
4. One approval: nothing is charged without a prior approval (storyboard revision or quote token) that the server re-checks (T1 + T2).
5. One lineage: a delivered video names its parent, its storyboard revision and its QC in the Library (T2/T4).
