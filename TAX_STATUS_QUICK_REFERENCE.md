# Tax Status Feature - Quick Reference

**Date**: February 13, 2026  
**Status**: ✅ Ready to Use

---

## 30-Second Overview

Georgian stores can now choose:
- **VAT Payer**: 18% VAT on sales to Georgian customers
- **Non-VAT Payer**: No VAT, income-tax accounting mode

Affects checkout totals, invoices, and finance reporting.

---

## Core APIs

### Get Tax Profile
```typescript
import { getStoreTaxProfile } from '@/app/actions/taxStatus';

const { success, data: profile } = await getStoreTaxProfile(storeId);
```

### Update Tax Status
```typescript
import { updateStoreTaxStatus } from '@/app/actions/taxStatus';

await updateStoreTaxStatus({
  store_id: storeId,
  tax_status: 'vat_payer',
  vat_registration_no: 'GE123...',
});
```

### Compute Order Totals
```typescript
import { computeOrderTotals } from '@/lib/finance';

const totals = computeOrderTotals({
  subtotalCents: 10000,
  shippingCostCents: 500,
  platformFeeBps: 500,
  affiliateFeeBps: 1000,
  buyerCountryCode: 'GE',
  taxProfile,
});

// totals.vatAmountCents → 1525 (18% of subtotal)
// totals.totalCents → 12500
// totals.breakdown → itemized costs
```

---

## UI Components

### Tax Status Selector
```tsx
import { TaxStatusSelector } from '@/components/tax/TaxStatusSelector';

<TaxStatusSelector
  currentProfileValue={profile}
  onSelect={(status) => console.log(status)}
  onVatNumberChange={(num) => console.log(num)}
/>
```

### Finance Dashboard
```tsx
import { FinanceDashboardTax } from '@/components/finance/FinanceDashboardTax';

<FinanceDashboardTax
  taxProfile={profile}
  reportData={{
    grossRevenue: 100000,
    vatCollected: 15250,
    netRevenue: 84750,
    costs: 30000,
    fees: 10000,
    estimatedProfit: 44750,
    period: { start: '2026-01-01', end: '...' }
  }}
/>
```

---

## Key Rules

✅ **VAT Applies If**:
- Store tax_status = 'vat_payer' AND
- Buyer country = 'GE'

✅ **VAT Computation**:
- Formula: `VAT = floor(price * 1800 / 11800)`
- Implementation: `computeVatInclusive(priceCents, 1800)`

✅ **Always Server-Side**:
- Compute totals on server only
- Never trust client calculations
- Use `computeOrderTotals()` as source of truth

✅ **Tax Status Changes**:
- Apply to future orders only
- Don't retroactively change old orders
- Orders snapshot `vat_status` at creation

---

## Database Fields

### stores table (add these)
```
tax_status                  → 'vat_payer' | 'non_vat_payer'
vat_rate_bps               → 1800 (18% in basis points)
vat_registration_no        → Optional registration number
prices_include_vat         → true (VAT included in price)
tax_residency_country      → 'GE' (Georgia)
legal_entity_type          → 'individual' | 'llc' | null
```

### orders table (add this)
```
vat_status                  → Snapshot of store.tax_status at order time
```

---

## Validation

```typescript
import { validateTaxStatusConsistency, validateOrderCalculation } from '@/lib/finance';

// Validate tax profile
const profileValidation = validateTaxStatusConsistency(profile);
if (!profileValidation.valid) {
  console.error(profileValidation.errors);
}

// Validate order calculation
const calcValidation = validateOrderCalculation(totals);
if (!calcValidation.valid) {
  console.error(calcValidation.errors);
}
```

---

## Testing

```bash
# Run tax status tests
npm test -- taxStatus.test.ts

# Expected: 50+ tests passing
```

---

## Common Scenarios

### Scenario 1: VAT Payer, Georgian Buyer
```
Store: VAT Payer (18%)
Buyer: Georgia
Subtotal: ₾100

VAT: ₾15.25 (= floor(10000 * 1800 / 11800))
Total: ₾100 (includes VAT)
```

### Scenario 2: Non-VAT Payer
```
Store: Non-VAT Payer
Buyer: Georgia (or anywhere)
Subtotal: ₾100

VAT: ₾0 (no VAT collected)
Total: ₾100
```

### Scenario 3: VAT Payer, Non-Georgian Buyer
```
Store: VAT Payer (18%)
Buyer: USA
Subtotal: ₾100

VAT: ₾0 (no VAT for foreign buyers)
Total: ₾100
```

---

## Integration Steps

1. **Database**: Add columns to stores & orders tables
2. **Checkout**: Use `computeOrderTotals()` for calculations
3. **Order Creation**: Snapshot `vat_status`
4. **UI**: Add Tax Status selector & dashboard
5. **Ledger**: Record `vat_amount`
6. **Invoices**: Show VAT breakdown if applicable
7. **Test**: Run test suite
8. **Deploy**: Staging → Production

---

## Error Handling

```typescript
try {
  const result = await updateStoreTaxStatus({...});
  if (!result.success) {
    console.error('Error:', result.error);
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

---

## Important Warnings

⚠️ Always compute on server  
⚠️ Never retro-edit old orders  
⚠️ VAT only for GE buyers  
⚠️ Use validated calculations  
⚠️ Record vat_status snapshots  

---

## File Locations

Core:
- `lib/finance/taxProfile.ts`
- `lib/finance/orderCalculation.ts`

UI:
- `components/tax/TaxStatusSelector.tsx`
- `components/finance/FinanceDashboardTax.tsx`

Actions:
- `app/actions/taxStatus.ts`

Tests:
- `__tests__/finance/taxStatus.test.ts`

Docs:
- `TAX_STATUS_IMPLEMENTATION.md` (full guide)
- `TAX_STATUS_COMPLETION.md` (summary)

---

**Start here**: Read TAX_STATUS_IMPLEMENTATION.md for full integration guide
