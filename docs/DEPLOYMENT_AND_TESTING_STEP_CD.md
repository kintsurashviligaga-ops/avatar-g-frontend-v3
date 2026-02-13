# Step C & D: Deployment & Testing Guide

## Pre-Deployment Checklist

### Code Quality

- [ ] TypeScript typecheck passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint` (ignore pre-existing errors per requirements)
- [ ] Unit tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in development: `npm run dev`

### Security Review

- [ ] ✅ No secrets or API keys in client code
- [ ] ✅ All money calculations server-side (no price sent from client)
- [ ] ✅ Zod validates all POST/GET payloads
- [ ] ✅ RLS enforced (store ownership verified)
- [ ] ✅ Admin endpoints check role before allowing action
- [ ] ✅ Error messages don't leak sensitive info (e.g., "User not found" instead of email)

### Database

- [ ] ✅ All tables created (via migrations from Step A)
- [ ] ✅ RLS policies enabled on all tables
- [ ] ✅ Foreign keys set up correctly (store_id, user_id)
- [ ] ✅ Indexes exist for common queries (store_id, user_id, created_at)

### API Routes

- [ ] ✅ 9 routes implemented and tested locally
- [ ] ✅ Each route has Zod validation
- [ ] ✅ Each route returns consistent error format
- [ ] ✅ Rate limiting ready (future: implement)

### Dashboard UI

- [ ] ✅ 4 components responsive on mobile
- [ ] ✅ All components handle loading/error states
- [ ] ✅ No console warnings
- [ ] ✅ Accessibility features working (keyboard nav, color contrast)

---

## Local Testing

### 1. TypeScript Compilation

```bash
npm run typecheck
```

**Expected Output**:
```
✓ No errors
```

**If Fails**:
- Check for missing types in routes
- Verify Zod schema matches types
- Run `npm install` to ensure dependencies are up-to-date

### 2. Unit Tests

```bash
npm test -- __tests__/finance/ --coverage
npm test -- __tests__/decision-engine/ --coverage
```

**Expected**:
- Finance tests: 4+ test suites, 12+ tests ✓
- Decision engine tests: 1 test suite, 8 tests ✓
- Coverage: > 80% for /lib/finance and /lib/decision-engine

**If Fails**:
- Review test output to see which assertions failed
- Check if finance.ts and decisionEngine.ts match test expectations
- Verify money.ts (roundToNearest, percentageOf) implementation

### 3. Build

```bash
npm run build
```

**Expected Output**:
```
✓ Next.js 14.2.35 Creating an optimized production build
✓ Compiled successfully
✓ Linting and checking validity of types ...
✓ Collecting build traces ...
✓ Finalizing bundle ...
✓ Route (app)                                     ...
```

**If Fails**:
- Run `rm -r .next` to clear cache (Windows: `rd /s .next`)
- Check for TypeScript errors: Open Problems panel (Ctrl+Shift+M)
- Verify all imports are correct

### 4. Local Development Server

```bash
npm run dev
```

**Expected**: Server starts on http://localhost:3000

**Test Route**:
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

**Expected Response**:
```json
{
  "data": {
    "net_per_order_cents": 5223,
    "margin_bps": 5223,
    "margin_percent": 52.23,
    "daily_profit_cents": 52230,
    "monthly_profit_cents": 1566900,
    "break_even_orders_per_day": 0,
    "warnings": []
  }
}
```

### 5. Manual UI Testing

#### Finance Simulator Page

1. Navigate to: http://localhost:3000/dashboard/shop/finance
2. Fill inputs:
   - Retail Price: 100 (displays as ₾100)
   - Supplier Cost: 20
   - Shipping Cost: 5
   - Platform Fee: 5%
   - Orders/Day: 10
3. Click "Simulate"
4. Verify results display:
   - Net per order: ₾52.23 (or similar)
   - Margin %: ~52%
   - Daily Profit: ₾523 (approx)
5. Try unprofitable scenario:
   - Retail: 100, Supplier: 90 → Should show negative profit (red)

#### Launch Plan Page

1. Navigate to: http://localhost:3000/dashboard/shop/launch
2. Click "Generate Plan"
3. Verify plan displays:
   - Checklist with 4 items
   - First 4 weeks with tasks
   - Social templates section
   - Influencer scripts section

#### Payouts Page

1. Navigate to: http://localhost:3000/dashboard/shop/payouts
2. Enter amount: 500
3. Click "Request"
4. Verify:
   - Success message (or error if validation fails)
   - New request appears in history table
   - Status badge shows "Pending"

#### Growth KPIs Page

1. Navigate to: http://localhost:3000/dashboard/marketplace/growth
2. Verify:
   - 6 KPI cards display (Impressions, Clicks, Conversions, Revenue, CTR, Conv. Rate)
   - Numbers are realistic (impressions > clicks > conversions)
   - Revenue formatted as ₾
   - Daily table shows 30 rows (or fewer if less data)

---

## Integration Testing (cURL/Postman)

### Finance Simulation

**Request**:
```bash
curl -X POST http://localhost:3000/api/finance/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "retail_price_cents": 10000,
    "supplier_cost_cents": 2000,
    "shipping_cost_cents": 500,
    "vat_enabled": true,
    "platform_fee_bps": 500,
    "affiliate_bps": 1000,
    "expected_orders_per_day": 10
  }'
```

**Verify**:
- ✓ Returns 200 OK
- ✓ net_per_order_cents > 0 (for this profitable scenario)
- ✓ margin_percent between 0-100
- ✓ daily_profit_cents = (net_per_order × 10) - ad_spend

### Decision Engine

**Request (Profitable)**:
```bash
curl -X POST http://localhost:3000/api/decision/evaluate \
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

**Expected**:
```json
{
  "data": {
    "decision": "publish",
    "reasons": [],
    "warnings": [],
    "computed": { /* margin data */ },
    "recommended_price_cents": null
  }
}
```

**Request (Unprofitable)**:
```bash
curl -X POST http://localhost:3000/api/decision/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "product_type": "standard",
    "retail_price_cents": 5000,
    "supplier_cost_cents": 4000,
    "shipping_cost_cents": 500,
    "vat_enabled": true,
    "platform_fee_bps": 500
  }'
```

**Expected**:
```json
{
  "data": {
    "decision": "reject",
    "reasons": [
      "Margin 4% is below standard minimum 15%"
    ],
    "warnings": [],
    "computed": { /* low margin */ },
    "recommended_price_cents": 7500
  }
}
```

### Launch Plan Generation

**Request** (requires auth token):
```bash
curl -X POST http://localhost:3000/api/launch/generate \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Expected**: 200 OK with plan data (weeks, checklist, templates, scripts)

### KPIs Retrieval

**Request**:
```bash
curl "http://localhost:3000/api/marketplace/kpis?storeId=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $YOUR_TOKEN"
```

**Expected**: 200 OK with KPI data and aggregates

---

## Staging Deployment

### Prerequisites

- [ ] Supabase staging project set up
- [ ] Environment variables configured (.env.local)
- [ ] Database migrations run on staging
- [ ] RLS policies enabled

### Deployment Steps

```bash
# 1. Build production bundle
npm run build

# 2. Export to static (if using static export)
npm run export

# 3. Deploy to Vercel (if using Vercel)
vercel --prod --env production

# OR deploy to AWS/GCP/self-hosted
# (Platform-specific deployment commands)
```

### Post-Deployment Verification

```bash
# 1. Test finance simulation endpoint
curl -X POST https://staging.example.com/api/finance/simulate \
  -H "Content-Type: application/json" \
  -d '{"retail_price_cents": 10000, ...}'

# 2. Test authenticated endpoints
curl -X POST https://staging.example.com/api/launch/generate \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -d '{"store_id": "..."}'

# 3. Verify UI loads
# Visit https://staging.example.com/dashboard/shop/finance in browser

# 4. Check logs for errors
# Review deployment platform's error logs
```

---

## Production Deployment

### Pre-Production Checks

- [ ] Security audit passed (no secrets in environment, RLS enforced)
- [ ] Load testing completed (simulate 100+ concurrent users)
- [ ] Failover/backup procedures documented
- [ ] Rollback procedure tested
- [ ] Monitoring & alerting set up

### Monitoring & Alerts

**Key Metrics to Monitor**:
- API response times (target: < 500ms)
- Error rates (target: < 0.1%)
- Database query times (target: < 100ms)
- Server resource usage (CPU, memory, disk)

**Alerts to Set Up**:
- API errors spike (> 1% error rate)
- Database connection pool exhausted
- Deployment failure
- Zod validation errors spike (potential data integrity issue)

### Rollback Plan

If deployment fails:

```bash
# 1. Identify issue from logs
# 2. Verify rollback version
# 3. Deploy previous stable version
vercel rollback

# 4. Verify rollback succeeded
curl https://example.com/api/finance/simulate

# 5. Post-mortem: Why did new code fail?
```

---

## Ongoing Maintenance

### Weekly

- [ ] Review error logs for new patterns
- [ ] Check database query performance
- [ ] Monitor payout processing success rate

### Monthly

- [ ] Review API usage (which endpoints used most?)
- [ ] Update decision engine thresholds if needed (based on product data)
- [ ] Analyze decision rejection rate (too high? too low?)

### Quarterly

- [ ] Review and update financial formulas if exchange rates change
- [ ] Gather merchant feedback on dashboard UX
- [ ] Plan feature enhancements (e.g., multi-currency support, seasonal adjustments)

---

## Troubleshooting

### Build Fails with "Module not found"

**Solution**:
```bash
npm install
npm run build
```

### TypeScript Errors on Deploy

**Solution**:
```bash
npm run typecheck
# Fix errors, then deploy
```

### API Route Returns 500

**Solution**:
1. Check server logs for stack trace
2. Verify Supabase connection string
3. Check RLS policies (Store must exist for user)
4. Test route locally with `npm run dev`

### Dashboard Doesn't Load Data

**Solution**:
1. Check browser console for fetch errors
2. Verify authentication token is valid
3. Check API response status (should be 200)
4. Verify store exists and user owns it

### Decision Engine Always Rejects

**Solution**:
1. Verify thresholds match product type (standard=15%, dropshipping=25%, digital=70%)
2. Check margin calculation: Is margin_bps < threshold_bps?
3. Console.log margin values to debug
4. Test with profitable scenario (retail=10000, cost=2000, shipping=500)

### Payout Request Returns 404

**Solution**:
1. Verify store_id exists in stores table
2. Verify user owns that store (check profiles.user_id)
3. Verify user is authenticated (Authorization header present)

---

## Performance Optimization

### Caching Strategy

**Query Results to Cache**:
- `GET /api/marketplace/kpis` (cache 1 hour; KPIs update daily)
- `GET /api/launch/plan` (cache 24 hours; plan rarely changes)
- `GET /api/payouts/history` (cache 1 hour; minimal change frequency)

**Implementation** (Future):
```typescript
const response = await fetch(url, {
  next: { revalidate: 3600 } // ISR: revalidate every hour
});
```

### Database Indexes

**Create These Indexes** (if not already present):

```sql
-- Speed up store lookups
CREATE INDEX idx_stores_user_id ON stores(user_id);

-- Speed up payout history queries
CREATE INDEX idx_payout_requests_store_id ON payout_requests(store_id);
CREATE INDEX idx_payout_requests_created_at ON payout_requests(created_at DESC);

-- Speed up KPI aggregation
CREATE INDEX idx_growth_kpis_store_id_date ON growth_kpis(store_id, date DESC);

-- Speed up launch plan retrieval
CREATE INDEX idx_launch_plans_store_id ON launch_plans(store_id);
```

### CDN Configuration

All static assets (CSS, images, fonts) should be served from CDN for:
- Faster delivery globally
- Reduced server load
- Better user experience

---

## Feature Flags (Future)

For gradual rollout of features:

```typescript
const features = {
  DECISION_ENGINE_ENABLED: true,
  LAUNCH_PLAN_ENABLED: true,
  PAYOUTS_ENABLED: false, // Coming soon
  AUTO_PAYOUT_ENABLED: false, // Coming soon
};

if (!features.PAYOUTS_ENABLED) {
  return NextResponse.json(
    { error: 'Payouts not yet available' },
    { status: 503 }
  );
}
```

---

## Documentation Updates

After deployment, keep these docs current:

- [ ] API_ROUTES_STEP_C.md (if endpoints change)
- [ ] DASHBOARD_UI_STEP_D.md (if UI components change)
- [ ] DECISION_ENGINE.md (if thresholds change)
- [ ] FINANCE_SIMULATION.md (if formulas change)

---

## Success Criteria

✅ **Step C/D is production-ready when**:

1. All 9 API routes respond correctly to valid/invalid inputs
2. All 4 dashboard components display correctly and update data
3. TypeScript typecheck passes (0 errors from our changes)
4. Unit tests pass (finance + decision-engine)
5. Security audit complete (no secrets, RLS enforced, Zod validated)
6. Performance tests pass (< 500ms response time for all routes)
7. Merchant can: simulate, evaluate, plan launch, request payouts, and view KPIs
8. Admin can: approve/reject payouts with proper role checks

---

