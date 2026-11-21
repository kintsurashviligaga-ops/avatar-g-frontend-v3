# MyAvatar.ge

MyAvatar.ge is a Georgian-first AI creative studio. Everything starts from one chat composer: Agent G answers, plans and
runs tasks, and the same composer makes pictures, video clips, music, read-aloud audio and live voice calls with a
talking avatar. Results land in the Library. The site speaks Georgian (default), English and Russian.

Live at **https://myavatar.ge**.

> The full state of the project (what is live, what waits in draft PRs, the launch order) is in
> `MASTER_PROJECT_SUMMARY.md` and `docs/launch/LAUNCH_COMMANDS.md` (draft PR #373). The exact name and accepted values of
> every launch switch are in `docs/launch/ENV_REGISTRY.md` (draft PR #396). This README is the short version.

## What runs where

| Part | Where | Notes |
|---|---|---|
| Web app and API routes | Vercel, project `avatar-g-frontend-v3` | Next.js 14 App Router, TypeScript, Tailwind |
| Database, auth, storage | Supabase project `zwksnayknzggdcenqqxy` | Postgres with RLS, private buckets |
| AI models | Google Cloud Vertex AI only | Gemini (chat, Live, TTS, STT), Veo and Omni (video), Lyria (music), Gemini image |
| Live voice relay | Cloud Run (`services/live-relay`) | WebSocket relay for Gemini Live, EU region |
| 3D worker (draft, off) | Cloud Run GPU job | TRELLIS.2, PRs #366, #367, #369 |
| Code run and browser agent | Vercel Sandbox | Admins only, behind flags |
| Payments | Bank of Georgia (BOG) | Credits wallet. The old Stripe billing page is retired in draft #338 |

There are no OpenAI, ElevenLabs, Replicate, Runway, Suno or HeyGen calls in the app. Generation that cannot be priced
or paid for is refused before any provider call (billing fails closed).

## Services in the composer

- **Agent G**: chat, planning, research, tasks with a live step timeline, Google Drive (picked files only).
- **Image**: Gemini image generation and edits.
- **Video**: one clip of 4 to 10 seconds. Veo by default; Omni when the clip has a Georgian spoken line.
- **Music**: Lyria, with Georgian vocals.
- **Read aloud**: Google Cloud TTS (Gemini TTS).
- **Live**: a voice call with Agent G and an optional talking avatar.
- **Library**: every result, searchable, with favorites.

New services (Smart Editor, Art Director, Music Producer, Virtual Studio, Director's Workflow, 3D Studio, Agent G
plugins, Notion and GitHub connectors) are in draft PRs and stay off until a flag is set. See `ENV_REGISTRY.md`.

## Run it locally

Node 24 is required (`engines.node` in package.json).

```bash
npm ci
cp .env.example .env.local   # fill in the Supabase and Google Cloud values you have access to
npm run dev                  # http://localhost:3000
```

A local run cannot reach Vertex (Workload Identity allows only the Preview and Production deployments), and Preview
deployments block every paid generation because they share Production's database. Paid checks therefore run on
Production, by the owner, within an approved budget.

## Checks

```bash
npm run typecheck            # tsc --noEmit
npm run lint                 # next lint
npx jest                     # unit and route tests (about 18,000)
npm run test:e2e:preview     # the Playwright set that CI runs against a Preview
```

About 20 Jest suites that call ffmpeg fail inside some cloud containers because the ffmpeg-static binary is not
downloaded there (`spawn ENOENT`). That is the container, not the code; CI downloads the binary and runs them.

GitHub CI (`.github/workflows/ci.yml`, `e2e.yml` and others) runs for pull requests into `main`. A PR stacked on another
PR's branch gets only the Vercel check; see Step 8 of `LAUNCH_COMMANDS.md`.

## Repository map

| Folder | What is in it |
|---|---|
| `app/` | Pages (`app/[locale]/…`) and API routes (`app/api/…`) |
| `components/` | UI; `components/studio/OmniStudio.tsx` is the chat composer |
| `lib/` | Server and shared logic: billing, credits, Vertex clients, Agent G, voice, video, music |
| `services/` | Separately deployed services (Live relay, call bridge) |
| `supabase/`, `migrations/` | SQL migrations |
| `docs/` | Design, audits, phase reports, runbooks |
| `tests/`, `e2e/` | Playwright specs |
| `pilots/adk/` | Google ADK read-only pilot (own lockfile and CI, no route) |
| `_graveyard/` | Retired code kept for reference; nothing imports it |

## Rules for changes

- Google Vertex only. A new model or region needs a verified capability row before it can be called.
- Never touch the BOG payment code or the wallet ledger without the owner's written approval.
- New features ship behind a flag that defaults to off. Flag values differ per feature; a wrong value leaves the feature
  off with no error, so copy the value from `ENV_REGISTRY.md`.
- `NEXT_PUBLIC_` variables are built into the client: changing one needs a redeploy.
- Visible text and screen-reader names come in ka, en and ru (`lib/i18n/a11yLabels.ts` for aria-labels).
- Merges to `main` happen one PR at a time, with the owner's OK for each.
