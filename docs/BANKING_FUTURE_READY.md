# Banking Integration Model (Future Ready)

This document describes the payout and settlement architecture for Avatar G Online Shop with future adapters for Georgian banks (TBC, BoG) and Payze. The current implementation is designed for Stripe today and bank adapters later.

## Goals
- Support Stripe payouts immediately.
- Add local Georgian bank payouts without reworking the payout flow.
- Keep security tight: no secrets on client, all server-side validation.
- Enforce plan rules and AML review thresholds.

## Current Tables

### payout_accounts
Tracks where a user can be paid out.

Fields:
- id (uuid)
- user_id (uuid)
- type (stripe | tbc | bog | payze)
- details_json (bank account, card, or provider identifiers)
- status (pending | active | disabled)
- created_at

### payout_requests
Tracks payout requests and approval lifecycle.

Fields:
- id (uuid)
- user_id (uuid)
- amount_cents (int)
- currency (GEL | USD)
- status (requested | approved | paid | rejected)
- review_required (boolean)
- requested_at
- decided_at
- notes

## Current Flow (Manual Approval)
1. User requests payout in dashboard.
2. System validates plan and threshold.
3. payout_requests row created with status "requested".
4. Admin reviews in /dashboard/admin/payouts.
5. Admin approves/rejects/marks paid.

## AML Awareness
Large payouts trigger review:
- review_required = true for payouts >= 5,000.00 (currency units)
- manual review is required before approval

## Adapter Architecture (Future)
Add a payout adapter interface:

```
interface PayoutAdapter {
  type: 'stripe' | 'tbc' | 'bog' | 'payze';
  createRecipient(details: Record<string, any>): Promise<string>;
  createPayout(requestId: string, amountCents: number, currency: 'GEL' | 'USD'): Promise<{ providerId: string }>
  getStatus(providerId: string): Promise<'pending' | 'paid' | 'failed'>
}
```

### Stripe Adapter
- Use Stripe Connect for marketplace payouts.
- Store provider IDs in payout_accounts.details_json.

### TBC / BoG Adapters
- Use bank APIs to create transfer instructions.
- Map bank transaction ID to payout_requests.notes.
- Update status from bank webhook or polling.

### Payze Adapter
- Use Payze payout API.
- Store payout reference in payout_requests.notes.

## Security Guarantees
- No service role keys in client code.
- All payout creation and updates are server-side.
- RLS ensures users only see their own payouts.
- Admin role required for approvals.

## Upgrade Steps (When Bank APIs Are Ready)
1. Implement `lib/payouts/adapters/*` for each provider.
2. Store provider IDs in payout_accounts.details_json.
3. Replace manual approval with automated payout execution.
4. Add webhook handlers to reconcile status.
5. Add audit logs for all payout state transitions.

## API Endpoints (Current)
- GET /api/payouts/accounts
- POST /api/payouts/accounts
- GET /api/payouts/requests
- POST /api/payouts/requests
- GET /api/admin/payouts
- POST /api/admin/payouts
