# Finance Simulation Engine

## Overview

The Finance Simulation Engine provides real-time financial modeling and profitability analysis for e-commerce businesses. It calculates margins, break-even points, and daily/monthly revenue projections based on product pricing, costs, fees, and expected order volumes.

## Real Financial Model

### Pricing & VAT (Georgia Standard: 18%)

- **VAT Rate**: 18% (1800 basis points) included in retail price
- **VAT Formula**: $VAT = \lfloor \frac{RetailPrice \times VAT_{bps}}{10000 + VAT_{bps}} \rfloor$
- **Rationale**: Floor function conserves revenue; VAT is extracted from retail price

Example:
- Retail Price: ₾100.00 (10,000 cents)
- VAT Amount: ₾15.25 (floor of 1525 cents)
- Net of VAT: ₾84.75 (8475 cents)

### Margin Calculation

Margin is calculated on a per-order basis:

$$NetProfit = RetailPrice - VAT - SupplierCost - ShippingCost - Fees$$

Where fees are calculated as basis points of **net-of-VAT price**:
- Platform Fee: percentage of net
- Affiliate Fee: percentage of net  
- Refund Reserve: percentage of net (default 2%)
- Ad Cost Per Order: actual cost from daily ad spend

**Critical Design**: Fees apply to net-of-VAT amount to ensure realistic profitability targets.

### Break-Even Analysis

$$BreakEvenOrders = \lceil \frac{DailyAdSpend}{NetProfitPerOrder} \rceil$$

- Returns `null` if net profit ≤ 0 (unprofitable)
- Useful for marketing ROI planning

## API Routes

### POST /api/finance/simulate

Runs a single scenario simulation with instant results.

**Request**:
```json
{
  "currency": "GEL",
  "retailPriceCents": 10000,
  "supplierCostCents": 2000,
  "shippingCostCents": 500,
  "vatEnabled": true,
  "platformFeeBps": 500,
  "affiliateBps": 1000,
  "refundReserveBps": 200,
  "expectedOrdersPerDay": 10,
  "adSpendPerDayCents": 1000
}
```

**Response**:
```json
{
  "data": {
    "netPerOrderCents": 5223,
    "marginBps": 5223,
    "dailyProfitCents": 52230,
    "monthlyProfitCents": 1566900,
    "breakEvenOrdersPerDay": 2,
    "warnings": []
  }
}
```

### POST /api/finance/scenarios
Save scenario for later analysis (stores `inputs_json` + `outputs_json`).

### GET /api/finance/scenarios
Retrieve all scenarios for a store.

## Core Functions

### simulateScenario(input: SimulationInput) → SimulationOutput

Main entry point for all simulations.

```typescript
const output = simulateScenario({
  retail_price_cents: 10000,
  supplier_cost_cents: 2000,
  shipping_cost_cents: 500,
  vat_enabled: true,
  platform_fee_bps: 500,
  affiliate_bps: 1000,
  refund_reserve_bps: 200,
  expected_orders_per_day: 10,
  ad_spend_per_day_cents: 1000,
});

console.log(output.net_per_order_cents); // 5223
console.log(output.break_even_orders); // 2
```

### computeMargin(input: MarginInput) → MarginResult

Lower-level margin calculator used by simulator.

```typescript
const margin = computeMargin({
  retail_price_cents: 10000,
  supplier_cost_cents: 2000,
  shipping_cost_cents: 500,
  vat_enabled: true,
  platform_fee_bps: 500,
  affiliate_bps: 1000,
  refund_reserve_bps: 200,
});

console.log(margin.net_profit_cents); // 5223
console.log(margin.margin_percent); // 52.23
```

## Money Helpers (Integer-Only)

All money is stored and computed as integer cents (no floats).

### toCents(amountFloat: number) → number
Convert 12.34 → 1234

### fromCents(cents: number) → number
Convert 1234 → 12.34

### percentageOf(amountCents: number, basisPoints: number) → number
Compute (amount × bps) / 10000

```typescript
percentageOf(10000, 500); // 500 (5% of 10000)
percentageOf(10000, 1800); // 1800 (18% of 10000)
```

## Testing

Unit tests cover:
- ✓ VAT extraction with floor formula
- ✓ Margin calculation with all fee combinations
- ✓ Break-even calculation (zero profit handling)
- ✓ Daily/monthly profit scaling

Run tests:
```bash
npm test __tests__/finance
```
Net/day = NetPerOrder * expected_orders_per_day
Net/week = Net/day * 7
Net/month = Net/day * 30
```

## Break-even Orders Per Day

```
BreakEvenOrders = ad_spend_per_day / net_profit_per_order_without_ad
```

If net_profit_per_order_without_ad <= 0, break-even is not possible (null).

## Recommended Price
The recommended price uses the target margin (bps) and fee rates to solve for the minimum retail price that meets the margin threshold.

## Tests
Unit tests are provided in:
- __tests__/finance/money.test.ts
- __tests__/finance/vat.test.ts
- __tests__/finance/margin.test.ts
- __tests__/finance/simulator.test.ts
