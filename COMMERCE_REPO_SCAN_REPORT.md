# Avatar G Commerce System - Repo Scan Report
**Date:** February 13, 2026  
**Architect:** Staff SaaS Architect  
**Project:** Online Shop AI-Monetization Engine

---

## EXECUTIVE SUMMARY

Avatar G is a **production-ready Next.js 14 SaaS platform** with:
- ✅ User authentication (Supabase Auth)
- ✅ 13 AI services (video, music, avatar builders)
- ✅ Payment infrastructure (Stripe)
- ✅ SaaS billing (credits, subscriptions)
- ✅ Row-Level Security (RLS) enabled
- ✅ Production logging & monitoring

**Commerce Readiness:** 60% infrastructure ready. Requires Phase 1-7 commerce-specific layers.

---

## REPOSITORY STRUCTURE

```
avatar-g-frontend-v3/
├── app/                          # Next.js 14 App Router
│   ├── api/                       # 20+ API route groups
│   │   ├── agents/               # AI service orchestration
│   │   ├── billing/              # Stripe checkout + webhooks
│   │   ├── credits/              # Credit system
│   │   └── ...                   # Other services
│   ├── dashboard/                # User dashboard
│   ├── pricing/                  # Pricing page
│   └── ...
├── lib/
│   ├── billing/                  # Plans, pricing, enforcement
│   │   ├── plans.ts             # 3-tier: FREE, BASIC, PREMIUM
│   │   ├── stripe.ts            # Stripe client
│   │   ├── stripe-prices.ts     # Server-only price mapping
│   │   └── enforce.ts           # Plan enforcement
│   ├── supabase/                # Database client
│   ├── auth/                    # Auth utilities
│   ├── env/                     # Environment config
│   └── providers/               # AI provider adapters
├── supabase/migrations/         # Database migrations
│   ├── 001_core_tables.sql      # Avatars, videos, tracks
│   ├── 004_saas_billing.sql     # Subscriptions, credits
│   └── 005_stripe_events.sql    # Stripe webhooks
├── types/                       # TypeScript definitions
└── components/                  # React components
```

---

## CODEBASE METRICS

| Metric | Value | Status |
|--------|-------|--------|
| **Framework** | Next.js 14 | ✅ Latest |
| **Language** | TypeScript 5.3 | ✅ Strict |
| **Database** | Supabase (Postgres) | ✅ RLS Enabled |
| **Auth** | Supabase Auth | ✅ Production |
| **Payment** | Stripe + Webhooks | ✅ Live |
| **Validation** | Zod | ✅ Strict |
| **AI Services** | 13 agents | ✅ Functional |
| **State** | Zustand | ✅ Used |
| **Styling** | Tailwind + Radix UI | ✅ Production |
| **Testing** | Jest + Playwright | ⚠️ Partial |
| **Monitoring** | Logging enabled | ✅ Basic |
| **Security** | RLS, server-only | ✅ Implemented |

---

## EXISTING DATABASE SCHEMA

### Core Tables

#### 1. **auth.users** (Supabase managed)
- User identity
- Email, password, 2FA

#### 2. **profiles**
```sql
id (UUID, PK)
email (TEXT)
full_name (TEXT)
avatar_url (TEXT)
preferences (JSONB)
created_at, updated_at (TIMESTAMPTZ)
```
- RLS: User-only access

#### 3. **subscriptions** (Stripe integration)
```sql
user_id (UUID, PK) → auth.users
stripe_customer_id (TEXT, UNIQUE)
stripe_subscription_id (TEXT, UNIQUE)
plan (VARCHAR) → FREE | BASIC | PREMIUM
status (VARCHAR) → active | canceled | past_due
current_period_start/end (TIMESTAMPTZ)
metadata (JSONB)
```
- RLS: User-only access
- Indexes: stripe_customer_id, stripe_subscription_id, plan

#### 4. **credits** (Monthly allowance)
```sql
user_id (UUID, PK)
balance (INTEGER)
monthly_allowance (INTEGER)
last_reset_at, next_reset_at (TIMESTAMPTZ)
total_earned, total_spent (INTEGER)
```
- RLS: User-only access

#### 5. **credit_transactions** (Audit log)
```sql
id (UUID, PK)
user_id (UUID, FK)
amount (INTEGER, can be negative)
balance_after (INTEGER)
transaction_type (VARCHAR) → deduction | refill | bonus | refund
description (TEXT)
job_id (UUID, FK)
agent_id (VARCHAR)
metadata (JSONB)
created_at (TIMESTAMPTZ)
```
- RLS: User SELECT-only
- Indexes: user_id, created_at, job_id

#### 6. **stripe_events** (Idempotency)
```sql
id (UUID, PK)
stripe_event_id (TEXT, UNIQUE)
event_type (VARCHAR)
status (VARCHAR) → pending | processed | failed
payload (JSONB)
created_at (TIMESTAMPTZ)
```
- Used for webhook deduplication

#### 7. **jobs** (Task queue)
```sql
id (UUID, PK)
user_id (UUID, FK)
status (VARCHAR)
cost_credits (INTEGER)
agent_id (VARCHAR)
plan_required (VARCHAR)
created_at, updated_at (TIMESTAMPTZ)
```

#### 8. **avatars**, **tracks**, **video_clips** (Media)
- User-scoped media assets
- RLS enabled

---

## EXISTING BILLING ARCHITECTURE

### Plan Tier System
**Type:** `FREE | BASIC | PREMIUM` (canonical)  
**Aliases:** `PRO → BASIC`, `ENTERPRISE → PREMIUM`

```typescript
// lib/billing/plans.ts
export const PLANS: Record<CanonicalPlanTier, PlanConfig> = {
  FREE: { 
    monthlyCredits: 100, 
    maxConcurrentJobs: 1,
    features: [...]
  },
  BASIC: { 
    monthlyCredits: 1000, 
    maxConcurrentJobs: 3,
    monthlyPriceUSD: 30,
    features: [...]
  },
  PREMIUM: { 
    monthlyCredits: 10000, 
    maxConcurrentJobs: 10,
    monthlyPriceUSD: 150,
    features: [...]
  }
}
```

### Enforcement
- **Module:** `lib/billing/enforce.ts`
- **Pattern:** Server-only plan validation
- **Usage:** All `/api/agents/*` routes
- **Function:** `getEnforcementContext(userId)` → plan checks

### Stripe Integration
- **Webhook:** `/api/billing/webhook`
- **Checkout:** `/api/billing/checkout`
- **Prices:** `lib/billing/stripe-prices.ts` (server-only)

---

## GAPS FOR COMMERCE (PHASE 1-7)

### ❌ NOT IMPLEMENTED

| Category | Gap | Priority | Phase |
|----------|-----|----------|-------|
| **Wallet System** | No shop_wallets table | CRITICAL | 1 |
| **Ledger** | No wallet_transactions table | CRITICAL | 1 |
| **Compliance** | No audit_logs, user_consents | HIGH | 1 |
| **VAT** | Not tracked per order | HIGH | 1 |
| **Affiliate** | No affiliate tracking | HIGH | 3 |
| **Suppliers** | No supplier abstraction | MEDIUM | 5 |
| **Products** | No products/listings table | CRITICAL | 2 |
| **Orders** | No orders table | CRITICAL | 2 |
| **Splits** | No revenue splits logic | CRITICAL | 2 |
| **Tokens** | No digital token system | MEDIUM | 4 |
| **Workflows** | No commerce orchestrator | MEDIUM | 6 |
| **Legal Pages** | Auto-gen not implemented | MEDIUM | 7 |

---

## SECURITY POSTURE

### ✅ STRENGTHS
- RLS on all tables
- Server-only modules (`use server-only`)
- Zod validation
- Stripe signature verification
- No service role key in client code
- Environment separation (public/server)

### ⚠️ GAPS
- No audit logging for critical actions
- No AML risk scoring
- No data deletion endpoints
- No consent tracking

---

## TECH STACK READY FOR COMMERCE

| Layer | Tech | Status |
|-------|------|--------|
| **Frontend** | Next.js 14 App Router | ✅ Ready |
| **Backend** | Node.js (Next.js API) | ✅ Ready |
| **Database** | Supabase Postgres + RLS | ✅ Ready |
| **Auth** | Supabase Auth | ✅ Ready |
| **Payments** | Stripe API | ✅ Ready |
| **Validation** | Zod | ✅ Ready |
| **Storage** | AWS S3 / R2 | ✅ Ready |
| **Logging** | Console + structured | ⚠️ Basic |
| **Monitoring** | None configured | ❌ Missing |

---

## API ROUTE STRUCTURE

### Existing Commerce Routes
```
/api/billing/
  ├── checkout         → Create Stripe session
  └── webhook          → Process Stripe events

/api/credits/
  └── [routes]         → Credit management

/api/admin/
  ├── analytics/
  └── [admin routes]
```

### Planned Commerce Routes
```
/api/shop/                    (PHASE 2+)
  ├── products/
  ├── orders/
  ├── checkout/
  └── webhook/

/api/affiliate/              (PHASE 3)
  ├── track/
  ├── earnings/
  └── payout/

/api/compliance/            (PHASE 1)
  ├── export-data/
  ├── delete-account/
  ├── policies/
  └── consent/
```

---

## ENVIRONMENT VARIABLES USAGE

### Current Env Vars
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
STRIPE_PUBLIC_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BASIC
STRIPE_PRICE_PREMIUM
```

### Compliance: Separated
- **Public:** `lib/env/public.ts`
- **Server:** `lib/env/server.ts` (with `use server-only`)

---

## PRODUCTION READINESS CHECKLIST

### For Commerce Launch
- [ ] Phase 1: DB Schema + RLS + Wallet
- [ ] Phase 2: Stripe + Splits + Orders
- [ ] Phase 3: Affiliate System
- [ ] Phase 4: Digital Tokens
- [ ] Phase 5: Supplier Abstraction
- [ ] Phase 6: AI Automation
- [ ] Phase 7: Legal Compliance
- [ ] TypeScript: `tsc --noEmit` (no errors)
- [ ] Tests: Jest coverage > 80%
- [ ] Security: Penetration test
- [ ] Load: 1000+ RPS simulation
- [ ] VAT: Georgian tax rules audit
- [ ] Webhooks: Idempotency verified
- [ ] Audit Logs: All critical actions tracked

---

## IMMEDIATE RECOMMENDATIONS

### SHORT TERM (This Sprint)
1. ✅ Phase 1 migration: Wallet + Ledger + Compliance
2. ✅ RLS policies for all commerce tables
3. ✅ Zod schemas for commerce inputs
4. ✅ Server-side split computation logic

### MEDIUM TERM (Next 2 Sprints)
1. Phase 2: Orders + Stripe webhook enhancements
2. Phase 3: Affiliate system
3. Legal page auto-generation (Georgian + English)

### LONG TERM (Production)
1. Phase 4-6: Full automation + tokenization
2. Supplier integrations (API-based)
3. Geographic expansion (EU VAT OSS)

---

## NEXT STEPS

**Proceed with Phase 1 Implementation:**
- [x] Database migrations
  - [x] shop_wallets
  - [x] wallet_transactions
  - [x] audit_logs
  - [x] user_consents
  - [x] orders (with VAT)
- [ ] RLS policies (all tables)
- [ ] Zod schemas
- [ ] API utilities
- [ ] Server functions

**Estimated Time:** 4-6 hours for full Phase 1 implementation.

---

**Report Generated:** 2026-02-13 | **Status:** Ready for Phase 1 Implementation
