# 📈 AVATAR G: 6-MONTH REVENUE FORECAST MODEL

**Date**: February 13, 2026  
**Model Version**: 1.0  
**Purpose**: Financial projection for investor/founder decision-making

---

## 🎯 MODEL ASSUMPTIONS

### Market Context

**Georgian E-commerce Market**:
- Population: 3.7M (1M in Tbilisi)
- Internet penetration: 82%
- E-commerce adoption: ~15% (growing 25% YoY)
- Average order value: ₾50-150 ($18-55)
- Mobile-first: 78% of transactions

**Avatar G Target Market**:
- Micro-entrepreneurs (freelancers, students, stay-at-home parents)
- No existing online presence
- Product sourcing: AliExpress, local wholesale, handmade
- Tech-savvy but not developers
- Average age: 22-35

### Financial Model Foundation

**Money Model**: Integer cents (₾1 = 100 cents)  
**Platform Fee Structure**:
- **Profit Mode**: 3% of GMV + 2% payment processing
- **Volume Mode**: 7.5% of GMV + 2% payment processing
- **Hybrid Mode**: 5% of GMV + 2% payment processing

**Cost Structure**:
```typescript
interface PlatformCosts {
  // Fixed Monthly Costs
  hosting_cents: 50000;              // ₾500/mo (Vercel Pro + Supabase Pro)
  domain_ssl_cents: 3000;            // ₾30/mo
  monitoring_cents: 10000;           // ₾100/mo (Sentry, analytics)
  bank_integration_cents: 20000;     // ₾200/mo (BoG/TBC fees)
  
  // Variable Costs (per transaction)
  stripe_fee_bps: 290;               // 2.9% + ₾0.30
  stripe_fixed_cents: 30;
  sms_verification_cents: 10;
  email_notifications_cents: 1;
  
  // Marketing Costs (scalable)
  cac_target_cents: 700;             // ₾7 per seller acquired
  monthly_marketing_budget_cents: number; // Variable by phase
  
  // Team Costs (Phase dependent)
  founder_salary_cents: 0;           // Months 1-3: sweat equity
  developer_salary_cents: 0;         // Month 4+: ₾2,000/mo
  support_salary_cents: 0;           // Month 5+: ₾1,000/mo
}
```

---

## 📊 SCENARIO 1: CONSERVATIVE (Survival Path)

### Overview

**Philosophy**: Worst-case scenario planning  
**Assumptions**:
- Slow seller acquisition
- Low conversion rates
- High churn (30% monthly)
- Minimal viral growth
- High CAC (₾10/seller)

---

### Month 1: Beta Launch

```typescript
const month1Conservative: MonthlyProjection = {
  // Seller Metrics
  active_sellers: 10,
  new_sellers: 10,
  churned_sellers: 0,
  retention_rate: 1.0,
  
  // Product Metrics
  avg_products_per_seller: 3,
  total_products: 30,
  
  // Revenue Metrics
  avg_orders_per_seller: 8,
  total_orders: 80,
  avg_order_value_cents: 7000,        // ₾70
  gmv_cents: 560000,                  // ₾5,600
  conversion_rate: 0.015,             // 1.5%
  
  // Platform Revenue
  avg_platform_fee_bps: 500,          // 5% (hybrid mode)
  platform_fee_revenue_cents: 28000,  // ₾280
  payment_processing_fee_cents: 11200,// ₾112 (2% of GMV)
  total_platform_revenue_cents: 39200,// ₾392
  
  // Costs
  fixed_costs_cents: 83000,           // ₾830
  variable_costs_cents: 19000,        // ₾190 (Stripe + ops)
  marketing_costs_cents: 100000,      // ₾1,000 (10 sellers x ₾10 CAC)
  total_costs_cents: 202000,          // ₾2,020
  
  // Profitability
  gross_profit_cents: 20200,          // ₾202
  net_profit_cents: -162800,          // -₾1,628 LOSS
  profit_margin: -4.15,
  
  // Cash Flow
  cash_in_cents: 39200,
  cash_out_cents: 202000,
  net_cash_flow_cents: -162800,
  cumulative_cash_cents: -162800,
  
  // Unit Economics
  ltv_cents: 5000,                    // ₾50 (conservative 6-month LTV)
  cac_cents: 1000,                    // ₾10
  ltv_cac_ratio: 0.5,                 // ❌ Below target (3.0)
  
  // Health Metrics
  refund_rate: 0.08,                  // 8% (high initially)
  payment_failure_rate: 0.07,         // 7%
  avg_seller_profit_cents: 22400      // ₾224 avg profit/seller
};
```

**Key Insights**:
- ❌ **Unprofitable** (-₾1,628)
- ❌ **LTV:CAC < 1** (0.5x - unsustainable)
- ⚠️ High refund rate (8%)
- ✅ Platform functional

---

### Month 2: Stabilization

```typescript
const month2Conservative: MonthlyProjection = {
  active_sellers: 15,                 // +5 (50% growth MoM)
  new_sellers: 8,
  churned_sellers: 3,                 // 30% churn
  retention_rate: 0.7,
  
  avg_products_per_seller: 4,
  total_products: 60,
  
  avg_orders_per_seller: 12,
  total_orders: 180,
  avg_order_value_cents: 7500,
  gmv_cents: 1350000,                 // ₾13,500
  conversion_rate: 0.018,             // 1.8% (improving)
  
  platform_fee_revenue_cents: 67500,  // ₾675
  payment_processing_fee_cents: 27000,
  total_platform_revenue_cents: 94500,// ₾945
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 45000,
  marketing_costs_cents: 80000,       // ₾800 (8 sellers x ₾10)
  total_costs_cents: 208000,
  
  gross_profit_cents: 49500,
  net_profit_cents: -113500,          // -₾1,135 LOSS
  profit_margin: -1.20,
  
  cash_in_cents: 94500,
  cash_out_cents: 208000,
  net_cash_flow_cents: -113500,
  cumulative_cash_cents: -276300,     // -₾2,763 cumulative
  
  ltv_cents: 6000,
  cac_cents: 1000,
  ltv_cac_ratio: 0.6,
  
  refund_rate: 0.06,
  payment_failure_rate: 0.05,
  avg_seller_profit_cents: 36000
};
```

**Key Insights**:
- ❌ Still unprofitable (-₾1,135)
- ❌ Cumulative loss: -₾2,763
- ⚠️ Churn high (30%)
- ↗️ GMV growing (+141%)

---

### Month 3: First Profitability Attempt

```typescript
const month3Conservative: MonthlyProjection = {
  active_sellers: 20,
  new_sellers: 10,
  churned_sellers: 5,
  retention_rate: 0.75,               // Churn improving
  
  avg_products_per_seller: 5,
  total_products: 100,
  
  avg_orders_per_seller: 15,
  total_orders: 300,
  avg_order_value_cents: 8000,
  gmv_cents: 2400000,                 // ₾24,000
  conversion_rate: 0.02,              // 2%
  
  platform_fee_revenue_cents: 120000, // ₾1,200
  payment_processing_fee_cents: 48000,
  total_platform_revenue_cents: 168000,// ₾1,680
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 75000,
  marketing_costs_cents: 100000,      // ₾1,000
  total_costs_cents: 258000,
  
  gross_profit_cents: 93000,
  net_profit_cents: -90000,           // -₾900 LOSS
  profit_margin: -0.54,
  
  cash_in_cents: 168000,
  cash_out_cents: 258000,
  net_cash_flow_cents: -90000,
  cumulative_cash_cents: -366300,     // -₾3,663 cumulative
  
  ltv_cents: 7000,
  cac_cents: 1000,
  ltv_cac_ratio: 0.7,
  
  refund_rate: 0.05,
  payment_failure_rate: 0.04,
  avg_seller_profit_cents: 48000
};
```

**Key Insights**:
- ❌ Still losing money (-₾900)
- ⚠️ Cumulative loss: -₾3,663
- ↗️ Revenue doubling monthly
- ⏳ Break-even visible (Month 4-5)

---

### Month 4: Break-Even

```typescript
const month4Conservative: MonthlyProjection = {
  active_sellers: 28,                 // +8 (40% growth slowing)
  new_sellers: 12,
  churned_sellers: 4,
  retention_rate: 0.85,               // Churn stabilizing
  
  avg_products_per_seller: 5,
  total_products: 140,
  
  avg_orders_per_seller: 18,
  total_orders: 504,
  avg_order_value_cents: 8500,
  gmv_cents: 4284000,                 // ₾42,840
  conversion_rate: 0.022,
  
  platform_fee_revenue_cents: 214200, // ₾2,142
  payment_processing_fee_cents: 85680,
  total_platform_revenue_cents: 299880,// ₾2,999
  
  fixed_costs_cents: 103000,          // +₾200 (added developer part-time)
  variable_costs_cents: 130000,
  marketing_costs_cents: 120000,
  total_costs_cents: 353000,
  
  gross_profit_cents: 169880,
  net_profit_cents: -53120,           // -₾531 LOSS (near break-even!)
  profit_margin: -0.18,
  
  cash_in_cents: 299880,
  cash_out_cents: 353000,
  net_cash_flow_cents: -53120,
  cumulative_cash_cents: -419420,     // -₾4,194 cumulative
  
  ltv_cents: 8000,
  cac_cents: 1000,
  ltv_cac_ratio: 0.8,
  
  refund_rate: 0.04,
  payment_failure_rate: 0.03,
  avg_seller_profit_cents: 61200
};
```

**Key Insights**:
-操作Break-even**ัน approaching (-₾531)
- ↗️ Revenue: ₾2,999
- ✅ Retention improving (85%)
- ⏳ Profitability in Month 5

---

### Month 5: First Profit

```typescript
const month5Conservative: MonthlyProjection = {
  active_sellers: 38,
  new_sellers: 14,
  churned_sellers: 4,
  retention_rate: 0.90,               // Good retention
  
  avg_products_per_seller: 6,
  total_products: 228,
  
  avg_orders_per_seller: 20,
  total_orders: 760,
  avg_order_value_cents: 9000,
  gmv_cents: 6840000,                 // ₾68,400
  conversion_rate: 0.025,
  
  platform_fee_revenue_cents: 342000, // ₾3,420
  payment_processing_fee_cents: 136800,
  total_platform_revenue_cents: 478800,// ₾4,788
  
  fixed_costs_cents: 283000,          // +₾1,800 (full dev + support)
  variable_costs_cents: 205000,
  marketing_costs_cents: 140000,
  total_costs_cents: 628000,
  
  gross_profit_cents: 273800,
  net_profit_cents: -149200,          // -₾1,492 LOSS (cost spike!)
  profit_margin: -0.31,
  
  cash_in_cents: 478800,
  cash_out_cents: 628000,
  net_cash_flow_cents: -149200,
  cumulative_cash_cents: -568620,     // -₾5,686 cumulative
  
  ltv_cents: 9000,
  cac_cents: 1000,
  ltv_cac_ratio: 0.9,
  
  refund_rate: 0.035,
  payment_failure_rate: 0.025,
  avg_seller_profit_cents: 72000
};
```

**Key Insights**:
- ❌ **Setback** due to team hiring
- ⚠️ Fixed costs jumped (+₾1,800)
- ↗️ Revenue strong (₾4,788)
- ⏳ Profitability delayed to Month 6

---

### Month 6: Profitability Achieved

```typescript
const month6Conservative: MonthlyProjection = {
  active_sellers: 50,
  new_sellers: 16,
  churned_sellers: 4,
  retention_rate: 0.92,
  
  avg_products_per_seller: 6,
  total_products: 300,
  
  avg_orders_per_seller: 22,
  total_orders: 1100,
  avg_order_value_cents: 9500,
  gmv_cents: 10450000,                // ₾104,500
  conversion_rate: 0.028,
  
  platform_fee_revenue_cents: 522500, // ₾5,225
  payment_processing_fee_cents: 209000,
  total_platform_revenue_cents: 731500,// ₾7,315
  
  fixed_costs_cents: 283000,
  variable_costs_cents: 315000,
  marketing_costs_cents: 160000,
  total_costs_cents: 758000,
  
  gross_profit_cents: 416500,
  net_profit_cents: -26500,           // -₾265 LOSS (almost there!)
  profit_margin: -0.04,
  
  cash_in_cents: 731500,
  cash_out_cents: 758000,
  net_cash_flow_cents: -26500,
  cumulative_cash_cents: -595120,     // -₾5,951 cumulative
  
  ltv_cents: 10000,
  cac_cents: 1000,
  ltv_cac_ratio: 1.0,                 // ✅ Reached 1:1
  
  refund_rate: 0.03,
  payment_failure_rate: 0.02,
  avg_seller_profit_cents: 83600
};
```

**Key Insights**:
- ⚠️ **Near break-even** (-₾265)
- ✅ LTV:CAC = 1.0 (improving)
- ↗️ GMV: ₾104,500
- 💡 Month 7 = profitable

---

### Conservative Scenario Summary

| Metric | Month 1 | Month 3 | Month 6 | Notes |
|--------|---------|---------|---------|-------|
| **Active Sellers** | 10 | 20 | 50 | Slow growth |
| **GMV** | ₾5,600 | ₾24,000 | ₾104,500 | 18x growth |
| **Platform Revenue** | ₾392 | ₾1,680 | ₾7,315 | 18.7x growth |
| **Net Profit** | -₾1,628 | -₾900 | -₾265 | Improving |
| **Cumulative Cash** | -₾1,628 | -₾3,663 | -₾5,951 | **Total investment needed** |
| **LTV:CAC** | 0.5x | 0.7x | 1.0x | Approaching viability |
| **Break-Even** | - | - | Month 7 | 1 month away |

**Investment Required**: ₾6,000 ($2,220) to reach profitability

---

## 🚀 SCENARIO 2: REALISTIC (Expected Path)

### Overview

**Philosophy**: Data-driven expected performance  
**Assumptions**:
- Moderate seller acquisition (25% MoM growth)
- Industry-standard conversion (2.5%)
- Normal churn (15% monthly)
- Organic referrals kick in Month 3
- CAC improves (₾7/seller by Month 6)

---

### Month 1: Strong Beta Launch

```typescript
const month1Realistic: MonthlyProjection = {
  active_sellers: 15,
  new_sellers: 15,
  churned_sellers: 0,
  retention_rate: 1.0,
  
  avg_products_per_seller: 4,
  total_products: 60,
  
  avg_orders_per_seller: 12,
  total_orders: 180,
  avg_order_value_cents: 8000,
  gmv_cents: 1440000,                 // ₾14,400
  conversion_rate: 0.02,
  
  platform_fee_revenue_cents: 72000,  // ₾720
  payment_processing_fee_cents: 28800,
  total_platform_revenue_cents: 100800,// ₾1,008
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 45000,
  marketing_costs_cents: 105000,      // 15 sellers x ₾7 CAC
  total_costs_cents: 233000,
  
  gross_profit_cents: 55800,
  net_profit_cents: -132200,          // -₾1,322 LOSS
  profit_margin: -1.31,
  
  cumulative_cash_cents: -132200,
  
  ltv_cents: 8000,
  cac_cents: 700,
  ltv_cac_ratio: 1.14,                // ✅ Above 1.0
  
  refund_rate: 0.05,
  payment_failure_rate: 0.05,
  avg_seller_profit_cents: 38400
};
```

---

### Month 2: Growth Accelerates

```typescript
const month2Realistic: MonthlyProjection = {
  active_sellers: 20,                 // +33% MoM
  new_sellers: 7,
  churned_sellers: 2,
  retention_rate: 0.87,
  
  avg_products_per_seller: 5,
  total_products: 100,
  
  avg_orders_per_seller: 16,
  total_orders: 320,
  avg_order_value_cents: 8500,
  gmv_cents: 2720000,                 // ₾27,200
  conversion_rate: 0.023,
  
  platform_fee_revenue_cents: 136000,
  payment_processing_fee_cents: 54400,
  total_platform_revenue_cents: 190400,// ₾1,904
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 85000,
  marketing_costs_cents: 49000,       // 7 sellers x ₾7
  total_costs_cents: 217000,
  
  gross_profit_cents: 105400,
  net_profit_cents: -26600,           // -₾266 LOSS
  profit_margin: -0.14,
  
  cumulative_cash_cents: -158800,
  
  ltv_cents: 9500,
  cac_cents: 700,
  ltv_cac_ratio: 1.36,
  
  refund_rate: 0.04,
  payment_failure_rate: 0.04,
  avg_seller_profit_cents: 54400
};
```

---

### Month 3: Break-Even Achieved

```typescript
const month3Realistic: MonthlyProjection = {
  active_sellers: 28,
  new_sellers: 10,
  churned_sellers: 2,
  retention_rate: 0.90,
  
  avg_products_per_seller: 6,
  total_products: 168,
  
  avg_orders_per_seller: 20,
  total_orders: 560,
  avg_order_value_cents: 9000,
  gmv_cents: 5040000,                 // ₾50,400
  conversion_rate: 0.025,
  
  platform_fee_revenue_cents: 252000,
  payment_processing_fee_cents: 100800,
  total_platform_revenue_cents: 352800,// ₾3,528
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 155000,
  marketing_costs_cents: 70000,
  total_costs_cents: 308000,
  
  gross_profit_cents: 197800,
  net_profit_cents: 44800,            // ₾448 PROFIT! ✅
  profit_margin: 0.13,
  
  cumulative_cash_cents: -114000,     // Still negative cumulative
  
  ltv_cents: 12000,
  cac_cents: 700,
  ltv_cac_ratio: 1.71,
  
  refund_rate: 0.035,
  payment_failure_rate: 0.03,
  avg_seller_profit_cents: 72000
};
```

**🎉 BREAK-EVEN ACHIEVED IN MONTH 3!**

---

### Month 4: Profitability Scaling

```typescript
const month4Realistic: MonthlyProjection = {
  active_sellers: 40,
  new_sellers: 14,
  churned_sellers: 2,
  retention_rate: 0.95,
  
  avg_products_per_seller: 7,
  total_products: 280,
  
  avg_orders_per_seller: 24,
  total_orders: 960,
  avg_order_value_cents: 9500,
  gmv_cents: 9120000,                 // ₾91,200
  conversion_rate: 0.027,
  
  platform_fee_revenue_cents: 456000,
  payment_processing_fee_cents: 182400,
  total_platform_revenue_cents: 638400,// ₾6,384
  
  fixed_costs_cents: 283000,          // Added team
  variable_costs_cents: 280000,
  marketing_costs_cents: 98000,
  total_costs_cents: 661000,
  
  gross_profit_cents: 358400,
  net_profit_cents: -22600,           // -₾226 LOSS (temporary)
  profit_margin: -0.04,
  
  cumulative_cash_cents: -136600,
  
  ltv_cents: 14000,
  cac_cents: 700,
  ltv_cac_ratio: 2.0,                 // ✅ Excellent
  
  refund_rate: 0.03,
  payment_failure_rate: 0.025,
  avg_seller_profit_cents: 91200
};
```

---

### Month 5: Strong Profitability

```typescript
const month5Realistic: MonthlyProjection = {
  active_sellers: 55,
  new_sellers: 17,
  churned_sellers: 2,
  retention_rate: 0.96,
  
  avg_products_per_seller: 8,
  total_products: 440,
  
  avg_orders_per_seller: 28,
  total_orders: 1540,
  avg_order_value_cents: 10000,
  gmv_cents: 15400000,                // ₾154,000
  conversion_rate: 0.029,
  
  platform_fee_revenue_cents: 770000,
  payment_processing_fee_cents: 308000,
  total_platform_revenue_cents: 1078000,// ₾10,780
  
  fixed_costs_cents: 283000,
  variable_costs_cents: 465000,
  marketing_costs_cents: 119000,
  total_costs_cents: 867000,
  
  gross_profit_cents: 613000,
  net_profit_cents: 211000,           // ₾2,110 PROFIT ✅
  profit_margin: 1.95,
  
  cumulative_cash_cents: 74400,       // ✅ POSITIVE CUMULATIVE!
  
  ltv_cents: 16000,
  cac_cents: 700,
  ltv_cac_ratio: 2.29,
  
  refund_rate: 0.025,
  payment_failure_rate: 0.02,
  avg_seller_profit_cents: 112000
};
```

**🎉 CUMULATIVE POSITIVE CASH FLOW IN MONTH 5!**

---

### Month 6: Scale Mode

```typescript
const month6Realistic: MonthlyProjection = {
  active_sellers: 75,
  new_sellers: 22,
  churned_sellers: 2,
  retention_rate: 0.97,
  
  avg_products_per_seller: 9,
  total_products: 675,
  
  avg_orders_per_seller: 32,
  total_orders: 2400,
  avg_order_value_cents: 10500,
  gmv_cents: 25200000,                // ₾252,000
  conversion_rate: 0.031,
  
  platform_fee_revenue_cents: 1260000,// ₾12,600
  payment_processing_fee_cents: 504000,
  total_platform_revenue_cents: 1764000,// ₾17,640
  
  fixed_costs_cents: 283000,
  variable_costs_cents: 760000,
  marketing_costs_cents: 154000,
  total_costs_cents: 1197000,
  
  gross_profit_cents: 1004000,
  net_profit_cents: 567000,           // ₾5,670 PROFIT ✅
  profit_margin: 3.21,
  
  cumulative_cash_cents: 641400,      // ₾6,414 cash positive
  
  ltv_cents: 18000,
  cac_cents: 700,
  ltv_cac_ratio: 2.57,                // ✅ Excellent unit economics
  
  refund_rate: 0.02,
  payment_failure_rate: 0.015,
  avg_seller_profit_cents: 134400
};
```

---

### Realistic Scenario Summary

| Metric | Month 1 | Month 3 | Month 6 | Growth |
|--------|---------|---------|---------|--------|
| **Active Sellers** | 15 | 28 | 75 | 5x |
| **GMV** | ₾14,400 | ₾50,400 | ₾252,000 | 17.5x |
| **Platform Revenue** | ₾1,008 | ₾3,528 | ₾17,640 | 17.5x |
| **Net Profit** | -₾1,322 | **+₾448** ✅ | **+₾5,670** ✅ | Profitable M3+ |
| **Cumulative Cash** | -₾1,322 | -₾114 | **+₾6,414** ✅ | Positive M5+ |
| **LTV:CAC** | 1.14x | 1.71x | 2.57x | Excellent |
| **Avg Seller Profit** | ₾384 | ₾720 | ₾1,344 | 3.5x |

**Total Investment Needed**: ₾1,370 ($507) - recovers in Month 5!

**Key Milestones**:
- ✅ **Month 3**: Break-even achieved
- ✅ **Month 5**: Cumulative cash positive
- ✅ **Month 6**: ₾5,670 monthly profit

---

## 🌟 SCENARIO 3: AGGRESSIVE (Viral Growth)

### Overview

**Philosophy**: Best-case with viral mechanics  
**Assumptions**:
- Rapid seller acquisition (50% MoM growth early)
- Strong referral program (30% organic)
- High conversion (3.5%)
- Low churn (8% monthly)
- CAC drops fast (₾5/seller by Month 4)

---

### Month 1: Explosive Launch

```typescript
const month1Aggressive: MonthlyProjection = {
  active_sellers: 25,                 // Strong beta
  new_sellers: 25,
  churned_sellers: 0,
  retention_rate: 1.0,
  
  avg_products_per_seller: 5,
  total_products: 125,
  
  avg_orders_per_seller: 18,
  total_orders: 450,
  avg_order_value_cents: 9000,
  gmv_cents: 4050000,                 // ₾40,500
  conversion_rate: 0.03,
  
  platform_fee_revenue_cents: 202500,
  payment_processing_fee_cents: 81000,
  total_platform_revenue_cents: 283500,// ₾2,835
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 125000,
  marketing_costs_cents: 175000,      // 25 sellers x ₾7
  total_costs_cents: 383000,
  
  gross_profit_cents: 158500,
  net_profit_cents: -99500,           // -₾995 LOSS
  profit_margin: -0.35,
  
  cumulative_cash_cents: -99500,
  
  ltv_cents: 12000,
  cac_cents: 700,
  ltv_cac_ratio: 1.71,
  
  refund_rate: 0.04,
  payment_failure_rate: 0.04,
  avg_seller_profit_cents: 64800
};
```

---

### Month 2: Referral Flywheel Activates

```typescript
const month2Aggressive: MonthlyProjection = {
  active_sellers: 40,                 // +60% MoM
  new_sellers: 17,                    // 30% organic referrals
  churned_sellers: 2,
  retention_rate: 0.92,
  
  avg_products_per_seller: 6,
  total_products: 240,
  
  avg_orders_per_seller: 24,
  total_orders: 960,
  avg_order_value_cents: 9500,
  gmv_cents: 9120000,                 // ₾91,200
  conversion_rate: 0.032,
  
  platform_fee_revenue_cents: 456000,
  payment_processing_fee_cents: 182400,
  total_platform_revenue_cents: 638400,// ₾6,384
  
  fixed_costs_cents: 83000,
  variable_costs_cents: 280000,
  marketing_costs_cents: 85000,       // CAC dropping (referrals)
  total_costs_cents: 448000,
  
  gross_profit_cents: 358400,
  net_profit_cents: 190400,           // ₾1,904 PROFIT! ✅
  profit_margin: 2.09,
  
  cumulative_cash_cents: 90900,       // ✅ ALREADY POSITIVE!
  
  ltv_cents: 16000,
  cac_cents: 500,                     // Improved via referrals
  ltv_cac_ratio: 3.2,                 // ✅ Excellent
  
  refund_rate: 0.03,
  payment_failure_rate: 0.03,
  avg_seller_profit_cents: 91200
};
```

**🎉 PROFITABLE & CASH POSITIVE IN MONTH 2!**

---

### Month 3: Hypergrowth Phase

```typescript
const month3Aggressive: MonthlyProjection = {
  active_sellers: 65,
  new_sellers: 27,
  churned_sellers: 2,
  retention_rate: 0.95,
  
  avg_products_per_seller: 7,
  total_products: 455,
  
  avg_orders_per_seller: 30,
  total_orders: 1950,
  avg_order_value_cents: 10000,
  gmv_cents: 19500000,                // ₾195,000
  conversion_rate: 0.034,
  
  platform_fee_revenue_cents: 975000,
  payment_processing_fee_cents: 390000,
  total_platform_revenue_cents: 1365000,// ₾13,650
  
  fixed_costs_cents: 283000,          // Team hired
  variable_costs_cents: 590000,
  marketing_costs_cents: 135000,
  total_costs_cents: 1008000,
  
  gross_profit_cents: 775000,
  net_profit_cents: 357000,           // ₾3,570 PROFIT ✅
  profit_margin: 2.61,
  
  cumulative_cash_cents: 447900,
  
  ltv_cents: 20000,
  cac_cents: 500,
  ltv_cac_ratio: 4.0,                 // 🌟 World-class
  
  refund_rate: 0.025,
  payment_failure_rate: 0.02,
  avg_seller_profit_cents: 120000
};
```

---

### Month 4-6: Scale Mode (Summary)

```typescript
const month4Aggressive: MonthlyProjection = {
  active_sellers: 100,
  gmv_cents: 35000000,                // ₾350,000
  total_platform_revenue_cents: 2450000,// ₾24,500
  net_profit_cents: 945000,           // ₾9,450 profit
  cumulative_cash_cents: 1392900,
  ltv_cac_ratio: 4.5,
};

const month5Aggressive: MonthlyProjection = {
  active_sellers: 145,
  gmv_cents: 58000000,                // ₾580,000
  total_platform_revenue_cents: 4060000,// ₾40,600
  net_profit_cents: 1825000,          // ₾18,250 profit
  cumulative_cash_cents: 3217900,
  ltv_cac_ratio: 5.0,
};

const month6Aggressive: MonthlyProjection = {
  active_sellers: 200,
  gmv_cents: 90000000,                // ₾900,000
  total_platform_revenue_cents: 6300000,// ₾63,000
  net_profit_cents: 3150000,          // ₾31,500 profit
  cumulative_cash_cents: 6367900,     // ₾63,679 cash
  ltv_cac_ratio: 5.5,
};
```

---

### Aggressive Scenario Summary

| Metric | Month 1 | Month 3 | Month 6 | Growth |
|--------|---------|---------|---------|--------|
| **Active Sellers** | 25 | 65 | 200 | 8x |
| **GMV** | ₾40,500 | ₾195,000 | ₾900,000 | 22x |
| **Platform Revenue** | ₾2,835 | ₾13,650 | ₾63,000 | 22x |
| **Net Profit** | -₾995 | **+₾3,570** ✅ | **+₾31,500** ✅ | 32x |
| **Cumulative Cash** | -₾995 | **+₾4,479** ✅ | **+₾63,679** ✅ | Viral |
| **LTV:CAC** | 1.71x | 4.0x | 5.5x | World-class |
| **Avg Seller Profit** | ₾648 | ₾1,200 | ₾1,800 | 2.8x |

**Total Investment Needed**: ₾0 (self-funding from Month 2!)

**Key Milestones**:
- ✅ **Month 2**: Profitable & cash positive
- ✅ **Month 3**: ₾3,570 monthly profit
- ✅ **Month 6**: ₾31,500 monthly profit, ₾63,679 cash

---

## 📊 SCENARIO COMPARISON

### Revenue Growth Comparison

| Month | Conservative GMV | Realistic GMV | Aggressive GMV |
|-------|-----------------|---------------|----------------|
| 1 | ₾5,600 | ₾14,400 | ₾40,500 |
| 2 | ₾13,500 | ₾27,200 | ₾91,200 |
| 3 | ₾24,000 | ₾50,400 | ₾195,000 |
| 4 | ₾42,840 | ₾91,200 | ₾350,000 |
| 5 | ₾68,400 | ₾154,000 | ₾580,000 |
| 6 | ₾104,500 | ₾252,000 | ₾900,000 |

### Profitability Timeline

| Scenario | Break-Even Month | Cash Positive Month | Investment Needed |
|----------|-----------------|---------------------|-------------------|
| **Conservative** | 7 | 7+ | ₾6,000 ($2,220) |
| **Realistic** | 3 | 5 | ₾1,370 ($507) |
| **Aggressive** | 2 | 2 | ₾0 (self-funding) |

### Month 6 Comparison

| Metric | Conservative | Realistic | Aggressive |
|--------|--------------|-----------|------------|
| **Active Sellers** | 50 | 75 | 200 |
| **GMV** | ₾104,500 | ₾252,000 | ₾900,000 |
| **Platform Revenue** | ₾7,315 | ₾17,640 | ₾63,000 |
| **Monthly Profit** | -₾265 | +₾5,670 | +₾31,500 |
| **Cumulative Cash** | -₾5,951 | +₾6,414 | +₾63,679 |
| **LTV:CAC Ratio** | 1.0x | 2.57x | 5.5x |

---

## 💡 KEY INSIGHTS & RECOMMENDATIONS

### Critical Success Factors

1. **LTV:CAC Ratio > 3.0** → Realistic scenario achieves this by Month 4
2. **20% Net Margin Floor** → Guardrails prevent erosion
3. **Seller Retention > 90%** → Realistic hits 97% by Month 6
4. **Organic Referrals** → 30% in Aggressive scenario = game-changer

### Investment Decision Matrix

**If you have ₾6,000 ($2,220) to invest:**
- ✅ Pursue **Realistic scenario** (high probability)
- ✅ Target Month 3 break-even, Month 5 cash positive
- ✅ Hedge against Conservative downside

**If you have <₾2,000 budget:**
- ⚠️ High risk - Conservative scenario shows Month 7+ break-even
- 💡 Focus on organic growth & referral mechanics
- 💡 Extend timeline to 9-12 months

**If you can activate referral flywheel:**
- 🚀 Aggressive scenario attainable
- 🚀 Self-funding from Month 2
- 🚀 ₾63,000+ cash by Month 6

### Risk Mitigation Strategy

**Month 1-2: Survival Mode**
- Minimize fixed costs (no hires)
- Focus on 15-25 beta sellers
- Perfect core product experience
- CAC < ₾7 mandatory

**Month 3-4: Validation Mode**
- Hit break-even (Realistic target: Month 3)
- Validate unit economics (LTV:CAC > 1.5)
- Proof of margin enforcement working
- Decision point: hire team or stay lean?

**Month 5-6: Scale Mode**
- Hire developer + support (if cash positive)
- Expand marketing spend
- Target 75-100 sellers
- Build bank integration

---

## 🎯 RECOMMENDED STRATEGY

### Base Case: Realistic Scenario

**Rationale**:
- Proven unit economics (LTV:CAC 2.57x by Month 6)
- Low investment requirement (₾1,370)
- Fast payback (Month 5 cumulative positive)
- Achievable with focused execution

**Execution Plan**:
1. **Month 1**: Launch with 15 beta sellers, nail onboarding
2. **Month 2**: Optimize CAC to ₾7, hit 20 active sellers
3. **Month 3**: **Break-even target** - validate profitability
4. **Month 4**: Hire team (if on track), expand to 40 sellers
5. **Month 5**: **Cash positive target** - bank integration live
6. **Month 6**: Scale to 75 sellers, ₾5,670 monthly profit

### Hedge Strategy: Conservative Downside

**If below targets:**
- Extend timeline to 9 months for break-even
- Keep team lean (no hires until Month 6)
- Focus on retention > acquisition
- Reduce marketing spend, increase organic

### Upside Strategy: Aggressive Opportunity

**If above targets (Month 2 > ₾27,000 GMV):**
- Accelerate hiring (Month 3)
- Double marketing budget
- Activate affiliate program hard
- Target 100+ sellers by Month 6

---

## 📉 SENSITIVITY ANALYSIS

### Key Variable Impact on Break-Even

| Variable | Base Value | +20% Impact | -20% Impact |
|----------|-----------|-------------|-------------|
| **Conversion Rate** | 2.5% | Break-even Month 2 | Break-even Month 5 |
| **CAC** | ₾7 | Break-even Month 4 | Break-even Month 2 |
| **Churn Rate** | 15% | Break-even Month 5 | Break-even Month 2 |
| **Platform Fee** | 5% | Break-even Month 2 | Break-even Month 6 |
| **Avg Order Value** | ₾100 | Break-even Month 2 | Break-even Month 5 |

**Most Sensitive Variables**:
1. **CAC** (Customer Acquisition Cost) - 3x impact
2. **Conversion Rate** - 2.5x impact
3. **Churn Rate** - 2x impact

**Recommendation**: Focus relentlessly on **CAC optimization** and **churn reduction**.

---

## ✅ VALIDATION CHECKLIST

### Before Launch (Must Verify)

- [ ] Margin guardrails enforce 20% floor
- [ ] VAT calculation accurate (18% included formula)
- [ ] Invoice generation working (PDF + storage)
- [ ] Payment flow tested (Stripe Live)
- [ ] Webhook idempotency working
- [ ] Seller onboarding <20min
- [ ] KPI dashboard real-time
- [ ] Break-even calculator accurate

### Month 1 Validation

- [ ] 15+ sellers activated
- [ ] ₾14,000+ GMV achieved
- [ ] 100% margin compliance
- [ ] CAC ≤ ₾7
- [ ] LTV:CAC > 1.0
- [ ] <5% refund rate

### Month 3 Decision Point

- [ ] Break-even achieved (or path visible)
- [ ] 28+ active sellers
- [ ] LTV:CAC > 1.5
- [ ] Retention > 85%
- [ ] Organic referrals > 15%

**If yes to all → Scale Mode activate**  
**If no to 3+ → Pivot or extend timeline**

---

**Next**: Georgian Bank Integration Architecture →
