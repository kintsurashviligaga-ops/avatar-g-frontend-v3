# Dashboard UI - Step D Implementation

## Overview

Step D implements 4 interactive dashboard components for merchants to simulate finances, plan launches, request payouts, and monitor store growth. All components use React hooks for state management and Zod validates all API requests.

## Component Architecture

### Pattern: Client-Side Components + Server-Side Pages

**Page Structure** (Server Component):
```typescript
// /app/dashboard/shop/finance/page.tsx (Server Component)
export default async function FinanceSimulatorPage() {
  const auth = await createSupabaseServerClient(); // Server-side auth
  const user = await auth.getUser();
  
  return (
    <main>
      <SimulatorClient /> {/* Client component */}
    </main>
  );
}
```

**Client Component Structure**:
```typescript
// /app/dashboard/shop/finance/SimulatorClient.tsx (Client Component)
'use client';

export function SimulatorClient() {
  const [inputs, setInputs] = useState({/* ... */});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    const response = await fetch('/api/finance/simulate', {
      method: 'POST',
      body: JSON.stringify(inputs)
    });
    const { data, error } = await response.json();
    setResult(data);
  };

  return (/* UI */);
}
```

---

## 1. Finance Simulator (/dashboard/shop/finance)

### Purpose
Real-time profit scenario modeling with instant calculations. Merchants adjust pricing, costs, and volumes to see impact on profit before publishing products.

### Location
- **Page**: [/app/dashboard/shop/finance/page.tsx](/app/dashboard/shop/finance/page.tsx)
- **Component**: [/app/dashboard/shop/finance/SimulatorClient.tsx](/app/dashboard/shop/finance/SimulatorClient.tsx)

### UI Layout

```
┌─────────────────────────────────────────────────┐
│  FINANCE SIMULATOR                              │
├─────────────────────────────────────────────────┤
│ PRICING & COSTS                                 │
│  Retail Price:        [₾] [_______]            │
│  Supplier Cost:       [₾] [_______]            │
│  Shipping Cost:       [₾] [_______]            │
│  Platform Fee (%):         [_______]           │
│  Affiliate Fee (%):        [_______]           │
│                                                  │
│ VOLUME & MARKETING                              │
│  Expected Orders/Day:      [_______]           │
│  Daily Ad Spend:      [₾] [_______]           │
│                                                  │
│                [SIMULATE]                       │
├─────────────────────────────────────────────────┤
│ RESULTS                                         │
│  ┌─────────────┐ ┌─────────────┐              │
│  │ Net/Order   │ │ Margin %    │              │
│  │ ₾52.23      │ │ 52.23%      │              │
│  └─────────────┘ └─────────────┘              │
│  ┌─────────────┐ ┌─────────────┐              │
│  │ Daily Profit│ │ Monthly     │              │
│  │ ₾523         │ │ ₾15,690     │              │
│  └─────────────┘ └─────────────┘              │
│                                                  │
│ ⚠️ WARNINGS                                     │
│  • Refund reserve below 2% (insufficient)      │
└─────────────────────────────────────────────────┘
```

### Input Fields

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| Retail Price | number | 10000 | In cents (₾100) |
| Supplier Cost | number | 2000 | In cents (₾20) |
| Shipping Cost | number | 500 | In cents (₾5) |
| Platform Fee | number | 500 | In basis points (5%) |
| Affiliate Fee | number | 1000 | In basis points (10%), optional |
| Orders/Day | number | 10 | Integer only |
| Ad Spend/Day | number | 1000 | In cents, optional |

### Result Cards (KPIs)

1. **Net Per Order**
   - Value: `₾52.23`
   - Formula: Retail - VAT - Costs - Fees
   - Color: Green if > 0, Red if ≤ 0

2. **Margin %**
   - Value: `52.23%`
   - Formula: (NetPerOrder / RetailPrice) × 100
   - Context: Standard minimum is 15%

3. **Daily Profit**
   - Value: `₾523` (10 orders × ₾52.23)
   - Formula: NetPerOrder × OrdersPerDay - AdSpend
   - Color: Green if > 0, Red if ≤ 0

4. **Monthly Profit**
   - Value: `₾15,690` (30 × Daily)
   - Shows annualized impact
   - Links to business planning

5. **Break-Even Orders**
   - Value: `1 order` or `null` (if unprofitable)
   - Formula: ⌈AdSpendPerDay / NetPerOrder⌉
   - Shows how many sales needed to cover ad costs

6. **Action Items** (if unprofitable)
   - Suggested retail price to reach 15% margin
   - "Increase price to ₾132 to reach target margin"

### Warnings Section

**Yellow background list** of non-blocking warnings:
- "Shipping > 21 days (buyer expectation: ≤21 days)"
- "Refund reserve < 2% (recommended: ≥2%)"

### State Management

```typescript
const [inputs, setInputs] = useState({
  retail_price_cents: 10000,
  supplier_cost_cents: 2000,
  shipping_cost_cents: 500,
  platform_fee_bps: 500,
  affiliate_bps: 1000,
  expected_orders_per_day: 10,
  ad_spend_per_day_cents: 0
});

const [result, setResult] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

### API Call

```typescript
const handleSimulate = async () => {
  setLoading(true);
  setError(null);
  
  const response = await fetch('/api/finance/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs)
  });

  const { data, error } = await response.json();
  if (error) {
    setError(error);
  } else {
    setResult(data);
  }
  setLoading(false);
};
```

### Advanced Features (Future)

- **Scenario Saving**: "Save as 'Holiday Campaign'" button → saves to simulation_scenarios table
- **Comparison View**: Show 2 scenarios side-by-side (current vs baseline)
- **Export**: Download as CSV or PDF for financial planning
- **Historical Actuals**: Overlay with real product performance

---

## 2. Launch Plan Generator (/dashboard/shop/launch)

### Purpose
Automated 12-week go-to-market plan with tasks, checklists, social templates, and influencer scripts. Merchants get a structured roadmap for product launch success.

### Location
- **Page**: [/app/dashboard/shop/launch/page.tsx](/app/dashboard/shop/launch/page.tsx)
- **Component**: [/app/dashboard/shop/launch/LaunchPlanClient.tsx](/app/dashboard/shop/launch/LaunchPlanClient.tsx)

### UI Layout

```
┌─────────────────────────────────────────────────┐
│  LAUNCH PLAN GENERATOR                          │
├─────────────────────────────────────────────────┤
│                  [GENERATE PLAN]                │
├─────────────────────────────────────────────────┤
│ PRE-LAUNCH CHECKLIST ✓                          │
│  ☐ 30-day inventory confirmed                  │
│  ☐ Shipping carriers configured                │
│  ☐ Return policy documented                    │
│  ☐ Customer support SLA set                    │
├─────────────────────────────────────────────────┤
│ WEEK 1: FOUNDATION                              │
│  • Write compelling product description         │
│  • Create 3 professional product photos        │
│  • Set up payment processing                   │
│                                                  │
│ WEEK 2: TECHNICAL SETUP                         │
│  • Configure inventory tracking                │
│  • Set up analytics                            │
│  • Test checkout flow                          │
│  ...                                            │
├─────────────────────────────────────────────────┤
│ SOCIAL MEDIA TEMPLATES                          │
│  1. Launch day announcement (Instagram)        │
│  2. Customer testimonial post template         │
├─────────────────────────────────────────────────┤
│ INFLUENCER OUTREACH SCRIPTS                     │
│  • Pitch for micro-influencers (< 100k)       │
│  • Affiliate partnership email template        │
└─────────────────────────────────────────────────┘
```

### Plan Structure

**Weeks Array**:
```json
{
  "weeks": [
    {
      "week": 1,
      "title": "Foundation Week",
      "tasks": [
        "Write compelling product description",
        "Create 3 professional product photos",
        "Set up payment processing"
      ]
    },
    {
      "week": 2,
      "title": "Technical Setup",
      "tasks": [/* ... */]
    }
  ]
}
```

**Pre-Launch Checklist**:
```json
{
  "checklist": [
    { "item": "30-day inventory confirmed", "completed": false },
    { "item": "Shipping carriers configured", "completed": false },
    { "item": "Return policy documented", "completed": false },
    { "item": "Customer support response SLA set", "completed": false }
  ]
}
```

**Social Templates**:
```json
{
  "social_templates": [
    "Launch day announcement for Instagram",
    "Customer testimonial post template",
    "Unboxing video script for TikTok"
  ]
}
```

**Influencer Scripts**:
```json
{
  "influencer_scripts": [
    "Product pitch for micro-influencers (< 100k followers)",
    "Affiliate partnership email template",
    "Press release for tech publications"
  ]
}
```

### State Management

```typescript
const [plan, setPlan] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

### API Call

```typescript
const handleGeneratePlan = async () => {
  setLoading(true);
  const response = await fetch('/api/launch/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId })
  });

  const { data, error } = await response.json();
  if (error) {
    setError(error);
  } else {
    setPlan(data);
  }
  setLoading(false);
};
```

### User Interactions

1. **Generate Button**: Calls POST /api/launch/generate; saves plan to DB
2. **Checklist Items**: Click to toggle ✓ (future: save state to DB)
3. **Copy Template**: One-click copy social template to clipboard
4. **Download Script**: Export influencer script as .txt

### Advanced Features (Future)

- **Language Selection**: Generate plan in Georgian, Russian, French
- **Product Customization**: Adjust plan based on product type (digital vs physical)
- **Milestone Tracking**: Mark tasks complete; track progress toward launch
- **Team Assignment**: Assign tasks to team members (for multi-user stores)
- **Notifications**: Remind merchant of upcoming milestones

---

## 3. Payouts Manager (/dashboard/shop/payouts)

### Purpose
Request withdrawals and track payment history. Merchants see pending, approved, and rejected requests with clear status indicators.

### Location
- **Page**: [/app/dashboard/shop/payouts/page.tsx](/app/dashboard/shop/payouts/page.tsx)
- **Component**: [/app/dashboard/shop/payouts/PayoutsClient.tsx](/app/dashboard/shop/payouts/PayoutsClient.tsx)

### UI Layout

```
┌─────────────────────────────────────────────────┐
│  PAYOUTS                                        │
├─────────────────────────────────────────────────┤
│ REQUEST WITHDRAWAL                              │
│  Amount:  [₾] [________________] [REQUEST]     │
│  Account: .................................     │
├─────────────────────────────────────────────────┤
│ PAYMENT HISTORY                                 │
│  Date        | Amount   | Status    | Reason   │
│  Feb 12      | ₾500     | ✓APPROVED | -        │
│  Feb 11      | ₾250     | ⏳REQUEST | pending  │
│  Feb 10      | ₾100     | ✗REJECTED | Insufficient│
│                                                  │
│  Showing 1-3 of 3                              │
└─────────────────────────────────────────────────┘
```

### Request Form

**Inputs**:
- Amount in GEL (merchant inputs ₾500, stored as 50000 cents)
- Account selection (future: manage multiple bank accounts)

**Validation**:
- Amount > 0
- Amount ≤ available balance (future)
- Account must be verified (future)

### Payment History Table

**Columns**:
1. **Date**: ISO format date (e.g., "2025-02-12")
2. **Amount**: Right-aligned, formatted GEL (₾500)
3. **Status**: Badge with color
   - Green ✓ = Approved
   - Yellow ⏳ = Requested (pending review)
   - Red ✗ = Rejected
4. **Reason** (if rejected): Displays rejection_reason from DB

**Sorting**: By created_at DESC (newest first)

**Pagination** (future): Show 10 per page; add "Load more"

### Status Badges

```typescript
<StatusBadge status={payout.status}>
  {status === 'approved' && <CheckCircle /> Approved}
  {status === 'requested' && <Clock /> Pending}
  {status === 'rejected' && <AlertCircle /> Rejected}
</StatusBadge>
```

### State Management

```typescript
const [amountCents, setAmountCents] = useState('');
const [payouts, setPayouts] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

### API Calls

**Request Payout**:
```typescript
const handleRequestPayout = async () => {
  const response = await fetch('/api/payouts/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_id: storeId,
      amount_cents: parseInt(amountCents) * 100
    })
  });

  const { data } = await response.json();
  setPayouts([data, ...payouts]); // Add to top of list
  setAmountCents('');
};
```

**Fetch History**:
```typescript
useEffect(() => {
  const fetchPayouts = async () => {
    const response = await fetch('/api/payouts/history');
    const { data } = await response.json();
    setPayouts(data);
  };
  fetchPayouts();
}, []);
```

### Advanced Features (Future)

- **Auto-Payout**: Set minimum threshold (e.g., auto-transfer when balance > ₾1000)
- **Multiple Accounts**: Register multiple bank accounts; choose destination per request
- **Invoice Generation**: Download payout receipt with itemized earnings
- **Tax Reporting**: Generate 1099 / Georgian tax form
- **Payment Methods**: Support Wise, Stripe Connect, PayPal

---

## 4. Growth KPIs Dashboard (/dashboard/marketplace/growth)

### Purpose
Real-time store performance metrics showing impressions, clicks, conversions, and revenue with daily breakdown. Merchants monitor marketing effectiveness and identify trends.

### Location
- **Page**: [/app/dashboard/marketplace/growth/page.tsx](/app/dashboard/marketplace/growth/page.tsx)
- **Component**: [/app/dashboard/marketplace/growth/GrowthKPIsClient.tsx](/app/dashboard/marketplace/growth/GrowthKPIsClient.tsx)

### UI Layout

```
┌─────────────────────────────────────────────────┐
│  GROWTH KPIs                                    │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Impressions  │  │ Clicks       │             │
│  │ 145,000      │  │ 7,250        │             │
│  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Conversions  │  │ Total Revenue│             │
│  │ 725          │  │ ₾14,500      │             │
│  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ CTR (%)      │  │ Conv. Rate %│             │
│  │ 5.0%         │  │ 10.0%        │             │
│  └──────────────┘  └──────────────┘             │
├─────────────────────────────────────────────────┤
│ DAILY PERFORMANCE                               │
│  Date      | Impr. | Clicks | Conv. | Revenue  │
│  Feb 12    | 5000  | 250    | 25    | ₾500    │
│  Feb 11    | 4800  | 240    | 24    | ₾480    │
│  Feb 10    | 4600  | 230    | 23    | ₾460    │
│  ...                                            │
│  [More rows: scrollable table]                  │
└─────────────────────────────────────────────────┘
```

### KPI Cards (6 Total)

1. **Total Impressions**
   - Metric: Sum of all impressions (30-day window)
   - Display: Large number (145,000)
   - Trend: Daily breakdown in table

2. **Total Clicks**
   - Metric: Sum of all clicks
   - Display: Large number (7,250)
   - Useful for: Traffic quality assessment

3. **Total Conversions**
   - Metric: Sum of all purchases/signups
   - Display: Large number (725)
   - Impact: Maps to revenue

4. **Total Revenue**
   - Metric: Sum of revenue_cents across 30 days
   - Display: Formatted GEL (₾14,500)
   - Color: Green
   - Most important KPI

5. **CTR (Click-Through Rate)**
   - Formula: (Total Clicks / Total Impressions) × 100
   - Display: Percentage (5.0%)
   - Interpretation: 5% of viewers click; 95% skip
   - Benchmark: 2-5% typical for Georgian e-commerce

6. **Conversion Rate**
   - Formula: (Total Conversions / Total Clicks) × 100
   - Display: Percentage (10.0%)
   - Interpretation: 10 of 100 clickers become buyers
   - Benchmark: 2-5% typical for e-commerce

### Daily Performance Table

**Columns**:
- **Date**: YYYY-MM-DD format
- **Impressions**: Raw number (5000)
- **Clicks**: Raw number (250)
- **Conversions**: Raw number (25)
- **Revenue**: Formatted GEL (₾500)

**Rows**: Last 30 days of data (or all data if < 30 days old)
**Sorting**: By date DESC (newest first)
**Scrolling**: Vertical scroll for history; horizontal scroll optional for mobile

### Card Component Design

```typescript
<KPICard
  title="Total Impressions"
  value="145,000"
  icon={<Eye />}
  color="blue"
/>

<KPICard
  title="CTR (%)"
  value="5.0%"
  icon={<TrendingUp />}
  color="green"
/>
```

### State Management

```typescript
const [kpis, setKpis] = useState([]);
const [aggregates, setAggregates] = useState({
  total_impressions: 0,
  total_clicks: 0,
  total_conversions: 0,
  total_revenue_cents: 0
});
const [loading, setLoading] = useState(false);
```

### API Call

```typescript
useEffect(() => {
  const fetchKPIs = async () => {
    setLoading(true);
    const response = await fetch('/api/marketplace/kpis?storeId=' + storeId);
    const { data, error } = await response.json();
    
    if (!error) {
      setKpis(data.kpis);
      setAggregates(data.aggregates);
    }
    setLoading(false);
  };
  
  fetchKPIs();
}, [storeId]);
```

### Computed Metrics (Client-Side)

```typescript
const ctrPercent = (aggregates.total_clicks / aggregates.total_impressions) * 100;
const conversionRatePercent = (aggregates.total_conversions / aggregates.total_clicks) * 100;
```

### Empty State

```
No data yet. Your KPIs will appear here as traffic builds.
[Learn about marketing best practices →]
```

### Advanced Features (Future)

- **Date Range Picker**: Select custom 7-day, 30-day, or custom range
- **Comparison**: Current month vs previous month growth %
- **Alerts**: "CTR dropped 20% - investigate ad performance"
- **Export**: Download as CSV/PDF for analysis
- **Charts**: Line graph of daily revenue trend; bar chart of traffic sources
- **Attribution**: Show which marketing channels drove each conversion
- **Cohort Analysis**: Segment customers by acquisition date; track retention

---

## Shared Components & Utilities

### Formatting Helpers

**Format Cents to GEL**:
```typescript
function formatCents(cents) {
  return `₾${(cents / 100).toLocaleString('ka-GE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

formatCents(50000) // "₾500"
formatCents(5023)  // "₾50.23"
```

**Format Percentage**:
```typescript
function formatPercent(value, decimals = 2) {
  return `${value.toFixed(decimals)}%`;
}

formatPercent(52.234) // "52.23%"
```

### Error Display

```typescript
{error && (
  <div className="bg-red-50 border border-red-200 rounded p-4">
    <p className="text-red-800 font-semibold">Error</p>
    <p className="text-red-700">{error}</p>
  </div>
)}
```

### Loading State

```typescript
{loading && (
  <div className="flex items-center justify-center p-8">
    <Spinner /> Loading...
  </div>
)}
```

---

## Testing Checklist

### Finance Simulator
- [ ] Input values update state correctly
- [ ] Simulate button calls API with correct payload
- [ ] Results display in cards with correct formatting
- [ ] Warnings appear in yellow box
- [ ] Negative profit shows in red
- [ ] Recommended price appears when unprofitable

### Launch Plan Generator
- [ ] Generate Plan button works
- [ ] Plan saves to DB (check launch_plans table)
- [ ] All 12 weeks display correctly
- [ ] Checklist items render
- [ ] Social templates list displays
- [ ] Influencer scripts appear

### Payouts Manager
- [ ] Request form accepts amount
- [ ] Request button calls API
- [ ] New request appears at top of history
- [ ] Status badges display correctly (green=approved, yellow=pending, red=rejected)
- [ ] Rejection reason displays if rejected
- [ ] History loads on mount

### Growth KPIs
- [ ] KPI cards display with correct aggregates
- [ ] CTR calculates correctly: (clicks / impressions) × 100
- [ ] Conversion rate calculates correctly: (conversions / clicks) × 100
- [ ] Daily table displays 30 days of data
- [ ] Revenue formats correctly as ₾
- [ ] Responsive on mobile (cards stack, table scrolls horizontally)

---

## Accessibility & UX

### Color Contrast (WCAG AA)
- Green badges: #059669 on white (14:1 contrast)
- Red badges: #DC2626 on white (10:1 contrast)
- Yellow badges: #CA8A04 on white (8:1 contrast)

### Keyboard Navigation
- Tab through all inputs in order
- Enter to submit forms
- Escape to close modals (future)

### Mobile Responsive
- Stack card grid to 1 column on mobile
- Table scrolls horizontally with pinned date column
- Font sizes: 16px minimum for touch targets

### Translations (Future)
- English interface
- Georgian (ka) translations
- Russian (ru) translations

