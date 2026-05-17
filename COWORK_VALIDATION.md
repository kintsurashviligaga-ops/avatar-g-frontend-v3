# Sprint validation: voice-memory-onboarding-analytics

Branch: `feature/voice-memory-onboarding-analytics`
Base: `main` @ `896021c`
Health probe before start: `12/12 CONNECTED, 0 errors` at `2026-05-17T09:22:56Z`

## Task 1 — One Window audit
- [x] grep baseline: 16 (`window.open` / `target="_blank"` across legitimate non-chat surfaces — Stripe checkout, social links, admin links, business listings, plus the one documented CapCut escape hatch)
- [x] grep post-sprint: 16 (no new violations introduced)
- [x] All 6 generation handlers in `CommandCenter.tsx` set `media: { kind, url }` — verified at lines 699, 730, 740, 755, 765, 775
- [x] No new `window.open` or `target="_blank"` introduced by any task in this sprint

## Task 2 — Voice Lab (commit `f14e33c`)
- [x] Migration applied: `supabase/migrations/20260517_voice_samples.sql` (RLS owner-only, ivfflat not needed, partial index on user_id)
- [x] `POST /api/voice/clone` accepts multipart `audio` + `name`, calls ElevenLabs `/v1/voices/add`, generates Georgian preview via `eleven_multilingual_v2`, uploads preview to Supabase Storage at `media/voices/{uid}/{vid}.mp3`, returns 1-year signed URL
- [x] `GET /api/voice/clone` lists user voices newest-first
- [x] `DELETE /api/voice/clone?id=` removes (RLS-enforced)
- [x] `PATCH /api/voice/clone` set-as-default flips `is_default`, best-effort updates `avatars.voice_id`
- [x] `VoiceLab.tsx` MediaRecorder (audio/webm;codecs=opus), 30s auto-cap, pulsing red dot, mm:ss timer
- [x] Test playback uses `<InlineMedia kind="audio" url={previewUrl} />` — One Window compliant
- [x] `/[locale]/voice-lab/page.tsx` server component, force-dynamic, redirects unauthenticated to `/{locale}/login`

## Task 3 — Memory (commit `4b553c9`)
- [x] Migration applied: `supabase/migrations/20260517_memories.sql` with `vector(1536)`, pgvector extension, ivfflat cosine index, owner-only RLS, `match_memories(query_embedding, match_count)` RPC scoped by `auth.uid()`
- [x] `lib/memory/embed.ts` — shared embed helper (text-embedding-3-small, null on failure)
- [x] `GET/POST/PATCH/DELETE /api/memory` all auth-gated and RLS-enforced
- [x] `MemoryPanel.tsx` — add textarea, edit-in-place, delete, source badges (auto purple / manual cyan)
- [x] `/[locale]/memory/page.tsx` server component, force-dynamic, auth-gated
- [x] Chat memory injection wired in `app/api/chat/gemini/route.ts`:
  - `extractLatestUserText()` walks messages to find the most recent user text
  - `buildMemoryPreamble()` embeds, queries `match_memories` RPC, formats as `User context (remembered facts):` bullet block
  - Injected into both Gemini and Anthropic system prompts
  - Silent on all failure modes (missing key, no auth, RPC error)
- [x] Sidebar nav updated: Memory entry added to Intelligence section of `DASHBOARD_NAV_SECTIONS`

## Task 4 — Onboarding (commit `f06ed8b`)
- [x] Migration applied: `supabase/migrations/20260517_avatars_onboarding.sql` — additive (existing `avatars` image-gen rows untouched), dropped NOT NULL on `prompt`, added nullable `name`/`personality`/`voice_id`/`system_prompt`, partial unique index on `(user_id) WHERE name IS NOT NULL` so each user gets exactly one persona row while still allowing many image-gen rows
- [x] `GET/POST/PATCH /api/avatar/route.ts` — Zod-validated, `requireUser()` auth, upsert keyed by `(user_id) WHERE name IS NOT NULL`
- [x] `OnboardingWizard.tsx` — framer-motion 3 steps:
  - Step 1: Name (≥2 chars)
  - Step 2: Personality cards (friendly / professional / funny / custom + textarea)
  - Step 3: Voice (3 ElevenLabs presets + Clone-Later → `/voice-lab`)
- [x] Voice previews use `<InlineMedia kind="audio" />` (ported from worktree's native `<audio>` to production InlineMedia)
- [x] `/[locale]/onboarding/page.tsx` — server component, redirects to login if anon, to dashboard if persona exists
- [x] First-login gate: `/[locale]/dashboard/page.tsx` queries avatars for `name IS NOT NULL`, redirects to onboarding if missing

## Task 5 — Analytics (commit `9f1caaf`)
- [x] `GET /api/analytics/summary` — auth-gated 30-day aggregate over `messages` (joined via `conversations.user_id`) and `user_creations`; returns `{ messagesPerDay, generationUsage, topTopics, totalMessages }`
- [x] Dense 30-day buckets (zero-filled so the line chart is continuous)
- [x] Simple JS topic extraction with EN/KA/RU stopwords
- [x] `components/analytics/AnalyticsCharts.tsx` — pure inline SVG (no recharts/chartjs dependency added):
  - `LineChart` (gradient area + grid + max-tick labels)
  - `BarChart` (column per kind with gradient fills)
  - `TopicList` (horizontal bars per topic)
  - `KpiTile` (label + value + accent stripe)
- [x] `/[locale]/analytics/page.tsx` — server component, force-dynamic, auth-gate, fetches summary via internal HTTP with forwarded cookie, renders empty state when `totalMessages < 5`, else KPIs + 3 chart cards
- [x] Layout responsive: 2-col on desktop, single-col on mobile (via inline grid auto-fit)

## Build & invariants
- [x] `npx tsc --noEmit` → exit 0
- [x] `npx next lint --max-warnings 0 | grep -c "Error:"` → 0 (warnings remain — `<img>` → next/image migrations, useCallback deps, aria-pressed — all pre-existing, out of scope)
- [x] `grep -rn "window\.open\|target=\"_blank\"" --include="*.tsx" --include="*.ts" app/ components/ | grep -v rebuild-v2 | wc -l` → 16 (unchanged from baseline)
- [x] No `[COWORK]` debug logs left in committed code
- [x] All commits have meaningful messages with provenance

## Files added in this sprint

```
supabase/migrations/
├── 20260517_voice_samples.sql           # voice cloning
├── 20260517_memories.sql                # pgvector + match_memories RPC
└── 20260517_avatars_onboarding.sql      # additive avatars persona

app/api/
├── voice/clone/route.ts                 # GET/POST/PATCH/DELETE
├── memory/route.ts                      # GET/POST/PATCH/DELETE
├── avatar/route.ts                      # GET/POST/PATCH
└── analytics/summary/route.ts           # GET aggregate

app/[locale]/
├── voice-lab/page.tsx
├── memory/page.tsx
├── onboarding/page.tsx
└── analytics/page.tsx

components/
├── voice/VoiceLab.tsx
├── memory/MemoryPanel.tsx
├── onboarding/OnboardingWizard.tsx
└── analytics/AnalyticsCharts.tsx

lib/memory/embed.ts                      # shared embedding helper
```

## Files modified
- `app/api/chat/gemini/route.ts` — memory preamble injection
- `app/[locale]/dashboard/page.tsx` — first-login onboarding gate
- `components/dashboard/hyperframe.config.ts` — Memory nav entry

## Deployment notes for the maintainer
1. **Do NOT push migrations to production Supabase from this PR alone.** Apply manually after review:
   ```bash
   supabase db push
   ```
   Three migrations to apply: `20260517_voice_samples.sql`, `20260517_memories.sql`, `20260517_avatars_onboarding.sql`. `pgvector` extension required (already common on Supabase).
2. Storage bucket `media` must exist with public read access on the `voices/*` path (Voice Lab uses Supabase Storage).
3. No new env vars required — `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` already configured in Vercel production env.
4. After merge, deploy with `npx vercel --prod`.
