# Phase 3 measurements

Spec §4.1 asks for measurement before optimisation. This file holds the Phase 3 numbers as they were taken, with each run's setup and spans. `PERFORMANCE_BASELINE.md` v2 sums them up, one row per §4.1 interaction.

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

## After PR 5: films kept between showings (24 October 2026)

**What was measured:** the code of `claude/p3-05-posters` (the report's commit column shows its base, `b8a2fab2`), same benchmark, same fixtures, same machine as the tables above.

| Interaction | §4.1 target | After PR 2 p50 / p95 | After PR 5 p50 / p95 | What the run shows |
|---|---|---|---|---|
| Media requests on a warm return | (none) | 12 | 0 | The film cards get their own `<video>` elements back, already loaded, so no film is read again. Before this PR every return read the metadata of all 12 films. |
| Library, warm return to a tab already shown | p95 ≤ 150 ms, no blank replacement screen | 29.7 / 55.8 ms | 29.4 / 41.5 ms | Still met. Spinner in 0 of 30 returns, 0 Library requests. |
| Library, first open of a tab | (none) | 123.6 / 140.1 ms | 121.9 / 143.1 ms | Unchanged, as expected: it still waits for the API. |

**Also in this PR:** a return to the Library (a reload, or back from Montage) opens the tab, page and search it was left on, scrolled where it was, and reads only that tab. `tests/library-films-kept.spec.ts` checks this after a reload: the Library API is asked only for Music, and the Video tab is never read. The benchmark above still starts every run on the first tab.

**What this does not show:**

- How many films the first open of a page reads. A film now gets its link only when its card is within 300 px of the screen. `tests/library-films-kept.spec.ts` shows this on a phone-sized window: a film far below the screen reads nothing until it is scrolled to. The benchmark does not count first-open reads.
- No poster images were made. Works have no stored poster, and making one would need the producers, storage and a decision from the owner. Instead, the card keeps the film's first frame from its own element.
- Production or Preview. These are mock numbers, as above.

## After PR 6: download (24 October 2026)

**What was measured:** the code of `claude/p3-06-download` (the report's commit column shows its base, `b70d7fdb`), same download benchmark, same fixtures, same machine as the "Download with #166" table. Each sample now waits 1.1 s before the next one, because a tap on the same link within 1 s of a finished save is the same save (a double click saves one file). The wait is outside every timing.

| Interaction | §4.1 / §4.3 target | With #166 p50 / p95 | After PR 6 p50 / p95 | What the run shows |
|---|---|---|---|---|
| Storage link, click to request | app overhead ≤ 250 ms | 70.3 / 84.8 ms | 74 / 98.7 ms | Met. |
| Storage link, click to saving starts | initiation measured apart from transfer | 84.6 / 102 ms | 91 / 114.7 ms | Met: saving starts after the headers. The time to a complete file is measured on its own, in the next row. |
| Storage link, click to file complete | (none) | 1775.3 / 1806.4 ms | 1796.8 / 1864.9 ms | The link speed sets it (about 1678 ms for the file). |
| Foreign link, click to saving starts | (none) | 1738.8 / 1747 ms | 1743.7 / 1775.4 ms | Unchanged: an 8 MB file on another origin is still read, then saved. |

**What else this PR changes, checked by tests rather than timed:**

- **A double click saves one file.** `lib/media/saveMedia` gives a second tap on the same link the first one's outcome while it runs and for 1 s after it produced a file.
- **A link that ran out is signed afresh.** Storage's 400, 401 or 403 makes the Library read its page again, and the save goes on with the work's fresh link. `tests/storage-download-start.spec.ts` shows it: the refused HEAD, one more Library read, one file, nothing opened in a tab.
- **3D models, PDFs and songs from our Storage start like pictures and films.** The browser takes the file as it arrives, named `.glb`, `.pdf` or `.mp3`. Before, a `model/gltf-binary` link was read whole into the page first.
- **Off an iPhone, no large file is held in memory.** A file over 50 MB on another origin, or a video there of unknown size, opens in a new tab instead. A link to our Storage takes this path only when its headers could not be read within 2 s.

**What this does not show:** Production or Preview. Whether production Storage answers HEAD on `/object/sign/` with the same types is not measured here. A file over 50 MB on another origin is covered by unit tests, not by the benchmark.

## After PR 7: chat (24 October 2026)

**What was measured:** the chat benchmark (`perf/chat-ttft.perf.ts`), now with three runs of the same turn, on `5ff5b376` (PR 6's head, the "before") and on the code of `claude/p3-07-chat-ttft` (the "after"; the report's commit column shows its base). Both used the same benchmark file, fixture and machine. Each run is 30 traced turns after one warm-up turn.

- **Normal:** every dependency at the fixture latencies above.
- **Slow memory:** the memory's embedding takes 1500 ms instead of 150 ms.
- **Cold admin check:** the signed-in user has a confirmed email that is not on the static admin list, so the avatar check reads the admin list from the database. That read takes 800 ms, and the cache is emptied before every turn, as on an instance that has not read it yet.

| Run | §4.1 target | Before p50 / p95 | After p50 / p95 | What the run shows |
|---|---|---|---|---|
| Normal | p50 ≤ 1.5 s, p95 ≤ 4 s on an authorised warm benchmark | 696.7 / 699.5 ms | 697.2 / 700.3 ms | Unchanged. Everything is in before the 500 ms deadline, so the turn is the same. |
| Slow memory | (same) | 2046 / 2047.1 ms | 996.6 / 998.1 ms | The model was asked only after the slow memory. Now it is asked at the deadline, without the memory. |
| Cold admin check | (same) | 1481 / 1482.3 ms | 995.9 / 998.2 ms | The response waited for the admin list before it started. Now the check runs alongside the budget, and the turn stops waiting for it at the deadline (no avatar is offered that turn). |

**Spans, median (ms):**

| Run | | rate | auth | admin | budget | profile | embed | memory | model | ttft |
|---|---|---|---|---|---|---|---|---|---|---|
| Slow memory | before | 30.7 | 60.5 | 0.2 | 80.3 | 40.7 | 1500.6 | 1551.2 | 401 | 2045.2 |
| Slow memory | after | 30.8 | 60.6 | 0.2 | 80.4 | 40.6 | (late) | (late) | 400.9 | 995.9 |
| Cold admin check | before | 30.8 | 60.6 | 800.7 | 80.3 | 40.3 | 150.6 | 201.1 | 401 | 1480.1 |
| Cold admin check | after | 30.8 | 60.5 | 800.6 | 80.4 | 40.7 | 150.2 | 200.8 | 400.5 | 995.2 |

"(late)" means the span ended after the turn's spans were written, because the turn no longer waited for it.

**How:** in `app/api/chat/gemini/route.ts`, the profile facts, the memory and the avatar check get `CONTEXT_DEADLINE_MS` (500 ms) from when they start, or until the budget answers if that is later. The budget is still waited for in full and still fails closed. 500 ms is a chosen bound: production latencies of these steps have not been measured.

**What this does not show:**

- A real provider. The §4.1 chat target is for an authorised warm benchmark on live Flash, and that is the owner's decision 3, not taken. These are mock numbers: the route's own waits over fixed fixture latencies.
- Production or Preview latencies of the memory, the profile read or the admin list read. How often a real turn hits the deadline is not known.
- The first open of the route on a cold function. Every run here is warm.
