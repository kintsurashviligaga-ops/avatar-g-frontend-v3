# Steps C & D: Visual Architecture & Data Flow

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         MERCHANT DASHBOARD                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │   Simulator      │  │  Launch Plan     │                   │
│  │   (Finance)      │  │  (Planning)      │                   │
│  │                  │  │                  │                   │
│  │ • Input prices   │  │ • Generate plan  │                   │
│  │ • See profit     │  │ • Tasks/checklist│                   │
│  │ • Warnings       │  │ • Templates      │                   │
│  └────────┬─────────┘  └────────┬─────────┘                   │
│           │                     │                              │
│  ┌────────▼──────────┐  ┌──────▼───────────┐                 │
│  │  Payouts Manager │  │ Growth KPIs      │                 │
│  │  (Withdrawals)   │  │ (Analytics)      │                 │
│  │                  │  │                  │                 │
│  │ • Request payout │  │ • 6 KPI cards    │                 │
│  │ • History table  │  │ • Daily table    │                 │
│  │ • Status tracking│  │ • Trend analysis │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                              │
└───────────┼─────────────────────┼──────────────────────────────┘
            │                     │
            └─────────┬───────────┘
                      │
        ┌─────────────▼──────────────────┐
        │   NEXT.JS API ROUTES (C)       │
        ├────────────────────────────────┤
        │                                │
        │  • /api/finance/simulate       │◄─── POST: Calculate profit
        │  • /api/decision/evaluate      │◄─── POST: Product evaluation
        │  • /api/launch/generate        │◄─── POST: Generate plan
        │  • /api/launch/plan            │◄─── GET:  Retrieve plan
        │  • /api/payouts/request        │◄─── POST: Create request
        │  • /api/payouts/history        │◄─── GET:  List requests
        │  • /api/marketplace/kpis       │◄─── GET:  Get metrics
        │  • /api/admin/payouts/*        │◄─── POST: Admin approve/reject
        │                                │
        └────────┬──────────┬────────────┘
                 │          │
      ┌──────────▼┐   ┌─────▼────────┐
      │  Business │   │  Admin Role  │
      │   Logic   │   │   Check      │
      │           │   │              │
      │ • Finance │   │ • Verify     │
      │   Sim     │   │   admin role │
      │ • Decision│   │ • Update     │
      │   Engine  │   │   status     │
      └──────────┬┘   └─────┬───────┘
                 │          │
                 └────┬─────┘
                      │ Zod Validation + RLS
                      │
        ┌─────────────▼──────────────────┐
        │    SUPABASE POSTGRESQL + RLS   │
        ├────────────────────────────────┤
        │                                │
        │ • stores (user_id FK)          │
        │ • launch_plans                 │
        │ • payout_requests              │
        │ • growth_kpis                  │
        │ • simulation_scenarios         │
        │                                │
        │ RLS: Row-level security        │
        │   ↓ Only own store data        │
        │                                │
        └────────────────────────────────┘
```

---

## Data Flow: Finance Simulation

```
Merchant Input
    ↓
┌─────────────────────────────────────┐
│ Retail Price: ₾100 (10,000 cents)  │
│ Supplier Cost: ₾20 (2,000 cents)   │
│ Shipping: ₾5 (500 cents)           │
│ Platform Fee: 5% (500 bps)         │
│ Orders/Day: 10                      │
└──────────┬──────────────────────────┘
           │
           │ POST /api/finance/simulate
           │ (Zod validates)
           ▼
    ┌──────────────────┐
    │ simulateScenario │
    │   (library)      │
    └────┬─────────────┘
         │
         ├─ computeVAT()      → 1,525 cents (floor-extracted)
         ├─ computeMargin()   → 5,223 cents (net profit)
         ├─ computeBreakEven()→ 0 orders (profitable)
         │
         └─ Return {
              netPerOrderCents: 5223,
              marginBps: 5223,
              marginPercent: 52.23,
              dailyProfit: 52230,
              monthlyProfit: 1566900,
              breakEven: 0,
              warnings: []
            }
           ▼
    ┌──────────────────┐
    │ SimulatorClient  │
    │ (Dashboard)      │
    └────┬─────────────┘
         │
         └─ Display 6 React cards:
            • Net per order: ₾52.23 ✓
            • Margin: 52.23% ✓
            • Daily profit: ₾523 ✓
            • Monthly profit: ₾15,690 ✓
            • Break-even: 0 orders ✓
            • No warnings
```

---

## Data Flow: Product Evaluation

```
Merchant Product Data
    ↓
┌──────────────────────────────┐
│ Product Type: "standard"     │
│ Retail Price: ₾50 (5,000)   │
│ Supplier Cost: ₾40 (4,000)  │
│ Shipping: ₾5 (500)          │
│ Platform Fee: 5% (500 bps)  │
└──────────┬──────────────────┘
           │
           │ POST /api/decision/evaluate
           │ (Zod validates)
           ▼
    ┌────────────────────────┐
    │ evaluateProductCandidate
    │   (Decision Engine)     │
    └────┬───────────────────┘
         │
         ├─ Calculate margin: 4% (400 bps)
         │
         ├─ Check Rule 1: Net > 0? YES ✓
         │
         ├─ Check Rule 2: Margin 4% < 15%? NO ✗
         │  → REJECT: "Margin 4% below 15% threshold"
         │
         ├─ Calculate recommended price:
         │  RecommendedPrice = TotalCosts / (1 - TargetMargin)
         │  = 4,805 / (1 - 0.15)
         │  = 5,653 cents (₾56.53)
         │
         └─ Return {
              decision: "reject",
              reasons: ["Margin 4% below 15%"],
              warnings: [],
              computed: {
                netPerOrderCents: 195,
                marginBps: 400,
                marginPercent: 4.0,
                ...
              },
              recommendedPriceCents: 5653
            }
           ▼
    ┌──────────────────────────┐
    │ Show Merchant UI         │
    ├──────────────────────────┤
    │ ✗ REJECTED               │
    │                          │
    │ Reasons:                 │
    │ • Margin 4% below 15%    │
    │                          │
    │ Suggested price: ₾56.53  │
    │                          │
    │ [Adjust price & retry]   │
    └──────────────────────────┘
```

---

## Data Flow: Payout Management

```
Merchant Action: Request Payout
    ↓
┌────────────────────┐
│ Amount: ₾500       │
│ (50,000 cents)     │
└────────┬───────────┘
         │
         │ POST /api/payouts/request
         │ (Zod validates)
         │ (RLS: Verify store ownership)
         ▼
    ┌──────────────────────┐
    │ INSERT payout_request │
    │ (Supabase)           │
    │                      │
    │ status: "requested"  │
    │ amount_cents: 50000  │
    │ created_at: NOW      │
    └─────┬────────────────┘
          ▼
    Store in Database
         │
         └─ Show merchant confirmation
            "Payout requested. Awaiting approval."


Admin Dashboard: Review Payouts
    ↓
┌────────────────────────────────┐
│ Pending Requests:              │
│ • Merchant A: ₾500 [Approve]   │
│ • Merchant B: ₾250 [Reject]    │
└────────┬───────────────────────┘
         │
         │ Click Approve
         │ POST /api/admin/payouts/approve
         │ (Zod validates)
         │ (Role check: verify admin)
         ▼
    ┌──────────────────────────┐
    │ UPDATE payout_requests   │
    │ SET status = "approved"  │
    │ WHERE id = <id>          │
    └─────┬────────────────────┘
          ▼
    Show Admin Confirmation
    "Payout approved. Transfer to payment processor."


Merchant: Check History
    ↓
    GET /api/payouts/history
    (Zod validates)
    (RLS: Return only user's stores)
    ▼
    ┌─────────────────────────────────┐
    │ Payout History:                 │
    │ Date    | Amount   | Status     │
    │ Feb 12  | ₾500     | APPROVED ✓ │
    │ Feb 10  | ₾250     | REJECTED ✗ │
    │ Feb 8   | ₾1000    | REQUESTED ⏳│
    └─────────────────────────────────┘
```

---

## Data Flow: KPI Retrieval

```
Merchant Navigation
    ↓
    GET /api/marketplace/kpis?storeId=<id>
    (Zod validates query param)
    (RLS: Verify store ownership)
    ▼
    ┌──────────────────────────────────┐
    │ Query growth_kpis table          │
    │ WHERE store_id = <id>            │
    │   AND date >= 30 days ago        │
    │ ORDER BY date DESC               │
    │                                  │
    │ ✓ Returns ~30 rows (daily data)  │
    └────┬─────────────────────────────┘
         │
         │ Aggregate server-side:
         │
         ├─ totalImpressions = SUM(impressions)   = 145,000
         ├─ totalClicks = SUM(clicks)             = 7,250
         ├─ totalConversions = SUM(conversions)   = 725
         └─ totalRevenueCents = SUM(revenue)      = 1,450,000
         │
         ▼
    ┌──────────────────────────────────┐
    │ Return:                          │
    │ {                                │
    │   kpis: [...30 daily records],   │
    │   aggregates: {                  │
    │     totalImpressions: 145000,    │
    │     totalClicks: 7250,           │
    │     totalConversions: 725,       │
    │     totalRevenueCents: 1450000   │
    │   }                              │
    │ }                                │
    └────┬───────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ GrowthKPIsClient (React)           │
    │                                    │
    │ Compute client-side:               │
    │ • CTR = 7250 / 145000 × 100 = 5%  │
    │ • ConvRate = 725 / 7250 × 100 = 10%
    │                                    │
    │ Display 6 cards:                   │
    │ ┌──────────┐ ┌──────────┐         │
    │ │Impress.  │ │Clicks    │         │
    │ │145,000   │ │7,250     │         │
    │ └──────────┘ └──────────┘         │
    │ ┌──────────┐ ┌──────────┐         │
    │ │Conversns │ │Revenue   │         │
    │ │725       │ │₾14,500   │         │
    │ └──────────┘ └──────────┘         │
    │ ┌──────────┐ ┌──────────┐         │
    │ │CTR       │ │Conv Rate │         │
    │ │5.0%      │ │10.0%     │         │
    │ └──────────┘ └──────────┘         │
    │                                    │
    │ Display daily table (scrollable):  │
    │ Date  | Impr | Clicks | Conv | Rev
    │ Feb12 | 5000 | 250    | 25   | ₾500
    │ Feb11 | 4800 | 240    | 24   | ₾480
    │ ...                              │
    └────────────────────────────────────┘
```

---

## Authentication & Authorization Flow

```
User wants to access protected endpoint
    ↓
┌─────────────────┐
│ GET /api/launch │
│ /plan?storeId=X │
└────────┬────────┘
         │
         ├─ Zod validates query param storeId
         │
         ├─ Request includes Authorization: Bearer $TOKEN
         │
         ├─ Server calls auth.getUser()
         │
         ├─→ If no token: 401 Unauthorized
         │
         └─→ If token valid:
             │
             ├─ Verify store ownership:
             │  SELECT stores WHERE id=X AND user_id=auth.uid()
             │
             ├─→ If store not found: 404 Not Found
             │  (User doesn't own this store)
             │
             └─→ If store found: ✓ Proceed
                 │
                 └─ Query launch_plans table
                    (RLS policy:
                     SELECT * WHERE store_id IN (
                       SELECT id FROM stores
                       WHERE user_id = auth.uid()
                     ))
                    ▼
                    Return launch_plans data
```

---

## Admin Authorization Flow

```
Admin wants to approve payout
    ↓
┌──────────────────────────────┐
│ POST /api/admin/payouts/      │
│ approve                       │
│ Authorization: Bearer $TOKEN  │
│ Body: {                       │
│   payout_request_id: "xyz"   │
│ }                            │
└────────┬─────────────────────┘
         │
         ├─ Zod validates payload
         │
         ├─ Server calls auth.getUser()
         │
         ├─→ If not authenticated: 401
         │
         └─→ If authenticated:
             │
             ├─ Query profiles table:
             │  SELECT role FROM profiles
             │  WHERE id = auth.uid()
             │
             ├─→ If role != 'admin': 403 Forbidden
             │
             └─→ If role == 'admin': ✓ Proceed
                 │
                 └─ Update payout_requests:
                    UPDATE payout_requests
                    SET status = 'approved'
                    WHERE id = payout_request_id
                    ▼
                    Return updated request
```

---

## Error Handling Flow

```
Invalid API Request
    ↓
POST /api/decision/evaluate
Body: {
  product_type: "invalid_type",
  retail_price_cents: "not_a_number"
}
    │
    ├─ Zod schema check:
    │
    │  product_type: z.enum(['standard', 'dropshipping', 'digital'])
    │  ✗ FAIL: 'invalid_type' not in enum
    │
    │  retail_price_cents: z.number().int().positive()
    │  ✗ FAIL: "not_a_number" is string, not positive integer
    │
    ├─ Zod calls parseAsync()
    │
    ├─ Catches validation error
    │
    ├─ Calls error.flatten()
    │
    └─ Return 400:
        {
          "error": "Invalid input",
          "details": [
            {
              "path": ["product_type"],
              "message": "Invalid enum value. Expected 'standard' | 'dropshipping' | 'digital'"
            },
            {
              "path": ["retail_price_cents"],
              "message": "Expected integer, received string"
            }
          ]
        }
```

---

## Component State Management

```
SimulatorClient Component
    │
    ├─ useState inputs
    │  {
    │    retail_price_cents: 10000,
    │    supplier_cost_cents: 2000,
    │    shipping_cost_cents: 500,
    │    vat_enabled: true,
    │    platform_fee_bps: 500,
    │    expected_orders_per_day: 10
    │  }
    │
    ├─ useState result (null initially)
    │
    ├─ useState loading (false initially)
    │
    └─ useState error (null initially)


User Changes Input
    ↓
setInputs({ ...inputs, retail_price_cents: 15000 })
    ↓
Component re-renders with new input field value


User Clicks Simulate
    ↓
setLoading(true)
setError(null)
    ↓
fetch('/api/finance/simulate', { method: 'POST', body: JSON.stringify(inputs) })
    ↓
    ├─→ If error: setError(error), setLoading(false)
    └─→ If success: setResult(data), setLoading(false)


Component Re-renders
    ├─ If loading: Show "Calculating..."
    ├─ If error: Show red error box
    └─ If result: Show 6 KPI cards with data
```

---

## Database Schema Relationships

```
users (Supabase auth)
    ↓
    └─ (1) has many (∞)


profiles
    id ─────────┬──── user_id (auth.users.id)
    role ───────┘     ├─ 'merchant' | 'admin'
    created_at        └─ Used for admin checks


stores
    id ────────────────┬──── user_id (profiles.id)
    name              │     (RLS: WHERE user_id = auth.uid())
    user_id           ├─ (1) has many (∞)
    created_at        │


launch_plans
    id
    store_id ─────────┬──── (FK → stores.id)
    plan              │     (RLS: store_id in user's stores)
    created_at        ├─ 0..1


payout_requests
    id
    store_id ─────────┬──── (FK → stores.id)
    amount_cents      │     (RLS: store_id in user's stores)
    status ────────────┼─ 'requested' | 'approved' | 'rejected'
    rejection_reason  │     (admin endpoints check profiles.role)
    created_at        ├─ 0..n


growth_kpis
    id
    store_id ─────────┬──── (FK → stores.id)
    date              │     (RLS: store_id in user's stores)
    impressions ──────┼─ Used for daily KPI tracking
    clicks            ├─ Aggregated by GrowthKPIsClient
    conversions       │
    revenue_cents     │
    created_at        ├─ 0..n


simulation_scenarios
    id
    store_id ─────────┬──── (FK → stores.id)
    name              │     (RLS: store_id in user's stores)
    inputs_json ──────┼─ What-if scenario history
    outputs_json      │
    created_at        ├─ 0..n
```

---

## Testing Pyramid

```
                    △
                   /│\
                  / │ \
                 /  │  \  E2E Tests
                /   │   \  - Full user flows
               /    │    \  - Real database
              ╱     │     ╲ - Manual testing
             / ─ ─ ─│─ ─ ─ \
            /       │        \
           /   Integration   \  Integration Tests
          /        Tests      \ - API route + DB
         /    - Zod validation  \
        /     - Route responses  \
       / ─ ─ ─ ─ │ ─ ─ ─ ─ ─ ─ ─\
      /         │               \
     /  Unit Tests              \ Unit Tests
    /  - Finance math             \ - Decision engine
   /   - VAT, margin, break-even   \ - All scenarios
  /___________│_____________________\

    Running:
    npm test -- __tests__/finance
    npm test -- __tests__/decision-engine
```

---

**Generated**: February 12, 2025  
**Status**: Complete ✅

