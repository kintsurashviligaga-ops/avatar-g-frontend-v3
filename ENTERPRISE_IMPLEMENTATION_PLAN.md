# 🏗️ Avatar G Enterprise Implementation Plan

## Overview
Implementing 4 major systems + i18n + Camera fix in Avatar G platform.

### Timeline
**Week 1:** i18n + Camera Fix  
**Week 2-3:** Subscription System  
**Week 4:** Stripe Connect Marketplace  
**Week 5:** Affiliate System  
**Week 6:** Analytics Dashboard + Documentation  

---

## PHASE 0: Foundation Fixes (TODAY)

### 0.1 Build Error Resolution
- ✓ Identified: `/app/global-error.tsx` - resolved
- [ ] Run clean build verification
- [ ] Fix any remaining type errors

### 0.2 Camera Black Screen Fix
**File:** `/app/services/avatar-builder/page.tsx`
**Problem:** video element missing `muted` and `playsInline` attributes
**Solution:** Add video control attributes + enhance stream handling

### 0.3 i18n Architecture Setup
**Goals:**
- Georgian (ka) as default language
- English (en) and Russian (ru) selectable
- URL-based routing: /ka/* /en/* /ru/*
- Language persistence in localStorage

**Libraries:** next-intl (already installed)

---

## PHASE 1: i18n SYSTEM

### 1.1 Middleware Configuration
**File:** `middleware.ts`
- Locale detection from URL
- Fallback to localStorage
- Accept-Lang helper
- Default to Georgian (ka)

### 1.2 Translation Files
```
/messages/
  ├── ka.json        (Georgian - default)
  ├── en.json        (English)
  └── ru.json        (Russian)
```

**Content:** All UI strings for:
- Navigation
- Avatar Builder (all labels)
- Payment screens
- Dashboard pages
- Error messages

### 1.3 Language Switcher Component
**File:** `/components/ui/LanguageSwitcher.tsx`
- Button/dropdown in header
- Shows current language
- Changes on click
- Persists to localStorage

### 1.4 i18n Provider Setup
**File:** `/app/layout.tsx`
- Wrap with locale provider
- Pass current locale
- Set direction (LTR for all)

---

## PHASE 2: SUBSCRIPTIONS (SaaS Model)

### 2.1 DbSchema Updates
**Table:** `subscriptions`
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  product_id TEXT,
  price_id TEXT,
  status TEXT (active|canceled|past_due|incomplete),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stripe_subscription_id)
);

CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE,
  event_type TEXT,
  subscription_id TEXT,
  data JSONB,
  processed_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Subscription Plans (Define in Stripe Dashboard)
**Starter:**
- $29/month
- Features: A, B, C
- Billing interval: monthly

**Pro:**
- $99/month
- Features: A, B, C, D, E
- Annual discount: 20%

**Business:**
- $299/month
- Features: A-G + support
- Custom pricing available

### 2.3 API Endpoints

**POST /api/stripe/subscription/create-checkout**
```typescript
Body: { priceId: string, quantity?: number }
Returns: { sessionUrl: string, sessionId: string, mode: 'subscription' }
```

**POST /api/stripe/customer-portal**
```typescript
Returns: { url: string } (redirect to Stripe Customer Portal)
```

**GET /api/stripe/subscription/status**
```typescript
Returns: { subscription: {id, status, current_plan, nextBillingDate}, ...}
```

**Webhooks:** `/api/stripe/webhook` handles
- `checkout.session.completed`
- `customer.subscription.created/updated/deleted`
- `invoice.paid/payment_failed`
- `charge.refunded`

### 2.4 Pages

**`/pricing`** - Show plans, C TA to subscribe

**`/dashboard/billing`** - Current plan + management

**`/pay/success`** - Subscription confirmation

---

## PHASE 3: STRIPE CONNECT (Marketplace)

### 3.1 DB Schema
```sql
CREATE TABLE connect_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  stripe_account_id TEXT UNIQUE,
  account_country TEXT,
  charges_enabled BOOLEAN DEFAULT FALSE,
  payouts_enabled BOOLEAN DEFAULT FALSE,
  details_submitted BOOLEAN DEFAULT FALSE,
  requirements JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 Setup Process
1. User clicks "Become Seller"
2. App creates Connected Account
3. Generates onboarding link
4. User completes Stripe onboarding
5. Webhook confirms `payouts_enabled = true`
6. User can now accept payments

### 3.3 API Endpoints

**POST /api/connect/create-account**
```typescript
Body: { countryCode: 'US' | 'GE' | 'RU', ... }
Returns: { accountId: string }
```

**POST /api/connect/onboarding-link**
```typescript
Returns: { url: string } (Stripe onboarding link)
Expires: 24 hours
```

**GET /api/connect/status**
```typescript
Returns: { accountId, chargesEnabled, payoutsEnabled, requirements }
```

**POST /api/stripe/webhook**
- Handle `account.updated` events
- Update `payouts_enabled` status

### 3.4 Charging Flow

When user purchases from marketplace:
```javascript
const charge = await stripe.paymentIntents.create({
  amount: 10000,
  currency: 'usd',
  application_fee_amount: 1000, // Platform takes 10%
  transfer_data: {
    destination: sellerConnectedAccountId
  },
  payment_method_types: ['card']
});
```

---

## PHASE 4: AFFILIATE SYSTEM

### 4.1 DB Schema
```sql
CREATE TABLE affiliates (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users,
  code TEXT UNIQUE (e.g., "AVATAR-A1B2C3"),
  status TEXT (active|suspended|inactive),
  commission_rate NUMERIC DEFAULT 10.0, -- percentage
  created_at TIMESTAMP
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY,
  referrer_user_id UUID REFERENCES affiliates.user_id,
  referred_user_id UUID REFERENCES auth.users,
  first_touch_at TIMESTAMP,
  last_touch_at TIMESTAMP,
  source TEXT (affiliate_link|code_signup),
  status TEXT (pending|converted|expired),
  conversion_date TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE affiliate_commissions (
  id UUID PRIMARY KEY,
  referrer_user_id UUID,
  commission_amount NUMERIC,
  currency TEXT DEFAULT 'usd',
  source_type TEXT (subscription|marketplace_sale),
  source_id TEXT (invoice_id|payment_intent_id),
  status TEXT (pending|available|paid),
  paid_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### 4.2 Workflow

**1. Affiliate Link Generation**
```
User → Settings → Affiliate Panel → Copy link
Link: https://myavatar.ge/ref?code=AVATAR-XXXX
```

**2. First-Time Visitor Clicks Link**
```
Middleware → Detect ?ref=CODE
→ Set cookie + localStorage
→ Redirect to /signup
```

**3. Signup/Conversion**
```
New user signs up → Check ref cookie
→ Create referral record
→ On first paid action (subscription/marketplace) → Calculate commission
→ Add to affiliate_commissions (pending status)
```

**4. Payout Schedule**
```
- Commissions pending 30 days (anti-fraud period)
- Become available for payout
- Affiliate can request withdrawal (if Connect enabled)
- Or manual payout via admin
```

### 4.3 API Endpoints

**GET /api/affiliate/me**
```typescript
Returns: { code, stats: {clicks, conversions, earnings} }
```

**POST /api/affiliate/claim**
```typescript
Body: {} (Generate affiliate code if not exists)
```

**GET /api/affiliate/earnings**
```typescript
Returns: { pending, available, paid, history[] }
```

**POST /api/affiliate/request-payout**
```typescript
Body: { amount, method: 'stripe_transfer'|'bank_transfer' }
```

### 4.4 Middleware Hook

**File:** `middleware.ts`
```typescript
// On every request
if (url contains ?ref=CODE) {
  verify code exists
  set cookie 'referrer_code=CODE' (30 day expiry)
  redirect without ?ref param
}
```

---

## PHASE 5: FINANCIAL ANALYTICS DASHBOARD

### 5.1 Dynamic Pages

**`/dashboard/finance`** (User)
- Active subscriptions
- Next billing date
- Total spent (lifetime)
- Invoices list + download
- Affiliate earnings (if enrolled)

**`/dashboard/seller`** (Seller with Connect)
- Total sales
- Platform fees paid
- Net payout amount
- Recent transactions
- Payout history

**`/dashboard/analytics`** (Admin)
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Churn rate
- Active subscriptions by plan
- Revenue by day/week/month
- Top sellers

### 5.2 Data Sources

**Option A: Aggregation on Read** (Fast for small scale)
```typescript
// Compute in API endpoint
const getMRR = async () => {
  const activeSubscriptions = await db
    .from('subscriptions')
    .select('price_id, current_period_end')
    .eq('status', 'active');
    
  return activeSubscriptions.reduce((sum, sub) => {
    const planAmount = PLANS[sub.price_id].amount;
    return sum + planAmount;
  }, 0);
};
```

**Option B: Nightly Aggregation** (Better for scale)
```typescript
// Cron job runs nightly at 3 AM UTC
POST /api/admin/cron/aggregate-metrics

// Stores in metrics table
INSERT INTO metrics (date, type, value)
VALUES (NOW(), 'mrr', 15000), (NOW(), 'active_subs', 150), ...
```

**Recommendation:** Start with Option A, migrate to B when needed

### 5.3 UI Components

- KPI cards (MRR, ARR, Churn %)
- Line charts (Revenue trend)
- Pie charts (Plan distribution)
- Tables (Recent transactions, top sellers)
- Filters (Date range, source)

**Libraries:** Recharts (lightweight, React-native)

---

## SYSTEM ARCHITECTURE

### Environment Variables
```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=ka
NEXT_PUBLIC_SUPPORTED_LOCALES=ka,en,ru

# Database (existing)
DATABASE_URL=...

# Application
NEXT_PUBLIC_APP_URL=https://myavatar.ge
```

### Database Connection
- Supabase client (already configured)
- Auth via '@supabase/auth-helpers-nextjs'
- Row-level security (RLS) policies

### API Pattern
```typescript
// All endpoints follow:
POST /api/[domain]/[action]

// Validation:
// - Check auth headers
// - Validate input with zod
// - Return structured errors

// Logging:
// - Do NOT log secrets
// - Log event IDs for tracing
// - Use timestamps for debugging
```

---

## TESTING CHECKLIST

### i18n Testing
- [ ] Default language is Georgian
- [ ] Language switcher changes UI
- [ ] Persistence works on reload
- [ ] URL routing works (/ka/..., /en/..., /ru/...)
- [ ] Error messages in correct language

### Camera Testing
- [ ] Click "Allow camera" → preview appears <2s
- [ ] Multiple angles can be captured
- [ ] Preview clear and focused
- [ ] Mobile Safari works (i Pad/iPhone)
- [ ] Permission denied → retry button shows

### Subscription Testing
- [ ] Checkout loads test card form
- [ ] Used card 4242 4242 4242 4242 → success
- [ ] Webhook received in Stripe Dashboard
- [ ] DB subscription record created
- [ ] Dashboard shows active plan
- [ ] Customer portal works (manage card/cancel)
- [ ] Cancellation webhook processes

### Connect Testing
- [ ] Seller clicks "Onboard"
- [ ] Stripe onboarding window opens
- [ ] Completes KYC
- [ ] Webhook confirms payouts_enabled
- [ ] Seller can now accept payments
- [ ] Platform fee deducted correctly

### Affiliate Testing
- [ ] Generate affiliate code
- [ ] Share link works
- [ ] Conversion tracked (new signup via code)
- [ ] Commission calculated on first payment
- [ ] Appears in affiliate dashboard (pending)
- [ ] After 30 days → available
- [ ] Withdrawal request processed

### Dashboard Testing
- [ ] MRR numbers correct
- [ ] Sales chart updates
- [ ] Filters work
- [ ] Download invoice works
- [ ] Mobile responsive

---

## SECURITY CHECKLIST

- [ ] All API endpoints require authentication
- [ ] Stripe webhooks verified with signature
- [ ] No API keys logged
- [ ] No PII in analytics
- [ ] Affiliate code validation (prevent enumeration)
- [ ] Rate limiting on sensitive endpoints
- [ ] HTTPS enforced (camera requires it)
- [ ] CORS configured properly
- [ ] Secrets in .env.local only (never committed)

---

## ROLLOUT PLAN

### Phase 1: Internal Testing
- Deploy to staging
- Test all scenarios
- Load testing (1000 concurrent users)
- Security audit

### Phase 2: Beta Users
- Invite 100 trusted users
- Collect feedback
- Fix critical bugs

### Phase 3: General Availability
- Enable for all users
- Monitor errors in Sentry
- Have support team ready

### Phase 4: Optimization
- Analyze usage patterns
- Optimize performance
- Plan Phase 2 features

---

## Success Metrics

**Adoption:**
- 20% of users with active subscription
- 50+ sellers onboarded in first month
- 1000+ affiliate signups

**Revenue:**
- $20K MRR by end of month 2
- $100K+ ARR by end of quarter

**Technical:**
- <100ms API response time
- 99.9% uptime
- <2% error rate
- <50 concurrent webhook delays

**User Experience:**
- <2s camera preview time
- >95% subscription success rate
- >80% seller activation rate

---

## Handoff Documentation

After completion, provide:
1. **README.md** - Feature overview + quick start
2. **API_DOCUMENTATION.md** - All endpoints + examples
3. **DATABASE_GUIDE.md** - Schema + migrations
4. **TROUBLESHOOTING.md** - Common issues + fixes
5. **MONITORING.md** - How to check health + debug

---

**Start Date:** 2026-02-14  
**Target Completion:** 2026-03-28  
**Status:** Beginning Phase 0

