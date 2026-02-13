# AI Decision Engine - Product Profitability Guardrails

## Overview

The Decision Engine is a pure function that evaluates product candidates for publishability based on profitability guardrails and profit thresholds. It integrates with the Finance Simulation Engine to compute margins and returns a "publish" or "reject" decision with reasoning.

## Profit Guardrails

### Rejection Rules

**Rule 1: Reject if unprofitable** (net per order ≤ 0)
```
If NetProfitPerOrder ≤ 0 → REJECT
Reason: "Net profit per order is zero or negative"
```

**Rule 2: Reject if margin below product-type threshold**
```
Product Type Thresholds:
- standard:     15% (1500 bps)
- dropshipping: 25% (2500 bps)
- digital:      70% (7000 bps)

If Margin% < Threshold → REJECT
Reason: "Margin 12% below standard minimum 15%"
```

### Warning Flags (Non-Blocking)

**Warning 1: High shipping time**
```
If ShippingDaysMax > 21 → WARN
Reason: "Shipping takes 30 days (typical buyers expect ≤ 21 days)"
```

**Warning 2: Low refund reserve**
```
If RefundReserveBps < 200 (2%) → WARN
Reason: "Refund reserve below 200 bps (2%) - insufficient safety margin"
```

## API Endpoint

### POST /api/decision/evaluate

**Request**:
```json
{
  "productType": "standard",
  "retailPriceCents": 10000,
  "supplierCostCents": 2000,
  "shippingCostCents": 500,
  "vatEnabled": true,
  "buyerCountryCode": "GE",
  "platformFeeBps": 500,
  "affiliateBps": 1000,
  "refundReserveBps": 200
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
      "netPerOrderCents": 5223,
      "marginBps": 5223,
      "marginPercent": 52.23,
      "vatAmountCents": 1525,
      "totalCostsCents": 3252
    },
    "recommendedPriceCents": null
  }
}
```

**Response (Reject with Recommendation)**:
```json
{
  "data": {
    "decision": "reject",
    "reasons": [
      "Margin 8% below standard minimum 15%"
    ],
    "warnings": [],
    "computed": {
      "netPerOrderCents": 800,
      "marginBps": 800,
      "marginPercent": 8.0,
      "vatAmountCents": 1525,
      "totalCostsCents": 6675
    },
    "recommendedPriceCents": 13200
  }
}
```

## Price Recommendation Algorithm

When rejected due to margin, the engine computes a recommended retail price to reach target margin:

$$RecommendedPrice = \frac{TotalCosts + VAT}{1 - \frac{TargetMargin_{bps}}{10000}}$$

Where:
- `TotalCosts` = supplier cost + shipping + platform fee + affiliate fee + refund reserve
- `VAT` = extracted from current price estimate
- `TargetMargin_bps` = product-type minimum (e.g., 1500 for standard)

**Example Calculation**:
```
Current price:       ₾100 (unprofitable, 8% margin)
Target margin:       15% (1500 bps)
Estimated costs:     ₾93
Recommended price:   ₾132
→ At ₾132 retail, product reaches 15% target margin
```

## Integration with Product Publishing

When a merchant publishes a product or imports from supplier:

1. **Server fetches product data** (price, cost, shipping)
2. **Calls `evaluateProductCandidate()`**
3. **Decision Engine returns** { decision, reasons, computed, recommendedPrice }
4. **If "reject"**:
   - Block publication
   - Show reasons to merchant
   - Suggest recommended price
   - Allow manual override (advanced users)
5. **If "publish"**:
   - Proceed with product creation
   - Show warnings (if any)

## Decision Result Types

### MarginResult (Internal)
```typescript
{
  vat_amount_cents: number;
  platform_fee_cents: number;
  affiliate_fee_cents: number;
  refund_reserve_cents: number;
  net_profit_cents: number;
  margin_percent: number;
}
```

### DecisionResult (API Response)
```typescript
{
  decision: 'publish' | 'reject';
  reasons: string[];        // Rejection reasons (empty if publish)
  warnings: string[];       // Non-blocking warnings
  computed: {
    netPerOrderCents: number;
    marginBps: number;
    marginPercent: number;
    vatAmountCents: number;
    totalCostsCents: number;
  };
  recommendedPriceCents?: number; // Only if rejected + margin too low
}
```

## Unit Tests

Decision Engine tests cover:

- ✓ Publish profitable standard product
- ✓ Reject unprofitable product (net ≤ 0)
- ✓ Reject low-margin product below standard threshold
- ✓ Reject digital product below 70% margin
- ✓ Provide price recommendation when rejected for margin
- ✓ Warn on high shipping days (> 21)
- ✓ Warn on low refund reserve (< 2%)
- ✓ Accept dropshipping with 25% margin

Run tests:
```bash
npm test __tests__/decision-engine
```

## Future Enhancements

1. **Dynamic thresholds**: Lower thresholds for high-volume sellers
2. **Competitor pricing**: Adjust thresholds based on market rates
3. **Seasonal adjustments**: Higher margins expected in Q4
4. **Risk scoring**: Credit score-like metric (0-100) for each product
5. **Audit logging**: Track all rejections + reasoning for analytics
