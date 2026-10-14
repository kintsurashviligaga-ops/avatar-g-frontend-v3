# Music Studio v1 — 05 Branch, PR, release & rollback, owner approvals

## Branch / commits / PR
- Branch: `claude/music-studio-v1-20261014` (from `origin/main` fef867a, own worktree; no other agent's branch touched; never force-pushed)
- Draft PR: see README.md (URL recorded there after creation)
- Compatibility: `git merge-tree` against PR #60 (`codex/image-studio-v1`) and PR #64 (`claude/video-core-final-20261013-234606`) — **both merge without conflicts**. Shared files: `components/studio/OmniStudio.tsx` (#60), `scripts/lease-isolation/run.sh` (#64). No interface of either PR was changed; Music Studio reuses main's `jobLease` / `quoteToken` / ledger, the same primitives #60 builds on, and does not depend on either unmerged branch.

## Switches (all OFF by default — merging changes nothing user-visible except the provider-boundary refusals)
| Variable | Where | Effect |
|---|---|---|
| `MUSIC_STUDIO_ENABLED=1` | server | `/api/music/studio/*` answer (off → 503 `not_enabled`; the sweep still settles debts) |
| `NEXT_PUBLIC_MUSIC_STUDIO_V1=1` | client build | the Music tool's Create opens the plan card instead of the old synchronous route |
| `MUSIC_LYRIA_VOCALS_VERIFIED=1` | server | offers sung vocals (only after Phase 8) |
| `MUSIC_LYRIA_PRO_VERIFIED=1` + `MUSIC_LYRIA_PRO_SECONDS` | server | offers Lyria Pro at the verified length |
| `GEMINI_TRANSPORT=vertex` (+ existing Vertex WIF config) | server | preferred transport |
| `AGENT_G_QUOTE_SECRET` (optional) | server | quote HMAC key (falls back to the service-role key, as Agent G media does) |

## ⚠️ Behaviour that changes on merge even with the switches off
The provider boundary is enforced unconditionally: Udio / ElevenLabs Music / MusicGen picks, covers, "sing in my voice" (MiniMax / RVC), chat music, `/api/udio/generate`, `/api/orchestrator/music/produce` and Demucs stem separation are refused (`400 unsupported`, nothing charged). Lyria composition on `/api/ai/music` keeps working. If the owner wants the boundary change and Music Studio separated, the boundary commits can be split into their own PR.

## Release procedure (after the approvals below)
1. Required CI green on the exact final commit of the PR.
2. Merge to main (owner) → Preview deploy.
3. Preview env: `MUSIC_STUDIO_ENABLED=1`, `NEXT_PUBLIC_MUSIC_STUDIO_V1=1`, `GEMINI_TRANSPORT=vertex`. Confirm the cron `/api/music/studio/sweep` is listed.
4. Run Phase 8 (03_PROVIDER_VERIFICATION_AND_SPEND.md) on Preview with the owner's test account; record the ledger before/after.
5. If vocals pass: `MUSIC_LYRIA_VOCALS_VERIFIED=1` on Preview, repeat with a song.
6. Production: set the same variables (owner), redeploy, smoke one instrumental on the owner account, watch `ops_marker music_studio_unsettled` and `audit.agent_g.media` rows (`toolId music.generate`).

## Rollback
- Fast (no deploy for the server switch): `MUSIC_STUDIO_ENABLED=0` — new quotes/starts refused; the sweep keeps paying any refund owed by jobs already started. Client flag off needs a rebuild (`NEXT_PUBLIC_*`); with the server off the card shows "not switched on".
- Full: revert the merge commit. No migration to undo (state lives in `generation_jobs.params`, Storage under `renders/music-studio/`).
- In-flight jobs at rollback: leave the sweep cron running until `listOwed('music-studio-v1')` is empty (the sweep returns `unsettled: 0`).

## Exact owner approvals needed
1. **Merge** PR (Draft → Ready → main). Optionally split the provider-boundary commits.
2. **Provider boundary** sign-off: Udio / ElevenLabs Music / Replicate music paths refused for all users (current Production still allows them when `MEDIA_GOOGLE_ONLY` is off).
3. **Paid Phase 8 test**: budget ceiling **$5** (planned ≈ $0.16), Vertex on the owner's GCP account.
4. **Preview env vars** (`MUSIC_STUDIO_ENABLED`, `NEXT_PUBLIC_MUSIC_STUDIO_V1`, `GEMINI_TRANSPORT=vertex`).
5. **Production env vars + public activation** (separately, after Preview evidence).
6. **Vocals**: set `MUSIC_LYRIA_VOCALS_VERIFIED=1` only after hearing the Phase 8 vocal output.
7. **Product decisions**: edits free vs priced; cover art (Google image) or none; whether ElevenLabs Voice Isolator (`/api/audio/isolate`) counts as permitted voice functionality; pricing tier for a 30 s Lyria Clip (currently `music_30s` = 5 credits).
8. **No Production migration is required.**
