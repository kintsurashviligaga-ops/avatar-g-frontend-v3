# 🚀 AVATAR G SELLER GROWTH SYSTEM - IMPLEMENTATION PLAN

**Status:** IN PROGRESS  
**Target:** Production-Grade Georgian Commerce Platform  
**Stack:** Next.js 14 + Supabase + Stripe Live + AI

---

## REPOSITORY SCAN RESULTS

### ✅ Existing Infrastructure (Strong Foundation)
```
/lib/finance/          - Complete margin/VAT calculation system
/lib/pricing/          - Auto-margin guard & dynamic pricing
/lib/commerce/         - Order, wallet, shipping types
/lib/stripe/           - Stripe integration
/lib/decision-engine/  - Decision logic framework
/messages/ka.json      - Georgian i18n already configured
/app/dashboard/        - Dashboard structure exists
/app/admin/            - Admin routes exist
```

### ⚠️ Gaps to Fill (New Implementation Required)
```
❌ /app/seller/*               - Seller funnel UI (NEW)
❌ /lib/onboarding/            - Automation engine (NEW)
❌ /lib/pricing/georgiaStrategy.ts - Georgia-specific pricing (NEW)
❌ /app/dashboard/seller       - Seller KPI dashboard (NEW)
❌ /app/dashboard/admin        - Admin KPI dashboard (ENHANCE)
❌ /app/growth/                - Growth automation tools (NEW)
❌ /app/dashboard/forecast     - Revenue forecast system (NEW)
❌ Georgian UI strings         - Seller-specific messages (EXTEND)
```

---

## PHASED IMPLEMENTATION PLAN

### 📋 PHASE 1: SELLER FUNNEL UI (Routes + Components)
**Priority:** CRITICAL  
**Estimated Time:** 2-3 hours  

#### Tasks:
1. Create **`/app/seller/start/page.tsx`** - Landing page
   - Georgian headline: "არ გაყიდო არამომგებიანი პროდუქტი"
   - CTA button: "დაიწყე მოგების სიმულაცია"
   - Professional SaaS design

2. Create **`/app/seller/onboarding/page.tsx`** - Business profile
   - VAT toggle: ვარ დღგ გადამხდელი / არ ვარ
   - Business type selector
   - Target income input (₾)
   - Budget input (₾)
   - Form validation with Zod

3. Create **`/app/seller/simulation/page.tsx`** - AI simulation
   - Integrate with `/lib/finance/simulator.ts`
   - Display margin calculations
   - Show risk scoring
   - Break-even analysis
   - Margin < 20% → BLOCK with warning

4. Create **`/app/seller/activation/page.tsx`** - Final activation
   - Store creation
   - Stripe mode activation
   - Guardrails enable
   - Redirect to seller dashboard

#### Dependencies:
- `/lib/finance/margin.ts` ✅ (exists)
- `/lib/finance/vat.ts` ✅ (exists)
- `/lib/pricing/autoMarginGuard.ts` ✅ (exists)

---

### 📋 PHASE 2: ONBOARDING AUTOMATION ENGINE
**Priority:** CRITICAL  
**Estimated Time:** 1-2 hours

#### Tasks:
1. Create **`/lib/onboarding/automationEngine.ts`**
   ```typescript
   export async function runSellerOnboarding(userId: string) {
     // 1. Detect tax status
     // 2. Set VAT/Income mode
     // 3. Set margin floor (20%)
     // 4. Set target margin (30%)
     // 5. Enable dynamic pricing
     // 6. Enable break-even monitoring
     // 7. Enable risk scoring
     // 8. Generate pricing recommendation
     // 9. Generate GTM plan
     // 10. Log to onboarding_events table
   }
   ```

2. Create **`/lib/onboarding/types.ts`**
   - OnboardingProfile interface
   - OnboardingEvent interface
   - OnboardingResult interface

3. Create Supabase migration for **`onboarding_events`** table
   - user_id, event_type, metadata, status, created_at

#### Dependencies:
- `/lib/finance/*` ✅ (exists)
- `/lib/pricing/*` ✅ (exists)
- Supabase client ✅ (exists)

---

### 📋 PHASE 3: SELLER KPI DASHBOARD
**Priority:** HIGH  
**Estimated Time:** 2-3 hours

#### Tasks:
1. Create **`/app/dashboard/seller/page.tsx`**
   - Widget: დღევანდელი გაყიდვები (Today's Sales)
   - Widget: სუფთა მოგება (Net Profit)
   - Widget: დღგ გადასახდელი (VAT Payable)
   - Widget: Break-even პროგნოზი
   - Widget: Risk ინდიკატორი
   - Widget: რეკომენდირებული ფასი

2. Create **`/components/dashboard/SellerWidgets.tsx`**
   - Reusable widget components
   - Chart components (Revenue trend, Margin stability, CAC vs LTV)
   - Alert banner (margin < 20%)

3. Add **API routes**:
   - `/api/seller/kpi` - Fetch seller metrics
   - `/api/seller/alerts` - Check margin violations

#### Dependencies:
- Chart library (recharts or similar) - Check if exists
- `/lib/finance/*` for calculations ✅

---

### 📋 PHASE 4: ADMIN KPI DASHBOARD
**Priority:** HIGH  
**Estimated Time:** 2 hours

#### Tasks:
1. Enhance **`/app/dashboard/admin/page.tsx`**
   - Total GMV metric
   - Active sellers count
   - Platform revenue
   - Margin compliance %
   - LTV/CAC ratio
   - Bank payout ratio

2. Create **`/api/admin/health-check/route.ts`**
   - Stripe webhook health
   - Margin violations monitor
   - Payout queue status
   - Tax mode distribution

3. Add real-time monitoring widgets

#### Dependencies:
- Admin authentication ✅
- Supabase RLS policies ✅

---

### 📋 PHASE 5: GEORGIA PRICING STRATEGY ENGINE
**Priority:** HIGH  
**Estimated Time:** 1-2 hours

#### Tasks:
1. Create **`/lib/pricing/georgiaStrategy.ts`**
   ```typescript
   export enum PricingMode {
     GROWTH = 'growth',
     PROFIT = 'profit',
     HYBRID = 'hybrid'
   }

   export function recommendPricingMode(ltv: number, cac: number) {
     const ratio = ltv / cac;
     if (ratio < 1.5) return PricingMode.GROWTH;
     if (ratio > 2.5) return PricingMode.PROFIT;
     return PricingMode.HYBRID;
   }

   export function calculateGeorgianPlatformFee(mode: PricingMode) {
     // Standard: 5%, Premium: 7%, Enterprise: custom
   }
   ```

2. Integrate with existing **`/lib/pricing/dynamicPricing.ts`**
3. All calculations use integer cents (no floats)

#### Dependencies:
- `/lib/finance/money.ts` ✅ (already uses cents)

---

### 📋 PHASE 6: GEORGIAN LOCALIZATION (UI STRINGS)
**Priority:** HIGH  
**Estimated Time:** 1 hour

#### Tasks:
1. Extend **`/messages/ka.json`** with seller strings:
   ```json
   {
     "seller": {
       "funnel": {
         "headline": "არ გაყიდო არამომგებიანი პროდუქტი",
         "cta": "დაიწყე მოგების სიმულაცია",
         "vat_payer": "ვარ დღგ გადამხდელი",
         "non_vat": "არ ვარ დღგ გადამხდელი",
         "business_type": "ბიზნესის ტიპი",
         "target_income": "სამიზნე შემოსავალი (₾)",
         "budget": "ბიუჯეტი (₾)"
       },
       "dashboard": {
         "nav": "მთავარი პანელი",
         "products": "პროდუქტები",
         "finance": "ფინანსები",
         "orders": "შეკვეთები",
         "payouts": "გადახდები",
         "analytics": "ანალიტიკა",
         "settings": "პარამეტრები"
       },
       "metrics": {
         "today_sales": "დღევანდელი გაყიდვები",
         "net_profit": "სუფთა მოგება",
         "vat_payable": "დღგ გადასახდელი",
         "breakeven": "Break-even პროგნოზი",
         "risk": "Risk ინდიკატორი",
         "recommended_price": "რეკომენდირებული ფასი"
       },
       "actions": {
         "simulate": "მოგების გამოთვლა",
         "activate_vat": "დღგ რეჟიმის ჩართვა",
         "request_payout": "გადახდის მოთხოვნა",
         "launch_product": "პროდუქტის გაშვება"
       }
     }
   }
   ```

2. Create **`/lib/i18n/sellerMessages.ts`** - Type-safe i18n hooks

#### Dependencies:
- next-intl ✅ (already configured)

---

### 📋 PHASE 7: GROWTH AUTOMATION TOOLS
**Priority:** MEDIUM  
**Estimated Time:** 2 hours

#### Tasks:
1. Create **`/app/growth/outreach/page.tsx`**
   - DM script generator
   - TikTok script generator
   - Email outreach template
   - Affiliate referral system

2. Create **`/lib/growth/scriptGenerator.ts`**
   - Template engine for Georgian market
   - CAC tracking integration
   - Referral link generation

3. Add **`/api/growth/analytics/route.ts`**
   - Track CAC
   - Track referral conversions

#### Dependencies:
- UTM parameter tracking
- Analytics system

---

### 📋 PHASE 8: REVENUE FORECAST SYSTEM
**Priority:** MEDIUM  
**Estimated Time:** 2-3 hours

#### Tasks:
1. Create **`/app/dashboard/forecast/page.tsx`**
   - Month 1, 3, 6 projections
   - GMV forecast
   - Revenue forecast
   - Net profit projection
   - LTV/CAC trends
   - Break-even timeline

2. Create **`/lib/forecast/revenueProjection.ts`**
   ```typescript
   export function forecastRevenue(
     currentGMV: number,
     growthRate: number,
     monthsAhead: number
   ) {
     // Exponential growth projection
     // Account for seasonality
     // Include margin degradation
   }
   ```

3. Integrate with:
   - `/lib/pricing/autoMarginGuard.ts` ✅
   - `/lib/finance/margin.ts` ✅
   - Tax mode calculations

#### Dependencies:
- Historical data from orders table

---

### 📋 PHASE 9: FINANCIAL GUARDRAILS
**Priority:** CRITICAL  
**Estimated Time:** 1 hour (Validation)

#### Tasks:
1. **Verify existing guardrails:**
   - ✅ Integer cents only (`/lib/finance/money.ts`)
   - ✅ VAT server-side (`/lib/finance/vat.ts`)
   - ✅ Margin floor enforcement (`/lib/pricing/autoMarginGuard.ts`)
   - ✅ Zod validation (check all API routes)
   - ✅ RLS enabled (Supabase policies)

2. **Add missing guardrails:**
   - Stripe webhook idempotency keys
   - Immutable invoice records
   - Audit logging on payments
   - No client secret exposure

3. Create **`/lib/security/guardrails.ts`**
   - Centralized security checks
   - Audit log helper functions

#### Dependencies:
- All existing finance/pricing modules

---

## IMPLEMENTATION ORDER (OPTIMIZED)

### Sprint 1: Core Seller Experience (4-5 hours)
1. ✅ Phase 1: Seller Funnel UI
2. ✅ Phase 2: Onboarding Automation
3. ✅ Phase 6: Georgian Localization

### Sprint 2: KPI & Analytics (3-4 hours)
4. ✅ Phase 3: Seller Dashboard
5. ✅ Phase 4: Admin Dashboard
6. ✅ Phase 8: Revenue Forecast

### Sprint 3: Strategy & Growth (3-4 hours)
7. ✅ Phase 5: Pricing Strategy
8. ✅ Phase 7: Growth Tools
9. ✅ Phase 9: Security Validation

---

## DATABASE SCHEMA ADDITIONS

### New Tables Required:
```sql
-- Onboarding events tracking
CREATE TABLE onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL, -- pending, completed, failed
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller profiles (extend existing users)
CREATE TABLE seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  tax_status TEXT NOT NULL, -- vat_payer, non_vat_payer
  business_type TEXT NOT NULL, -- dropshipping, own_product, digital
  target_monthly_income_cents INTEGER NOT NULL,
  available_budget_cents INTEGER NOT NULL,
  pricing_mode TEXT DEFAULT 'hybrid', -- growth, profit, hybrid
  margin_floor_bps INTEGER DEFAULT 2000, -- 20%
  margin_target_bps INTEGER DEFAULT 3000, -- 30%
  guardrails_enabled BOOLEAN DEFAULT true,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Growth tracking
CREATE TABLE growth_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_type TEXT NOT NULL, -- dm, tiktok, email, referral
  script_content TEXT,
  cac_target_cents INTEGER,
  conversions INTEGER DEFAULT 0,
  total_reach INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue forecasts (cached)
CREATE TABLE revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  forecast_month INTEGER NOT NULL, -- 1, 3, 6
  gmv_projection_cents INTEGER NOT NULL,
  revenue_projection_cents INTEGER NOT NULL,
  net_profit_projection_cents INTEGER NOT NULL,
  ltv_cac_ratio NUMERIC(10,2),
  confidence_score NUMERIC(3,2), -- 0.00-1.00
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies:
```sql
-- Seller profiles: users can only see their own
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_profiles_select ON seller_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Admin can see all
CREATE POLICY seller_profiles_admin ON seller_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' = 'admin'
    )
  );
```

---

## TESTING CHECKLIST

### Unit Tests:
- [ ] Margin calculations (integer cents)
- [ ] VAT calculations (Georgia rates)
- [ ] Pricing strategy logic
- [ ] Revenue forecast accuracy
- [ ] Onboarding automation flow

### Integration Tests:
- [ ] Seller funnel end-to-end
- [ ] Stripe webhook handling
- [ ] Dashboard KPI calculations
- [ ] Georgian i18n rendering

### Manual QA:
- [ ] Full seller journey (start → activation)
- [ ] Margin < 20% blocking
- [ ] VAT toggle behavior
- [ ] Dashboard live data
- [ ] Admin monitoring

### Build Verification:
```bash
npm run typecheck  # 0 TypeScript errors
npm run build      # Successful production build
npm test           # All tests pass
```

---

## SUCCESS CRITERIA

✅ **Seller Experience:** Complete funnel from landing → activation  
✅ **AI Automation:** Onboarding engine configures seller automatically  
✅ **KPI Visibility:** Real-time dashboards for seller + admin  
✅ **Georgian UX:** 100% localized UI strings  
✅ **Financial Safety:** Margin floor enforced, no floats, VAT correct  
✅ **Growth Tools:** Outreach automation + CAC tracking  
✅ **Forecasting:** 6-month revenue projections  
✅ **Production Ready:** 0 build errors, all tests pass  

---

## ESTIMATED TOTAL TIME: 10-12 hours

**Status:** Ready to execute Phase 1  
**Next Action:** Create `/app/seller/start/page.tsx`
