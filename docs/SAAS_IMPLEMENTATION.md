# Avatar G SaaS Implementation Guide

## 🎯 Overview

This document describes the complete SaaS implementation for Avatar G, including billing, credits, subscriptions, multi-agent orchestration, and usage tracking.

## 📋 Architecture

### Core Components

1. **Billing System** (`/lib/billing/`)
   - `plans.ts` - Plan definitions (FREE, PRO, PREMIUM, ENTERPRISE)
   - `stripe.ts` - Stripe integration (server-only)
   - `enforce.ts` - Plan and credit enforcement

2. **Agent Registry** (`/lib/agents/`)
   - `registry.ts` - 13 agent definitions with metadata

3. **Jobs System** (`/lib/jobs/`)
   - `jobs.ts` - Job creation, tracking, and statistics

4. **API Routes** (`/app/api/`)
   - `/billing/checkout` - Create Stripe checkout session
   - `/billing/portal` - Manage subscription
   - `/billing/webhook` - Handle Stripe webhooks
   - `/credits/balance` - Get credit balance
   - `/agents/execute` - Execute agent with enforcement
   - `/jobs/list` - List user jobs

5. **UI Components** (`/components/dashboard/`)
   - Dashboard widgets for billing overview

## 🗄️ Database Schema

### Tables Added (Migration: `004_saas_billing_credits.sql`)

#### `profiles`
User extended data
```sql
- id (UUID, PK, FK to auth.users)
- email, full_name, avatar_url
- preferences (JSONB)
- timestamps
```

#### `subscriptions`
Stripe subscription data
```sql
- user_id (UUID, PK, FK)
- stripe_customer_id (TEXT, UNIQUE)
- stripe_subscription_id (TEXT, UNIQUE)
- plan (VARCHAR: FREE/PRO/PREMIUM/ENTERPRISE)
- status (VARCHAR: active/canceled/past_due)
- current_period_start, current_period_end
- cancel_at_period_end (BOOLEAN)
- metadata (JSONB)
- timestamps
```

#### `credits`
Monthly credit balance
```sql
- user_id (UUID, PK, FK)
- balance (INTEGER)
- monthly_allowance (INTEGER)
- last_reset_at, next_reset_at (TIMESTAMPTZ)
- total_earned, total_spent (INTEGER)
- timestamps
```

#### `credit_transactions`
Audit log for all credit changes
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- amount (INTEGER) - negative for deductions
- balance_after (INTEGER)
- transaction_type (VARCHAR: deduction/refill/bonus/refund)
- description (TEXT)
- job_id (UUID, FK, nullable)
- agent_id (VARCHAR)
- metadata (JSONB)
- created_at
```

#### Enhanced `jobs` table
Added columns:
```sql
- cost_credits (INTEGER)
- agent_id (VARCHAR)
- plan_required (VARCHAR)
```

### Database Functions

#### `deduct_credits()`
Transaction-safe credit deduction with balance check
```sql
Parameters:
  - p_user_id: UUID
  - p_amount: INTEGER
  - p_job_id: UUID
  - p_agent_id: VARCHAR
  - p_description: TEXT
Returns:
  - success: BOOLEAN
  - new_balance: INTEGER
  - error_message: TEXT
```

#### `add_credits()`
Add credits (refill/bonus)
```sql
Parameters:
  - p_user_id: UUID
  - p_amount: INTEGER
  - p_description: TEXT
Returns:
  -success: BOOLEAN
  - new_balance: INTEGER
```

#### `reset_monthly_credits()`
Cron job function to reset credits monthly
```sql
Updates all user credits to monthly_allowance when next_reset_at <= NOW()
```

## 💳 Plan Tiers

| Plan | Credits/Month | Price | Key Features |
|------|--------------|-------|--------------|
| **FREE** | 100 | $0 | 1 avatar, 5 videos, 5 tracks, basic agents |
| **PRO** | 1,000 | $29 | Unlimited creations, 3 voice slots, advanced agents |
| **PREMIUM** | 5,000 | $99 | Avatar G Agent, multi-agent orchestration, API access |
| **ENTERPRISE** | 50,000 | $499 | Dedicated infrastructure, SSO, custom integrations |

## 🤖 Agent Registry

13 agents registered with metadata:

1. **avatar-builder** (FREE) - 10 credits base
2. **video-studio** (FREE) - 20 credits
3. **music-studio** (FREE) - 15 credits
4. **voice-lab** (PRO) - 50 credits
5. **media-production** (PRO) - 25 credits
6. **business-agent** (PRO) - 15 credits
7. **chat** (FREE) - 1 credit
8. **game-creator** (PRO) - 30 credits (coming soon)
9. **image-creator** (FREE) - 8 credits
10. **social-media** (PRO) - 5 credits (coming soon)
11. **online-shop** (PRO) - 10 credits (coming soon)
12. **prompt-builder** (FREE) - 2 credits (coming soon)
13. **avatar-g-agent** (PREMIUM) - 50+ credits - **Premium superhero agent**

## 🔒 Security

### Server-Only Secrets
All sensitive keys MUST be server-side only:
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Client-Safe Variables
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Stripe Price IDs
```
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PREMIUM=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

## 🛠️ Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # SERVER ONLY

# Stripe
STRIPE_SECRET_KEY=sk_test_... # SERVER ONLY
STRIPE_WEBHOOK_SECRET=whsec_... # SERVER ONLY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (from Stripe Dashboard)
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PREMIUM=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Redis (optional, for rate limiting)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## 🚀 Setup Instructions

### 1. Run Database Migration

```bash
# Connect to Supabase and run:
supabase db push

# Or manually execute:
psql $DATABASE_URL < supabase/migrations/004_saas_billing_credits.sql
```

### 2. Create Stripe Products

In Stripe Dashboard:

1. Create Products:
   - **Avatar G Pro** - $29/month recurring
   - **Avatar G Premium** - $99/month recurring
   - **Avatar G Enterprise** - $499/month recurring

2. Copy Price IDs to `.env.local`

3. Create Webhook:
   - URL: `https://yourdomain.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`
   - Copy webhook secret to `.env.local`

### 3. Install Dependencies

```bash
npm install stripe
# Already installed: @supabase/supabase-js
```

### 4. Test Locally

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/billing/webhook

# Copy webhook secret from output to .env.local
```

### 5. Initialize User Data

New users automatically get:
- FREE plan subscription
- 100 credits balance
- Profile record

Existing users: Run migration to backfill data.

## 📊 Usage Flow

### Agent Execution with Enforcement

```typescript
// Example: Music generation with enforcement
import { withEnforcement, deductCredits } from '@/lib/billing/enforce';
import { createJob } from '@/lib/jobs/jobs';
import { getCreditCost } from '@/lib/billing/plans';

const cost = getCreditCost('music-studio.generate'); // 15 credits

await withEnforcement(
  userId,
  {
    agentId: 'music-studio',
    cost,
    requiredPlan: 'FREE',
  },
  async (context) => {
    // Create job
    const job = await createJob({
      userId,
      agentId: 'music-studio',
      type: 'generate',
      inputJson: { prompt, genre, mood },
      costCredits: cost,
      planRequired: 'FREE',
    });
    
    // Deduct credits (transaction-safe)
    await deductCredits({
      userId,
      amount: cost,
      jobId: job.id,
      agentId: 'music-studio',
      description: 'Music Studio - Generate Track',
    });
    
    // Execute generation...
    return { jobId: job.id };
  }
);
```

### Error Handling

Enforcement throws `EnforcementError` with specific codes:

- **PLAN_REQUIRED** (403) - User plan too low
- **AGENT_NOT_ALLOWED** (403) - Plan doesn't include agent
- **INSUFFICIENT_CREDITS** (402) - Not enough credits
- **SUBSCRIPTION_INACTIVE** (403) - Subscription not active
- **DEDUCTION_FAILED** (402) - Credit deduction failed

## 🎨 Dashboard UI

### Routes

- `/dashboard` - Main dashboard (existing orbital view)
- `/dashboard/billing` - **New** Billing & usage dashboard

### Components

Located in `/components/dashboard/`:

- `DashboardHeader.tsx` - Welcome header with upgrade CTAs
- `PlanCard.tsx` - Current plan status and features
- `CreditsSummary.tsx` - Credit balance with progress bar
- `UsageStats.tsx` - Monthly statistics and top agents
- `RecentJobs.tsx` - Latest job history

### Features

✅ Server-side rendered (no client-side data fetching)  
✅ Real-time plan status  
✅ Credit balance with next reset countdown  
✅ Job success rate tracking  
✅ Top agents by usage  
✅ One-click Stripe checkout  
✅ Customer portal integration  

## 🧪 Testing Checklist

### Local Development

- [ ] Run migration successfully
- [ ] Create test user
- [ ] Verify FREE plan auto-assigned
- [ ] Check 100 credits allocated
- [ ] Access `/dashboard/billing`
- [ ] All dashboard widgets render
- [ ] Click "Upgrade Plan" → Stripe checkout opens
- [ ] Complete test payment (use test card `4242 4242 4242 4242`)
- [ ] Webhook receives `checkout.session.completed`
- [ ] Plan upgraded in database
- [ ] Credits updated to new allowance
- [ ] Click "Manage Billing" → Stripe portal opens

### Agent Execution

- [ ] Call `/api/agents/execute` with valid auth
- [ ] Verify plan enforcement (try PREMIUM agent with FREE plan → 403)
- [ ] Verify credit check (try with 0 balance → 402)
- [ ] Successful execution deducts credits
- [ ] Job created in database
- [ ] Credit transaction logged

### Stripe Webhook

- [ ] `checkout.session.completed` → Updates subscription
- [ ] `customer.subscription.updated` → Syncs plan changes
- [ ] `customer.subscription.deleted` → Downgrades to FREE
- [ ] `invoice.payment_failed` → Sets status to `past_due`
- [ ] All events idempotent (replay doesn't cause issues)

### Edge Cases

- [ ] User with temp customer ID can't access portal (returns 400)
- [ ] Canceled subscription still works until period end
- [ ] Credits reset on monthly boundary (test `reset_monthly_credits()`)
- [ ] Failed job refunds credits

## 🚢 Vercel Deployment

### 1. Environment Variables

Add all `.env.local` variables to Vercel project settings.

**CRITICAL**: Ensure webhook secret matches production webhook.

### 2. Stripe Webhook

Update webhook endpoint in Stripe Dashboard:
```
https://yourdomain.com/api/billing/webhook
```

Create **separate webhook** for production (different secret).

### 3. Database

Ensure Supabase project is production-ready:
- RLS policies enabled
- Indexes created
- Functions deployed

### 4. Deploy

```bash
git push # Auto-deploys to Vercel
```

### 5. Verify

- [ ] Visit `/dashboard/billing` in production
- [ ] Test checkout flow with real payment method
- [ ] Monitor webhook logs in Stripe Dashboard
- [ ] Check Supabase for data updates

## 📈 Monitoring

### Key Metrics

Track in your analytics:

1. **Conversion Rate**: Free → Paid
2. **Churn Rate**: Cancellations per month
3. **Credit Utilization**: Average % used per plan
4. **Top Agents**: Most popular by plan tier
5. **Job Success Rate**: Completed vs failed
6. **Support Tickets**: By plan tier

### Database Queries

```sql
-- Active subscriptions by plan
SELECT plan, COUNT(*) 
FROM subscriptions 
WHERE status = 'active' 
GROUP BY plan;

-- Credit utilization this month
SELECT 
  AVG((monthly_allowance - balance)::FLOAT / monthly_allowance * 100) as avg_utilization
FROM credits;

-- Top agents
SELECT agent_id, COUNT(*) as job_count
FROM jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_id
ORDER BY job_count DESC
LIMIT 10;

-- Revenue (estimate from subscriptions)
SELECT 
  plan,
  COUNT(*) as subscribers,
  CASE 
    WHEN plan = 'PRO' THEN COUNT(*) * 29
    WHEN plan = 'PREMIUM' THEN COUNT(*) * 99
    WHEN plan = 'ENTERPRISE' THEN COUNT(*) * 499
    ELSE 0
  END as mrr
FROM subscriptions
WHERE status = 'active'
GROUP BY plan;
```

## 🛡️ Security Best Practices

### ✅ DO

- Use `withEnforcement()` wrapper for all service routes
- Verify webhook signatures
- Use Supabase RLS policies
- Rate limit API routes
- Log all credit transactions
- Validate user input with Zod schemas
- Use database transactions for credit operations

### ❌ DON'T

- Expose Stripe secret key to client
- Trust client-side credit checks
- Skip plan enforcement
- Allow direct credit manipulation
- Use API keys in frontend code
- Skip webhook signature verification

## 🔄 Credit Reset Cron

Set up monthly credit reset:

### Option 1: Supabase Cron (pg_cron)

```sql
SELECT cron.schedule(
  'reset-monthly-credits',
  '0 0 1 * *', -- First day of month at midnight
  $$SELECT reset_monthly_credits()$$
);
```

### Option 2: Vercel Cron

Create `/app/api/cron/reset-credits/route.ts`:

```typescript
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const supabase = createSupabaseServerClient();
  await supabase.rpc('reset_monthly_credits');
  
  return Response.json({ success: true });
}
```

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/reset-credits",
    "schedule": "0 0 1 * *"
  }]
}
```

## 📚 Additional Resources

- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

## 🆘 Troubleshooting

### Webhook not receiving events

1. Check Stripe Dashboard → Webhooks → Logs
2. Verify endpoint URL is correct
3. Ensure webhook secret matches `.env.local`
4. Check Vercel logs for errors

### Credits not deducting

1. Check `credit_transactions` table for logs
2. Verify Supabase function `deduct_credits()` exists
3. Check for transaction conflicts
4. Review enforcement errors in API logs

### Plan not updating after payment

1. Check webhook logs in Stripe
2. Verify `customer.subscription.updated` event handled
3. Check Supabase `subscriptions` table
4. Ensure price ID mapping correct in `plans.ts`

### Dashboard not loading

1. Verify user has subscription record
2. Check credits record exists
3. Review server logs for errors
4. Ensure Supabase RLS policies allow reads

---

**Implementation Status**: ✅ Core Complete  
**Last Updated**: 2026-02-12  
**Version**: 1.0.0
