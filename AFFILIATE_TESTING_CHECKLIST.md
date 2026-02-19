# Affiliate Growth Engine Testing Checklist

Use this checklist to validate Phase 7 affiliate flows end to end.

## Prerequisites
- Apply migration: supabase/migrations/011_affiliate_growth_engine.sql.
- Configure env vars:
  - AFFILIATE_PAYOUT_DELAY_DAYS (default 7)
  - AFFILIATE_MIN_PAYOUT_CENTS (default 1000)
  - NEXT_PUBLIC_APP_URL
- Stripe webhook configured for checkout.session.completed, invoice.paid, charge.refunded.
- Stripe Connect account created and payouts enabled for test affiliate.

## Referral Capture
- Visit a landing URL with ?ref=AFFILIATE_CODE.
- Confirm cookie "aff_ref" is set (httpOnly, 30 days).
- Sign up and log in as the referred user.
- Verify POST /api/affiliate/claim clears the cookie and inserts affiliate_referrals.

## Affiliate Profile + Badge
- Open /affiliate to auto-create affiliate (GET /api/affiliate/me?create=true).
- Confirm affiliate badge appears in the header for active affiliates.
- Toggle affiliate is_active false via admin API and confirm badge styling reflects disabled.

## Commission Events
- Complete a one-time checkout as the referred user.
- Verify a commission row in affiliate_commission_events with event_type=checkout.
- Complete a subscription invoice payment as the referred user.
- Verify a commission row in affiliate_commission_events with event_type=invoice.
- Trigger a refund and confirm a reversal event is inserted.

## Availability Delay
- Confirm new commission events start as status=pending with available_at set.
- Wait or backdate available_at and confirm dashboard/balance endpoints auto-promote to available.

## Dashboard + Analytics
- Open /affiliate dashboard.
- Confirm totals update: clicks, signups, pending, available, paid, total.
- Verify the 7-day earnings chart updates for non-reversed events.
- Call GET /api/affiliate/analytics and confirm 30-day series response.

## Payout Request (Affiliate)
- Ensure available balance is above AFFILIATE_MIN_PAYOUT_CENTS.
- Submit a payout request on /affiliate or /affiliate/payouts.
- If Connect payouts enabled, verify Stripe transfer created and payout status=paid.
- If Connect not enabled, verify payout is created as requested and requires connect.
- Confirm paid commission events are marked paid (and partial splits are handled).

## Admin Payout Queue
- Call GET /api/admin/payouts/eligible and confirm eligible affiliates listed.
- Use admin payout creation flow and verify affiliate_payouts updated.

## Regression Checks
- Verify other Stripe webhook logic still works for non-affiliate customers.
- Confirm no errors when visiting /affiliate without being referred.
