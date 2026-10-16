# Music Studio v1 — FINAL spend report (Google Lyria), approval GG-20261014-MUSIC-LYRIA-E2E-USD5

Cap: **USD 5.00 cumulative**. Reference price rechecked 2026-10-14: `lyria-3-clip-preview` **$0.04 per 30-s clip** (Gemini API pricing
listings, aggregators dated Aug–Sep 2026; matches the 2026-10-08 billed Vertex run). The Vertex pricing page could not be read
(truncated) — treat $0.04 as a reference, not a quote.

## Ledger of every paid request under this approval
| # | When (UTC) | Where | Case | Outcome | Retried? | Reference cost |
|---|---|---|---|---|---|---|
| 1 | 2026-10-14 12:39:09–19 | Preview build `c4c8792e` | A instrumental | HTTP 200, audio | no | $0.04 |
| 2 | 12:39:19–28 | same | B English vocal | HTTP 200, audio | no | $0.04 |
| 3 | 12:39:28–38 | same | C Georgian vocal (experimental) | HTTP 200, audio | no | $0.04 |
| | | | | **Dispatched: 3 · uncertain: 0 · failed: 0** | | **≈ $0.12 (estimate)** |

Builds checked afterwards with no call: `abe8b234` (`[lyria-check] skipped: no request file`, 12:41:29), `5b6e6c07` (12:48:09). Any later
build of this branch also skips (the request file is gone; the step needs it). The isolated E2E replays a stored file — $0.

## Actual billed cost
**NOT AVAILABLE to the agent.** There is no gcloud / Cloud Billing access on this machine. The owner should read the Cloud Billing report
(project in `GCP_PROJECT_ID`, SKU for Lyria / Vertex generative AI, 2026-10-14) and record it here. Until then the figure above is an
**estimate** and must not be presented as billing.

Remaining under the cap (by estimate): **≈ $4.88**. Nothing else is planned.

Claude Code's own execution cost is separate and not included.
