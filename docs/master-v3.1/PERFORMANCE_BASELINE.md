# Performance baseline (v2, 24 October 2026)

v1 was written in Phase 0, on 22 October 2026, and measured nothing: every number in it was a code constant or a §4.1 target. It is in the Phase 0 audit PR #114, which is still a draft. This v2 replaces it. If #114 is merged later, keep this version of the file.

v2 holds the Phase 3 numbers, one row per §4.1 interaction, as they were before Phase 3 and as they are after it. The run setup, the fixtures and the server spans for each change are in `PERFORMANCE_PHASE3.md`.

## Which environments were measured

| Environment | What it is | State |
|---|---|---|
| Mock | The real app code on a local `next dev`, with fixed, made-up latencies for the provider, the database and the network. Headless Chromium at 1280 × 800 on a Linux container. | **Measured.** It shows the app's own overhead and which waits it puts in series. It is not a provider number and not a production number (§4.1: "Mock tests establish app overhead, not real provider performance"). |
| Preview, warm | Real network and Storage on a Vercel Preview, with a test account that has seeded works. | **Not measured.** It needs that test account in the shared database (owner's decision 4, open). |
| Live provider | An authorised warm benchmark on live Vertex models. | **Not measured.** It needs the owner's authorisation and a cap for about 30 + 30 Flash turns (owner's decision 3, open). |

Every mock p95 comes from 30 samples, nearest rank, after one warm-up that is not counted. No phone-sized run was timed: the phone checks in Phase 3 are behaviour tests, not timings.

## Per interaction (§4.1)

"Before" is the Phase 3 starting point: `af3a716c`, which is `main` at `31e5d372` with the measuring code only. Two exceptions: the slow-memory and cold-admin chat runs were added in PR 7, so their "before" was taken then, on `5ff5b376` (the chat route had not changed since the starting point). "After" is the code of the PR named in the last column, on the same machine with the same fixtures.

| Interaction | §4.1 target | Environment | Before p50 / p95 | After p50 / p95 | Target met | Changed by |
|---|---|---|---|---|---|---|
| Click or selection acknowledged | ≤ 100 ms on reference desktop and phone fixtures | all | not measured | not measured | not measured | — |
| My Works, warm return to a tab already shown | p95 ≤ 150 ms, no blank replacement screen | mock | 124.7 / 142 ms. Spinner on 30 of 30 returns, 1 Library request and 12 media requests per return. | 29.4 / 41.5 ms. Spinner on 0 of 30 returns, 0 Library requests, 0 media requests. | Yes, in mock. The "before" time fit only because the API fixture answers in 80 ms, and it blanked the grid. | PR 2 #168 (one Library cache), PR 5 #171 (films kept between showings) |
| My Works, first open of a tab | (none) | mock | 120.8 / 139.1 ms | 121.9 / 143.1 ms | — | Unchanged: a tab not loaded yet still waits for the API. |
| My Works, warm return | same | Preview, warm | not measured | not measured | not measured | — |
| Cached item preview open | p95 ≤ 150 ms to the visible shell | all | not measured | not measured | not measured | — |
| Download, click to request (app overhead, Storage link) | ≤ 250 ms | mock | 48 / 57.9 ms | 74 / 98.7 ms | Yes, in mock. The 26 ms more is mostly the HEAD check (#166) that lets saving start early. | #166, PR 6 #172 |
| Download, click to saving starts (Storage link) | initiation measured apart from transfer | mock | 1747.9 / 1783.1 ms. Saving started only after the whole 8 MB had arrived. | 91 / 114.7 ms. Saving starts after the headers. | Measured apart, as asked. | #166, PR 6 #172 |
| Download, click to file complete (Storage link) | (none) | mock | 1792.9 / 1823.2 ms | 1796.8 / 1864.9 ms | — | Unchanged: the link speed sets it (about 1678 ms for the file). |
| Download, click to saving starts (link to another origin) | (none) | mock | 1745.8 / 1857.9 ms | 1743.7 / 1775.4 ms | — | Unchanged: an 8 MB file there is still read, then saved. |
| Download, warm first byte | p95 ≤ 1 s, apart from transfer | Preview or production | not measured | not measured | not measured | — |
| Chat, first semantic token, all fixtures as set | p50 ≤ 1.5 s, p95 ≤ 4 s on an authorised warm benchmark | mock | 696 / 697.8 ms | 697.2 / 700.3 ms | Not judged: the target is for live Flash. This is the fixture total. | Unchanged: everything is in before the deadline. |
| Chat, first semantic token, slow memory (embedding 1500 ms) | same | mock | 2046 / 2047.1 ms | 996.6 / 998.1 ms | Not judged, as above. | PR 7 #173 (deadline for profile, memory and the avatar check) |
| Chat, first semantic token, cold admin check (admin list read 800 ms, not cached) | same | mock | 1481 / 1482.3 ms | 995.9 / 998.2 ms | Not judged, as above. | PR 7 #173 |
| Chat, first semantic token | same | live provider | not measured | not measured | not measured | — |
| Warm inline read-aloud, first audible speech | p95 ≤ 2.5 s | all | not measured | not measured | not measured | Not in Phase 3. |

## The v1 code facts, now

v1 listed what in the code would shape these numbers. This is where each one stands after Phase 3.

| Area | v1 said | Now | Changed by |
|---|---|---|---|
| Library tab switch | Both Library views fetch with `no-store`, so every tab switch is a full round trip and a re-sign. | One Library cache for the /library page and the studio's slide-over. A warm return comes from it with no request; after 30 s it shows the cached grid and refreshes behind it. The route's header is now `private, no-store`, which is what the views always did. | PR 2 #168 |
| Library signing | `createSignedAssetUrls` per page, plus up to 60 ranged GETs per page to prove legacy manual saves (`LEGACY_PROOFS_PER_PAGE = 60`). | Unchanged. The `proof` span times it on traced requests, but no fixture has legacy rows, so its share of p95 is not measured. | — |
| Library errors | An outer `catch` answered `{ items: [] }` with 200, so a failure looked like an empty Library. | 503 `library_unavailable` when the database cannot be reached, 500 `library_failed` otherwise. `items: []` stays in the body for readers that look only at it. The views show an error with a retry, not an empty grid. | PR 3 #169 |
| Library films | (not in v1) | A film card gets its own `<video>` back on a return, already loaded, so nothing is read again (12 media requests per return became 0). A film gets its link only when its card is within 300 px of the screen. | PR 5 #171 |
| Download | `fetch`, then `await r.blob()` before the save, so starting a save took as long as the whole transfer. | Our signed Storage links (pictures, films, songs, 3D models, PDFs) are saved as attachments: the browser takes the file as it arrives. A double click saves one file. A link Storage refuses is signed afresh once through the Library. Off an iPhone, a file over 50 MB on another origin, or a video there of unknown size, opens in a tab instead of being held in memory. The iPhone and iPad share sheet is unchanged. | #166, PR 6 #172 |
| Chat route | The response, its first keep-alive and the budget check waited for the avatar capability check. Profile and memory ran in parallel, but the model was asked only after all of them. | The avatar check runs inside the stream. The profile facts, the memory and the avatar check are waited for at most `CONTEXT_DEADLINE_MS` (500 ms) from their start, or until the budget answers if that is later. Whatever is late is left out of that turn, and a late avatar check means no avatar offer. The budget is still waited for in full and still fails closed. While the avatar check is out, the budget estimate is priced on the longer of the two prompts. | PR 7 #173 |
| Read-aloud | Client timeout 25 s; the route tries up to 3 times at 25 s each, with `maxDuration = 30`. | Not changed in Phase 3, and not measured. | — |

## The v1 trace plan, now

v1 planned spans from `ui.click` through `provider.first_token` to `ui.render`, tied browser to server by one trace id, with no prompt, audio or link in them. What exists:

- **Server spans** (`lib/perf/serverTiming`, PR 1 #167). They are written only for a request that carries an `x-myavatar-trace` id, and they hold a name and a duration, nothing else. The id is echoed back so the browser side of a trace ties to its server side.
  - **Library route:** `auth`, `db`, `proof`, `sign`, `fav`.
  - **Chat route:** `rate`, `auth`, `body`, `admin`, `prompt`, `budget`, `profile`, `embed`, `memory`, `model`, `ttft`.
  - **Also:** `respond`, the time until the response was handed back, and `total`, the whole request.
- **Browser timings** in the mock benchmarks (`perf/library.pw.ts`, `perf/download.pw.ts`). They cover the click, the request, saving starts, the file complete, the spinner and the request counts.
- **Not built:** spans on the other routes (generation, `quote.reserve`, `provider.start`, `first_audio`), and any trace collection from real users. Nothing is traced unless the request asks for it.

## How to repeat the mock numbers

Run `npm run perf:mock`. It runs `perf/chat-ttft.perf.ts`, `perf/library.pw.ts` and `perf/download.pw.ts` against `next dev` on the dummy Supabase, then prints the report (`npm run perf:report`). Each fixture latency can be changed through a `PERF_FIXTURE_*_MS` or `PERF_DOWNLOAD_*` variable, and the chat's slow runs through `PERF_FIXTURE_SLOW_EMBED_MS` and `PERF_FIXTURE_SLOW_ADMIN_LIST_MS`. Each row of the report carries its environment, commit, payload, network, cache state and sample count beside p50 and p95. A p95 from fewer than 30 samples is marked as indicative.

## What this does not show

- **No real provider, Preview or production number.** Each "not measured" row stays so until the owner takes decision 3 (a live chat benchmark) or decision 4 (a Preview test account).
- **No cold start.** Every mock run is warm.
- **No phone timing.** No run used a phone-sized window or a phone CPU.
- **How often real turns hit the chat deadline.** The 500 ms deadline is a chosen bound. The real latencies of the memory, the profile read and the admin-list read have not been measured.
- **Whether production Storage answers HEAD on `/object/sign/` with the same content types.** The mock Storage does.

## What Phase 3 did not do

No spinner was removed and no progress was faked to improve a number. A first open still shows the spinner while it waits. No billing check was skipped: the chat budget is still a hard gate that fails closed (§4.4). No benchmark spent a billed call.
