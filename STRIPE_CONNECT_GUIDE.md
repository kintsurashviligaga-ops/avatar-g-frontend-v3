# Stripe Connect Implementation Guide

**Complete marketplace payment system with Standard Accounts**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup Instructions](#setup-instructions)
4. [API Endpoints](#api-endpoints)
5. [Database Schema](#database-schema)
6. [Commission Configuration](#commission-configuration)
7. [Payment Flow](#payment-flow)
8. [Webhook Events](#webhook-events)
9. [Security](#security)
10. [Testing](#testing)
11. [Frontend Integration](#frontend-integration)
12. [Troubleshooting](#troubleshooting)

---

## Overview

This implementation provides a complete **Stripe Connect** integration using **Standard Accounts**.

### Key Features

✅ **Seller Onboarding** - One-click Connect account creation  
✅ **Account Verification** - Real-time status checking  
✅ **Commission System** - Configurable platform fees (5-15%)  
✅ **Direct Charges** - Platform collects payment, auto-transfers to seller  
✅ **Webhook Automation** - Status updates and commission tracking  
✅ **Audit Trail** - Complete event logging  

### Why Standard Accounts?

- ✅ **Seller owns the account** - Platform never has access to seller's Stripe keys
- ✅ **Seller owns customer relationships** - Direct access to customer data
- ✅ **Seller handles disputes** - Platform not liable for chargebacks
- ✅ **Lowest platform risk** - Sellers are responsible for compliance

---

## Architecture

```
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│   Customer  │ ─────────>│  Platform   │ ─────────>│   Seller    │
│             │  Payment  │   Stripe    │  Transfer │   Stripe    │
│             │           │   Account   │           │   Account   │
└─────────────┘           └─────────────┘           └─────────────┘
                                │
                         Application Fee
                          (10% default)
```

### Payment Flow

1. **Customer** pays $100 to **Platform**
2. **Platform** keeps $10 (application fee)
3. **Seller** receives $90 (via automatic transfer)

---

## Setup Instructions

### 1. Stripe Dashboard Configuration

#### Enable Connect

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/settings/connect)
2. Enable **Standard accounts**
3. Add your **Platform Name**
4. Set **Brand Color** and **Icon**

#### Configure Webhooks

Add these events to your webhook endpoint (`https://yourdomain.com/api/stripe/webhook`):

**Required Events:**
- `account.updated` - Track seller account status changes
- `account.application.authorized` - Seller authorizes platform
- `application_fee.created` - Commission collected
- `application_fee.refunded` - Commission refunded

**Existing Events (keep these):**
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `customer.subscription.*`
- `payment_intent.succeeded`
- `charge.refunded`

#### Get Webhook Secret

```bash
# Copy webhook signing secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2. Database Migration

Run the migration to add Connect tables:

```bash
# Navigate to Supabase SQL Editor
# Copy and run: supabase/migrations/009_stripe_connect.sql
```

This creates:
- `seller_profiles` columns (stripe_connected_account_id, status, etc.)
- `stripe_connect_events` table (audit log)
- `platform_commissions` table (commission tracking)

### 3. Environment Variables

Add to `.env.local`:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_live_...           # Your platform's secret key
STRIPE_PUBLISHABLE_KEY=pk_live_...      # Your platform's publishable key
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret

# App URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 4. Verify Installation

```bash
# Check database tables
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('stripe_connect_events', 'platform_commissions');

# Should return both tables
```

---

## API Endpoints

### POST `/api/stripe/connect/onboarding`

Create Connect account and get onboarding URL.

**Request:**

```typescript
POST /api/stripe/connect/onboarding
Content-Type: application/json
Authorization: Bearer <user_token>

{
  "businessName": "My Store" // Optional
}
```

**Response:**

```json
{
  "success": true,
  "accountId": "acct_1ABC123...",
  "onboardingUrl": "https://connect.stripe.com/setup/...",
  "message": "Connect account created successfully"
}
```

**Usage:**

```typescript
const response = await fetch('/api/stripe/connect/onboarding', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ businessName: 'My Store' }),
});

const { onboardingUrl } = await response.json();
window.location.href = onboardingUrl; // Redirect to Stripe
```

---

### GET `/api/stripe/connect/account-status`

Get seller's Connect account status and capabilities.

**Request:**

```typescript
GET /api/stripe/connect/account-status
Authorization: Bearer <user_token>
```

**Response:**

```json
{
  "hasAccount": true,
  "canReceivePayments": true,
  "account": {
    "id": "acct_1ABC123...",
    "status": "enabled",
    "chargesEnabled": true,
    "payoutsEnabled": true,
    "detailsSubmitted": true,
    "email": "seller@example.com",
    "country": "US",
    "currency": "usd",
    "onboardingCompletedAt": "2026-02-14T10:30:00Z"
  },
  "requirements": {
    "currentlyDue": [],
    "eventuallyDue": [],
    "pastDue": [],
    "disabled": false,
    "disabledReason": null
  },
  "capabilities": {
    "cardPayments": "active",
    "transfers": "active"
  },
  "dashboardUrl": "https://connect.stripe.com/express/..."
}
```

---

## Database Schema

### `seller_profiles` (Extended)

```sql
CREATE TABLE seller_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id),
  
  -- Stripe Connect fields
  stripe_connected_account_id TEXT UNIQUE,
  stripe_account_status TEXT CHECK (status IN ('pending', 'restricted', 'enabled', 'rejected')),
  stripe_charges_enabled BOOLEAN DEFAULT FALSE,
  stripe_payouts_enabled BOOLEAN DEFAULT FALSE,
  stripe_details_submitted BOOLEAN DEFAULT FALSE,
  stripe_onboarding_completed_at TIMESTAMPTZ,
  stripe_account_updated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `stripe_connect_events`

```sql
CREATE TABLE stripe_connect_events (
  id UUID PRIMARY KEY,
  seller_id UUID REFERENCES auth.users(id),
  stripe_account_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'account_created', 'onboarding_completed', etc.
  status TEXT NOT NULL,     -- 'success', 'failed'
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `platform_commissions`

```sql
CREATE TABLE platform_commissions (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  seller_id UUID REFERENCES auth.users(id),
  
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_connected_account_id TEXT NOT NULL,
  
  total_amount_cents INTEGER NOT NULL,
  application_fee_cents INTEGER NOT NULL,
  seller_payout_cents INTEGER NOT NULL,
  commission_percentage DECIMAL(5, 2) NOT NULL,
  
  status TEXT DEFAULT 'pending', -- 'pending', 'collected', 'failed', 'refunded'
  collected_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Commission Configuration

### Default Settings

```typescript
// lib/stripe/config.ts

export const STRIPE_CONNECT_CONFIG = {
  DEFAULT_COMMISSION_PERCENTAGE: 10.0,  // 10%
  MIN_COMMISSION_CENTS: 50,              // $0.50 minimum
  MAX_COMMISSION_CENTS: 10000,           // $100.00 maximum
  
  // Volume-based tiers
  COMMISSION_TIERS: [
    { minVolumeUSD: 0,     maxVolumeUSD: 1000,   percentage: 15.0 },  // 0-1k: 15%
    { minVolumeUSD: 1000,  maxVolumeUSD: 5000,   percentage: 12.0 },  // 1k-5k: 12%
    { minVolumeUSD: 5000,  maxVolumeUSD: 10000,  percentage: 10.0 },  // 5k-10k: 10%
    { minVolumeUSD: 10000, maxVolumeUSD: 50000,  percentage: 8.0 },   // 10k-50k: 8%
    { minVolumeUSD: 50000, maxVolumeUSD: Infinity, percentage: 5.0 }, // 50k+: 5%
  ],
};
```

### Calculate Commission

```typescript
import { calculateCommission } from '@/lib/stripe/config';

const { applicationFeeCents, sellerPayoutCents, effectiveRate } = 
  calculateCommission(10000); // $100.00

console.log(applicationFeeCents);  // 1000 ($10.00)
console.log(sellerPayoutCents);    // 9000 ($90.00)
console.log(effectiveRate);        // 10.0 (%)
```

---

## Payment Flow

### Create Payment with Commission

```typescript
import { createPaymentWithFee } from '@/lib/stripe/payments';

const result = await createPaymentWithFee({
  amountCents: 10000,           // $100.00
  currency: 'usd',
  sellerId: 'user-uuid-123',
  orderId: 'order-uuid-456',
  description: 'Avatar video order',
  metadata: {
    product: 'avatar_video',
    customerId: 'customer-123',
  },
  commissionPercentage: 12.0,   // Optional, defaults to config value
});

console.log(result.clientSecret);           // For Stripe Elements
console.log(result.applicationFeeCents);    // 1200 ($12.00)
console.log(result.sellerPayoutCents);      // 8800 ($88.00)
console.log(result.effectiveCommissionRate); // 12.0%
```

### Direct Payment (No Fee)

For platform-subsidized transactions:

```typescript
import { createDirectPayment } from '@/lib/stripe/payments';

const paymentIntent = await createDirectPayment({
  amountCents: 5000,            // $50.00
  sellerId: 'user-uuid-123',
  description: 'Promotional credit',
});

// 100% goes to seller ($50.00)
```

---

## Webhook Events

### Connect Event Handlers

#### `account.updated`

Triggered when seller's account status changes.

```typescript
// Updates seller_profiles with latest status
await updateAccountStatus(userId, accountId);
```

#### `application_fee.created`

Triggered when platform fee is collected.

```typescript
// Updates platform_commissions status to 'collected'
await updateCommissionStatus(paymentIntentId, 'collected');
```

#### `application_fee.refunded`

Triggered when fee is refunded.

```typescript
// Updates platform_commissions status to 'refunded'
await updateCommissionStatus(paymentIntentId, 'refunded');
```

### Webhook Configuration

Add to Stripe Dashboard:

```
Webhook URL: https://yourdomain.com/api/stripe/webhook
Events: account.updated, application_fee.created, application_fee.refunded
```

---

## Security

### ✅ Security Features

1. **Seller Owns Account**
   - Platform NEVER has access to seller's Stripe API keys
   - Seller manages their own Stripe dashboard

2. **Authentication Required**
   - All endpoints require valid Supabase auth token
   - User isolation via RLS policies

3. **Account Validation**
   - Check `canSellerReceivePayments()` before creating payments
   - Throw error if account not enabled

4. **Webhook Verification**
   - All webhooks verified with Stripe signature
   - Idempotency prevents duplicate processing

5. **Database Security**
   - RLS policies: Sellers can only view own data
   - Service role for payment creation

### ⚠️ Security Checklist

- [ ] Validate seller account before payment creation
- [ ] Never expose `STRIPE_SECRET_KEY` to frontend
- [ ] Verify webhook signatures
- [ ] Use HTTPS in production
- [ ] Enable Stripe Radar for fraud detection
- [ ] Monitor `platform_commissions` for anomalies

---

## Testing

### Test Mode Setup

1. **Use Test API Keys**

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... # Test webhook secret
```

2. **Stripe CLI (Local Testing)**

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to localhost
stripe listen --forward-to http://localhost:3000/api/stripe/webhook

# Trigger test events
stripe trigger account.updated
stripe trigger application_fee.created
```

### End-to-End Test Flow

**1. Seller Onboarding**

```bash
# Start onboarding
curl -X POST http://localhost:3000/api/stripe/connect/onboarding \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test Store"}'

# Response: { "onboardingUrl": "https://connect.stripe.com/..." }
# Click URL to complete onboarding
```

**2. Check Account Status**

```bash
curl http://localhost:3000/api/stripe/connect/account-status \
  -H "Authorization: Bearer <token>"

# Should show: canReceivePayments: true
```

**3. Create Test Payment**

```typescript
import { createPaymentWithFee } from '@/lib/stripe/payments';

const result = await createPaymentWithFee({
  amountCents: 5000,
  sellerId: 'test-seller-uuid',
  description: 'Test payment',
});

// Use result.clientSecret with Stripe Elements
```

**4. Complete Payment**

Use Stripe test card: `4242 4242 4242 4242`

**5. Verify Commission**

```sql
SELECT * FROM platform_commissions 
WHERE seller_id = 'test-seller-uuid'
ORDER BY created_at DESC LIMIT 1;

-- Should show:
-- total_amount_cents: 5000
-- application_fee_cents: 500 (10%)
-- seller_payout_cents: 4500
-- status: 'collected'
```

---

## Frontend Integration

### React Hook

```typescript
'use client';

import { useStripeConnect } from '@/hooks/useStripeConnect';

export function SellerDashboard() {
  const { 
    account, 
    loading, 
    error, 
    startOnboarding, 
    refreshStatus,
    canReceivePayments 
  } = useStripeConnect();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  if (!account?.hasAccount) {
    return (
      <button onClick={() => startOnboarding('My Store')}>
        Complete Seller Setup
      </button>
    );
  }

  if (!canReceivePayments) {
    return (
      <div>
        <p>Complete onboarding to receive payments</p>
        <p>Requirements Due: {account.requirements.currentlyDue.join(', ')}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Connected Account</h2>
      <p>Status: {account.account?.status}</p>
      <p>Email: {account.account?.email}</p>
      <button onClick={refreshStatus}>Refresh Status</button>
    </div>
  );
}
```

### Payment Form

```typescript
import { createPaymentWithFee } from '@/lib/stripe/payments';
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// 1. Create payment on server
const response = await fetch('/api/orders/create-payment', {
  method: 'POST',
  body: JSON.stringify({
    orderId: 'order-123',
    sellerId: 'seller-uuid',
    amountCents: 10000,
  }),
});

const { clientSecret } = await response.json();

// 2. Confirm payment on client
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Customer Name' },
  },
});

if (!error) {
  console.log('Payment successful!');
}
```

---

## Troubleshooting

### "Seller is not eligible to receive payments"

**Cause:** Seller hasn't completed onboarding or account is restricted.

**Solution:**
```typescript
const { account } = await getAccountStatus(accountId);

console.log('Charges enabled:', account.charges_enabled);
console.log('Payouts enabled:', account.payouts_enabled);
console.log('Details submitted:', account.details_submitted);
console.log('Requirements:', account.requirements);
```

Redirect seller to complete onboarding.

---

### "No Connect account found"

**Cause:** Seller hasn't started onboarding.

**Solution:**
```typescript
await createConnectAccount(userId, email);
// Returns onboardingUrl - redirect seller
```

---

### "Application fee exceeds transaction amount"

**Cause:** Commission configuration error.

**Solution:**
Check `STRIPE_CONNECT_CONFIG` settings:
```typescript
// Ensure fee doesn't exceed 50% of transaction
const maxFee = amountCents * 0.5;
if (applicationFeeCents > maxFee) {
  applicationFeeCents = maxFee;
}
```

---

### Webhook not receiving events

**Cause:** Webhook secret mismatch or incorrect URL.

**Solution:**
1. Check `.env.local`: `STRIPE_WEBHOOK_SECRET=whsec_...`
2. Verify webhook URL in Stripe Dashboard
3. Test with Stripe CLI: `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`

---

## Next Steps

- [ ] **Run database migration** (`009_stripe_connect.sql`)
- [ ] **Enable Connect in Stripe Dashboard**
- [ ] **Add webhook events** (`account.updated`, `application_fee.*`)
- [ ] **Test onboarding flow** with test account
- [ ] **Test payment creation** with test card
- [ ] **Monitor commission tracking** in database
- [ ] **Enable production mode** with live API keys

---

## Support

### Documentation
- [Stripe Connect Docs](https://stripe.com/docs/connect)
- [Standard Accounts](https://stripe.com/docs/connect/standard-accounts)
- [Direct Charges](https://stripe.com/docs/connect/direct-charges)

### Monitoring
```sql
-- Check seller account status
SELECT user_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled
FROM seller_profiles
WHERE stripe_connected_account_id IS NOT NULL;

-- Check platform commissions
SELECT 
  DATE(created_at) as date,
  COUNT(*) as transactions,
  SUM(total_amount_cents) as total_revenue_cents,
  SUM(application_fee_cents) as total_fees_cents
FROM platform_commissions
WHERE status = 'collected'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Check recent Connect events
SELECT * FROM stripe_connect_events
ORDER BY created_at DESC
LIMIT 20;
```

---

**🎉 Stripe Connect implementation complete!**

Platform can now onboard sellers, collect commissions, and process marketplace payments securely.
