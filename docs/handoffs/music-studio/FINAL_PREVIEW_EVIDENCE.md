# Music Studio v1 — FINAL Preview evidence (2026-10-14)

## Preview database = Production database (re-verified read-only, names/targets only)
`vercel env ls`: `NEXT_PUBLIC_SUPABASE_URL` → Production, Preview, Development (one row); `SUPABASE_SERVICE_ROLE_KEY` → Development,
Preview, Production (one row). No `MUSIC_*` or `MUSIC_STUDIO_E2E_FAKE_PROVIDER` variable on any target.
⇒ **No mutating Music Studio test was run on any Preview**, and no Music Studio flag was set there (brief: never enable studio flags on a
Preview connected to Production Supabase). Creating an isolated Supabase project would be a new billable resource → not authorised.

## What WAS done on Preview
| Item | Evidence | Class |
|---|---|---|
| Vercel Preview build identity → GCP WIF (STS + SA impersonation) | build `c4c8792e`: `[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok` | PROVEN_PREVIEW |
| 3 live Lyria calls from the Preview build (no app, no DB, no user) | FINAL_REAL_LYRIA_E2E.md; `evidence/lyria-live/result.json` | PROVEN_PREVIEW |
| Result files served by that Preview only, downloaded, digests equal to the build's | `…-p6hshpgfb…/preview-checks/lyria/*` | PROVEN_PREVIEW |
| Later Preview builds spend nothing | `abe8b234`, `5b6e6c07`: `[lyria-check] skipped: no request file` | PROVEN_PREVIEW |
| Preview deploys of the branch build green with the new step | Vercel status on each SHA | PROVEN_PREVIEW |

## What was NOT done on Preview (and why)
| Item | Class | Unblock |
|---|---|---|
| Studio UI with `MUSIC_STUDIO_ENABLED=1` / `NEXT_PUBLIC_MUSIC_STUDIO_V1=1` | BLOCKED | an isolated Supabase project for Preview (owner: new resource), or written approval to use Production data |
| Live quote → debit → worker → Vertex Lyria → Storage → Library on a real account | BLOCKED | same; this is the only path where the studio worker itself calls live Lyria (Vertex = Preview identity only) |
| Forced failure → `:refund` once on Preview | BLOCKED | same |
| Real microphone | BLOCKED | a person with a microphone on an isolated Preview |

The equivalent chain is proven on the isolated CI stack with real Lyria bytes replayed (PHASE2_E2E_MATRIX.md).
