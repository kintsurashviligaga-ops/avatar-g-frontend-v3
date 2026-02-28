# MyAvatar.ge — Setup Guide

## Architecture

```
UI Layer (Vercel) → API Gateway (Next.js Routes) → Agent G Router → Job Queue (PostgreSQL)
                                                                        ↓
                                                              CPU/GPU Worker Pools
                                                                        ↓
                                                              Supabase Storage + Realtime
```

## Prerequisites

- Node.js 18+
- pnpm or npm
- Supabase project (with service role key)
- Stripe account (test mode for development)
- Git

## Environment Variables

### Vercel (Web Layer)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://myavatar.ge
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

SUPABASE_SERVICE_ROLE_KEY=eyJ...     # server-only
STRIPE_SECRET_KEY=sk_live_...         # server-only
STRIPE_WEBHOOK_SECRET=whsec_...       # server-only
SERVICE_NAME=myavatar-web
```

### Workers (AI Compute Layer)

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
WORKER_ID=cpu-worker-001
SERVICE_NAME=myavatar-worker-cpu
NODE_ENV=production
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run database migrations
npx supabase db push --linked

# 3. Start development server
npm run dev

# 4. Open browser
open http://localhost:3000
```

## Database Migrations

Migrations are in `supabase/migrations/` and must be applied in order:

| Migration | Purpose |
|-----------|---------|
| `001_core_tables.sql` | Base tables: profiles, jobs |
| `003_jobs_queue_v2.sql` | Job locking + atomic claim |
| `20260228_agent_definitions.sql` | 18 agent definitions |
| `20260228_avatar_storage_buckets.sql` | Storage buckets with RLS |
| `20260228100001_jobs_system_v3.sql` | Enhanced jobs: enums, indexes, idempotency |
| `20260228100002_job_logs.sql` | Job logs + execution trace |
| `20260228100003_worker_heartbeat.sql` | Worker heartbeat table |
| `20260228100004_claim_fn_and_realtime.sql` | claim_next_job fn + Realtime |

## Project Structure

```
app/                          # Next.js App Router pages
  layout.tsx                  # Root layout (AppShell wrapping)
  page.tsx                    # Landing page
  api/
    health/route.ts           # Health check endpoint
    jobs/create/route.ts      # Job creation (Agent G entry)
    jobs/[jobId]/status/      # Job status polling
    agents/execute/route.ts   # Agent execution
    admin/stats/route.ts      # Admin dashboard stats
    avatar/                   # Avatar CRUD routes
    stripe/                   # Stripe payment routes
components/
  AppShell.tsx                # Root shell (Navbar + ErrorBoundary)
  GlobalNavbar.tsx            # Fixed navbar with Avatar G logo
  HeroSection.tsx             # Landing hero
  PricingSection.tsx          # Pricing grid (4 plans)
  OrbitSolarSystem.tsx        # 13-module orbit visualization
  CoreAvatar.tsx              # 3D avatar viewer (model-viewer)
  ErrorBoundary.tsx           # Class-based error boundary
  ClientErrorBoundary.tsx     # Client wrapper for error boundary
hooks/
  useJobStatus.ts             # Realtime job status + polling fallback
  useCoreAvatar.ts            # Realtime core avatar updates
lib/
  logger.ts                   # Structured JSON logger
  supabase/server.ts          # Server Supabase client
  supabase/browser.ts         # Browser Supabase client
  supabase/client.ts          # Re-export alias
  pricing/canonicalPricing.ts # Pricing plans source of truth
types/
  jobs.ts                     # Job queue type definitions
  avatar.ts                   # Avatar type definitions
workers/
  shared/
    types.ts                  # Shared worker types
    supabaseClient.ts         # Service role client
    logger.ts                 # Worker structured logger
    heartbeat.ts              # Worker heartbeat loop
    queue.ts                  # Job claim/process/complete/fail
  cpu/index.ts                # CPU worker entry point
  gpu/index.ts                # GPU worker entry point
  gpu/agents/editingAgent.ts  # Universal editing pipeline
```

## Agent Communication Law

All inter-agent communication is mediated exclusively by Agent G (director).
Specialist agents expose only: `accept(job) → process() → return(result)`.
Specialist agents NEVER call other agents directly.

## Production Validation

```bash
npx tsc --noEmit              # 0 type errors
npx next lint                 # 0 lint errors
npx next build                # Successful build
curl https://myavatar.ge/api/health  # { "status": "ok" }
```

## Worker Deployment

### CPU Workers (Fly.io)

```bash
fly launch --name myavatar-cpu-worker
fly secrets set SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=...
fly scale count 3
fly deploy
```

### GPU Workers (Local RTX / RunPod)

```bash
docker build -t myavatar-gpu-worker workers/gpu/
docker run -d --gpus all \
  -e SUPABASE_SERVICE_ROLE_KEY=$KEY \
  -e SUPABASE_URL=$URL \
  -e WORKER_ID=local-rtx-001 \
  myavatar-gpu-worker
```

## Pricing Plans

| Plan | Price | Credits |
|------|-------|---------|
| Free | $0/mo | Limited |
| Pro | $39/mo | 1000 |
| Business | $150/mo | 5000 |
| Enterprise | $500/mo | Unlimited |
