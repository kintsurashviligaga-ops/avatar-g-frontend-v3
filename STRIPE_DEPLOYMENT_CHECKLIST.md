# 🚀 STRIPE DEPLOYMENT CHECKLIST

**Goal:** Deploy Stripe integration to production with webhooks working end-to-end.

---

## PRE-DEPLOYMENT (Before pushing code)

### Code Verification
- [ ] Webhook endpoint created: `/api/stripe/webhook/route.ts` ✓
- [ ] All 4 payment pages exist:
  - [ ] `/pay` payment page
  - [ ] `/pay/success` success page
  - [ ] `/pay/cancel` cancel page
  - [ ] `/api/stripe/create-checkout-session` endpoint
- [ ] Health check endpoint exists: `/api/stripe/health`
- [ ] No TypeScript errors: `npm run build` passes ✓
- [ ] All code is production-ready (error handling, logging)

### Stripe Account Setup
- [ ] Stripe account created and verified ✓
- [ ] API keys obtained:
  - [ ] Secret Key: `sk_test_...` (or `sk_live_...` for production)
  - [ ] Publishable Key: `pk_test_...` (or `pk_live_...`)
- [ ] Webhook endpoint configured to: `https://myavatar.ge/api/stripe/webhook` ✓
- [ ] Webhook signing secret obtained: `whsec_...`
- [ ] Events selected for webhook:
  - [ ] `checkout.session.completed` ✓
  - [ ] `payment_intent.succeeded` ✓
  - [ ] `payment_intent.payment_failed` ✓
  - [ ] `charge.refunded` ✓

---

## DEPLOYMENT (Pushing to Vercel)

### Environment Variables Configuration
**In Vercel Dashboard:**

1. **Go to:** Project Settings → Environment Variables

2. **Add/Update these 4 variables:**

   ```env
   STRIPE_SECRET_KEY = sk_test_XXXXXXXXXXXXXXXXXXXXX
   ```
   - [ ] Variable name correct (no typos)
   - [ ] Value starts with `sk_test_` or `sk_live_`
   - [ ] No spaces before/after value
   - [ ] Hidden from logs ✓

   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_test_XXXXXXXXXXXXXXXXXXXXX
   ```
   - [ ] Variable name correct (starts with `NEXT_PUBLIC_`)
   - [ ] Value starts with `pk_test_` or `pk_live_`
   - [ ] Matches the mode of STRIPE_SECRET_KEY (both test or both live)

   ```env
   STRIPE_WEBHOOK_SECRET = whsec_XXXXXXXXXXXXXXXXXXXXX
   ```
   - [ ] Variable name correct (no typos)
   - [ ] Value starts with `whsec_`
   - [ ] Copied from Stripe Dashboard → Webhooks → Reveal
   - [ ] No extra spaces or characters
   - [ ] Hidden from logs ✓

   ```env
   APP_URL = https://myavatar.ge
   ```
   - [ ] Domain correct
   - [ ] No trailing slash
   - [ ] HTTPS (not HTTP)

3. **After adding variables:**
   - [ ] Click "Save"
   - [ ] Redeploy the application

### Code Deployment
```bash
# In your local terminal:
cd avatar-g-frontend-v3

# 1. Build locally to verify
npm run build

# 2. Commit changes
git add .
git commit -m "feat: Add Stripe webhook handler at /api/stripe/webhook"

# 3. Push to GitHub (Vercel auto-deploys)
git push origin main
```

- [ ] Build completes without errors
- [ ] Vercel deployment starts
- [ ] Deployment completes successfully
- [ ] "Production" is set to latest deployment

---

## POST-DEPLOYMENT VERIFICATION (In This Order)

### Step 1: Health Check (5 minutes after deploy)
```bash
curl https://myavatar.ge/api/stripe/health
```

**Expected Response:**
```json
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
  "checks": {
    "stripeSecretKey": "✓ Set",
    "publishableKey": "✓ Set",
    "webhookSecret": "✓ Set",
    "appUrl": "✓ Set"
  },
  "warnings": []
}
```

- [ ] Response received (no timeout)
- [ ] `"ok": true`
- [ ] All `"configured": true`
- [ ] `"warnings": []` is empty

**If not working:**
- [ ] Wait 5 more minutes (Vercel needs to finish deploying)
- [ ] Check Vercel deployment status
- [ ] Verify all 4 env vars are set
- [ ] Redeploy if env vars were just added

### Step 2: Payment Page Load Check
```
Open: https://myavatar.ge/pay
```

- [ ] Page loads without errors
- [ ] "💳 Test Payment" heading visible
- [ ] "$10", "$50", "$100" buttons visible
- [ ] Test card info displayed: `4242 4242 4242 4242`
- [ ] Custom amount input works

### Step 3: Test Payment Flow
1. **Click "💰 Pay $100"**
   - [ ] Redirects to Stripe Checkout (`checkout.stripe.com`)
   - [ ] Shows "$100.00" amount

2. **Enter Test Card Details**
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/25` (or any future date)
   - CVC: `123` (any 3 digits)
   - Email: (leave blank or `test@example.com`)
   - [ ] All fields accepted

3. **Click "Pay"**
   - [ ] Payment processes (shows spinner/loading)
   - [ ] Payment succeeds (no error messages)

4. **Verify Success Page**
   - [ ] Redirected to `https://myavatar.ge/pay/success`
   - [ ] Green ✅ icon visible
   - [ ] "Payment Successful!" heading shows
   - [ ] Session ID displayed
   - [ ] "Next Steps" checklist shown

### Step 4: Stripe Dashboard - Events Verification
**Stripe Dashboard → Developers → Events**

Wait 2-30 seconds, then:
- [ ] Find event: `checkout.session.completed`
- [ ] Event is recent (within last minute)
- [ ] Click event to expand
- [ ] Verify details:
  - [ ] Event ID: `evt_test_...` or `evt_...`
  - [ ] Type: `checkout.session.completed`
  - [ ] Amount: `10000` (cents) = $100
  - [ ] Currency: `usd`
  - [ ] Livemode: `false` (test mode)

### Step 5: Stripe Dashboard - Webhooks Verification
**Stripe Dashboard → Developers → Webhooks**

1. **Find your endpoint:** "myavatar-ge-stripe-webhook"
   - [ ] URL: `https://myavatar.ge/api/stripe/webhook` ✓
   - [ ] Status: "Active" ✓

2. **Check Event Deliveries**
   - Scroll to "Event deliveries"
   - [ ] Your `checkout.session.completed` event listed
   - [ ] HTTP Response Code: `200` ✓
   - [ ] Delivery timestamp: Recent (2-3 minutes ago)

3. **Click Event to See Webhook Payload**
   - [ ] "Request" section shows POST body
   - [ ] "Response" section shows `{ "received": true }`
   - [ ] Response status: `200` ✓

### Step 6: Vercel Function Logs Verification
**Vercel Dashboard → Deployments → [Latest] → Function Logs**

Look for logs from the webhook handler:

**Expected logs:**
```
[Stripe Webhook] Event received {
  eventId: "evt_test_...",
  eventType: "checkout.session.completed",
  mode: "test",
  timestamp: "2026-02-14T...",
  requestId: "..."
}

[Stripe Webhook] Processing checkout.session.completed {
  sessionId: "cs_test_...",
  customerId: "cus_...",
  paymentStatus: "paid",
  amountTotal: 10000,
  currency: "usd"
}
```

- [ ] Webhook received log appears
- [ ] Event processing log appears
- [ ] No error logs
- [ ] Logs show within 1-2 minutes of payment

### Step 7: Test Cancel Flow
1. Open: `https://myavatar.ge/pay`
2. Click: "💰 Pay $50"
3. On Stripe Checkout page, click "Back" or close
   - [ ] Redirects to `https://myavatar.ge/pay/cancel`
   - [ ] Orange ⚠️ icon visible
   - [ ] "Payment Cancelled" message shown
   - [ ] "Try Payment Again" button works

---

## SUCCESS CRITERIA

### All Green ✅ If:
- [ ] Health check returns `ok: true`
- [ ] Payment page loads
- [ ] Test payment succeeds
- [ ] Redirects to success page
- [ ] Event appears in Stripe Dashboard within 2 min
- [ ] Webhook delivery shows HTTP 200
- [ ] Vercel logs show webhook processing
- [ ] Cancel page works
- [ ] No error messages anywhere

### Red ❌ If Any Of:
- [ ] Health check shows warnings
- [ ] Payment page won't load
- [ ] Stripe Checkout won't open
- [ ] Payment fails with error
- [ ] Doesn't redirect to success page
- [ ] Event doesn't appear in Stripe
- [ ] Webhook shows 401 or 5xx status
- [ ] Vercel logs show errors

---

## TROUBLESHOOTING DURING DEPLOYMENT

### Problem: Build fails
```bash
npm run build
```
Check for TypeScript errors. Common issues:
- [ ] Missing imports
- [ ] Type mismatches
- [ ] Syntax errors

**Fix:** Resolve build errors before deploying

### Problem: Health check returns errors
**Example:**
```json
{
  "ok": false,
  "stripe": {
    "configured": {
      "secretKey": false,
      "publishableKey": true,
      "webhookSecret": true
    }
  }
}
```

**Fixes:**
- [ ] Missing var: Add `STRIPE_SECRET_KEY` and redeploy
- [ ] Wrong format: Key should start with `sk_test_` or `sk_live_`
- [ ] Typo in var name: Must be exactly `STRIPE_SECRET_KEY`

### Problem: Payment succeeds but webhook doesn't fire
**Checklist:**
1. [ ] Stripe Dashboard shows webhook is "Active"
2. [ ] Webhook signing secret matches exactly (no spaces)
3. [ ] Webhook events include `checkout.session.completed`
4. [ ] Check Events in Stripe Dashboard (not just Webhooks)
5. [ ] Wait 2-3 minutes (events are async)

### Problem: Webhook shows 401 Unauthorized
**Cause:** Webhook signing secret doesn't match
**Fix:**
1. Stripe Dashboard → Webhooks → Click your endpoint
2. Find "Signing secret" → Click "Reveal"
3. Copy exact value
4. Vercel → Update `STRIPE_WEBHOOK_SECRET` to exact value
5. Redeploy
6. Try payment again

### Problem: Webhook shows timeout
**Cause:** Vercel function slow or has errors
**Fix:**
1. Check Vercel logs for long request times
2. Check for database queries or slow operations
3. Optimize handler code if needed
4. Retry webhook from Stripe Dashboard

---

## AFTER SUCCESSFUL VERIFICATION

### Short-term
- [ ] Document this setup in team wiki
- [ ] Train developers on payment flow
- [ ] Add monitoring/alerts for webhook failures
- [ ] Set up error tracking (Sentry, etc.)

### Medium-term
- [ ] Test refund flow
- [ ] Implement subscription support (if needed)
- [ ] Add email receipts
- [ ] Set up analytics/dashboards

### Going Live to Real Payments
```
When ready (NOT YET):

1. Switch Stripe to LIVE mode
   Stripe Dashboard → Toggle (top-right)

2. Get LIVE keys (these are different from test keys)
   Stripe Dashboard → Developers → API Keys
   Copy: sk_live_... (secret)
   Copy: pk_live_... (public)

3. Create NEW webhook in LIVE mode
   Same URL: https://myavatar.ge/api/stripe/webhook
   But different signing secret: whsec_... (different)

4. Update Vercel env vars:
   STRIPE_SECRET_KEY = sk_live_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
   STRIPE_WEBHOOK_SECRET = whsec_... (live secret)

5. Redeploy

6. Test with $1 real card payment

7. Check Stripe Dashboard (should say LIVE)

8. Refund the $1 immediately

9. Monitor logs for 24 hours
```

---

## ACCEPTANCE CHECKLIST

Deployment is successful when:

- [x] Code deployed to Vercel
- [x] All 4 env vars set
- [x] Health check passes
- [x] Payment page loads
- [x] Test payment succeeds
- [x] Success page shown
- [x] Event appears in Stripe
- [x] Webhook delivery HTTP 200
- [x] Vercel logs show processing
- [x] Cancel page works
- [x] No errors in logs or browser

**Status: ✅ READY FOR PRODUCTION**

---

**Date:** February 14, 2026  
**Version:** 1.0.0  
**Last Updated:** Production deployment guide  
**Est. Time to Deploy:** 15-20 minutes
