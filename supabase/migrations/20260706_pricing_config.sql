-- 20260706_pricing_config.sql — runtime-editable refill tiers + commission rules for the Master Control
-- Panel (v358 #2). Apply in the Supabase SQL Editor (Management API / CLI DDL channels are unavailable here).
-- ADDITIVE + fail-open: lib/billing/pricingConfig.db.ts falls back to the hardcoded REFILL_TIERS_GEL when
-- pricing_tiers is absent or has NO active rows, so checkout is byte-identical pre-migration and an admin can
-- never lock out all tiers. Reads + writes go through the SERVICE-ROLE client only.

-- Purchasable top-up tiers (a tier = pay `gel_amount` GEL, receive `credits_amount` credits).
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gel_amount     numeric(12,2) NOT NULL CHECK (gel_amount > 0 AND gel_amount <= 10000),
  credits_amount integer NOT NULL CHECK (credits_amount >= 0),
  label          text,
  is_active      boolean NOT NULL DEFAULT true,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gel_amount)
);

-- Per-gateway bank commission. METRIC-ONLY by product decision: stored + displayed for reporting, NEVER
-- deducted at credit time (credit_wallet_gel keeps crediting the full amount). No webhook reads this.
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway           text NOT NULL UNIQUE CHECK (gateway IN ('stripe', 'bog')),
  commission_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  note              text,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_tiers   ENABLE ROW LEVEL SECURITY;  -- deny-by-default; service-role bypasses RLS
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pricing_tiers IS
  'Runtime-editable top-up tiers. Empty/absent → checkout falls back to the hardcoded REFILL_TIERS_GEL. Admin-only via service role.';
COMMENT ON TABLE public.commission_rules IS
  'Per-gateway bank commission — METRIC ONLY (reporting/display). Never deducted from a credited top-up.';
