# 08 — Security, billing, RLS, recovery

Honesty note: no new PostgreSQL/PostgREST run happened on this Mac (no Docker). Database claims below cite the PRs' CI jobs on
their exact heads; source claims cite files. Nothing was weakened or skipped.

## Proven in CI on real Postgres (stand-in provider)

| Property | Evidence |
|---|---|
| Exactly-once debit per ref, exactly-once refund `${ref}:refund`, concurrent Confirm → one debit | "billing on real Postgres" ✅ on bcb724a1 (run 38527010610), be9edee3 (38527016388), 54532ff8 (38572860799) |
| Lease queue crash recovery / sweep refunds, delivery outbox CAS, request_idempotency before/after migration, film waiver | `scripts/lease-isolation/run.sh` in the same jobs |
| RLS / owner-only reads for Image Studio rows and storage | `isolated-db` ✅ be9edee3 (38527016387) |
| Music Studio: quote → reserve → lease → deliver / refund-once on live store | `musicIsolation.pg.test.ts` in the 54532ff8 job |

## Found in this run

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | **P1** | Paid preview build steps were replayable: old commits c4c8792e (Lyria) and 396cb354 (Gemini) carry request files with no expiry | hooks removed (a31b7205, #65 97f64337); new step requires `notAfter`; residual documented in 09 |
| S2 | **P1 (billing)** | Paid provider output with **zero credit charge**: `/api/v2/dubbing/start` (ElevenLabs), `/api/v2/presentation/build` (Gemini+Imagen), `/api/pipeline` voice (ElevenLabs) and the uncharged `/api/pipeline` media legs | owner pricing decision; protected only by per-account daily ceilings / rate limits |
| S3 | P2 | `ServiceParamsPanel.tsx:258` says "these services all spend credits" while dubbing/presentation/montage charge none; `/services/software` charges 3 cr without showing a price | copy fix |
| S4 | P2 | Misleading catalogue copy (workflow, shop, visual-intel, media, text) | copy fix / hide |
| S5 | **P0 for launch of Studios** | Preview deployments use the **Production Supabase** → no deployed isolated E2E possible; turning studio flags on in Preview would write Production rows/credits | see 10 |
| S6 | info | `/api/preview/google-check` public but Preview-only, free `countTokens`, no media; `public/preview-checks/*` exist only on the specific Preview deployments that ran a check, synthetic content | acceptable |
| S7 | P2 | Music edit clipping (+5.6 dBTP) | fixed on #65 9d25c7a4 |

## Source-level properties (unchanged, previously audited)

Admin gate = email allowlist; SSRF guard `isPublicHttpUrl` on user URLs; provider error sanitiser (`lib/api/providerError.ts`);
secrets: the new build script never logs tokens/keys or Google error text (unit-tested: `secret detail` absent from output).
