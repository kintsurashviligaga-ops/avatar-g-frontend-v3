# 09 — Provider spend ledger (Google, live)

Also referenced as `PROVIDER_SPEND_LEDGER.md`. One ledger per approval; approvals are **not** combined.

## Approval GG-20261014-GLOBAL-E2E-EXTRA-USD5 — cap USD 5.00 total (this task)

Transport: Vertex AI, keyless (Vercel OIDC → GCP STS → service account; WIF subject
`owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview`). Mechanism:
`scripts/global-e2e/preview-media-check.cjs`, ONE Preview build of commit **95432a2b** (deployment
`avatar-g-frontend-v3-lskuf1hqo-…vercel.app`, build started 2026-10-14T14:29:34Z, iad1). Build log line
`[gcp-auth-check] … ok=true mode:wif token:ok bucket:ok sign:ok` preceded the calls. One call per case, no retry, no parallelism;
worst case reserved before the first call.

| # | UTC (build log) | Case | Model | Region | Request / operation id | HTTP | Reserved (worst) | Estimate | Cumulative est. | Remaining (vs reserve) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 14:30:49 | IMG-1 text→image 16:9 | gemini-3.1-flash-image | global | — (sync) | 200 | 0.15 | 0.067 (1 120 image tokens) | 0.067 | 4.85 |
| 2 | 14:31:01 | IMG-2 edit background (image+text→image) | gemini-3.1-flash-image | global | — (sync) | 200 | 0.15 | 0.067 (1 148 in / 1 120 out) | 0.134 | 4.70 |
| 3 | 14:31:53 | VEO-1 t2v 9:16 4 s 720p audio | veo-3.1-fast-generate-001 | us-central1 | op `6bc95d61-879c-4bc1-8f27-0e85ee536ebe` | 200 | 0.60 | 0.40 ($0.10/s × 4) | 0.534 | 4.10 |
| 4 | 14:32:34 | VEO-2 i2v 16:9 4 s 720p audio (input = IMG-1) | veo-3.1-fast-generate-001 | us-central1 | op `4e530e0b-3d29-434c-a70a-fb84a793b9ec` | 200 | 0.60 | 0.40 | **0.934** | 3.50 |

- **Estimated spend: USD ≈ 0.93. Reserved upper bound: USD 1.50. Ambiguous calls: 0** (all four returned 200 with bytes).
- Actual billed amount: **not visible from here** (GCP Billing is owner-readable only). Owner check: Cloud Billing → reports,
  project `gen-lang-client-0671348730`, SKU filter "Veo" / "Gemini 3.1 Flash Image", 2026-10-14.
- Price sources: Veo — `lib/veo/capabilities.ts:108-112` (rechecked 2026-10-14 by the Video Core run); image — third-party
  listings of Google's rate ($0.0672 per 1K image; Google's page not machine-readable here), reserved at the 4K tier.
- **Remaining under this approval: not to be used.** The approval expires with this task; no armed trigger is left (below).

## Earlier approval (separate, NOT combined): GG-20261014-MUSIC-LYRIA-E2E-USD5

3 × `lyria-3-clip-preview` HTTP 200 from Preview build c4c8792e, ≈ USD 0.12 estimated (`docs/handoffs/music-studio/` on #65).

## Earlier: Veo L1 smoke 2026-10-08 (GCP Part 0)

1 × Veo 3.1 Fast 4 s via `/api/admin/veo-smoke`, quoted USD 0.40, billed amount unconfirmed.

## Replay protection (Phase 8 security fix)

| Trigger | State now | Residual |
|---|---|---|
| `scripts/global-e2e/preview-media-check.cjs` | request file deleted and hook removed in **a31b7205** (pushed after the 95432a2b deploy finished). The script refuses any request whose `notAfter` has passed (`2026-10-14T17:28:27Z` for 95432a2b) or is > 6 h ahead → a redeploy of 95432a2b after that moment spends nothing (unit-tested). | a redeploy of 95432a2b **before 17:28:27Z** would repeat ≤ USD 1.50 |
| `scripts/music-studio/preview-lyria-check.cjs` (#65) | hook removed from `vercel.json` in **97f64337** on #65 | commit **c4c8792e** still contains its request file and has no expiry: a manual "Redeploy" of that exact deployment would repeat 3 Lyria calls (≤ USD 0.12). Owner may delete that Preview deployment (`vercel rm <url>`) — not done here (outward action on Vercel). |
| `scripts/gcp/preview-inference-check.cjs` (main) | hook removed on this branch (a31b7205) and on #65 | commit **396cb354** (2026-10-08) contains its request file: redeploy would repeat 1 Gemini text call (< USD 0.01) |

Rule for any future paid build step: request file **must** carry `notAfter` (≤ 6 h) and be deleted in the next commit; the hook is
added and removed with it. CI (GitHub Actions) never has the Preview identity, so CI reruns cannot spend.

Public evidence: the four files are served at `/preview-checks/global/*` **only on that one Preview deployment** (synthetic toy-robot
prompts, no user data, no secrets). Later builds do not contain them (`public/preview-checks/` is generated at build time, not committed).
