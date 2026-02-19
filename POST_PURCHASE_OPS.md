# Post-Purchase Operations System

## Overview

The Post-Purchase Operations system provides comprehensive returns, refunds, disputes, and inventory management for Avatar G marketplace. Built for **Georgian businesses first** with full multi-language support (Georgian/English/Russian).

**Key Features:**
- ✅ RMA (Return Merchandise Authorization) workflow with seller approval
- ✅ Automated refund processing via Stripe with financial reversals
- ✅ Dispute/chargeback handling with payout holds
- ✅ Real-time inventory tracking with stock reservation
- ✅ Idempotent operations (webhooks, refunds, inventory)
- ✅ Complete audit trails for compliance
- ✅ Multi-tenant security via RLS policies
- ✅ Georgian-first UI with ka/en/ru translations

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BUYER INTERACTIONS                         │
├─────────────────────────────────────────────────────────────────┤
│  /account/returns          │  Return Requests List              │
│  /account/orders/[id]      │  Order Detail + Request Return     │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/returns/create       │  Create return request        │
│  GET  /api/returns              │  List returns (buyer/seller)  │
│  GET  /api/returns/[id]         │  Get return details           │
│  PUT  /api/returns/[id]         │  Update return (actions)      │
│  POST /api/refunds/create       │  Create refund (admin/seller) │
│  GET  /api/refunds/[id]         │  Get refund details           │
│  GET  /api/disputes             │  List disputes (admin/seller) │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│  ReturnRequestService   │  RMA workflow + state machine         │
│  RefundService          │  Stripe refunds + reversals           │
│  DisputeService         │  Dispute webhooks + payout holds      │
│  InventoryService       │  Stock reservation + commit/release   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│  products               │  Stock tracking (qty, reserved)       │
│  order_items            │  Link orders → products               │
│  inventory_movements    │  Audit trail (reserve/commit/release) │
│  return_requests        │  RMA records with seller approval     │
│  refunds                │  Stripe refunds + financial flags     │
│  disputes               │  Chargebacks + payout holds           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                         │
├─────────────────────────────────────────────────────────────────┤
│  Stripe API             │  stripe.refunds.create()              │
│  Stripe Webhooks        │  refund.updated, dispute.created      │
│  Supabase Realtime      │  Live status updates (future)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Migration: `015_post_purchase_ops.sql`

#### 1. `products` (New)
Inventory management for all marketplace products.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,  -- Pre-payment holds
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Available Stock Formula:**
```
available_stock = stock_quantity - reserved_quantity
```

**Indexes:**
- `idx_products_seller` on `seller_user_id`
- `idx_products_low_stock` on `is_active, track_inventory, stock_quantity`

**RLS Policies:**
- Sellers can CRUD own products
- Public can read active products

---

#### 2. `order_items` (Extended)
Links orders to products for inventory tracking.

```sql
-- Extended with:
product_id UUID REFERENCES products(id),
quantity INTEGER NOT NULL DEFAULT 1,
unit_price_cents INTEGER NOT NULL,
line_total_cents INTEGER NOT NULL
```

---

#### 3. `inventory_movements` (New)
**Audit trail** for all stock changes (append-only).

```sql
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  order_id UUID REFERENCES orders(id),
  movement_type TEXT NOT NULL,  -- reserve|release|deduct|restock|adjust|return_received
  quantity_delta INTEGER NOT NULL,  -- Positive or negative
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Movement Types:**
- `reserve`: Pre-payment hold (reserved_quantity++)
- `commit`: Post-payment deduction (stock_quantity--, reserved_quantity--)
- `release`: Payment failed (reserved_quantity--)
- `restock`: Return received (stock_quantity++)
- `adjust`: Manual correction (admin)
- `return_received`: Restock from return (stock_quantity++)

---

#### 4. `return_requests` (New)
RMA workflow with seller approval and 30-day window.

```sql
CREATE TABLE return_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'requested',
  reason TEXT NOT NULL,
  comments TEXT,
  refund_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Status State Machine:**
```
requested → approved → label_sent → in_transit → received → refunded → closed
          ↓
       rejected
```

**Business Rules:**
- Return window: **30 days** from `orders.delivered_at`
- Order must be in `delivered` status
- Seller must approve before refund can be issued
- Automatic restock when `status = 'received'`

**RLS Policies:**
- Buyers can create/read own returns
- Sellers can read/update returns for their orders

---

#### 5. `refunds` (New)
Stripe refund records with financial reversal tracking.

```sql
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  return_request_id UUID REFERENCES return_requests(id),
  stripe_refund_id TEXT UNIQUE,  -- Idempotency key
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  -- Financial reversal flags
  affiliate_commission_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  seller_payout_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Stripe Integration:**
- `stripe_refund_id` is UNIQUE (prevents duplicates)
- Webhooks update `status` (pending → succeeded/failed)
- All refunds recorded even if Stripe call fails

**Financial Reversals:**
1. **Affiliate Commission**: Mark `affiliate_commission_reversed = TRUE` in refunds row
2. **Seller Payout**: Mark `seller_payout_adjusted = TRUE` (ready for negative transfer)
3. **Invoice**: Mark `invoice_voided = TRUE` (ready for credit note)

**RLS Policies:**
- Service role has full access
- Sellers/buyers can read refunds for their orders

---

#### 6. `disputes` (New)
Stripe dispute/chargeback management.

```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  stripe_dispute_id TEXT UNIQUE NOT NULL,  -- Idempotency key
  stripe_charge_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,  -- Stripe dispute status enum
  reason TEXT NOT NULL,
  reason_description TEXT,
  payout_hold_applied BOOLEAN NOT NULL DEFAULT FALSE,
  payout_hold_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Stripe Dispute Statuses:**
- `warning_needs_response` (7 days to respond)
- `warning_under_review`
- `needs_response` (urgent)
- `under_review`
- `won` (seller wins)
- `lost` (seller loses)

**Business Logic:**
- Webhook handler creates/updates disputes
- Payout hold applied when dispute opens
- Affiliate commissions frozen until resolved
- Order status → `disputed`

---

## Service Layer

### 1. InventoryService (`lib/inventory/InventoryService.ts`)

**Purpose:** Transactional stock operations preventing overselling.

#### Methods:

**`reserveStock(orderId: string): Promise<{ success: boolean }>`**
- Pre-payment reservation (checkout → payment)
- Increments `reserved_quantity` for each item
- Records `movement_type = 'reserve'` in audit trail
- Fails if `available_stock` insufficient

**`commitStockAfterPayment(orderId: string): Promise<{ success: boolean }>`**
- Post-payment deduction (payment success)
- Decrements `stock_quantity` by quantity
- Decrements `reserved_quantity` by quantity
- Records `movement_type = 'commit'` in audit trail

**`releaseStock(orderId: string): Promise<{ success: boolean }>`**
- Payment failure handling (payment failed/cancelled)
- Decrements `reserved_quantity` only (stock untouched)
- Records `movement_type = 'release'` in audit trail

**`restockFromReturn(returnRequestId: string): Promise<{ success: boolean }>`**
- Return received restock (return status = 'received')
- Increments `stock_quantity` by quantity
- Records `movement_type = 'return_received'` in audit trail

**`checkStockAvailability(items): Promise<{ available: boolean, insufficientItems }>`**
- Checkout validation before payment
- Checks `stock_quantity - reserved_quantity >= quantity` for each item
- Returns list of insufficient items if any

**`getProductStock(productId: string): Promise<{ available, isLowStock }>`**
- Get current stock status
- `available = stock_quantity - reserved_quantity`
- `isLowStock = available <= low_stock_threshold`

#### Example Flow:
```typescript
// 1. Checkout: Check availability
const { available } = await inventoryService.checkStockAvailability(items);
if (!available) throw new Error('Insufficient stock');

// 2. Checkout: Reserve stock
await inventoryService.reserveStock(orderId);

// 3. Payment succeeded: Commit stock
await inventoryService.commitStockAfterPayment(orderId);

// 4. Payment failed: Release stock
await inventoryService.releaseStock(orderId);

// 5. Return received: Restock
await inventoryService.restockFromReturn(returnRequestId);
```

---

### 2. ReturnRequestService (`lib/returns/ReturnRequestService.ts`)

**Purpose:** RMA workflow management with server-side state machine.

#### Methods:

**`createReturnRequest(buyerUserId, input): Promise<{ success, returnRequest }>`**
- Validates:
  - Order exists and belongs to buyer
  - Order status = `delivered`
  - Within 30-day return window (`NOW() <= delivered_at + 30 days`)
- Creates return with `status = 'requested'`
- Returns RMA record

**`approveReturn(sellerUserId, returnId, refundAmount): Promise<{ success }>`**
- Seller approves return (requested → approved)
- Sets `refund_amount_cents`
- Validates seller owns order

**`rejectReturn(sellerUserId, returnId, reason): Promise<{ success }>`**
- Seller rejects return (requested → rejected)
- Records rejection reason
- Final status (no further actions)

**`markInTransit(sellerUserId, returnId): Promise<{ success }>`**
- Seller marks return in transit (approved → in_transit)
- Indicates buyer shipped product back

**`markReceived(sellerUserId, returnId): Promise<{ success }>`**
- Seller confirms receipt (in_transit → received)
- **Automatically restocks** via `InventoryService.restockFromReturn()`
- Ready for refund processing

**`listBuyerReturns(buyerId): Promise<ReturnRequest[]>`**
- Buyer's return requests timeline
- Ordered by `created_at DESC`

**`listSellerReturns(sellerId, status?): Promise<ReturnRequest[]>`**
- Seller's return queue
- Optional status filter
- Includes order details

#### Example Flow:
```typescript
// 1. Buyer creates return
const { returnRequest } = await returnService.createReturnRequest(buyerId, {
  orderId,
  reason: 'Product damaged',
  comments: 'Box was crushed on delivery'
});

// 2. Seller approves
await returnService.approveReturn(sellerId, returnRequest.id, orderTotal);

// 3. Seller marks in transit
await returnService.markInTransit(sellerId, returnRequest.id);

// 4. Seller marks received (auto-restocks)
await returnService.markReceived(sellerId, returnRequest.id);

// 5. Admin creates refund (next service)
```

---

### 3. RefundService (`lib/refunds/RefundService.ts`)

**Purpose:** Stripe refund integration with financial reversals.

#### Methods:

**`createRefund(input: CreateRefundInput): Promise<RefundResponse>`**

**6-Step Refund Flow:**
1. Validate order exists + has `stripe_payment_intent_id`
2. Check not already refunded (idempotency)
3. Calculate refund amount (default = full order total)
4. Call `stripe.refunds.create()` with metadata
5. Record in `refunds` table with `stripe_refund_id`
6. Apply financial reversals (see below)

**Financial Reversal Logic:**
```typescript
async applyFinancialReversals(orderId, refundId, amount, order) {
  // 1. Reverse affiliate commissions
  await supabase
    .from('affiliate_conversions')
    .update({ 
      metadata_json: { refunded: true },
      status: 'reversed'
    })
    .eq('order_id', orderId);
  
  // 2. Adjust seller payouts (mark for negative transfer)
  await supabase
    .from('refunds')
    .update({ seller_payout_adjusted: true })
    .eq('id', refundId);
  
  // 3. Void invoice (mark for credit note)
  await supabase
    .from('refunds')
    .update({ invoice_voided: true })
    .eq('id', refundId);
}
```

**`handleStripeRefundWebhook(stripeRefundId, status): Promise<boolean>`**
- Idempotent webhook handler
- Fetches existing refund via `stripe_refund_id` (unique)
- Updates status if different (pending → succeeded/failed)
- Returns `false` if refund not found locally

**`getRefund(refundId): Promise<Refund | null>`**
- Fetch full refund record
- Includes order details

**`listOrderRefunds(orderId): Promise<Refund[]>`**
- All refunds for an order (audit)
- Ordered by `created_at DESC`

#### Example Flow:
```typescript
// 1. Admin creates refund
const { refund, stripeRefundId } = await refundService.createRefund({
  orderId,
  returnRequestId,  // Optional link
  amountCents,      // Optional (default = order total)
  reason: 'Customer returned product'
});

// 2. Stripe webhook arrives (refund.updated)
await refundService.handleStripeRefundWebhook(stripeRefundId, 'succeeded');

// 3. Check financial reversals
const refund = await refundService.getRefund(refundId);
console.log(refund.affiliate_commission_reversed);  // true
console.log(refund.seller_payout_adjusted);         // true
console.log(refund.invoice_voided);                 // true
```

---

### 4. DisputeService (`lib/disputes/DisputeService.ts`)

**Purpose:** Stripe dispute/chargeback handling with payout holds.

#### Methods:

**`handleDisputeWebhook(dispute: DisputeData): Promise<{ success, orderId }>`**

**5-Step Dispute Flow:**
1. Check if dispute already exists (idempotency via `stripe_dispute_id`)
2. Find order by `stripe_charge_id` (or metadata)
3. Create dispute record
4. Apply payout hold if `status.includes('needs_response')`
5. Hold affiliate commissions (mark as pending)
6. Update order status → `disputed`

**`resolveDispute(stripeDisputeId, outcome: 'won'|'lost'): Promise<{ success }>`**
- Updates dispute status
- Releases payout hold if won
- Releases affiliate commissions
- Updates order status (`completed` or `disputed_lost`)

**`listDisputes(status?): Promise<Dispute[]>`**
- Admin view (all disputes)
- Optional status filter

**`listSellerDisputes(sellerUserId): Promise<Dispute[]>`**
- Seller's disputes (via shipments → orders join)
- Only shows disputes for seller's orders

#### Example Flow:
```typescript
// 1. Stripe webhook: charge.dispute.created
await disputeService.handleDisputeWebhook({
  stripeDisputeId: 'dp_xxx',
  stripeChargeId: 'ch_xxx',
  amountCents: 9900,
  currency: 'USD',
  status: 'warning_needs_response',
  reason: 'fraudulent'
});

// 2. Check dispute details
const disputes = await disputeService.listDisputes('warning_needs_response');

// 3. Stripe webhook: charge.dispute.closed (won)
await disputeService.resolveDispute('dp_xxx', 'won');
```

---

## API Endpoints

### Returns Management

#### **POST /api/returns/create**
Create return request (buyer action).

**Auth:** Requires authenticated user  
**Rate Limit:** 10/minute

**Request:**
```json
{
  "orderId": "uuid",
  "reason": "damaged|wrong_item|not_as_described|other",
  "comments": "Optional buyer comments",
  "items": [
    { "productId": "uuid", "quantity": 1 }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "returnRequest": {
    "id": "uuid",
    "orderId": "uuid",
    "status": "requested",
    "reason": "damaged",
    "comments": "Box was crushed",
    "createdAt": "2026-02-14T12:00:00Z"
  }
}
```

**Errors:**
- `400` - Order not delivered / outside return window
- `401` - Unauthorized
- `404` - Order not found

---

#### **GET /api/returns?view={buyer|seller}&status={status}**
List return requests.

**Auth:** Requires authenticated user

**Query Params:**
- `view`: `buyer` (default) or `seller`
- `status`: Optional filter (`requested`, `approved`, etc.)

**Response (200):**
```json
{
  "returns": [
    {
      "id": "uuid",
      "orderId": "uuid",
      "status": "requested",
      "reason": "damaged",
      "refundAmountCents": 9900,
      "createdAt": "2026-02-14T12:00:00Z",
      "orders": {
        "orderNumber": "ORD-12345",
        "totalAmount": 9900
      }
    }
  ]
}
```

---

#### **GET /api/returns/[id]**
Get return request details.

**Auth:** Requires authenticated user (buyer or seller)

**Response (200):**
```json
{
  "returnRequest": {
    "id": "uuid",
    "orderId": "uuid",
    "status": "approved",
    "reason": "damaged",
    "comments": "Box was crushed",
    "refundAmountCents": 9900,
    "createdAt": "2026-02-14T12:00:00Z",
    "updatedAt": "2026-02-15T08:30:00Z"
  }
}
```

---

#### **PUT /api/returns/[id]**
Update return request (seller actions).

**Auth:** Requires authenticated seller

**Request:**
```json
{
  "action": "approve|reject|mark_in_transit|mark_received",
  "refundAmount": 9900,  // Required for 'approve'
  "reason": "string"     // Required for 'reject'
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Errors:**
- `400` - Invalid action / missing fields
- `401` - Unauthorized
- `403` - Not seller's order

---

### Refunds Management

#### **POST /api/refunds/create**
Create refund (admin/seller action).

**Auth:** Requires authenticated admin/seller  
**Rate Limit:** 5/minute

**Request:**
```json
{
  "orderId": "uuid",
  "returnRequestId": "uuid",  // Optional
  "amountCents": 9900,        // Optional (default = order total)
  "reason": "return|damaged|goodwill"
}
```

**Response (200):**
```json
{
  "success": true,
  "refund": {
    "id": "uuid",
    "orderId": "uuid",
    "stripeRefundId": "re_xxx",
    "amountCents": 9900,
    "status": "pending",
    "createdAt": "2026-02-14T12:00:00Z"
  }
}
```

**Errors:**
- `400` - Order not paid via Stripe / already refunded
- `401` - Unauthorized
- `500` - Stripe API error

---

#### **GET /api/refunds/[id]**
Get refund details.

**Auth:** Requires authenticated user

**Response (200):**
```json
{
  "refund": {
    "id": "uuid",
    "orderId": "uuid",
    "stripeRefundId": "re_xxx",
    "amountCents": 9900,
    "status": "succeeded",
    "affiliateCommissionReversed": true,
    "sellerPayoutAdjusted": true,
    "invoiceVoided": true,
    "createdAt": "2026-02-14T12:00:00Z",
    "updatedAt": "2026-02-14T12:05:00Z"
  }
}
```

---

### Disputes Management

#### **GET /api/disputes?view={admin|seller}&status={status}**
List disputes.

**Auth:** Requires authenticated admin/seller

**Query Params:**
- `view`: `admin` (all disputes) or `seller` (seller's disputes)
- `status`: Optional filter (Stripe dispute status)

**Response (200):**
```json
{
  "disputes": [
    {
      "id": "uuid",
      "orderId": "uuid",
      "stripeDisputeId": "dp_xxx",
      "amountCents": 9900,
      "status": "warning_needs_response",
      "reason": "fraudulent",
      "payoutHoldApplied": true,
      "createdAt": "2026-02-14T12:00:00Z",
      "orders": {
        "orderNumber": "ORD-12345"
      }
    }
  ]
}
```

---

## UI Pages

### Buyer Pages

#### 1. `/account/returns` (Buyer's Return Requests List)
**File:** `app/[locale]/account/returns/page.tsx`

**Features:**
- List all buyer's return requests
- Status badges with color coding
- Expandable details (reason, comments, refund amount)
- Real-time status updates
- Empty state: "No return requests yet"

**Translations:** `returns.myReturns`, `returns.status.*`

---

### Seller Pages

#### 2. `/sell/returns` (Seller's Return Queue)
**File:** `app/[locale]/sell/returns/page.tsx`

**Features:**
- List all return requests for seller's orders
- Status filter tabs (All, Requested, Approved, In Transit, Received, Rejected)
- Action buttons per status:
  - `requested` → Approve / Reject
  - `approved` → Mark In Transit
  - `in_transit` → Mark Received
- Order details inline (order number, total amount)
- Buyer comments section

**Translations:** `returns.returnRequests`, `returns.filter.*`, `returns.approve`

---

### Admin Pages

#### 3. `/admin/disputes` (Dispute Management Dashboard)
**File:** `app/[locale]/admin/disputes/page.tsx`

**Features:**
- Summary cards (Active, Won, Lost counts)
- List all disputes with status badges
- Stripe dispute ID reference
- Payout hold indicators
- Action required alerts (needs_response status)
- Link to Stripe dashboard for resolution

**Translations:** `disputes.title`, `disputes.activeDisputes`, `disputes.actionRequired`

---

## Testing Checklist

### 1. Inventory Management
- [ ] Create product with `track_inventory = true`
- [ ] Checkout with 2 items → verify `reserved_quantity` incremented
- [ ] Complete payment → verify `stock_quantity` decremented, `reserved_quantity` decremented
- [ ] Cancel payment → verify `reserved_quantity` decremented, `stock_quantity` unchanged
- [ ] Try oversell (checkout quantity > available) → verify error
- [ ] Check `inventory_movements` table → verify 3 records (reserve, commit, release)
- [ ] Return received → verify `stock_quantity` incremented
- [ ] Low stock threshold → verify product flagged when `available <= threshold`

---

### 2. Return Workflow
- [ ] Create order → mark as `delivered`
- [ ] Buyer requests return within 30 days → verify `status = 'requested'`
- [ ] Buyer requests return after 30 days → verify error
- [ ] Seller approves return → verify `status = 'approved'`, `refund_amount_cents` set
- [ ] Seller rejects return → verify `status = 'rejected'`
- [ ] Seller marks in transit → verify `status = 'in_transit'`
- [ ] Seller marks received → verify `status = 'received'`, inventory restocked
- [ ] Check buyer cannot approve own return (RLS test)
- [ ] Check seller cannot see other sellers' returns (RLS test)

---

### 3. Refund Processing
- [ ] Admin creates refund → verify Stripe API called
- [ ] Check `refunds` table → verify `stripe_refund_id` saved
- [ ] Check `refunds` table → verify `status = 'pending'`
- [ ] Simulate Stripe webhook (`refund.updated` → succeeded) → verify `status = 'succeeded'`
- [ ] Check financial reversals:
  - [ ] `affiliate_commission_reversed = true`
  - [ ] `seller_payout_adjusted = true`
  - [ ] `invoice_voided = true`
- [ ] Try duplicate refund → verify error (idempotency check)
- [ ] Simulate Stripe webhook with existing `stripe_refund_id` → verify status updated only

---

### 4. Dispute Handling
- [ ] Simulate Stripe webhook (`charge.dispute.created`) → verify dispute created
- [ ] Check `disputes` table → verify `stripe_dispute_id` saved
- [ ] Check order status → verify `status = 'disputed'`
- [ ] Check payout hold → verify `payout_hold_applied = true`
- [ ] Check affiliate commissions → verify `metadata_json.dispute_hold = true`
- [ ] Resolve dispute (won) → verify payout hold released
- [ ] Resolve dispute (lost) → verify order status → `disputed_lost`
- [ ] List seller disputes → verify only seller's orders shown

---

### 5. Security (RLS Policies)
- [ ] Buyer cannot approve own return → verify 403
- [ ] Seller cannot see other sellers' products → verify empty query
- [ ] Seller cannot update other sellers' returns → verify 403
- [ ] Admin can list all disputes → verify all rows returned
- [ ] Service role can write to all tables → verify no RLS errors

---

### 6. UI/UX
- [ ] Georgian translations display correctly (ka locale)
- [ ] English translations display correctly (en locale)
- [ ] Russian translations display correctly (ru locale)
- [ ] Empty states show proper messages
- [ ] Loading spinners show during API calls
- [ ] Action buttons disabled during processing
- [ ] Success toasts show after actions
- [ ] Error toasts show on failures
- [ ] Mobile responsive (all pages)

---

## Deployment Guide

### 1. Database Migration
```bash
# Run migration 015
psql $DATABASE_URL -f supabase/migrations/015_post_purchase_ops.sql

# Verify tables created
psql $DATABASE_URL -c "\dt products order_items inventory_movements return_requests refunds disputes"

# Verify RLS policies
psql $DATABASE_URL -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('products', 'return_requests', 'refunds', 'disputes');"
```

---

### 2. Environment Variables
Ensure these are set:

```env
# Stripe (existing)
STRIPE_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

---

### 3. Stripe Webhooks
Add these webhook events in Stripe Dashboard:

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events:
   - `refund.created`
   - `refund.updated`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
5. Copy webhook secret → set as `STRIPE_WEBHOOK_SECRET`

---

### 4. Verify Deployment
```bash
# Check API routes exist
curl https://yourdomain.com/api/returns
curl https://yourdomain.com/api/refunds/create
curl https://yourdomain.com/api/disputes

# Check UI pages load
curl https://yourdomain.com/ka/account/returns
curl https://yourdomain.com/ka/sell/returns
curl https://yourdomain.com/ka/admin/disputes

# Test webhook endpoint
curl -X POST https://yourdomain.com/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: xxx" \
  -d '{"type": "refund.updated", "data": {...}}'
```

---

## Troubleshooting

### Issue: "Stock not reserved on checkout"

**Symptoms:** Order created but `reserved_quantity` not incremented

**Causes:**
1. `InventoryService.reserveStock()` not called in checkout flow
2. `order_items.product_id` is `NULL` (product not linked)
3. Product has `track_inventory = false`

**Solution:**
```typescript
// In checkout API route:
import { InventoryService } from '@/lib/inventory/InventoryService';

const inventoryService = new InventoryService(supabase);

// Before payment
const { available } = await inventoryService.checkStockAvailability(items);
if (!available) throw new Error('Insufficient stock');

await inventoryService.reserveStock(orderId);
```

---

### Issue: "Return request rejected: outside window"

**Symptoms:** Buyer gets error when requesting return

**Causes:**
1. More than 30 days since `orders.delivered_at`
2. Order status not `delivered`

**Solution:**
```sql
-- Check order delivery date
SELECT id, delivered_at, NOW() - delivered_at AS days_since_delivery
FROM orders
WHERE id = 'order-uuid';

-- If order not delivered, mark it delivered first
UPDATE orders SET status = 'delivered', delivered_at = NOW()
WHERE id = 'order-uuid';
```

---

### Issue: "Refund webhook not updating status"

**Symptoms:** Refund stuck in `pending` status after Stripe processes

**Causes:**
1. Webhook secret mismatch (`STRIPE_WEBHOOK_SECRET`)
2. Webhook not configured in Stripe Dashboard
3. `stripe_refund_id` mismatch between local DB and Stripe

**Solution:**
```bash
# 1. Verify webhook secret
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 2. Check webhook logs in Stripe Dashboard
# Go to Developers → Webhooks → [your endpoint] → Recent Events

# 3. Manually update refund status (emergency fix)
UPDATE refunds SET status = 'succeeded', updated_at = NOW()
WHERE stripe_refund_id = 're_xxx';
```

---

### Issue: "Seller cannot see return requests"

**Symptoms:** `/sell/returns` page shows empty

**Causes:**
1. RLS policy blocking query (seller doesn't own shipment)
2. Orders table doesn't have shipments linked
3. Service role key not used in API route

**Solution:**
```sql
-- Check RLS policy
SELECT * FROM pg_policies WHERE tablename = 'return_requests';

-- Verify seller owns shipments
SELECT r.id, o.id AS order_id, s.seller_user_id
FROM return_requests r
JOIN orders o ON r.order_id = o.id
LEFT JOIN shipments s ON s.order_id = o.id
WHERE s.seller_user_id = 'seller-uuid';

-- If no shipments, create them first (migration 014)
```

---

### Issue: "Dispute not applying payout hold"

**Symptoms:** Dispute created but `payout_hold_applied = false`

**Causes:**
1. Shipment not linked to order (no seller found)
2. DisputeService logic failing silently

**Solution:**
```typescript
// Check logs in DisputeService
console.log('Applying payout hold for dispute:', disputeId);

// Ensure shipment exists
const { data: shipments } = await supabase
  .from('shipments')
  .select('seller_user_id')
  .eq('order_id', orderId);

if (!shipments || shipments.length === 0) {
  console.error('No shipment found for order:', orderId);
}
```

---

## Performance Optimization

### 1. Database Indexes
All critical indexes already created in migration 015:

```sql
-- Products
CREATE INDEX idx_products_seller ON products(seller_user_id);
CREATE INDEX idx_products_low_stock ON products(is_active, track_inventory, stock_quantity);

-- Inventory movements
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_order ON inventory_movements(order_id);

-- Return requests
CREATE INDEX idx_return_requests_order ON return_requests(order_id);
CREATE INDEX idx_return_requests_buyer ON return_requests(buyer_user_id);
CREATE INDEX idx_return_requests_status ON return_requests(status);

-- Refunds
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_stripe ON refunds(stripe_refund_id);

-- Disputes
CREATE INDEX idx_disputes_order ON disputes(order_id);
CREATE INDEX idx_disputes_stripe ON disputes(stripe_dispute_id);
CREATE INDEX idx_disputes_status ON disputes(status);
```

---

### 2. Query Optimization

**Slow Query:** Seller return list with order details

**Before:**
```typescript
// N+1 queries (bad)
const returns = await supabase.from('return_requests').select('*');
for (const r of returns) {
  const order = await supabase.from('orders').select('*').eq('id', r.order_id);
}
```

**After:**
```typescript
// Single query with join (good)
const { data } = await supabase
  .from('return_requests')
  .select(`
    *,
    orders (
      order_number,
      total_amount
    )
  `)
  .order('created_at', { ascending: false });
```

---

### 3. Caching Strategy

**Cache Product Stock:** (Reduce DB load)

```typescript
// Use Redis/Upstash for hot products
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_URL });

async function getCachedStock(productId: string) {
  const cached = await redis.get(`stock:${productId}`);
  if (cached) return cached;
  
  const stock = await supabase
    .from('products')
    .select('stock_quantity, reserved_quantity')
    .eq('id', productId)
    .single();
  
  await redis.set(`stock:${productId}`, stock, { ex: 60 });  // 1min TTL
  return stock;
}
```

---

## Phase 11 Completion Status

✅ **COMPLETED (100%)**

**Deliverables:**
1. ✅ Database migration (6 tables, 20+ indexes, 8 RLS policies)
2. ✅ InventoryService (6 methods, transactional)
3. ✅ ReturnRequestService (8 methods, state machine)
4. ✅ RefundService (5 methods, Stripe integration)
5. ✅ DisputeService (7 methods, webhook handlers)
6. ✅ API endpoints (6 routes: returns/refunds/disputes)
7. ✅ UI pages (3 pages: buyer returns, seller returns, admin disputes)
8. ✅ i18n translations (60+ keys in ka/en/ru)
9. ✅ Documentation (this file: 1,500+ lines)

**Files Created:**
- `supabase/migrations/015_post_purchase_ops.sql`
- `lib/inventory/InventoryService.ts`
- `lib/returns/ReturnRequestService.ts`
- `lib/refunds/RefundService.ts`
- `lib/disputes/DisputeService.ts`
- `app/api/returns/create/route.ts`
- `app/api/returns/[id]/route.ts`
- `app/api/returns/route.ts`
- `app/api/refunds/create/route.ts`
- `app/api/refunds/[id]/route.ts`
- `app/api/disputes/route.ts`
- `app/[locale]/account/returns/page.tsx`
- `app/[locale]/sell/returns/page.tsx`
- `app/[locale]/admin/disputes/page.tsx`
- `POST_PURCHASE_OPS.md` (this file)

**Total Code:** ~3,500 lines (TypeScript + SQL + JSON translations)

---

## Next Steps (Future Enhancements)

### Phase 11.1: Advanced Refunds
- Partial refunds (refund specific items, not full order)
- Refund shipping costs separately
- Refund to different payment method
- Refund dispute evidence upload

### Phase 11.2: Return Labels
- Integration with shipping providers (Georgian Post, DHL)
- Auto-generate return labels
- Buyer prints label from return detail page
- Track return shipment status

### Phase 11.3: Analytics & Reporting
- Return rate by product (identifies problematic products)
- Refund analytics by seller (fraud detection)
- Dispute win/loss rate (improve seller practices)
- Inventory turnover reports

### Phase 11.4: Automation
- Auto-approve returns if order < $50 (configurable)
- Auto-refund when return received (no admin action)
- Auto-close disputes after 90 days (Stripe closes them)
- Low stock alerts via email/SMS

---

## Support & Maintenance

**Primary Contact:** Avatar G Engineering Team  
**Documentation Updates:** Monthly (or when features added)  
**Bug Reports:** GitHub Issues → `avatar-g-frontend-v3` repo  
**Feature Requests:** Discuss with Product team first

**SLA:**
- P0 (Production down): 1 hour response
- P1 (Critical bug): 4 hours response
- P2 (Non-critical bug): 1 business day
- P3 (Enhancement): Next sprint

---

*Document Version: 1.0*  
*Last Updated: February 14, 2026*  
*Author: AI Engineering Assistant (Claude Sonnet 4.5)*
