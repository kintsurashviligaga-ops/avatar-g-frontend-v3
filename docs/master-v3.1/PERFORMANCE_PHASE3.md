# Phase 3 measurements

Spec §4.1 asks for measurement before optimisation. This file holds the Phase 3 numbers as they are taken. Phase 3 PR 8 folds them into `PERFORMANCE_BASELINE.md` v2.

## How to read these numbers

- **Only the mock environment is measured.** Mock means the real app code runs on a local server with fixed, made-up latencies for the provider, the database and the network. It shows the app's own overhead and which waits it puts in series. It is not a provider number and not a production number (§4.1: "Mock tests establish app overhead, not real provider performance").
- **Preview, warm: not measured.** It needs a test account with seeded assets in the shared database (plan decision 4, still open).
- **Live provider: not measured.** It needs GG's authorisation and a budget for about 30 + 30 Flash turns (plan decision 3, still open).
- Every p95 below comes from 30 samples, nearest rank, after one warm-up that is not counted.
- Server spans come from `lib/perf/serverTiming` on traced requests only (`x-myavatar-trace`). A span is a name and a duration. It never carries a prompt, text, audio, user id or link.

To reproduce: `npm run perf:mock`, then `npm run perf:report`. That runs `perf/chat-ttft.perf.ts`, `perf/library.pw.ts` and `perf/download.pw.ts` against `next dev` on the dummy Supabase. Every fixture latency can be changed through a `PERF_FIXTURE_*_MS` or `PERF_DOWNLOAD_*` variable.

## Before (24 October 2026)

**What was measured:** commit `af3a716c`, which is `main` at `31e5d372` plus this PR's instrumentation only. Run against `next dev` on a Linux container, in headless Chromium at 1280 × 800.

| Interaction | §4.1 target | p50 | p95 | What the run shows |
|---|---|---|---|---|
| Library, warm return to a tab already shown | p95 ≤ 150 ms, no blank replacement screen | 124.7 ms | 142 ms | The time fits only because the API fixture answers in 80 ms. Every return blanks the grid behind the spinner (30 of 30), sends one Library request and re-requests the media: 12 requests for 12 films. |
| Library, first open of a tab | (none) | 120.8 ms | 139.1 ms | Same path as the warm return. Nothing is kept per tab. |
| Download, click to request (storage link) | app overhead ≤ 250 ms | 48 ms | 57.9 ms | Met. |
| Download, click to saving starts (storage link) | initiation measured apart from transfer | 1747.9 ms | 1783.1 ms | Saving starts only after the whole 8 MB has arrived. The paced link needs about 1678 ms for that file, so initiation equals the transfer. |
| Download, click to file complete (storage link) | (none) | 1792.9 ms | 1823.2 ms | |
| Download, click to saving starts (foreign link) | (none) | 1745.8 ms | 1857.9 ms | Same byte path. |
| Chat, first semantic token (fixture latencies) | p50 ≤ 1.5 s, p95 ≤ 4 s on an authorised warm benchmark | 696 ms | 697.8 ms | Fixture total, not a provider TTFT. The spans below show the critical path. |

**Fixtures:**

- **Library:** 12 items per tab. The API answers after 80 ms. Media are a 41 KB webm and a 99 KB jpg (Playwright's Chromium plays no H.264).
- **Download:** an 8 MB film on a local HTTPS server that sends the whole file at 40 Mbit/s and answers HEAD and range reads at once. The storage link is our signed Storage origin, resolved to that server. The foreign link is the same server under another origin.
- **Chat fixture latencies, in ms:**

| rate | auth | budget | profile | embed | memory RPC | first token |
|---|---|---|---|---|---|---|
| 15 | 60 | 80 | 40 | 150 | 50 | 400 |

### Chat spans (median of 30 traced turns, ms)

| rate | auth | admin | body | prompt | budget | profile | embed | memory | model | ttft |
|---|---|---|---|---|---|---|---|---|---|---|
| 30.8 | 60.5 | 0.2 | 0.1 | 0.6 | 80.3 | 40.8 | 150.5 | 201 | 400.9 | 694.9 |

TTFT comes out as `rate + auth + body + prompt + max(budget, profile, memory) + model`:

- `rate` is two rate-limit checks in series: the IP read limit, then the per-user chat limit.
- `budget`, `profile` and `memory` already run in parallel. Memory is the longest of the three, because it waits for the embedding and then for the vector lookup.
- On this path the model call starts only after all three have finished.

Phase 3 PR 7 works on this path. It gives profile and memory a deadline and drops them when they run late. Billing stays a hard gate that fails closed.

### Download with #166 (same benchmark; #166 is in `main` since `201a5839`)

| Interaction | p50 | p95 |
|---|---|---|
| Storage link, click to request | 70.3 ms | 84.8 ms |
| Storage link, click to saving starts | 84.6 ms | 102 ms |
| Storage link, click to file complete | 1775.3 ms | 1806.4 ms |
| Foreign link, click to saving starts | 1738.8 ms | 1747 ms |

**What changes with #166:**

- On our signed Storage links, saving starts about 1.66 s sooner, because the browser takes the file as it arrives.
- Time to a complete file is unchanged, because the link speed sets it.
- The extra 20 ms or so before the request is the HEAD check.
- Other links keep the old path.
- Whether production Storage answers HEAD on `/object/sign/` is not measured here.

## After PR 2: one Library cache (24 October 2026)

**What was measured:** the code of `claude/p3-02-library-query` (the report's commit column shows its base, `9feeadec`), same benchmark, same fixtures, same machine as the "before" table.

| Interaction | §4.1 target | Before p50 / p95 | After p50 / p95 | What the run shows |
|---|---|---|---|---|
| Library, warm return to a tab already shown | p95 ≤ 150 ms, no blank replacement screen | 124.7 / 142 ms | 29.7 / 55.8 ms | Met. The grid comes back from the cache: spinner in 0 of 30 returns (before: 30 of 30), 0 Library requests (before: 1). |
| Library, first open of a tab | (none) | 120.8 / 139.1 ms | 123.6 / 140.1 ms | Unchanged. A tab not loaded yet has nothing true to show, so it still waits for the API and shows the spinner. |
| Media requests on a warm return | (none) | 12 | 12 | Unchanged. The films are rebuilt as `<video>` elements and read their metadata again. Phase 3 PR 5 (posters) works on this. |

**What this does not show:**

- The 30 s window. Each warm return here comes about a second after the tab was shown. A return after 30 s shows the cached grid at once and refreshes it behind the grid (unit test `LibraryGallery.test.tsx`); that refresh is not timed here.
- Production or Preview. These are mock numbers, as above.
