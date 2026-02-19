# Stripe Connect UI Testing Checklist

End-to-end testing guide for seller onboarding and payout readiness.

## Prerequisites

- Stripe Connect enabled in Stripe dashboard
- `STRIPE_SECRET_KEY` configured
- `NEXT_PUBLIC_APP_URL` configured
- Migration `010_stripe_connect_accounts.sql` applied
- Test user account created

## Core End-to-End Flow

### 1. Seller Onboarding Page (/sell/onboarding)

- [ ] Page loads without errors
- [ ] Stepper shows 3 steps
- [ ] Status cards display connected/charges/payouts/details
- [ ] Missing requirements list is readable

### 2. Create Seller Account

- [ ] Clicking **Start seller setup** calls `/api/stripe/connect/create-account`
- [ ] Account created in Stripe
- [ ] Record created in `stripe_connect_accounts`

### 3. Complete Stripe Onboarding

- [ ] Clicking **Continue onboarding** redirects to Stripe onboarding
- [ ] After completion, user returns to `/sell/onboarding`
- [ ] Status updates show charges & payouts enabled

### 4. Seller Dashboard (/sell/dashboard)

- [ ] Shows payout status (active/pending)
- [ ] "Open Stripe dashboard" opens Stripe login link
- [ ] "Payout settings" opens Stripe login link

## API Tests (cURL)

### Create Account
```bash
curl -X POST http://localhost:3000/api/stripe/connect/create-account \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Create Account Link
```bash
curl -X POST http://localhost:3000/api/stripe/connect/create-account-link \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "accountId": "acct_123" }'
```

### Get Status
```bash
curl -X GET http://localhost:3000/api/stripe/connect/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Login Link
```bash
curl -X POST http://localhost:3000/api/stripe/connect/login-link \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

## Data Verification (SQL)

```sql
SELECT *
FROM stripe_connect_accounts
WHERE user_id = 'your-user-id';
```

## Troubleshooting

- **No account found**: Ensure migration ran and account is created
- **Onboarding link fails**: Verify `NEXT_PUBLIC_APP_URL`
- **Status not updated**: Check Stripe dashboard for account requirements
- **Login link error**: Stripe account must be created first

## Production Checklist

- [ ] Connect webhook configured (account.updated)
- [ ] Account links return to `/sell/onboarding`
- [ ] Admins can see seller status
- [ ] Payouts enabled before go-live
