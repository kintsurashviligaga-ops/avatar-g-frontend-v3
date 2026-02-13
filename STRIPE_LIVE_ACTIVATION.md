# 🚀 STRIPE LIVE ACTIVATION & PAYMENTS INFRASTRUCTURE

**Status**: ✅ Ready for Supabase Deployment  
**Date**: February 13, 2026  
**Total Components**: 15+ files, 2,000+ lines of code

---

## ⚙️ ENVIRONMENT VARIABLES (Vercel/Server)

Add these to your `.env.local` and Vercel dashboard:

```env
# Stripe Live Keys (NEVER in NEXT_PUBLIC)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxx

# Optional
STRIPE_PRODUCT_DEFAULT_TAX_BEHAVIOR=unspecified
```

**⚠️ CRITICAL**: Secret keys are server-side only. `NEXT_PUBLIC_*` prefix for client keys only.

---

## 📦 DATABASE MIGRATIONS (Run on Supabase)

Execute these SQL files in order:

1. `migrations/002_stripe_payments_init.sql`
2. `migrations/003_invoices_init.sql`
3. `migrations/004_launch_30_gtm_init.sql`
4. `migrations/005_audit_and_optimization_init.sql`

**Note**: These create tables, constraints, indexes, and RLS policies automatically.

---

## 🔌 API ENDPOINTS

### Payment Creation
**POST** `/api/checkout/create-intent`
```json
Request:
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000"
}

Response:
{
  "clientSecret": "pi_1234_secret_5678",
  "paymentIntentId": "pi_1234_secret_5678",
  "amountCents": 12500,
  "currency": "usd"
}
```

### Webhook Endpoint
**POST** `/api/webhooks/stripe`
- Stripe will POST here on payment events
- **Must configure** in Stripe Dashboard > Settings > Webhooks
- **Webhook URL**: `https://your-domain.com/api/webhooks/stripe`
- **Events to listen**: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`

### Invoice Generation (Automatic)
Triggered on `payment_intent.succeeded` webhook event automatically.

### Invoice Retrieval
**GET** `/api/invoices?orderId=...`
```json
Response:
{
  "invoice": { ... invoice record ... },
  "pdfUrl": "https://storage-signed-url/..."
}
```

**GET** `/api/invoices/list?role=buyer|seller&limit=50&offset=0`

---

## 🧪 TESTING FLOW (Development)

### 1. Create Payment Intent
```bash
curl -X POST http://localhost:3000/api/checkout/create-intent \
  -H "Content-Type: application/json" \
  -d '{"orderId": "YOUR_ORDER_ID"}'
```

### 2. Confirm Payment (Client-side)
Use Stripe.js to confirm:
```javascript
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Test' },
  },
});
```

### 3. Webhook Simulation (Development)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger payment_intent.succeeded
```

### 4. Verify Invoice
- Check `/api/invoices?orderId=YOUR_ORDER_ID`
- Verify PDF generated in Supabase Storage
- Download via signed URL

---

## 💳 PRODUCTION ACTIVATION CHECKLIST

- [ ] Add Stripe Live keys to Vercel
- [ ] Configure webhook endpoint in Stripe Dashboard
- [ ] Run database migrations on production
- [ ] Test with $1 GEL payment
- [ ] Verify invoice generates
- [ ] Test refund flow
- [ ] Enable monitoring on webhook failures
- [ ] Configure alerts for failed payments

---

## 🔐 SECURITY VALIDATION

✅ **Keys**: Server-side only, no client exposure  
✅ **Webhooks**: Signature verified with `STRIPE_WEBHOOK_SECRET`  
✅ **Idempotency**: Event ID prevents duplicate processing  
✅ **RLS**: All tables protected with row-level security  
✅ **Money**: Integer cents throughout (no float precision issues)  
✅ **Audit**: All payment events logged to `audit_logs`

---

## 📊 METRICS FOR MONITORING

Track in your dashboard:

- `stripe_events.processed_at IS NOT NULL` = webhook success rate
- `payment_attempts.status = 'succeeded'` = payment completion rate
- `invoices` count = revenue transactions
- Failed webhooks: `payment_intent.payment_failed` count
- Refund rate: `payment_attempts.status = 'refunded'` / `'succeeded'`

---

## 🛠️ TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| "Invalid signature" | Check `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard |
| Webhook not firing | Verify endpoint URL in Stripe Dashboard, check ngrok/local setup |
| Order total mismatch | Server recalculates with finance engine, ensure order items match |
| PDF not generating | Check Supabase Storage bucket `invoices` exists and permissions set |
| Invoice not appearing | Check `invoices` table RLS policy for your user |

---

## 📞 NEXT STEPS

1. **Deploy SQL migrations** to production Supabase
2. **Set Stripe environment variables** in Vercel
3. **Configure webhook URL** in Stripe Dashboard
4. **Test full flow** with test card in development
5. **Monitor webhook logs** for first 24 hours
6. **Enable monitoring** for payment success rate

---

**Ready for go-live**. All components production-ready and auditable.
