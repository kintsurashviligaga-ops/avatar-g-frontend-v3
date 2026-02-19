# ✅ Stripe Integration - FINAL SETUP & VERIFICATION GUIDE

**Status:** Webhook route created at correct path: `https://myavatar.ge/api/stripe/webhook`

## 🎯 CURRENT STATE

Your setup has:
- ✅ Checkout session endpoint: `/api/stripe/create-checkout-session`
- ✅ Health check endpoint: `/api/stripe/health`
- ✅ Payment UI: `/pay` page
- ✅ Success/Cancel pages: `/pay/success` & `/pay/cancel`
- ✅ **NEW:** Webhook handler: `/api/stripe/webhook` (now at correct path)

---

## ⚠️ ISSUE FIXED

**Problem:** Stripe Dashboard configured webhooks at `https://myavatar.ge/api/stripe/webhook` but route didn't exist.

**Solution:** Created `/api/stripe/webhook/route.ts` with full event handling.

---

## 📋 IMMEDIATE ACTION ITEMS

### 1. Verify Webhook Endpoint in Stripe Dashboard

```
Go to: Stripe Dashboard → Developers → Webhooks
Look for: "myavatar-ge-stripe-webhook" (your configured endpoint)
URL should be: https://myavatar.ge/api/stripe/webhook ✓
Status: Active ✓
```

**If URL shows something else:**
1. Delete the old endpoint
2. Create new endpoint:
   - URL: `https://myavatar.ge/api/stripe/webhook`
   - Select events: (see below)

### 2. Select Webhook Events

In Stripe Dashboard → Webhooks → Your Endpoint → "Events to send":

**Minimum (One-time payments):**
- [x] `checkout.session.completed`
- [x] `payment_intent.succeeded`
- [x] `payment_intent.payment_failed`
- [x] `charge.refunded`

**For Subscriptions (add later):**
- [x] `invoice.paid`
- [x] `customer.subscription.created`
- [x] `customer.subscription.updated`
- [x] `customer.subscription.deleted`

### 3. Copy Webhook Signing Secret

**In Stripe Dashboard:**
1. Go to: Developers → Webhooks
2. Click your webhook endpoint ("myavatar-ge-stripe-webhook")
3. Scroll to "Signing secret"
4. Click "Reveal" (if hidden)
5. Copy the value (starts with `whsec_`)

**In Vercel:**
1. Go to: Project → Settings → Environment Variables
2. Add/Update: `STRIPE_WEBHOOK_SECRET=whsec_...`
3. Redeploy

---

## 🔐 COMPLETE ENV VARS CHECKLIST

**Verify ALL 4 are set in Vercel:**

```env
# 1. Stripe Secret Key (NOT public)
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
□ Is it set?
□ Does it start with sk_test_ (test) or sk_live_ (live)?
□ Hidden from logs?

# 2. Stripe Public Key (CAN be public in NEXT_PUBLIC_)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...
□ Is it set?
□ Matches the secret key mode (test/test or live/live)?

# 3. Webhook Signing Secret (NOT public)
STRIPE_WEBHOOK_SECRET=whsec_...
□ Is it set?
□ From Stripe Dashboard → Webhooks → Reveal?
□ Hidden from logs?

# 4. App URL (for redirects)
APP_URL=https://myavatar.ge
□ Is it set?
□ Ends without trailing slash?
```

### Getting Each Key

| Key | Where to Find | Command/Action |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys | Copy "Secret key" |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys | Copy "Publishable key" |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Your Endpoint | Click "Reveal" next to "Signing secret" |
| `APP_URL` | Your domain | Set to `https://myavatar.ge` |

---

## ✅ VERIFICATION STEPS (In Order)

### Step 1: Health Check
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

**If you see warnings:** Update the corresponding env vars and redeploy.

### Step 2: Open Payment Page
```
https://myavatar.ge/pay
```

**Check:**
- [ ] Page loads
- [ ] "Pay $100" button visible
- [ ] Test card info displayed (4242 4242 4242 4242)

### Step 3: Make Test Payment
1. Click **"Pay $100"**
2. Redirected to Stripe Checkout (checkout.stripe.com)
3. Enter test card:
   - **Card:** `4242 4242 4242 4242`
   - **Expiry:** Any future date (e.g., `12/25`)
   - **CVC:** Any 3 digits (e.g., `123`)
   - **Email:** (optional, leave blank or `test@example.com`)
4. Click **"Pay"**

### Step 4: Verify Success Page
- [ ] Redirected to `https://myavatar.ge/pay/success`
- [ ] Green ✅ icon visible
- [ ] "Payment Successful!" heading shows
- [ ] Session ID displayed

### Step 5: Check Stripe Dashboard
**Stripe Dashboard → Developers → Events**

Look for: `checkout.session.completed`
- [ ] Event appears (should be within 2-30 seconds)
- [ ] Click event to see details:
  - Event ID: `evt_...`
  - Type: `checkout.session.completed`
  - Amount: 10000 cents ($100)

### Step 6: Verify Webhook Delivery
**Stripe Dashboard → Developers → Webhooks**
1. Click your endpoint: "myavatar-ge-stripe-webhook"
2. Scroll to **"Event deliveries"**

**Check:**
- [ ] Your `checkout.session.completed` event listed
- [ ] HTTP status: `200` ✓
- [ ] Delivery timestamp: Recent (within 2 minutes)
- [ ] Click event to see webhook payload

### Step 7: Check Vercel Logs
**Vercel Dashboard → Deployments → [Latest] → Function Logs**

**Look for:**
```
[Stripe Webhook] Event received {
  eventId: evt_test_...,
  eventType: "checkout.session.completed",
  mode: "test",
  timestamp: "2026-02-14T...",
  requestId: "...
}

[Stripe Webhook] Processing checkout.session.completed {
  sessionId: "cs_test_...",
  customerId: "cus_...",
  paymentStatus: "paid",
  amountTotal: 10000,
  currency: "usd"
}
```

- [ ] Webhook received logged
- [ ] Event processed logged
- [ ] No error messages
- [ ] Response was 200

---

## 🚀 TEST SCENARIOS

### Scenario 1: Successful Payment ✅
```
Card: 4242 4242 4242 4242
Expiry: 12/25 (any future)
CVC: 123 (any 3 digits)
Result: ✅ Payment succeeds
Action: Check Stripe Events + Webhooks + Vercel Logs
```

### Scenario 2: Declined Card ❌
```
Card: 4000 0000 0000 0002
Result: ❌ "Card declined"
Purpose: Test error handling
```

### Scenario 3: Expired Card ⚠️
```
Card: 4000 0000 0000 0069
Result: ⚠️ "Your card has expired"
Purpose: Test edge case handling
```

### Scenario 4: Cancel Payment
```
Action: Click "Never mind" on Stripe Checkout
Result: Redirected to /pay/cancel
```

---

## 🔧 TROUBLESHOOTING

### Issue: Health check shows `"ok": false`

**Causes & Fixes:**
```
❌ secretKey: false → STRIPE_SECRET_KEY not set
   Fix: Add to Vercel env vars, redeploy

❌ publishableKey: false → NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set
   Fix: Add to Vercel env vars, redeploy

❌ webhookSecret: false → STRIPE_WEBHOOK_SECRET not set
   Fix: Copy from Stripe Dashboard → Webhooks → Reveal → Add to Vercel

❌ appUrl: false → APP_URL not set
   Fix: Add APP_URL=https://myavatar.ge to Vercel
```

### Issue: Webhook doesn't deliver

**Causes & Fixes:**
```
1. Endpoint URL wrong in Stripe Dashboard
   Fix: Verify it's: https://myavatar.ge/api/stripe/webhook ✓

2. Webhook secret doesn't match
   Fix: Copy exact value from Stripe → Webhooks → Reveal
   Ensure no extra spaces

3. Wrong events selected
   Fix: Stripe Dashboard → Webhooks → Events to send
   Make sure checkout.session.completed is checked ✓

4. Event delivery shows 401 (Unauthorized)
   Fix: Webhook secret doesn't match
   Copy exact value again, redeploy

5. Event delivery shows timeout
   Fix: Vercel function may be slow
   Check Vercel Function Logs for delays
```

### Issue: Payment page won't load

**Causes:**
```
❌ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set
   Fix: Must start with NEXT_PUBLIC_ to be visible in browser

❌ Wrong key format
   Fix: Public key should start with pk_test_ or pk_live_

❌ Network error
   Fix: Check browser console for CORS issues
```

### Issue: Redirect to success page doesn't work

**Causes:**
```
❌ APP_URL not set or wrong
   Fix: Should be https://myavatar.ge (no trailing slash)

❌ Success page route doesn't exist
   Check: /pay/success page exists in app/pay/success/page.tsx
```

---

## 📊 WEBHOOK EVENT FLOW

```
User at /pay page
  ↓
Clicks "Pay $100"
  ↓
POST /api/stripe/create-checkout-session
  ↓ [Returns session.url]
  ↓
Redirects to Stripe Checkout (checkout.stripe.com)
  ↓
User enters card + clicks "Pay"
  ↓
Stripe processes payment
  ↓
✅ Payment succeeds
  ↓
Redirects to /pay/success
  ↓
[Stripe sends webhook async, 2-30 seconds later]
  ↓
POST /api/stripe/webhook
  [Body: Stripe event signed with webhook secret]
  ↓
Signature verified ✓
  ↓
Event ID checked (prevent duplicates)
  ↓
Handler processes event
  ↓
Logs to Vercel Function Logs
  ↓
Returns 200 OK (Stripe marks as delivered)
  ↓
Event appears in Stripe Dashboard after 1-2 minutes
```

---

## 📈 NEXT STEPS AFTER VERIFICATION

### If All Tests Pass ✅
1. You're ready for production!
2. Document the setup in your team wiki
3. Train team on payment flow
4. Plan rollout to real users

### If Tests Fail ❌
1. Check Vercel logs for error details
2. Verify all 4 env vars are set correctly
3. Review Stripe webhook configuration
4. Check webhook signing secret matches exactly
5. Contact Stripe support if signature verification fails

### For Going Live (Later)
```
1. Switch Stripe to LIVE mode
   (Top-right toggle in Stripe Dashboard)

2. Get LIVE keys (not test keys)
   Stripe Dashboard → Developers → API Keys → LIVE DATA

3. Create NEW webhook endpoint for LIVE
   (Use same URL, but it will have a different signing secret)

4. Update Vercel env vars:
   STRIPE_SECRET_KEY = sk_live_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
   STRIPE_WEBHOOK_SECRET = whsec_... (live secret)

5. Redeploy

6. Make small test payment with real card

7. Check Stripe Dashboard (should say "LIVE" data)

8. Refund immediately

9. Monitor logs for 24 hours
```

---

## 📚 DOCUMENTATION FILES

If you need more details:
- `STRIPE_PAYMENTS_GUIDE.md` - Complete guide (400+ lines)
- `STRIPE_IMPLEMENTATION_TESTING.md` - Testing checklist (300+ lines)
- `STRIPE_QUICK_REFERENCE.md` - Quick lookup (2 pages)

---

## ✅ SUCCESS CHECKLIST

Mark these when complete:

- [ ] Webhook route created: `/api/stripe/webhook` ✓
- [ ] Endpoint URL matches Stripe config: `https://myavatar.ge/api/stripe/webhook` ✓
- [ ] All 4 env vars set in Vercel
- [ ] Health check passes: `GET /api/stripe/health` → ok: true
- [ ] Payment page loads: `https://myavatar.ge/pay`
- [ ] Test payment completes with card 4242
- [ ] Success page shows
- [ ] Event appears in Stripe Dashboard
- [ ] Webhook shows 200 delivery status
- [ ] Vercel logs show webhook processing

**All checked ✅ = Production ready!**

---

## 🎉 SUMMARY

You now have:
1. ✅ Webhook handler at correct path
2. ✅ All event types handled
3. ✅ Signature verification built-in
4. ✅ Structured logging
5. ✅ Error handling
6. ✅ Complete verification guide

**Next Action:** Deploy and run through verification steps above.

---

**Date:** February 14, 2026  
**Status:** Ready to Test  
**Time to Verification:** ~15 minutes
