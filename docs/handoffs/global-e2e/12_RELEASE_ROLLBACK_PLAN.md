# 12 — Release order and rollback (proposal; nothing merged or deployed)

## Preconditions (owner)

1. Decide Preview isolation (10, option A or C).
2. Pricing decision for dubbing / presentation / voice (08 S2) — or hide them.
3. Rewrite or hide the misleading catalogue pages (01 §B).
4. Provider-boundary decision for third-party tools (`MEDIA_GOOGLE_ONLY`).
5. Check the GCP bill for 2026-10-14 against 09.

## Merge order (all `--no-ff`, never force)

1. **#64 Video Core** (no new flags; Veo already in Production via the Gemini API transport). Then Production `VEO_TRANSPORT=vertex` + `GCP_*` only if the owner wants Vertex in Production.
2. **#60 Image Studio** — stays OFF (`AGENT_G_MEDIA_EXEC` unset).
3. **#65 Music Studio** (incl. 97f64337, 9d25c7a4) — stays OFF (`MUSIC_STUDIO_ENABLED` unset).
4. **uid-race proposal** (7fe06fb5) — after the shared-chat owner accepts.
5. Astra's voice branch — when Astra pushes and CI is green (merges cleanly today).
6. This certification PR (docs + test + guarded script; the script is not hooked into the build).

Migrations: none required by this PR. #64's waiver table proposal (`20261014a_film_payment_waivers.sql`) is optional and owner-gated.

## Enabling (one studio at a time, admin allowlist first)

Image: `AGENT_G_MEDIA_EXEC` → admin canary → one paid job → check ledger row, private object, Library, refund path → open.
Music: `MUSIC_STUDIO_ENABLED=1` + `NEXT_PUBLIC_MUSIC_STUDIO_V1=1` → same canary. Vocals stay OFF.

## Rollback

| What | How | Data effect |
|---|---|---|
| A studio misbehaves | unset its flag in Vercel Production + redeploy (`vercel redeploy` of the current prod) | none; jobs in flight are refunded by the sweeps |
| A merge breaks Production | promote the previous Production deployment (`vercel promote <prev-url>` / Instant Rollback), then `git revert -m 1 <merge>` on main | none |
| Billing anomaly | flag off; ledger refunds are idempotent (`${ref}:refund`) | refunds once |
| Paid test trigger suspected | there is none hooked; delete old Preview deployments c4c8792e / 95432a2b if paranoid | none |
