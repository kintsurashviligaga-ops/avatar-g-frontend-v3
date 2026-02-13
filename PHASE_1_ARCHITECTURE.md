# Avatar G Commerce Architecture - Phase 1

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                          │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard │ Shop │ Affiliate │ Wallet │ Compliance │ Analytics │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │    Authentication Layer       │
           │  (Supabase Auth + RLS)        │
           └───────────────┬───────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼───┐          ┌───▼───┐          ┌──▼────┐
    │Wallet │          │Orders │          │Comply │
    │ API   │          │ API   │          │ API   │
    └───┬───┘          └───┬───┘          └──┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │    Server-Side Business Logic      │
        │  (lib/commerce/server.ts)           │
        │                                     │
        │  • Wallet operations                │
        │  • Order split computation          │
        │  • Affiliate tracking               │
        │  • Compliance operations            │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │    Validation Layer (Zod)           │
        │  (lib/commerce/validation.ts)       │
        │                                     │
        │  ✓ Request validation               │
        │  ✓ Type safety                      │
        │  ✓ Runtime checks                   │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │   Row-Level Security (RLS)          │
        │   PostgreSQL Policies               │
        │                                     │
        │   DENY all → ALLOW auth.uid() match │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │      Supabase Postgres Database     │
        │                                     │
        │  12 Core Commerce Tables:           │
        │  • shop_wallets (balance tracking)  │
        │  • wallet_transactions (ledger)     │
        │  • orders (order management)        │
        │  • order_items (line items)         │
        │  • affiliate_tracking (referrals)   │
        │  • affiliate_clicks (attribution)   │
        │  • affiliate_conversions (commish)  │
        │  • digital_licenses (tokenization)  │
        │  • digital_license_transfers       │
        │  • supplier_products (abstraction)  │
        │  • products (listings)              │
        │  • shop_stores (user shops)         │
        │  • audit_logs (compliance)          │
        │  • user_consents (GDPR)             │
        └─────────────────────────────────────┘
```

---

## Data Flow: Order Creation

```
1. User clicks "Buy Now"
   │
   ├─ UI sends: { subtotalAmount: 100, ... }
   │   (NO price computation on client)
   │
2. API Receives: POST /api/commerce/orders
   │
   ├─ Validate Zod schema
   │   └─ Check amount > 0, buyer fields, etc
   │
3. Server: computeOrderSplit()
   │   ├─ VAT = 100 * 18% = 18
   │   ├─ PlatformFee = 100 * 5% = 5
   │   ├─ AffiliateFee = 100 * 5% = 5
   │   ├─ SellerNet = 100 - 5 - 5 = 90
   │   └─ Total = 100 + 18 = 118
   │       (result NEVER sent to client before DB write)
   │
4. Database: INSERT order
   ├─ RLS CHECK: auth.uid() = user_id ✓
   ├─ Insert: orders table
   ├─ Auto-trigger: audit_logs entry
   └─ Response: order_id + split breakdown
   │
5. Return: 201 Created
   └─ Client receives order confirmation
      (all amounts already locked in DB)
```

---

## Data Flow: Wallet Deposit

```
1. User deposits $100
   │
2. API: POST /api/commerce/wallet/deposit
   │
3. Validate: amount > 0 and < $1,000,000
   │
4. Get or Create Wallet
   │   └─ RLS ensures only user's wallet
   │
5. Check AML Risk
   ├─ If amount > $5000: aml_risk_score += 30
   └─ Audit flag: ["aml"]
   │
6. Update Wallet (atomic)
   ├─ balance_amount += 100
   ├─ lifetime_deposits += 100
   └─ updated_at = NOW()
   │
7. Record Transaction
   ├─ wallet_transactions.INSERT
   ├─ type = "deposit"
   ├─ amount = 100
   └─ balance_after = current_balance
   │
8. Audit Log
   ├─ user_id = current_user
   ├─ action = "deposit_created"
   ├─ is_critical = amount > 5000
   └─ metadata = { amount, aml_flagged, source }
   │
9. Response
   └─ Return wallet balance + transaction ID
```

---

## Security Model

```
┌─────────────────────────────────────────┐
│         Authentication (Supabase)       │
│  ✓ Email/password or OAuth              │
│  ✓ Session token in cookie              │
│  ✓ Claims: sub (user_id), email, etc    │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼──────────┐
        │ RLS Policies    │
        │ (PostgreSQL)    │
        │                 │
        │ POLICY for      │
        │ shop_wallets:   │
        │                 │
        │ USING           │
        │ (auth.uid() =   │
        │  user_id)       │
        │                 │
        │ ✓ SELECT only   │
        │   own data      │
        │ ✓ UPDATE only   │
        │   own data      │
        │ ✓ DELETE not    │
        │   allowed       │
        └──────┬──────────┘
               │
        ┌──────▼──────────┐
        │ Column-level    │
        │ encryption      │
        │ (future)        │
        │                 │
        │ Sensitive:      │
        │ • bank_account  │
        │ • ssn           │
        │ • aml_flags     │
        └─────────────────┘
```

---

## Wallet Balance Guarantee

**Atomic Invariant:**

```typescript
// This is GUARANTEED by database:
for (transaction in wallet_transactions) {
  sum(amounts) === current_balance
}
```

**How:** PostgreSQL RPC function with transaction isolation
```sql
deduct_from_wallet(
  wallet_id: UUID,
  amount: DECIMAL
)
-- Uses serializable isolation level
-- Prevents concurrent balance corruption
```

---

## AML Risk Scoring

```
Deposits < $5K:     risk_score += 0
Deposits $5K-$10K:  risk_score += 30
Deposits $10K-$50K: risk_score += 60
Deposits > $50K:    risk_score += 90

ALERT THRESHOLD: risk_score >= 50
├─ Audit logged with risk_flags: ["aml"]
├─ Flagged at: aml_flagged_at timestamp
└─ Admin review required (Phase 7)
```

---

## VAT Computation (Georgian Compliant)

```
Order Breakdown (18% VAT in Georgia):

  Gross Amount:      $100.00  (user price)
  
  VAT Calculation:
    VAT = Gross × 18% = $18.00
  
  Platform Fee:      $5.00    (5% of gross)
  Affiliate Fee:     $5.00    (5% of gross)
  
  Seller Gets:
    $100 - $5 - $5 = $90.00
  
  Total to Customer: $100 + $18 = $118.00
  
  Breakdown:
  ├─ Revenue to seller:    $90.00
  ├─ Platform keeps:       $5.00
  ├─ Affiliate gets:       $5.00
  └─ VAT to government:    $18.00
     (seller responsible for remittance)
```

---

## Audit Trail Example

```
User deposits $10,000:

audit_logs entry:
{
  id: "log-123",
  user_id: "user-456",
  action: "deposit_created",
  resource_type: "wallet",
  resource_id: "wallet-789",
  description: "Deposit of $10000",
  is_critical: true,
  risk_flags: ["aml"],
  metadata_json: {
    amount: 10000,
    aml_flagged: true,
    lifetime_deposits: 10000,
    aml_risk_score: 60
  },
  created_at: "2026-02-13T...",
}

wallet_transactions entry:
{
  id: "tx-001",
  wallet_id: "wallet-789",
  user_id: "user-456",
  type: "deposit",
  amount: 10000,
  balance_after: 10000,
  description: "Wallet deposit",
  metadata_json: {
    aml_risk_score: 60,
    lifetime_deposits: 10000,
    source: "web_api"
  },
  created_at: "2026-02-13T...",
}
```

---

## GDPR Compliance Endpoints

```
1. GET /compliance/consent
   └─ Retrieve current consents

2. PUT /compliance/consent
   ├─ marketing_emails: boolean
   ├─ data_processing: boolean
   ├─ terms_accepted: boolean
   ├─ privacy_policy_accepted: boolean
   └─ georgian_terms_accepted: boolean

3. POST /compliance/export-data
   └─ Request GDPR Article 15 (right of access)
      └─ Returns within 24h in JSON/CSV format

4. POST /compliance/delete-account
   └─ Request GDPR Article 17 (right to be forgotten)
      └─ 30-day grace period before deletion
      └─ Can be cancelled before grace expires

5. GET /compliance/audit-logs
   └─ User's own audit trail (transparency)
```

---

## Phase 2 Integration Points

*Ready for:*
1. **Stripe Webhooks**
   - `order.id` → `stripe_payment_intent_id`
   - Webhook updates order.status → "completed"
   - Triggers affiliate commission recording

2. **Revenue Settlement**
   - Scheduled job runs: transfers to wallets
   - Writes `wallet_transactions` type: "adjustment"
   - Audit logged automatically

3. **Payout Automation**
   - Query: `affiliate_conversions` where status="approved"
   - Sum pending: `SUM(commission_amount)`
   - If > threshold: trigger payout
   - Update status → "paid"

---

**Architecture frozen for Phase 1. Ready for Phase 2 Stripe integration.**
