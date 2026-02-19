# Subscription UI Testing Checklist

End-to-end testing guide for Avatar G subscriptions.

## Prerequisites

- Stripe keys configured (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- `NEXT_PUBLIC_APP_URL` set to the correct domain
- Supabase tables migrated (`subscriptions`, `stripe_customers` as applicable)
- Test user account created

## Core End-to-End Flow

### 1. Pricing Page (/pricing)

- [ ] Pricing page loads without errors
- [ ] All three tiers are visible (Starter, Pro, Empire)
- [ ] Monthly/Yearly toggle updates prices
- [ ] USD price displayed with GEL approximation
- [ ] CTA button shows **Start free trial** if `trialDays > 0`
- [ ] Clicking CTA creates Stripe checkout session

### 2. Checkout Start

- [ ] `/api/stripe/subscription/create-checkout` returns `{ url }`
- [ ] User is redirected to Stripe Checkout
- [ ] Idempotency prevents duplicate sessions on refresh

### 3. Success + Cancel

- [ ] `/pay/success` loads after successful payment
- [ ] `/pay/cancel` loads after cancellation

### 4. Subscription Status

- [ ] `/api/stripe/subscription/get-status` returns active subscription
- [ ] Status fields match Stripe data
- [ ] `currentPeriodEnd` displays on billing page

### 5. Billing Page (/account/billing)

- [ ] Shows plan name, status, next billing date
- [ ] "Manage billing" opens Stripe customer portal
- [ ] "Change plan" routes back to pricing
- [ ] No-subscription state shows CTA to pricing

### 6. Header Badge

- [ ] Navbar shows **Premium Active** for active subscriptions
- [ ] Navbar shows **Trial** badge during trial
- [ ] Past-due banner appears for `past_due`
- [ ] "Fix payment" opens Stripe portal

### 7. Stripe Customer Portal

- [ ] `/api/stripe/customer-portal` returns `{ url }`
- [ ] User can update payment method
- [ ] User can cancel subscription
- [ ] Changes reflect in `/account/billing`

## API Tests (cURL)

### Create Checkout Session
```bash
curl -X POST http://localhost:3000/api/stripe/subscription/create-checkout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "priceId": "price_starter_monthly" }'
```

### Get Subscription Status
```bash
curl -X GET http://localhost:3000/api/stripe/subscription/get-status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Open Customer Portal
```bash
curl -X POST http://localhost:3000/api/stripe/customer-portal \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Data Verification (SQL)

```sql
SELECT *
FROM subscriptions
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 1;
```

```sql
SELECT *
FROM stripe_customers
WHERE user_id = 'your-user-id';
```

## Troubleshooting

- **Checkout fails**: Confirm price IDs in `lib/stripe/plans.ts` match Stripe Dashboard
- **Portal fails**: Ensure Stripe customer exists for user
- **Wrong status**: Verify webhook updates the `subscriptions` table
- **No badge**: Check `/api/stripe/subscription/get-status` response

## Production Checklist

- [ ] Stripe webhooks configured
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain
- [ ] Stripe live keys enabled
- [ ] Subscription plans synced with Stripe products
