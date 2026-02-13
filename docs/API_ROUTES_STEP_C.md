# API Routes - Step C Implementation

## Overview

Step C implements 9 API routes covering financial simulation, product evaluation, launch planning, payouts, and KPI reporting. All routes use Zod for runtime validation and enforce RLS via Supabase server-side auth.

## Authentication & Authorization

### Server-Side Auth Pattern
```typescript
const { data: { user }, error: authError } = await auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

### Role Checks
Admin endpoints verify `profiles.role = 'admin'` before allowing action:
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (profile?.role !== 'admin') {
  return NextResponse.json({ error: 'Admin only' }, { status: 403 });
}
```

### Store Ownership Verification
All store-scoped endpoints verify user owns the store:
```typescript
const { data: store } = await supabase
  .from('stores')
  .select('id')
  .eq('id', storeId)
  .eq('user_id', user.id)
  .single();

if (!store) {
  return NextResponse.json({ error: 'Store not found' }, { status: 404 });
}
```

## Simulation API

### POST /api/finance/simulate

**Purpose**: Real-time scenario simulation with instant profit calculations

**Request Schema** (Zod):
```typescript
{
  retail_price_cents: number;        // ₾100 = 10000
  supplier_cost_cents: number;       // ₾20 = 2000
  shipping_cost_cents: number;       // ₾5 = 500
  vat_enabled: boolean;              // true for Georgia
  platform_fee_bps: number;          // 500 = 5%
  affiliate_bps: number;             // 1000 = 10% (optional)
  refund_reserve_bps: number;        // 200 = 2% (optional)
  expected_orders_per_day: number;   // 10
  ad_spend_per_day_cents?: number;   // Optional
}
```

**Response**:
```json
{
  "data": {
    "net_per_order_cents": 5000,
    "margin_bps": 5000,
    "margin_percent": 50.0,
    "daily_profit_cents": 50000,
    "monthly_profit_cents": 1500000,
    "break_even_orders_per_day": 1,
    "warnings": [
      "Shipping reserve below 2% (1% detected)"
    ]
  }
}
```

**Error Cases**:
```json
{
  "error": "Invalid input",
  "details": [
    { "path": ["retail_price_cents"], "message": "Must be > 0" }
  ]
}
```

**Notes**:
- No API authentication required (anonymously simulated scenarios)
- VAT extracted using floor formula: `⌊price × vat_bps / (10000 + vat_bps) ⌋`
- Margin calculated on net-of-VAT amounts
- Break-even accounts for ad spend

---

## Decision Engine API

### POST /api/decision/evaluate

**Purpose**: Evaluate product profitability; return publish/reject decision

**Request Schema** (Zod):
```typescript
{
  product_type: 'standard' | 'dropshipping' | 'digital';
  retail_price_cents: number;
  supplier_cost_cents: number;
  shipping_cost_cents: number;
  vat_enabled: boolean;
  buyer_country_code?: string;       // Future: country-specific VAT
  platform_fee_bps: number;          // Store default
  affiliate_bps?: number;
  refund_reserve_bps?: number;       // Recommended: 200 (2%)
}
```

**Response (Publish)**:
```json
{
  "data": {
    "decision": "publish",
    "reasons": [],
    "warnings": [],
    "computed": {
      "net_per_order_cents": 5000,
      "margin_bps": 5000,
      "margin_percent": 50.0,
      "vat_amount_cents": 1525,
      "total_costs_cents": 3475
    },
    "recommended_price_cents": null
  }
}
```

**Response (Reject with Recommendation)**:
```json
{
  "data": {
    "decision": "reject",
    "reasons": [
      "Margin 8% is below standard minimum 15%"
    ],
    "warnings": [
      "Shipping delays > 21 days (typical buyer expectation)"
    ],
    "computed": {
      "net_per_order_cents": 500,
      "margin_bps": 500,
      "margin_percent": 5.0,
      "vat_amount_cents": 1525,
      "total_costs_cents": 7975
    },
    "recommended_price_cents": 13200
  }
}
```

**Thresholds**:
| Product Type   | Min Margin | Intent |
|----------------|-----------|--------|
| standard       | 15%       | Physical goods, ~7-21 day shipping |
| dropshipping   | 25%       | High supplier variability risk |
| digital        | 70%       | Near-zero COGS; high platform work |

**Non-Blocking Warnings**:
- Shipping > 21 days (buyer expectation mismatch)
- Refund reserve < 2% (insufficient safety margin)

---

## Launch Plan API

### POST /api/launch/generate

**Purpose**: Generate 12-week go-to-market plan with tasks, checklists, templates, scripts

**Authentication**: Required (user must own store)

**Request Schema** (Zod):
```typescript
{
  store_id: string;                  // UUID
  language?: 'en' | 'ka' | 'ru';    // Defaults to 'en'
}
```

**Response**:
```json
{
  "data": {
    "plan_id": "550e8400-e29b-41d4-a716-446655440000",
    "store_id": "...",
    "plan": {
      "weeks": [
        {
          "week": 1,
          "title": "Foundation Week",
          "tasks": [
            "Write compelling product description",
            "Create 3 professional product photos",
            "Set up payment processing"
          ]
        }
      ],
      "checklist": [
        { "item": "30-day inventory confirmed", "completed": false },
        { "item": "Shipping carriers configured", "completed": false },
        { "item": "Return policy documented", "completed": false },
        { "item": "Customer support response SLA set", "completed": false }
      ],
      "social_templates": [
        "Launch day announcement for Instagram",
        "Customer testimonial post template"
      ],
      "influencer_scripts": [
        "Product pitch for micro-influencers (< 100k followers)",
        "Affiliate partnership email template"
      ]
    },
    "created_at": "2025-02-12T10:30:00Z"
  }
}
```

**Error Cases**:
```json
{
  "error": "Store not found",
  "status": 404
}
```

**Notes**:
- Plan is generated and saved to `launch_plans` table
- Returns `planId` for later retrieval
- Plan language customizable (future: AI-generated in local language)

### GET /api/launch/plan?storeId=...

**Purpose**: Retrieve latest launch plan for a store

**Authentication**: Required

**Query Params**:
```typescript
{
  storeId: string; // UUID
}
```

**Response**:
```json
{
  "data": {
    "plan_id": "...",
    "plan": { /* same structure as POST response */ },
    "created_at": "2025-02-12T10:30:00Z"
  }
}
```

**Error Cases**:
```json
{
  "error": "No launch plan found for this store",
  "status": 404
}
```

---

## Payouts API

### POST /api/payouts/request

**Purpose**: Request a payout from store earnings

**Authentication**: Required

**Request Schema** (Zod):
```typescript
{
  store_id: string;        // UUID
  amount_cents: number;    // ₾500 = 50000
}
```

**Response**:
```json
{
  "data": {
    "id": "...",
    "store_id": "...",
    "user_id": "...",
    "amount_cents": 50000,
    "status": "requested",
    "created_at": "2025-02-12T10:30:00Z",
    "updated_at": "2025-02-12T10:30:00Z"
  }
}
```

**Validation**:
- Store must exist and belong to user
- Amount must be > 0
- (Future: Amount ≤ available balance check)

**Notes**:
- Status starts as `'requested'`
- Visible in admin dashboard for approval/rejection

### GET /api/payouts/history

**Purpose**: Retrieve all user's payout requests across stores

**Authentication**: Required

**Response**:
```json
{
  "data": [
    {
      "id": "...",
      "store_id": "...",
      "user_id": "...",
      "amount_cents": 50000,
      "status": "approved",
      "rejection_reason": null,
      "created_at": "2025-02-12T10:30:00Z",
      "updated_at": "2025-02-12T11:45:00Z"
    },
    {
      "id": "...",
      "store_id": "...",
      "amount_cents": 25000,
      "status": "rejected",
      "rejection_reason": "Insufficient funds in bank account",
      "created_at": "2025-02-12T09:00:00Z",
      "updated_at": "2025-02-12T10:00:00Z"
    }
  ]
}
```

**Ordering**: By `created_at` DESC (newest first)

---

## Admin Payouts API

### POST /api/admin/payouts/approve

**Purpose**: Admin approve a payout request

**Authentication**: Required + Admin Role

**Request Schema** (Zod):
```typescript
{
  payout_request_id: string; // UUID
}
```

**Response**:
```json
{
  "data": {
    "id": "...",
    "status": "approved",
    "updated_at": "2025-02-12T11:45:00Z"
  }
}
```

**Error Cases**:
```json
{
  "error": "Admin only",
  "status": 403
}
```

**Notes**:
- Role check: `profile.role === 'admin'`
- Updates `payout_requests.status = 'approved'`
- Clears any previous rejection_reason

### POST /api/admin/payouts/reject

**Purpose**: Admin reject a payout request with optional reason

**Authentication**: Required + Admin Role

**Request Schema** (Zod):
```typescript
{
  payout_request_id: string;    // UUID
  reason?: string;              // Max 500 chars
}
```

**Response**:
```json
{
  "data": {
    "id": "...",
    "status": "rejected",
    "rejection_reason": "Insufficient funds in bank account",
    "updated_at": "2025-02-12T11:45:00Z"
  }
}
```

**Notes**:
- Reason optional; if provided, stored in `rejection_reason` column
- Status changes to `'rejected'`
- Non-reversible (admin must request resubmission by merchant)

---

## KPI Reporting API

### GET /api/marketplace/kpis?storeId=...

**Purpose**: Fetch store's growth KPIs with 30-day daily breakdown and aggregates

**Authentication**: Required

**Query Params**:
```typescript
{
  storeId: string; // UUID
}
```

**Response**:
```json
{
  "data": {
    "kpis": [
      {
        "date": "2025-02-12",
        "impressions": 5000,
        "clicks": 250,
        "conversions": 25,
        "revenue_cents": 50000
      },
      {
        "date": "2025-02-11",
        "impressions": 4800,
        "clicks": 240,
        "conversions": 24,
        "revenue_cents": 48000
      }
    ],
    "aggregates": {
      "total_impressions": 145000,
      "total_clicks": 7250,
      "total_conversions": 725,
      "total_revenue_cents": 1450000
    }
  }
}
```

**Computed Metrics** (Client-side):
```typescript
ctr_percent = (total_clicks / total_impressions) * 100;        // 5%
conversion_rate_percent = (total_conversions / total_clicks) * 100; // 10%
```

**Time Window**: Last 30 days (or all data if < 30 days old)

**Notes**:
- Data sourced from `growth_kpis` table (ingested via webhooks or ETL)
- Aggregates computed server-side for efficiency
- Typically updated daily from analytics service

---

## Finance Scenarios API

### GET /api/finance/scenarios?storeId=...

**Purpose**: Retrieve all saved scenarios for a store

**Authentication**: Required

**Query Params**:
```typescript
{
  storeId: string; // UUID
}
```

**Response**:
```json
{
  "data": [
    {
      "id": "...",
      "store_id": "...",
      "name": "Holiday campaign high volume",
      "inputs": {
        "retail_price_cents": 15000,
        "supplier_cost_cents": 3000,
        "shipping_cost_cents": 500,
        "vat_enabled": true,
        "platform_fee_bps": 500,
        "expected_orders_per_day": 50
      },
      "outputs": {
        "net_per_order_cents": 8400,
        "daily_profit_cents": 420000,
        "monthly_profit_cents": 12600000
      },
      "created_at": "2025-02-12T10:30:00Z"
    }
  ]
}
```

**Ordering**: By `created_at` DESC

### POST /api/finance/scenarios

**Purpose**: Save a new scenario for later analysis

**Authentication**: Required

**Request Schema** (Zod):
```typescript
{
  store_id: string;
  name: string;                    // Max 100 chars
  inputs: {
    retail_price_cents: number;
    supplier_cost_cents: number;
    shipping_cost_cents: number;
    vat_enabled: boolean;
    platform_fee_bps: number;
    affiliate_bps?: number;
    refund_reserve_bps?: number;
    expected_orders_per_day: number;
    ad_spend_per_day_cents?: number;
  };
}
```

**Response**:
```json
{
  "data": {
    "id": "...",
    "store_id": "...",
    "name": "Holiday campaign high volume",
    "inputs": { /* echoed back */ },
    "outputs": {
      "net_per_order_cents": 8400,
      "daily_profit_cents": 420000,
      "monthly_profit_cents": 12600000
    },
    "created_at": "2025-02-12T10:30:00Z"
  }
}
```

**Process**:
1. Zod validates inputs
2. Calls `simulateScenario()` to compute outputs
3. Saves both inputs + outputs to `simulation_scenarios` table
4. Returns scenario with ID

**Notes**:
- Scenario immutable after creation
- Used for "what-if" analysis and decision history

---

## Error Handling

### Standard Error Response
```json
{
  "error": "Invalid input",
  "details": [
    {
      "path": ["retail_price_cents"],
      "message": "Expected number, received NaN"
    }
  ]
}
```

### HTTP Status Codes

| Code | Condition |
|------|-----------|
| 200  | Request succeeded |
| 400  | Zod validation failed; malformed JSON |
| 401  | Missing/invalid authentication token |
| 403  | Authenticated but insufficient permissions (admin-only endpoint) |
| 404  | Resource not found (store, payout request, plan) |
| 500  | Server error (Supabase connection, unexpected exception) |

---

## Rate Limiting (Future)

TBD: Implement rate limits per user/store:
- Simulation: 1000 calls/hour
- Decision: 100 calls/hour
- Admin approvals: 500 calls/hour

---

## Testing

### Using curl

**Simulate**:
```bash
curl -X POST http://localhost:3000/api/finance/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "retail_price_cents": 10000,
    "supplier_cost_cents": 2000,
    "shipping_cost_cents": 500,
    "vat_enabled": true,
    "platform_fee_bps": 500,
    "expected_orders_per_day": 10
  }'
```

**Evaluate**:
```bash
curl -X POST http://localhost:3000/api/decision/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_type": "standard",
    "retail_price_cents": 10000,
    "supplier_cost_cents": 2000,
    "shipping_cost_cents": 500,
    "vat_enabled": true,
    "platform_fee_bps": 500
  }'
```

### Using Node.js/fetch

```typescript
const result = await fetch('/api/finance/simulate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    retail_price_cents: 10000,
    supplier_cost_cents: 2000,
    shipping_cost_cents: 500,
    vat_enabled: true,
    platform_fee_bps: 500,
    expected_orders_per_day: 10
  })
});

const { data, error } = await result.json();
if (error) console.error(error);
else console.log('Profit:', data.net_per_order_cents);
```

