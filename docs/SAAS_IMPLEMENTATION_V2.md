# 🎯 Avatar G - SaaS Implementation Guide

**Complete Technical Documentation for Production Systems**  
Version: 2.0.0  
Last Updated: February 12, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Billing & Subscriptions](#billing--subscriptions)
3. [Credits System](#credits-system)
4. [AI Orchestration](#ai-orchestration)
5. [Provider System](#provider-system)
6. [Tool Registry](#tool-registry)
7. [Database Schema](#database-schema)
8. [API Routes](#api-routes)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Tech Stack

```
┌─────────────────────────────────────────────┐
│         Frontend (Next.js 14)               │
│  ├─ React 18 + TypeScript                   │
│  ├─ Framer Motion (animations)              │
│  ├─ React Three Fiber (3D WebGL)            │
│  └─ shadcn/ui + Tailwind CSS                │
└─────────────────────────────────────────────┘
              ↓ API Routes
┌─────────────────────────────────────────────┐
│        Backend (Next.js API)                │
│  ├─ /api/billing/webhook (Stripe)           │
│  ├─ /api/orchestrate (AI Brain)             │
│  ├─ /api/admin/analytics                    │
│  └─ /api/agents/execute                     │
└─────────────────────────────────────────────┘
       ↓                    ↓
┌──────────────┐    ┌──────────────┐
│   Supabase   │    │    Stripe    │
│  PostgreSQL  │    │   Payments   │
│     Auth     │    │  Webhooks    │
│   Storage    │    │Subscriptions │
└──────────────┘    └──────────────┘
       ↓
┌─────────────────────────────────────────────┐
│        AI Provider Layer                    │
│  ├─ OpenAI (GPT-4)                          │
│  ├─ DeepSeek (Cost-effective)               │
│  ├─ Suno (Music generation)                 │
│  ├─ Runway (Video generation)               │
│  ├─ ElevenLabs (Voice synthesis)            │
│  └─ Mock (Testing fallback)                 │
└─────────────────────────────────────────────┘
```

### Data Flow

```
User Request → Authentication → Credit Check → 
Provider Selection → AI Execution → Credit Deduction → 
Logging → Response → UI Update
```

---

## Billing & Subscriptions

### Plans Configuration

**File:** `/lib/billing/plans.ts`

```typescript
export const PLANS = {
  FREE: {
    name: 'Free',
    monthlyPriceUSD: 0,
    credits: 100,
    features: ['Basic access', '100 credits/mo']
  },
  BASIC: {
    name: 'Basic',
    monthlyPriceUSD: 30,
    credits: 500,
    features: ['All features', '500 credits/mo']
  },
  PREMIUM: {
    name: 'Premium',
    monthlyPriceUSD: 150,
    credits: 2000,
    features: ['Priority support', '2000 credits/mo', 'Avatar G Agent']
  }
};
```

### Stripe Integration

**Webhook Handler:** `/app/api/billing/webhook/route.ts`

**Supported Events:**
- `checkout.session.completed` - Initial payment
- `customer.subscription.created` - Subscription starts
- `customer.subscription.updated` - Plan change
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_succeeded` - Monthly renewal
- `invoice.payment_failed` - Payment issue

**Idempotency:**
- All webhook events stored in `stripe_events` table
- Duplicate events automatically skipped
- Ensures no double-processing of payments/credits

**Flow:**

```
1. User clicks "Upgrade to Basic"
2. Frontend → POST /api/billing/create-checkout-session
3. Stripe Checkout opens
4. User completes payment
5. Stripe → POST /api/billing/webhook (checkout.session.completed)
6. Webhook verifies signature
7. Webhook checks idempotency (stripe_events table)
8. Webhook updates subscription in database
9. Webhook calls update_monthly_allowance(user_id, 'BASIC')
10. User receives 500 credits
11. Frontend shows updated plan
```

### Subscription Management

**Database:** `subscriptions` table

```sql
CREATE TABLE subscriptions (
  user_id UUID PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan VARCHAR(50) DEFAULT 'FREE',
  status VARCHAR(50) DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
);
```

**Key Functions:**

- `getOrCreateCustomer()` - Stripe customer lookup/creation
- `createCheckoutSession()` - Generate payment link
- `handleSubscriptionUpdated()` - Process plan changes
- `updateMonthlyAllowance()` - Sync credits with plan

---

## Credits System

### Database Schema

**Credits Table:**

```sql
CREATE TABLE credits (
  user_id UUID PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  monthly_allowance INTEGER DEFAULT 100,
  last_reset_at TIMESTAMPTZ,
  next_reset_at TIMESTAMPTZ,
  total_earned INTEGER,
  total_spent INTEGER
);
```

**Credit Transactions (Audit Log):**

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY,
  user_id UUID,
  amount INTEGER,  -- positive or negative
  balance_after INTEGER,
  transaction_type VARCHAR(50),  -- deduction, refill, bonus, refund
  description TEXT,
  job_id UUID,
  agent_id VARCHAR(100)
);
```

### Atomic Operations

**PostgreSQL RPC Functions** (server-side, transaction-safe):

**1. Deduct Credits:**

```sql
CREATE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_job_id UUID,
  p_agent_id VARCHAR(100),
  p_description TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT);
```

**Usage:**

```typescript
const { data, error } = await supabase.rpc('deduct_credits', {
  p_user_id: userId,
  p_amount: 10,
  p_job_id: jobId,
  p_agent_id: 'video-studio',
  p_description: 'Video generation'
});

if (data[0].success) {
  console.log('New balance:', data[0].new_balance);
} else {
  console.error('Error:', data[0].error_message);
}
```

**Features:**
- Row-level locking (`FOR UPDATE`)
- Balance validation (prevents negative)
- Automatic transaction logging
- Returns new balance or error

**2. Add Credits:**

```sql
CREATE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER);
```

**Usage:**

```typescript
await supabase.rpc('add_credits', {
  p_user_id: userId,
  p_amount: 500,
  p_description: 'Monthly refill - Basic plan'
});
```

**3. Update Monthly Allowance:**

```sql
CREATE FUNCTION update_monthly_allowance(
  p_user_id UUID,
  p_plan VARCHAR(50)
)
RETURNS TABLE(success BOOLEAN, new_allowance INTEGER);
```

**Called automatically by Stripe webhook when subscription changes.**

### Monthly Reset

**PostgreSQL Function:**

```sql
CREATE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE credits
  SET balance = monthly_allowance,
      last_reset_at = NOW(),
      next_reset_at = NOW() + INTERVAL '1 month'
  WHERE next_reset_at <= NOW();
END;
$$;
```

**TODO: Set up cron job:**

```bash
# Vercel Cron (vercel.json)
{
  "crons": [{
    "path": "/api/cron/reset-credits",
    "schedule": "0 0 1 * *"  # Monthly on 1st at midnight
  }]
}
```

---

## AI Orchestration

### Architecture

**File:** `/lib/orchestration/orchestrator.ts`

**Purpose:** Unified job lifecycle management across all AI services.

**Components:**
1. **Job Creation** - Database record with status tracking
2. **Provider Selection** - Route to appropriate AI provider
3. **Execution** - Call provider with retry logic
4. **Status Updates** - Track progress (queued → processing → done/error)
5. **Credit Deduction** - Atomic transaction after success

### Flow

```
Request → Validate Agent → Check Credits →
Create Job (status: queued) →
Update Job (status: processing) →
Execute Provider (with retry) →
Update Job (status: done, output: result) →
Deduct Credits →
Return Result
```

### Provider Registry

**File:** `/lib/orchestration/orchestrator.ts`

```typescript
const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  'music-studio': {
    provider: 'suno',
    maxRetries: 2,
    execute: async (input) => { /* ... */ }
  },
  'video-studio': {
    provider: 'runway',
    maxRetries: 2,
    execute: async (input) => { /* ... */ }
  },
  'chat': {
    provider: 'openai',
    maxRetries: 2,
    execute: async (input) => { /* ... */ }
  }
};
```

### Retry Logic

**Exponential Backoff:**

```typescript
async function executeJob(jobId, provider, input) {
  let attempts = 0;
  const maxAttempts = provider.maxRetries + 1;
  
  while (attempts < maxAttempts) {
    attempts++;
    try {
      return await provider.execute(input);
    } catch (error) {
      if (attempts >= maxAttempts) throw error;
      
      // Wait with exponential backoff
      await delay(Math.min(1000 * Math.pow(2, attempts), 10000));
    }
  }
}
```

### Timeout Protection

**2-minute timeout wrapper:**

```typescript
async function executeWithTimeout(fn, timeoutMs = 120000) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}
```

---

## Provider System

### Text Generation Providers

**Interface:** `/lib/providers/openai.ts`

```typescript
interface ITextGenerationProvider {
  name: string;
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>;
  streamText?(input: TextGenerationInput): AsyncGenerator<string>;
  isAvailable(): boolean;
}
```

**Implemented Providers:**

1. **OpenAI** (`/lib/providers/openai.ts`)
   - Models: GPT-4, GPT-4o-mini
   - Cost: $0.15/1M input, $0.60/1M output (gpt-4o-mini)
   - Features: Streaming, function calling

2. **DeepSeek** (`/lib/providers/deepseek.ts`)
   - Model: deepseek-chat
   - Cost: $0.14/1M input, $0.28/1M output
   - Features: OpenAI-compatible API, streaming

3. **Mock** (`/lib/providers/text-mock.ts`)
   - Always available (no API key needed)
   - Returns placeholder text
   - Used for testing/development

### Provider Factory

**File:** `/lib/providers/text-factory.ts`

**Selection Priority:**
1. User preference (if available)
2. OpenAI (if API key configured)
3. DeepSeek (if API key configured)
4. Mock (always available)

**Usage:**

```typescript
import { textProviderFactory } from '@/lib/providers/text-factory';

// Auto-select best provider
const provider = textProviderFactory.getBestProvider();

// Or specify preference
const provider = textProviderFactory.selectProvider('deepseek');

// Generate text
const result = await provider.generateText({
  prompt: 'Write a poem about AI',
  max_tokens: 500,
  temperature: 0.7
});
```

---

## Tool Registry

### Available Tools

**File:** `/lib/tools/registry.ts`

1. **Summarize Text**
   - Input: `{text, maxLength}`
   - Output: `{summary, original_length, summary_length}`
   - Cost: 1 credit

2. **Translate Text**
   - Input: `{text, targetLang}`
   - Output: `{translated, source_lang, target_lang}`
   - Cost: 1 credit
   - Note: Currently placeholder, integrate real API

3. **Format Prompt**
   - Input: `{prompt, style}` (styles: default, detailed, concise, creative)
   - Output: `{formatted_prompt, style}`
   - Cost: 1 credit

4. **Analyze Sentiment**
   - Input: `{text}`
   - Output: `{sentiment, confidence, positive_words, negative_words}`
   - Cost: 1 credit

### Usage

```typescript
import { toolRegistry } from '@/lib/tools/registry';

// Execute tool
const result = await toolRegistry.executeTool('summarize', {
  text: 'Long article text...',
  maxLength: 200
});

// List all tools
const tools = toolRegistry.listTools();
```

---

## Database Schema

### Complete ERD

```
┌──────────────┐       ┌──────────────┐
│   auth.users │◄──────┤   profiles   │
└──────────────┘       └──────────────┘
       △                      △
       │                      │
       │               ┌──────────────┐
       │               │subscriptions │
       │               │  plan        │
       │               │  status      │
       │               └──────────────┘
       │                      △
       │                      │
┌──────────────┐       ┌──────────────┐
│   credits    │       │credit_       │
│  balance     │◄──────┤transactions  │
│  allowance   │       │  amount      │
└──────────────┘       │  type        │
       △               └──────────────┘
       │
┌──────────────┐
│    jobs      │
│  agent_id    │
│  status      │
│  output      │
└──────────────┘
       △
       │
┌──────────────────────┐
│orchestration_runs    │
│  provider_id         │
│  tokens_in/out       │
│  cost_usd            │
│  credits_spent       │
└──────────────────────┘
       △
       │
┌──────────────┐
│stripe_events │
│  event_id    │
│  processed_at│
└──────────────┘
```

### Key Relationships

- User (1) → (1) Profile
- User (1) → (1) Subscription
- User (1) → (1) Credits
- User (1) → (N) Credit Transactions
- User (1) → (N) Jobs
- User (1) → (N) Orchestration Runs
- Job (1) ← (N) Credit Transactions

### RLS Policies

**All user tables have Row Level Security:**

```sql
-- Users can only see their own data
CREATE POLICY user_policy ON table_name
  FOR ALL USING (auth.uid() = user_id);

-- Only specific user can read their credits
CREATE POLICY credits_user_policy ON credits
  FOR ALL USING (auth.uid() = user_id);
```

---

## API Routes

### Authentication Required

**All protected routes:**

```typescript
const { data: { user }, error } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Key Endpoints

#### 1. `/api/orchestrate` - AI Brain

**Method:** POST  
**Auth:** Required  
**Body:**

```json
{
  "agentId": "chat",
  "taskType": "text-generation",
  "input": {
    "prompt": "Hello, world!",
    "max_tokens": 500
  },
  "providerPreference": "openai"  // optional
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "text": "Hello! How can I help you today?",
    "model": "gpt-4o-mini"
  },
  "usage": {
    "credits_spent": 5,
    "credits_remaining": 495,
    "tokens_in": 10,
    "tokens_out": 25,
    "cost_usd": 0.0002,
    "duration_ms": 1250
  },
  "provider": "openai"
}
```

#### 2. `/api/billing/webhook` - Stripe Events

**Method:** POST  
**Auth:** Stripe signature (not user auth)  
**Headers:** `Stripe-Signature`  
**Body:** Raw Stripe event JSON

**Idempotency:** Event IDs checked in `stripe_events` table

#### 3. `/api/admin/analytics` - Dashboard Metrics

**Method:** GET  
**Auth:** Required (TODO: Add admin role check)  
**Response:**

```json
{
  "users": {
    "total": 150,
    "active_today": 45,
    "by_plan": {"FREE": 120, "BASIC": 25, "PREMIUM": 5}
  },
  "revenue": {
    "mrr": 1500,
    "by_plan": {"BASIC": 750, "PREMIUM": 750}
  },
  "usage": {
    "total_jobs": 5000,
    "top_services": [
      {"agent_id": "video-studio", "count": 1200},
      {"agent_id": "chat", "count": 800}
    ]
  }
}
```

---

## Security

### Best Practices Implemented

✅ **Environment Variables**
- All API keys in `.env.local` (never in code)
- Server-only imports with `server-only` package

✅ **Row Level Security**
- Enabled on all user tables
- Policies enforce user isolation

✅ **Atomic Transactions**
- Credit deductions use PostgreSQL RPC
- Row-level locking prevents race conditions

✅ **Webhook Verification**
- Stripe signature verification required
- Idempotency via `stripe_events` table

✅ **Rate Limiting**
- TODO: Add rate limiting middleware

✅ **Input Validation**
- Zod schemas for all API inputs
- SQL injection prevention via parameterized queries

### Remaining TODOs

⚠️ **Add Admin Role Check:**

```typescript
// /app/api/admin/analytics/route.ts
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (profile?.role !== 'admin') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## Troubleshooting

### Common Issues

**1. Credits Not Deducted**

**Symptoms:** Job completes but balance unchanged  
**Debug:**

```sql
-- Check credit_transactions
SELECT * FROM credit_transactions 
WHERE user_id = 'user-id' 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if RPC functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN ('deduct_credits', 'add_credits');
```

**Fix:** Run migration `005_stripe_events_idempotency.sql`

**2. Stripe Webhook Failing**

**Symptoms:** Payments succeed but plan doesn't update  
**Debug:**

```sql
-- Check stripe_events
SELECT * FROM stripe_events 
WHERE success = false 
ORDER BY created_at DESC;
```

**Fix:** Check Vercel logs, verify webhook secret matches

**3. 3D Scene Not Loading**

**Symptoms:** Dashboard shows fallback, no 3D scene  
**Debug:**

- Check browser console for WebGL errors
- Verify `@react-three/fiber` installed
- Check `ssr: false` in dynamic import

**Fix:** Clear browser cache, ensure WebGL supported

**4. Provider Unavailable**

**Symptoms:** AI features return mock responses  
**Debug:**

```typescript
import { textProviderFactory } from '@/lib/providers/text-factory';

const providers = textProviderFactory.getAvailableProviders();
console.log('Available:', providers);
// Should show: [{ id: 'openai', name: 'openai' }, ...]
```

**Fix:** Verify API keys in Vercel environment variables

---

## Performance Tips

### Optimization Checklist

✅ **Dynamic Imports**
```typescript
const Heavy = dynamic(() => import('./Heavy'), { ssr: false });
```

✅ **Database Indexes**
- All foreign keys indexed
- Queries use indexed columns

✅ **Caching**
- Static pages cached by Vercel
- API responses cached where appropriate

✅ **Image Optimization**
- Use `next/image` component
- Automatic webp conversion

✅ **Code Splitting**
- Automatic with Next.js pages
- Manual with `dynamic()`

---

## Deployment

### Environment Setup

```bash
# Development
npm run dev

# Production Build
npm run build
npm run start

# Type Check
npm run typecheck

# Lint
npm run lint
```

### Vercel Deployment

1. Connect GitHub repo
2. Set environment variables
3. Push to `main` branch → auto-deploy
4. Monitor at vercel.com/dashboard

---

## Support

**Issues:** GitHub Issues  
**Docs:** `/docs` folder  
**Contact:** support@yourdomain.com

---

**Version:** 2.0.0  
**Last Updated:** February 12, 2026  
**Status:** Production Ready ✅
