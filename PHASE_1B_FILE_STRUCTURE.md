# Phase 1B: File Structure Reference

```
avatar-g-frontend-v3/
├── supabase/
│   └── migrations/
│       └── 007_shipping_margin.sql ............................ [NEW] Shipping tables + RLS + functions
│
├── lib/
│   ├── commerce/
│   │   ├── types.ts ........................................... [UPDATED] Added shipping types
│   │   └── validation.ts ....................................... [UPDATED] Added shipping + margin schemas
│   │
│   ├── shipping/ .............................................. [NEW DIRECTORY]
│   │   └── index.ts ............................................ [NEW] Shipping functions (400+ LOC)
│   │       - computeShippingCost()
│   │       - addShippingEvent()
│   │       - getTracking()
│   │       - selectShippingProfile()
│   │       - createShippingProfile()
│   │
│   └── shop/ ................................................... [NEW DIRECTORY]
│       └── margin.ts ............................................ [NEW] Margin enforcement (500+ LOC)
│           - computeMargin()
│           - validateProductForPublishing()
│           - bulkMarginCheck()
│           - formatMargin() [debug]
│
├── app/
│   ├── api/
│   │   └── shipping/ ............................................ [NEW DIRECTORY]
│   │       ├── track/
│   │       │   └── route.ts ..................................... [NEW] GET /api/shipping/track
│   │       ├── event/
│   │       │   └── route.ts ..................................... [NEW] POST /api/shipping/event
│   │       └── select-profile/
│   │           └── route.ts ..................................... [NEW] POST /api/shipping/select-profile
│   │
│   └── track/
│       └── [orderId]/
│           └── page.tsx ......................................... [NEW] Live tracking page (300+ LOC)
│
├── PHASE_1B_SHIPPING_MARGIN.md ................................... [NEW] Complete implementation guide (1000+ LOC)
└── PHASE_1B_COMPLETION_SUMMARY.md ................................ [NEW] Quick reference & next steps
```

## Key Files by Purpose

### Database (SQL)
- **007_shipping_margin.sql**: Tables, RLS policies, indexes, functions

### Types & Validation (TypeScript)
- **types.ts**: ShippingStatus, ShippingProfile, ShippingEvent, ShippingTracking, ProductMargin
- **validation.ts**: Zod schemas for all shipping & margin inputs

### Business Logic (Server-Only)
- **lib/shipping/index.ts**: All shipping calculations + RLS checks
- **lib/shop/margin.ts**: Margin validation + product acceptance/rejection

### API Endpoints
- **app/api/shipping/track/route.ts**: GET tracking (RLS enforced)
- **app/api/shipping/event/route.ts**: POST events (store owner only)
- **app/api/shipping/select-profile/route.ts**: POST profile selection (store owner only)

### UI Components
- **app/track/[orderId]/page.tsx**: Live tracking page with timeline

### Documentation
- **PHASE_1B_SHIPPING_MARGIN.md**: Full implementation guide + examples
- **PHASE_1B_COMPLETION_SUMMARY.md**: Quick reference + next steps

---

## Code Imports Reference

### Use Shipping Functions
```typescript
import {
  computeShippingCost,
  addShippingEvent,
  getTracking,
  selectShippingProfile,
  createShippingProfile
} from '@/lib/shipping';
```

### Use Margin Functions
```typescript
import {
  computeMargin,
  validateProductForPublishing,
  bulkMarginCheck,
  formatMargin,
  MARGIN_THRESHOLDS,
  FEE_BASIS_POINTS
} from '@/lib/shop/margin';
```

### Use Types
```typescript
import type {
  ShippingProfile,
  ShippingEvent,
  ShippingTracking,
  ShippingStatus,
  ProductMargin,
  Order // updated with shipping fields
} from '@/lib/commerce/types';
```

### Use Validation Schemas
```typescript
import {
  AddShippingEventSchema,
  SelectShippingProfileSchema,
  ValidateProductForPublishingSchema,
  BulkMarginCheckSchema
} from '@/lib/commerce/validation';
```

---

## Database Schema Changes

### New Tables
1. **shipping_profiles** (store_id, name, base_cost, per_kg_cost, estimated_days_min/max)
2. **shipping_events** (order_id, status enum, location, tracking_code, created_at)

### Updated Table (orders)
- store_id (UUID)
- shipping_profile_id (UUID, nullable)
- shipping_cost (INT)
- shipping_status (ENUM)
- tracking_code (TEXT)
- shipped_at (TIMESTAMPTZ)
- delivered_at (TIMESTAMPTZ)
- weight_grams (INT)

### RLS Policies Added
- 13 policies total protecting shipping data
- Store owners can CRUD their profiles
- Buyers can READ their tracking
- Store owners can INSERT/UPDATE tracking for their orders

---

## API Endpoints Summary

### GET /api/shipping/track
- Query: `?orderId=uuid`
- Response: { orderId, shippingStatus, trackingCode, estimatedDays, events[] }
- Auth: Buyer or store owner (RLS enforced)

### POST /api/shipping/event
- Body: { orderId, status, location?, trackingCode?, metadata? }
- Effect: Inserts event + updates order.shipping_status + sets shipped_at/delivered_at
- Auth: Store owner only

### POST /api/shipping/select-profile
- Body: { orderId, shippingProfileId, weightGrams? }
- Effect: Links profile + recomputes shipping_cost + adjusts order total
- Auth: Store owner only

---

## Margin Thresholds

| Product Type | Minimum Margin | Use Case |
|--------------|----------------|----------|
| Digital | 70% | eBooks, software, licenses |
| Dropshipping | 25% | Third-party fulfillment |
| Physical | 15% | Standard products |
| Default | 15% | Fallback |

---

## Error Codes & Messages

### Shipping
- 401: Not authenticated
- 403: Not authorized (not store owner)
- 404: Order/profile not found
- 400: Invalid input
- 500: Internal error

### Margin Validation
- Valid: margin ≥ threshold AND net > 0
- Rejected: "Rejected: {type} product margin ({actual}%) below minimum ({required}%). Need ${shortfall} more profit."
- All rejections returned as { rejection: { reason, message } }

---

## Migration Path (Phase 2+)

1. **Phase 2 (Stripe)**: Add payment_intent_id, webhook handler
2. **Phase 3 (Affiliate)**: Payout automation (margin already accounts for commissions)
3. **Phase 4 (Digital)**: License generation on purchase (margin 70% threshold ready)
4. **Phase 5 (Suppliers)**: API imports with bulk margin check
5. **Phase 6 (AI)**: Price optimization based on margin data
6. **Phase 7 (Couriers)**: Real-time tracking via carrier APIs

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| New Files | 11 |
| Updated Files | 2 |
| Lines of Code | 2,500+ |
| Database Tables | 2 new, 1 extended |
| RLS Policies | 13 new |
| API Endpoints | 3 new |
| TypeScript Schemas | 30+ |
| Type Definitions | 8 new |

---

**Phase 1B Implementation Complete ✅**
