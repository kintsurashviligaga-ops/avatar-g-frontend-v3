# Stripe Payments & Webhooks Implementation Guide

## Overview

Avatar G now includes a complete, production-grade Stripe payment integration with:
- **Checkout Flow:** One-time payment checkout for testing
- **Webhook Handling:** Production-grade signature verification + idempotency
- **Health Monitoring:** Diagnostic endpoint to verify configuration
- **Event Processing:** Handles `checkout.session.completed` and order payments
- **Sandbox & Live Support:** Works in both test and production modes

## Architecture

### Files Added/Modified

```
app/
├── api/
│   ├── stripe/
│   │   ├── create-checkout-session/route.ts    [NEW] One-time payment checkout
│   │   └── health/route.ts                     [NEW] Health check endpoint
│   └── webhooks/
│       └── stripe/route.ts                     [ENHANCED] Added checkout.session.completed
├── pay/
│   ├── page.tsx                                [NEW] Payment UI page
│   ├── success/page.tsx                        [NEW] Success redirect page
│   └── cancel/page.tsx                         [NEW] Cancel redirect page

lib/
├── stripe/
│   ├── client.ts                               [EXISTING] Stripe client singleton
│   ├── webhooks.ts                             [EXISTING] Webhook verification
│   └── types.ts                                [EXISTING] TypeScript types
└── billing/
    └── stripe.ts                               [EXISTING] Subscription helpers
```

### Request/Response Flow

```
User Visits /pay
    ↓
Clicks "Pay $100"
    ↓
POST /api/stripe/create-checkout-session
    ↓ Returns { url: "https://checkout.stripe.com/..." }
    ↓
Redirects to Stripe Checkout
    ↓
User enters card 4242 4242 4242 4242
    ↓
Stripe processes payment
    ↓
Redirects to /pay/success
    ↓
Stripe sends webhook: checkout.session.completed
    ↓
POST /api/webhooks/stripe (signature verified)
    ↓
Records event (idempotent)
    ↓
Returns 200 OK
```

## Environment Variables

All of these must be set in Vercel environment variables:

### Required
```env
# Stripe API Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... (from webhook endpoint settings)

# Application Base URL
APP_URL=https://myavatar.ge
```

### Optional
```env
# For local development only (not needed in Vercel)
# Download from: https://dashboard.stripe.com/webhooks/endpoint/we_xxx
# Used with Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Stripe Dashboard Setup

### 1. Create Webhook Endpoint

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter endpoint URL: `https://myavatar.ge/api/webhooks/stripe`
4. Select events to listen for:
   - ✅ `checkout.session.completed` (one-time payments)
   - ✅ `payment_intent.succeeded` (orders)
   - ✅ `payment_intent.payment_failed` (order failures)
   - ✅ `invoice.paid` (subscriptions)
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `charge.refunded` (refunds)
5. Click **"Add endpoint"**
6. In the endpoint details, click **"Reveal"** next to **Signing secret**
7. Copy the secret (starts with `whsec_`)
8. Add to Vercel: `STRIPE_WEBHOOK_SECRET=whsec_...`

### 2. Verify Webhook Configuration

```bash
# Option A: Use the health endpoint (easiest)
curl https://myavatar.ge/api/stripe/health

# This returns:
{
  "ok": true,
  "stripe": {
    "mode": "test",
    "configured": {
      "secretKey": true,
      "publishableKey": true,
      "webhookSecret": true
    }
  },
  "warnings": []
}
```

### 3. Why "Send test events" Shows CLI Modal

Stripe's new Workbench experience sometimes shows a modal suggesting to use the Stripe CLI for test events. This is optional:
- **Option A (Recommended):** Run real test payments through `/pay` page
- **Option B:** Use Stripe CLI locally (for development only)
  ```bash
  stripe login
  stripe listen --api-key sk_test_... --forward-to http://localhost:3000/api/webhooks/stripe
  stripe trigger checkout.session.completed
  ```

We recommend **Option A** (real payments) because:
- Tests the full checkout flow
- Easier to debug in production environment
- No CLI setup required for Vercel

## Testing Payments (Sandbox Mode)

### Full Test Flow

#### 1. Open Payment Page
```
https://myavatar.ge/pay
```

#### 2. Choose Payment Amount
- Click **"Pay $10"** / **"Pay $50"** / **"Pay $100"** (test button)
- Or enter custom amount in the input field

#### 3. Complete Stripe Checkout
- **Card Number:** `4242 4242 4242 4242` (Stripe test card)
- **Expiry:** Any future date (e.g., `12/25`)
- **CVC:** Any 3-digit number (e.g., `123`)
- **Email:** (optional, leave blank or enter test email)
- Click **"Pay"**

#### 4. Verify Success
You should see `/pay/success` page with:
- ✅ Green success icon
- Session ID displayed
- Next steps checklist

#### 5. Verify in Stripe Dashboard
- Go to **Stripe Dashboard** → **Events**
- Look for `checkout.session.completed` event (may take 2-30 seconds)
- Click the event to see full details

#### 6. Verify Webhook Delivery
- Go to **Stripe Dashboard** → **Webhooks**
- Click your endpoint URL
- Scroll to **Event deliveries**
- Should show your checkout event with:
  - ✅ Event timestamp
  - ✅ HTTP status `200` (success)
  - ✅ Webhook payload

#### 7. Check Vercel Logs
```bash
# In Vercel dashboard:
# Deployments → (latest) → Function logs

# Should see logs like:
# [Stripe Webhook] checkout.session.completed
# sessionId: cs_test_...
# paymentStatus: paid
# timestamp: 2026-02-14T...
```

### Common Test Scenarios

| Card Number | Behavior |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declines (generic) |
| `4000 0000 0000 0069` | Expired card |
| `4000 0000 0000 0127` | CVC check fails |

See [Stripe Testing Docs](https://stripe.com/docs/testing) for 200+ test cards.

## API Endpoints

### 1. Create Checkout Session

**POST** `/api/stripe/create-checkout-session`

Creates a Stripe checkout session for one-time payment.

**Request Body:**
```json
{
  "amount": 10000,              // Optional, cents (default: 10000 = $100)
  "currency": "usd",            // Optional, default: "usd"
  "customerEmail": "user@example.com",  // Optional
  "description": "Test Payment" // Optional
}
```

**Response (200 OK):**
```json
{
  "url": "https://checkout.stripe.com/...",
  "id": "cs_test_...",
  "amount": 10000,
  "currency": "usd"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid amount. Must be positive number (cents)."
}
```

### 2. Stripe Health Check

**GET** `/api/stripe/health`

Diagnostic endpoint to verify Stripe configuration. Never exposes secrets.

**Response (200 OK):**
```json
{
  "ok": true,
  "stripe": {
    "mode": "test",
    "configured": {
      "secretKey": true,
      "publishableKey": true,
      "webhookSecret": true
    },
    "secrets": {
      "secretKey": "sk_test_...",
      "publishableKey": "pk_test_...",
      "webhookSecret": "whsec_..."
    }
  },
  "checks": {
    "stripeSecretKey": "✓ Set",
    "publishableKey": "✓ Set",
    "webhookSecret": "✓ Set"
  },
  "warnings": [],
  "endpoints": {
    "createCheckoutSession": "/api/stripe/create-checkout-session",
    "webhook": "/api/webhooks/stripe"
  }
}
```

### 3. Webhook Endpoint

**POST** `/api/webhooks/stripe`

Handles Stripe webhooks with signature verification.

**Incoming Header:**
```
stripe-signature: t=...,v1=...
```

**Processed Events:**
- `checkout.session.completed` → Records payment for audit trail
- `payment_intent.succeeded` → Updates order status to paid
- `payment_intent.payment_failed` → Records failed payment attempt
- `charge.refunded` → Creates refund ledger entry
- `invoice.paid` → (Ready for subscriptions)
- `customer.subscription.*` → (Ready for subscriptions)

**Response (200 OK):**
```json
{ "received": true }
```

## Production Deployment Checklist

- [ ] **Verify Environment Variables:** Run `curl https://myavatar.ge/api/stripe/health`
  - All `configured: true` checks pass ✓
  - No warnings in `warnings` array ✓

- [ ] **Set Webhook Secret:** Copy from Stripe Dashboard
  - Go to **Developers** → **Webhooks** → Your endpoint
  - Click **Reveal** next to **Signing secret**
  - Add to Vercel: `STRIPE_WEBHOOK_SECRET=whsec_...`
  - Redeploy

- [ ] **Test Payment Flow:**
  - Visit `https://myavatar.ge/pay`
  - Click **"Pay $10"**
  - Use test card `4242 4242 4242 4242`
  - Verify redirect to `/pay/success`
  - Check Stripe Dashboard → Events for `checkout.session.completed` ✓

- [ ] **Verify Webhook Delivery:**
  - Stripe Dashboard → **Webhooks** → Your endpoint → **Event deliveries**
  - Should show multiple successful deliveries (200 status)
  - Check Vercel Function Logs for webhook processing

- [ ] **Switch to Live Mode (when ready):**
  - In Stripe Dashboard, switch toggle to **Live** (top-right)
  - Get **LIVE** keys from **Developers** → **API Keys**
  - Update Vercel: `STRIPE_SECRET_KEY=sk_live_...`
  - Update Vercel: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
  - Create NEW webhook endpoint for live (same URL, different signing secret)
  - Redeploy to Vercel
  - Test with real card (small amount, refund immediately)

## Troubleshooting

### Issue: Health endpoint shows warnings

**Problem:** `STRIPE_WEBHOOK_SECRET not configured`

**Solution:**
1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click your endpoint URL
3. Click **Reveal** next to **Signing secret**
4. Copy `whsec_...` value
5. In Vercel: Project Settings → **Environment Variables**
6. Add: `STRIPE_WEBHOOK_SECRET=whsec_...`
7. Redeploy

---

### Issue: Payment succeeds but webhook doesn't fire

**Problem:** Event isn't showing in Stripe Dashboard

**Solution:**
1. Check you're in TEST mode (not LIVE)
2. Wait 30+ seconds (webhooks are async)
3. Verify webhook endpoint is active:
   - Stripe Dashboard → **Developers** → **Webhooks**
   - Endpoint should show **Active** ✓
4. Check Vercel Function Logs for errors
5. Verify `STRIPE_WEBHOOK_SECRET` is correct (should match dashboard value)

---

### Issue: Webhook returns 401 (Signature mismatch)

**Problem:** `{ error: 'Invalid signature' }`

**Solution:**
1. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard exactly
2. Check that webhook secret wasn't accidentally swapped with API key
3. Webhook secret starts with `whsec_` (not `sk_` or `pk_`)
4. If changed recently, redeploy after setting env var

---

### Issue: 500 Error on Payment Page

**Problem:** Cannot create checkout session

**Solution:**
1. Check `STRIPE_SECRET_KEY` exists in Vercel env vars
2. Verify it's a **secret** key (starts with `sk_`)
3. Run health check: `curl https://myavatar.ge/api/stripe/health`
4. Check Vercel Function Logs for error details

---

### Issue: Test card declined in Sandbox

**Problem:** "Your card was declined."

**Solution:**
1. Use correct Stripe test card: `4242 4242 4242 4242`
2. Expiry must be in **future** (try `12/25` or later)
3. CVC can be any 3 digits (e.g., `123`)
4. For other test scenarios, see [Stripe test cards table](#common-test-scenarios)

---

## Notes & Best Practices

### Idempotency
- Webhook handler stores `stripe_events` in Supabase
- Each event ID processed once, duplicates return 200 immediately
- Safe to retry webhooks (Stripe will retry on 5xx errors)

### Security
- Raw body read before parsing (required for signature verification)
- Secrets never logged or exposed in responses
- Webhook signature verified with `Stripe.webhooks.constructEvent()`
- App URL configurable via `APP_URL` env var

### No Card Storage
- Avatar G never touches card data
- All PCI compliance handled by Stripe
- Safe for Vercel deployment (no PCI audit required)

### Testing Without Stripe CLI
- Previous docs mention "Send test events" modal
- Simpler approach: Use `/pay` page for real test payments
- CLI option still available for local development if needed

### Event Storage
- `stripe_events` table stores webhook event history (audit trail)
- `stripe_checkout_sessions` table stores payment details (if table exists)
- Schema can be created via Supabase migrations

### Future Enhancements
- [ ] Subscription billing (use `mode: 'subscription'` instead of `'payment'`)
- [ ] Customer portal (billing management)
- [ ] Invoice generation (trigger on payment success)
- [ ] Email receipts (SendGrid/Resend integration)
- [ ] Refund API endpoint (admin only)

## Related Files

- **Existing Stripe Integration:** `lib/stripe/` (client, webhooks, types)
- **Billing System:** `lib/billing/stripe.ts` (subscriptions)
- **Orders Payment:** `/api/checkout/create-intent` (PaymentIntent for orders)
- **Billing Pages:** `/dashboard/billing` (subscription management)

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Stripe logs: **Stripe Dashboard** → **Developers** → **Logs**
3. Check Vercel logs: **Vercel Dashboard** → **Deployments** → **Function Logs**
4. Contact support with:
   - Session ID from `/pay/success`
   - Stripe event ID from dashboard
   - Error message from logs

---

**Last Updated:** February 14, 2026
**Stripe API Version:** 2024-06-20
**Next.js Version:** 14.2.0
