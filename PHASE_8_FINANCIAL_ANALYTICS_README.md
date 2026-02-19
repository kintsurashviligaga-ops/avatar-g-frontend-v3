# Phase 8: Full Financial Analytics Dashboard - Complete Implementation Guide

## Overview

Phase 8 implements a comprehensive Financial Analytics system for Avatar G platform, providing real-time financial tracking across admin, user, seller, and affiliate systems. The system uses database aggregation for fast KPI delivery (<2s load times) with Stripe webhook synchronization as the single source of truth.

## Architecture

### Core Design Principles

1. **Database as Source of Truth**: All financial data flows from Stripe webhooks into database tables, not queried directly from Stripe API on dashboard load
2. **Real-time Aggregation**: Daily aggregates computed incrementally after financial events
3. **Access Control**: Service role for webhooks + selective read-only RLS for users + admin guard for global metrics
4. **Performance**: Cached aggregates + proper indexing for <2s dashboard loads
5. **i18n**: Complete localization in Georgian (ka), English (en), Russian (ru)

## Database Schema

### Core Finance Tables (Migration: `012_finance_core.sql`)

#### 1. `stripe_customers` - User ↔ Stripe Customer ID Mapping
```sql
- id: UUID (PK)
- user_id: UUID (FK to auth.users)
- stripe_customer_id: VARCHAR (unique)
- status: VARCHAR (active | inactive)
- created_at, updated_at: TIMESTAMP
```

#### 2. `stripe_invoices` - Subscription Invoices
```sql
- id: UUID (PK)
- user_id: UUID (FK to auth.users)
- stripe_invoice_id: VARCHAR (unique, idempotency key)
- stripe_subscription_id: VARCHAR
- amount_cents: INTEGER (in USD cents)
- currency: VARCHAR
- status: VARCHAR (draft | open | paid | void | uncollectible)
- created_at, updated_at, paid_at: TIMESTAMP
```

#### 3. `stripe_payments` - One-time Payments
```sql
- id: UUID (PK)
- user_id: UUID (FK to auth.users)
- stripe_payment_intent_id: VARCHAR (unique, idempotency key)
- amount_cents: INTEGER
- currency: VARCHAR
- status: VARCHAR (requires_payment_method | processing | succeeded | canceled)
- description: VARCHAR
- created_at, updated_at: TIMESTAMP
```

#### 4. `marketplace_orders` - Buyer/Seller GMV Tracking
```sql
- id: UUID (PK)
- buyer_user_id: UUID (FK to auth.users)
- seller_user_id: UUID (FK to auth.users)
- gross_amount_cents: INTEGER (GMV)
- platform_fee_cents: INTEGER (30% of GMV)
- currency: VARCHAR
- status: VARCHAR (pending | completed | canceled | refunded)
- stripe_order_id: VARCHAR (FK to orders table if exists)
- created_at, updated_at: TIMESTAMP
```

#### 5. `seller_payouts` - Connect Account Transfers
```sql
- id: UUID (PK)
- seller_user_id: UUID (FK to auth.users)
- stripe_payout_id: VARCHAR (unique)
- stripe_transfer_id: VARCHAR (FK to Stripe Connect transfer)
- amount_cents: INTEGER
- currency: VARCHAR
- status: VARCHAR (pending | in_transit | paid | failed)
- created_at, updated_at: TIMESTAMP
```

#### 6. `finance_daily_aggregates` - Cached KPIs by Day
```sql
- id: UUID (PK)
- day: DATE (YYYY-MM-DD, PK)
- mrr_cents: INTEGER (Monthly Recurring Revenue from active subscriptions)
- subscriptions_active: INTEGER (count of active subscriptions on this day)
- revenue_subscriptions_cents: INTEGER (sum of paid invoices)
- revenue_one_time_cents: INTEGER (sum of succeeded payments)
- gmv_marketplace_cents: INTEGER (sum of completed orders)
- platform_fees_cents: INTEGER (sum of platform fees)
- affiliate_commissions_cents: INTEGER (sum of paid commissions)
- seller_payouts_cents: INTEGER (sum of completed payouts)
- created_at, updated_at: TIMESTAMP
```

### Access Control

**RLS Policies:**
- `stripe_customers`: User sees only own; service_role can select all
- `stripe_invoices`: User sees only own; service_role can select/insert/update
- `stripe_payments`: User sees only own; service_role can select/insert/update
- `marketplace_orders`: User sees as buyer or seller; service_role admin
- `seller_payouts`: User sees own payouts; service_role admin
- `finance_daily_aggregates`: All authenticated users read-only; admin sees all

## API Endpoints

### 1. Admin Financial Summary
**Endpoint:** `GET /api/finance/admin/summary?range=30d|90d|180d`

**Access:** Admin-only (via `requireAdmin()` guard)

**Response:**
```json
{
  "summary": {
    "mrr": 50000,         // Monthly recurring revenue in cents
    "arr": 600000,        // Annual recurring revenue (MRR * 12)
    "activeSubs": 150,    // Count of active subscriptions
    "revenue30d": 187500, // Sum of subscription + one-time revenue
    "gmv30d": 500000,     // Gross merchandise value (marketplace)
    "fees30d": 150000,    // Platform fees collected
    "refunds30d": 5000,   // Total refunds issued
    "churn": 2.5          // Monthly churn rate %
  }
}
```

### 2. Finance Timeseries Data
**Endpoint:** `GET /api/finance/admin/timeseries?range=30d|90d|180d`

**Access:** Admin-only

**Response:**
```json
{
  "range": "30d",
  "days": 30,
  "data": [
    {
      "date": "2026-02-15",
      "mrr": 50000,
      "revenue": 45000,
      "gmv": 25000,
      "fees": 7500,
      "affiliateCommissions": 2000,
      "payouts": 5000,
      "subscriptionsActive": 150
    }
    // ... 29 more days
  ]
}
```

### 3. User Billing Summary
**Endpoint:** `GET /api/finance/me/summary`

**Access:** Authenticated user

**Response:**
```json
{
  "subscription": {
    "id": "uuid",
    "user_id": "uuid",
    "stripe_subscription_id": "sub_xxx",
    "plan": "pro",
    "status": "active",
    "current_period_start": "2026-01-15T00:00:00Z",
    "current_period_end": "2026-02-15T00:00:00Z"
  },
  "recentInvoices": [
    {
      "id": "uuid",
      "stripe_invoice_id": "inv_xxx",
      "amount_cents": 9900,
      "status": "paid",
      "created_at": "2026-02-15T10:30:00Z"
    }
  ],
  "recentPayments": [
    {
      "id": "uuid",
      "stripe_payment_intent_id": "pi_xxx",
      "amount_cents": 4950,
      "status": "succeeded",
      "description": "Premium add-on",
      "created_at": "2026-02-10T14:20:00Z"
    }
  ],
  "totals": {
    "totalPaid": 14850,
    "invoiceCount": 15,
    "paymentCount": 3
  }
}
```

### 4. Seller Finance Summary
**Endpoint:** `GET /api/finance/seller/summary`

**Access:** Authenticated seller (checks `seller_profiles` table)

**Response:**
```json
{
  "seller": {
    "id": "uuid",
    "displayName": "My Store",
    "stripeAccountId": "acct_xxx"
  },
  "orders": [/* 10 most recent orders */],
  "payouts": [/* 10 most recent payouts */],
  "summary": {
    "totalGmv": 500000,      // Total gross revenue
    "totalFees": 150000,     // 30% platform fees
    "totalNet": 350000,      // GMV - fees
    "totalPaidOut": 200000,  // Already received via Stripe Connect
    "pendingPayout": 150000, // Waiting to be transferred
    "orderCount": 125,
    "payoutCount": 8
  }
}
```

### 5. Affiliate Finance Summary
**Endpoint:** `GET /api/finance/affiliate/summary`

**Access:** Authenticated affiliate (checks `affiliates` table)

**Response:**
```json
{
  "affiliate": {
    "id": "uuid",
    "status": "active",
    "referralCode": "ref_abc123"
  },
  "commissions": [/* 10 most recent commission events */],
  "payouts": [/* 10 most recent affiliate payouts */],
  "balances": {
    "pending": 25000,     // 7-day hold period
    "available": 50000,   // Ready to withdraw
    "paid": 250000,       // Already paid out
    "reversed": 1000,     // Chargebacks/reversals
    "total": 75000        // pending + available
  },
  "summary": {
    "totalEarned": 274000,  // pending + available + paid - reversed
    "totalPaidOut": 250000,
    "commissionCount": 87,
    "payoutCount": 5
  }
}
```

## Webhook Synchronization

### Updated Handler: `/api/stripe/webhook`

The main webhook handler now calls `recomputeFinanceDailyAggregates()` on these events:

1. **`checkout.session.completed`** (subscription)
   - Creates subscription → calls aggregation for subscription MRR update
   
2. **`invoice.paid`**
   - Records invoice payment → aggregation includes new revenue
   
3. **`payment_intent.succeeded`** (one-time payment)
   - Records one-time payment → aggregation includes in revenue_one_time_cents
   
4. **`charge.refunded`**
   - Records refund → aggregation adjusts revenue downward

5. **Affiliate commission events** (internal, not Stripe webhook):
   - Calls aggregation after commission_events insert

**Key Code Addition:**
```typescript
import { recomputeFinanceDailyAggregates } from '@/lib/finance/aggregates';

// In handleInvoicePaid:
await insertCommissionEvent({ /* ... */ });
const supabase = createRouteHandlerClient();
await recomputeFinanceDailyAggregates(supabase, {
  startDay: new Date().toISOString().slice(0, 10),
  endDay: new Date().toISOString().slice(0, 10),
});
```

## Aggregation Logic

### File: `/lib/finance/aggregates.ts`

**Function Signature:**
```typescript
export async function recomputeFinanceDailyAggregates(
  supabase: SupabaseClient,
  dateRange: { startDay: string; endDay: string }
): Promise<void>
```

**Process:**
1. Query all financial tables for transactions within date range
2. Group by day (YYYY-MM-DD)
3. Compute:
   - **MRR**: Count active subscriptions with current_period_end > now() on each day
   - **Subscriptions Active**: Count of non-canceled subscriptions
   - **Revenue Subscriptions**: Sum of paid invoices grouped by day
   - **Revenue One-Time**: Sum of succeeded payments grouped by day
   - **GMV Marketplace**: Sum of completed orders grouped by day
   - **Platform Fees**: Sum of platform_fee_cents from orders
   - **Affiliate Commissions**: Sum of affiliate_commission_events with status='paid'
   - **Seller Payouts**: Sum of seller_payouts with status='paid'
4. Upsert to `finance_daily_aggregates` table (one row per day)
5. Handle refunds as negative delta to revenue

**Performance:** O(days * transactions), optimized with database-side GROUP BY

## Dashboard Pages

### 1. Admin Finance Dashboard
**Route:** `/admin/finance`

**Features:**
- KPI cards: MRR, ARR, Active Subs, GMV
- Revenue & Fees summary cards
- Revenue trend (line chart, 30/90/180d)
- GMV & Fees trend (bar chart)
- Affiliate commissions trend (line chart)
- Seller payouts trend (line chart)
- Time range selector (30d/90d/180d)

**Component:** [app/admin/finance/page.tsx](app/admin/finance/page.tsx)

### 2. Seller Finance Dashboard
**Route:** `/sell/finance`

**Features:**
- KPI cards: Total GMV, Total Fees, Net Amount, Pending Payout
- Financial summary (gross vs. fees vs. net)
- Payout status (paid out, pending)
- Revenue & fees trend (bar chart)
- Net revenue trend (line chart)
- Recent orders table (date, amount, fees, status)

**Component:** [app/sell/finance/page.tsx](app/sell/finance/page.tsx)

### 3. Affiliate Finance Dashboard
**Route:** `/affiliate/finance`

**Features:**
- KPI cards: Pending, Available, Paid, Total Earned
- Referral code display with copy button
- Commission balance breakdown
- Statistics (commission count, payout count)
- Commission trend chart (pending/available/paid)
- Balance breakdown pie chart
- Recent commission events table

**Component:** [app/affiliate/finance/page.tsx](app/affiliate/finance/page.tsx)

### 4. Enhanced User Billing
**Route:** `/[locale]/account/billing`

**Enhancements:**
- Payment history section
- Total paid, invoice count, payment count cards
- Recent invoices table
- Recent transactions table
- Integration with `/api/finance/me/summary`

**Component:** [app/[locale]/account/billing/page.tsx](app/[locale]/account/billing/page.tsx)

## Testing Checklist

### Database Setup
- [ ] Run migration `supabase/migrations/012_finance_core.sql`
- [ ] Verify 6 new tables created: stripe_customers, stripe_invoices, stripe_payments, marketplace_orders, seller_payouts, finance_daily_aggregates
- [ ] Check RLS policies enabled on all tables
- [ ] Verify indexes created for queries on user_id, day, status fields

### Webhook Integration
- [ ] Test subscription creation → verify `stripe_customers` and `stripe_invoices` records
- [ ] Trigger `invoice.paid` event → verify aggregation runs and `finance_daily_aggregates` updated
- [ ] Create test marketplace order → verify `marketplace_orders` record and fees calculated
- [ ] Create test seller payout → verify `seller_payouts` record
- [ ] Check aggregation completes within 5 seconds

### API Endpoints
- [ ] Test `/api/finance/admin/summary` with admin user (should return MRR/ARR/fees)
- [ ] Test with non-admin user (should return 403 Forbidden)
- [ ] Test `/api/finance/admin/timeseries?range=30d` with charts data
- [ ] Test `/api/finance/me/summary` as authenticated subscriber
- [ ] Test `/api/finance/seller/summary` as seller (should show total GMV, pending payout)
- [ ] Test `/api/finance/affiliate/summary` as affiliate (should show commissions)

### Dashboard Load Times
- [ ] Measure `/admin/finance` load time with 90 days of data (target: <2s)
- [ ] Measure `/sell/finance` load time (target: <2s)
- [ ] Measure `/affiliate/finance` load time (target: <2s)

### i18n Verification
- [ ] Switch to Georgian (ka) → all labels display correctly
- [ ] Switch to English (en) → all labels display correctly
- [ ] Switch to Russian (ru) → all labels display correctly
- [ ] Check translation keys in messages/ka.json, messages/en.json, messages/ru.json

### Access Control
- [ ] Anonymous user visiting `/admin/finance` → redirected to login
- [ ] Logged-in non-admin user visiting `/admin/finance` → 403 error
- [ ] Admin visiting `/admin/finance` → full dashboard
- [ ] Seller visiting `/sell/finance` without seller profile → 404 error
- [ ] Seller visiting `/sell/finance` with active seller profile → dashboard

## Deployment Steps

1. **Database Migration:**
   ```bash
   supabase migration up
   ```

2. **Environment Variables:**
   - Ensure `STRIPE_WEBHOOK_SECRET` is set
   - Ensure `ADMIN_EMAILS` contains admin email addresses

3. **Code Deployment:**
   ```bash
   npm run build
   npm start
   ```

4. **Verify Webhook Endpoint:**
   - Update Stripe dashboard webhook endpoint to `https://youromain.com/api/stripe/webhook`
   - Test webhook delivery in Stripe dashboard

5. **Monitor:**
   - Check logs for `/api/finance/*` requests
   - Monitor aggregation function execution time
   - Verify daily aggregates computed correctly

## Performance Optimization

### Database Indexes
- `stripe_invoices(user_id, created_at)`
- `stripe_payments(user_id, created_at)`
- `marketplace_orders(seller_user_id, created_at)`
- `seller_payouts(seller_user_id, created_at)`
- `finance_daily_aggregates(day)` - primary key ensures fast lookup

### Query Patterns
- Dashboard queries pull from `finance_daily_aggregates` (pre-computed, <10ms)
- Detail tables cached with aggregates (no need for real-time Stripe API calls)
- Time range queries use day-based filtering (efficient with DATE type)

### Caching Strategy
- Aggregates recomputed incrementally (only changed days)
- No client-side caching needed (API already fast)
- Browser HTTP cache: 60s for `/api/finance/*` endpoints recommended

## Troubleshooting

### Issue: Aggregates not updating after webhook
**Solution:** 
1. Check webhook logs in Stripe dashboard
2. Verify `recomputeFinanceDailyAggregates` import in `/api/stripe/webhook`
3. Check database for stripe_events record (idempotency tracking)

### Issue: Slow dashboard load (>2s)
**Solution:**
1. Verify indexes created on finance_daily_aggregates(day)
2. Check query performance: `EXPLAIN SELECT * FROM finance_daily_aggregates WHERE day >= '2026-01-15'`
3. Reduce time range in dashboard (e.g., 30d instead of 90d)

### Issue: Admin sees 403 error on `/admin/finance`
**Solution:**
1. Verify user email in ADMIN_EMAILS environment variable
2. Check RLS policy: `SELECT CURRENT_USER;` → should return service role for webhooks
3. Check `requireAdmin()` function in lib/auth/adminGuard.ts

## Files Created/Modified

### New Files
- [supabase/migrations/012_finance_core.sql](supabase/migrations/012_finance_core.sql) - Database schema
- [lib/finance/aggregates.ts](lib/finance/aggregates.ts) - Aggregation function
- [app/api/finance/admin/summary/route.ts](app/api/finance/admin/summary/route.ts)
- [app/api/finance/admin/timeseries/route.ts](app/api/finance/admin/timeseries/route.ts)
- [app/api/finance/me/summary/route.ts](app/api/finance/me/summary/route.ts)
- [app/api/finance/seller/summary/route.ts](app/api/finance/seller/summary/route.ts)
- [app/api/finance/affiliate/summary/route.ts](app/api/finance/affiliate/summary/route.ts)
- [app/admin/finance/page.tsx](app/admin/finance/page.tsx)
- [app/sell/finance/page.tsx](app/sell/finance/page.tsx)
- [app/affiliate/finance/page.tsx](app/affiliate/finance/page.tsx)

### Modified Files
- [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) - Added aggregation calls
- [app/[locale]/account/billing/page.tsx](app/[locale]/account/billing/page.tsx) - Enhanced with payment history
- [messages/ka.json](messages/ka.json) - Added finance translations
- [messages/en.json](messages/en.json) - Added finance translations
- [messages/ru.json](messages/ru.json) - Added finance translations

## Support & Documentation

For questions or updates, reference:
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [PHASE_8_COMPLETION_REPORT.md](PHASE_8_COMPLETION_REPORT.md) - Implementation summary
- Stripe Webhook Documentation: https://stripe.com/docs/webhooks
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

---

**Phase 8 Status:** ✅ Complete
**Last Updated:** 2026-02-15
**Version:** 1.0.0
