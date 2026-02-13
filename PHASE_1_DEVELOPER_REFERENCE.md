# Avatar G Commerce - Phase 1 Developer Quick Reference

## Quick Start: Using Commerce Module

### 1. Import

```typescript
import {
  // Utilities
  depositToWallet,
  createOrder,
  computeOrderSplit,
  createAffiliateAccount,
  updateUserConsent,
  
  // Types
  Order,
  ShopWallet,
  WalletTransaction,
  
  // Schemas
  CreateOrderSchema,
  DepositToWalletSchema,
} from '@/lib/commerce';
```

---

## Common Operations

### Create Wallet & Deposit

```typescript
// Server-side function
'use server';

async function handleDeposit(userId: string, amount: number) {
  try {
    const result = await depositToWallet(
      userId,
      amount,
      'User deposit',
      { source: 'stripe' }
    );
    
    console.log('New balance:', result.wallet.balance_amount);
    console.log('Transaction ID:', result.transaction.id);
    
    return result;
  } catch (error) {
    console.error('Deposit failed:', error);
    throw error;
  }
}
```

### Create Order with Automatic Split

```typescript
// Server-side function
'use server';

async function handleCheckout(userId: string, cartTotal: number) {
  // Create order (split computed automatically)
  const order = await createOrder(userId, {
    subtotalAmount: cartTotal,
    vatEnabled: true,
    vatRate: 18,
    buyerCountryCode: 'GE',
    buyerEmail: 'user@example.com',
    buyerName: 'User Name',
    metadata: { cartId: 'cart-123' },
  });
  
  return {
    orderId: order.id,
    subtotal: order.subtotal_amount,
    vat: order.vat_amount,
    platformFee: order.platform_fee_amount,
    total: order.total_amount,
  };
}
```

### Compute Split (for validation)

```typescript
// Server-side function
'use server';

async function estimateOrder(grossAmount: number) {
  const split = computeOrderSplit({
    grossAmount,
    vatRate: 18,
    platformFeePercent: 5,
    affiliateFeePercent: 5,
  });
  
  console.log(`Customer pays: $${split.totalAmount}`);
  console.log(`Seller gets: $${split.sellerNet}`);
  console.log(`VAT: $${split.vatAmount}`);
  
  return split;
}
```

### Create Affiliate Account

```typescript
// Server-side function
'use server';

async function activateAffiliate(userId: string) {
  const affiliate = await createAffiliateAccount(userId);
  
  console.log('Referral link:', `/shop?ref=${affiliate.referral_code}`);
  console.log('Session ID:', affiliate.session_id);
  
  return affiliate;
}
```

---

## API Usage Examples

### Deposit via API

```bash
curl -X POST http://localhost:3000/api/commerce/wallet/deposit \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "amount": 100,
    "description": "Monthly budget"
  }'

# Response (201)
{
  "success": true,
  "data": {
    "transaction": {
      "id": "tx-123",
      "amount": 100,
      "balanceAfter": 100,
      "type": "deposit",
      "createdAt": "2026-02-13T..."
    },
    "wallet": {
      "id": "wallet-456",
      "balance": 100,
      "currency": "USD",
      "amlFlagged": false
    }
  }
}
```

### Get Wallet Balance

```bash
curl http://localhost:3000/api/commerce/wallet/balance \
  -H "Cookie: ..."

# Response (200)
{
  "success": true,
  "data": {
    "id": "wallet-456",
    "balance": 100,
    "currency": "USD",
    "lifetimeDeposits": 500,
    "amlRiskScore": 0,
    "updatedAt": "2026-02-13T..."
  }
}
```

### Create Order

```bash
curl -X POST http://localhost:3000/api/commerce/orders \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "subtotalAmount": 100,
    "vatRate": 18,
    "buyerCountryCode": "GE",
    "buyerEmail": "user@example.com"
  }'

# Response (201)
{
  "success": true,
  "data": {
    "id": "order-789",
    "status": "pending",
    "subtotal": 100,
    "vat": 18,
    "platformFee": 5,
    "affiliateFee": 5,
    "total": 118,
    "split": {
      "subtotalAmount": 100,
      "vatAmount": 18,
      "platformFeeAmount": 5,
      "affiliateFeeAmount": 5,
      "sellerNet": 90,
      "totalAmount": 118
    },
    "createdAt": "2026-02-13T..."
  }
}
```

### List Orders

```bash
curl http://localhost:3000/api/commerce/orders?limit=20&offset=0 \
  -H "Cookie: ..."

# Response (200)
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "order-789",
        "status": "completed",
        "total": 118,
        "subtotal": 100,
        "vat": 18,
        "platformFee": 5,
        "affiliateFee": 5,
        "createdAt": "2026-02-13T..."
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 42,
      "hasMore": true
    }
  }
}
```

### Update Consent

```bash
curl -X PUT http://localhost:3000/api/commerce/compliance/consent \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "termsAccepted": true,
    "privacyPolicyAccepted": true,
    "marketingEmails": false,
    "georgianTermsAccepted": true
  }'

# Response (200)
{
  "success": true,
  "data": {
    "userId": "user-456",
    "termsAccepted": true,
    "privacyPolicyAccepted": true,
    "marketingEmails": false,
    "georgianTermsAccepted": true,
    "updatedAt": "2026-02-13T..."
  }
}
```

### Request Data Export (GDPR Article 15)

```bash
curl -X POST http://localhost:3000/api/commerce/compliance/export-data \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{ "format": "json" }'

# Response (202 Accepted)
{
  "success": true,
  "data": {
    "exportId": "exp-1707859...",
    "status": "pending",
    "format": "json",
    "estimatedTime": "24 hours",
    "message": "Export request received. Check your email for download link within 24 hours."
  }
}
```

### Request Account Deletion (GDPR Article 17)

```bash
curl -X POST http://localhost:3000/api/commerce/compliance/delete-account \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{ "confirmDelete": true }'

# Response (202 Accepted)
{
  "success": true,
  "data": {
    "status": "pending_deletion",
    "graceperiodDays": 30,
    "message": "Your account will be deleted in 30 days. You can cancel this request anytime."
  }
}
```

---

## Error Handling

### Validation Errors

```typescript
try {
  const result = await createOrder(userId, {
    subtotalAmount: 0, // ❌ Invalid: must be > 0
  });
} catch (error) {
  // Error: subtotalAmount must be > 0
}
```

### Authorization Errors

```typescript
// User tries to access another user's order
// RLS policy blocks at database level
// API returns 404 (not 403, to hide existence)

GET /api/commerce/orders/[other-users-order-id]
→ 404 Not Found
```

### Wallet Errors

```typescript
try {
  await deductFromWallet(userId, 1000); // wallet has only $100
} catch (error) {
  // Error: "Insufficient balance or wallet not found"
}
```

---

## Database Query Examples

### Find user's total lifetime value

```sql
SELECT 
  user_id,
  SUM(amount) as total_value
FROM wallet_transactions
WHERE type = 'deposit'
GROUP BY user_id
ORDER BY total_value DESC;
```

### AML-flagged users

```sql
SELECT 
  id,
  user_id,
  aml_risk_score,
  aml_flagged_at,
  lifetime_deposits
FROM shop_wallets
WHERE aml_risk_score >= 50
ORDER BY aml_risk_score DESC;
```

### Top affiliates

```sql
SELECT 
  af.user_id,
  af.referral_code,
  COUNT(DISTINCT ac.id) as conversions,
  SUM(ac.commission_amount) as total_commissions
FROM affiliate_tracking af
LEFT JOIN affiliate_conversions ac ON af.id = ac.affiliate_id
GROUP BY af.user_id, af.referral_code
ORDER BY total_commissions DESC
LIMIT 10;
```

### VAT collected (by country)

```sql
SELECT 
  buyer_country_code,
  COUNT(*) as order_count,
  SUM(vat_amount) as total_vat,
  SUM(total_amount) as total_value
FROM orders
WHERE status = 'completed'
  AND vat_enabled = true
GROUP BY buyer_country_code
ORDER BY total_vat DESC;
```

---

## Best Practices

### ✅ DO

1. **Always compute splits server-side**
   ```typescript
   // ✅ Good
   const split = computeOrderSplit({ grossAmount });
   ```

2. **Use Zod validation before processing**
   ```typescript
   // ✅ Good
   const validated = CreateOrderSchema.parse(req.body);
   ```

3. **Include metadata for auditing**
   ```typescript
   // ✅ Good
   await depositToWallet(userId, amount, desc, {
     source: 'stripe',
     stripeChargeId: 'ch_123',
   });
   ```

4. **Check RLS is active**
   ```sql
   -- ✅ Good
   ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
   CREATE POLICY ... USING (auth.uid() = user_id);
   ```

### ❌ DON'T

1. **Don't compute splits on client**
   ```typescript
   // ❌ Bad
   const vat = grossAmount * 0.18; // client-computed
   ```

2. **Don't skip validation**
   ```typescript
   // ❌ Bad
   const order = await createOrder(userId, req.body); // unvalidated
   ```

3. **Don't expose AML scores to client**
   ```typescript
   // ❌ Bad
   return { ...wallet, aml_risk_score }; // exposes internal state
   ```

4. **Don't disable RLS for convenience**
   ```sql
   -- ❌ Bad
   ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
   ```

---

## Troubleshooting

### Issue: "Wallet not found"
**Cause:** User doesn't have a wallet
**Fix:** Call `createShopWallet(userId)` first or use API which auto-creates

### Issue: "RLS violation" error
**Cause:** Query bypassed RLS policy
**Fix:** Ensure user_id matches auth.uid() in WHERE clause

### Issue: "Insufficient balance"
**Cause:** Concurrent deductions caused race condition
**Fix:** Use `deduct_from_wallet()` RPC function, never direct UPDATE

### Issue: Split math doesn't add up
**Cause:** Client-computed split doesn't match server
**Fix:** Always use server's `computeOrderSplit()` result, never trust client

---

## Next Phase: Stripe Integration

When Phase 2 begins, you'll integrate:

1. **Webhook Handler**
   ```typescript
   POST /api/commerce/webhooks/stripe
   // Receives payment_intent.succeeded
   // Updates order.status = 'completed'
   // Records affiliate conversion
   ```

2. **Split Settlement**
   ```typescript
   // Scheduled job (background)
   // For each completed order:
   //   - Calculate split
   //   - Add to wallet_transactions
   //   - Update wallets balance
   ```

3. **Payout Automation**
   ```typescript
   // Monthly job
   // Send affiliate earnings to external wallets
   // Update status to 'paid'
   ```

---

**Phase 1 is complete. Foundation is solid. Phase 2 ready to begin.**
