# 04 — E2E matrix (Phase 4)

Head ff3a48c3 on PR #74 (main b21506bb + #60 + #65 + #68 + #67 + voice adapter + Phase 1 fixes). All runs 2026-10-15
18:04–18:25Z. Isolated means a local Postgres or Supabase started in CI with synthetic data, and fake or stubbed
providers. No run touched Production, its database, a paid provider or a bank.

| Service | Evidence on the merged tree | Class |
|---|---|---|
| Video Core (film, storyboard, billing) | Video Core E2E run 38782566423: "billing on real Postgres" ✓ and "live E2E (local Supabase, desktop + phone)" ✓ | PROVEN_ISOLATED |
| Image Studio (#60) | Image Studio Acceptance run 38782566332: "isolated-db" ✓, "image-browser" ✓ | PROVEN_ISOLATED |
| Music Studio (#65) | Music Studio E2E run 38782566427: "Music Studio live E2E (local Supabase, desktop + phone)" ✓ | PROVEN_ISOLATED |
| Voice / Gemini Live + Agent G (#68) | Voice Experience acceptance run 38782566311: "simulated-browser" ✓; Jest voice/policy 872/872 on the button-only contract | PROVEN_ISOLATED (simulated Live; no real Gemini Live session) |
| BOG payments | BOG E2E run 38782566303: "isolated (local Postgres, fake BOG)" ✓. The "BOG sandbox" job finished in 3 s: it skips without sandbox keys, so it proves nothing | PROVEN_ISOLATED (sandbox: UNAVAILABLE, bank object creation broken) |
| One Window / routing | Preview Contract run 38782566309 ✓; CI "verify" run 38782566304 ✓ (tsc, lint, Jest, build) | PROVEN_ISOLATED |
| Cross-studio (music → video montage, image → video) | Covered inside the Video Core and Music live E2E specs above; no separate cross-studio spec | BUILT (partial isolated proof) |
| Any of the above on Production | Only what Production already proved before this branch (memory: admin 4 s Veo clip, ordinary-account paid 16 s film, admin BOG 10 ₾) | PROVEN_PRODUCTION for main only; this branch's changes are not deployed |

## Not run, and why

- Real paid runs (Veo, Lyria, Imagen, ElevenLabs) on this branch: each needs GG's own word (master task; not asked yet).
- A Vercel Preview of this branch: a new Preview needs GG's approval, and Previews share the Production database (FR-2), so this branch has `git.deploymentEnabled: false`.
- Spoken-yes start paths: removed by design (§8.D), so there is nothing to run.
