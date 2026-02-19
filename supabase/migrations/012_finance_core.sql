/**
 * Finance Core Tables
 * Phase 8: Financial Analytics Dashboard
 */

-- ============================================
-- STRIPE CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON public.stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON public.stripe_customers(stripe_customer_id);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_customers_user_select ON public.stripe_customers;
DROP POLICY IF EXISTS stripe_customers_service_write ON public.stripe_customers;

CREATE POLICY stripe_customers_user_select ON public.stripe_customers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY stripe_customers_service_write ON public.stripe_customers
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- STRIPE INVOICES (SUBSCRIPTIONS)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stripe_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT,
  amount_paid_cents INT,
  amount_due_cents INT,
  currency TEXT DEFAULT 'usd',
  status TEXT CHECK (status IN ('paid', 'open', 'void', 'uncollectible')),
  billing_reason TEXT,
  hosted_invoice_url TEXT,
  invoice_pdf TEXT,
  created_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_invoices_user_id ON public.stripe_invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_subscription_id ON public.stripe_invoices(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_status ON public.stripe_invoices(status);

ALTER TABLE public.stripe_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_invoices_user_select ON public.stripe_invoices;
DROP POLICY IF EXISTS stripe_invoices_service_write ON public.stripe_invoices;

CREATE POLICY stripe_invoices_user_select ON public.stripe_invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY stripe_invoices_service_write ON public.stripe_invoices
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- STRIPE PAYMENTS (ONE-TIME + GENERAL)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_payment_intent_id TEXT UNIQUE,
  amount_cents INT,
  currency TEXT DEFAULT 'usd',
  status TEXT,
  created_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_user_id ON public.stripe_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_status ON public.stripe_payments(status);

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_payments_user_select ON public.stripe_payments;
DROP POLICY IF EXISTS stripe_payments_service_write ON public.stripe_payments;

CREATE POLICY stripe_payments_user_select ON public.stripe_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY stripe_payments_service_write ON public.stripe_payments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- MARKETPLACE ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id UUID REFERENCES auth.users(id),
  seller_user_id UUID REFERENCES auth.users(id),
  stripe_payment_intent_id TEXT UNIQUE,
  gross_amount_cents INT,
  platform_fee_cents INT,
  seller_net_cents INT,
  currency TEXT,
  status TEXT CHECK (status IN ('paid', 'refunded', 'failed')),
  created_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer ON public.marketplace_orders(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller ON public.marketplace_orders(seller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON public.marketplace_orders(status);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_orders_user_select ON public.marketplace_orders;
DROP POLICY IF EXISTS marketplace_orders_service_write ON public.marketplace_orders;

CREATE POLICY marketplace_orders_user_select ON public.marketplace_orders
  FOR SELECT USING (auth.uid() = buyer_user_id OR auth.uid() = seller_user_id);

CREATE POLICY marketplace_orders_service_write ON public.marketplace_orders
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- SELLER PAYOUTS (CONNECT TRANSFERS)
-- ============================================
CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID REFERENCES auth.users(id),
  stripe_transfer_id TEXT UNIQUE,
  amount_cents INT,
  currency TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_id ON public.seller_payouts(seller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_status ON public.seller_payouts(status);

ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_payouts_user_select ON public.seller_payouts;
DROP POLICY IF EXISTS seller_payouts_service_write ON public.seller_payouts;

CREATE POLICY seller_payouts_user_select ON public.seller_payouts
  FOR SELECT USING (auth.uid() = seller_user_id);

CREATE POLICY seller_payouts_service_write ON public.seller_payouts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- FINANCE DAILY AGGREGATES
-- ============================================
CREATE TABLE IF NOT EXISTS public.finance_daily_aggregates (
  day DATE PRIMARY KEY,
  mrr_cents INT DEFAULT 0,
  arr_cents INT DEFAULT 0,
  subscriptions_active INT DEFAULT 0,
  revenue_subscriptions_cents INT DEFAULT 0,
  revenue_one_time_cents INT DEFAULT 0,
  gmv_marketplace_cents INT DEFAULT 0,
  platform_fees_cents INT DEFAULT 0,
  affiliate_commissions_cents INT DEFAULT 0,
  payouts_cents INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.finance_daily_aggregates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_aggregates_service_access ON public.finance_daily_aggregates;

CREATE POLICY finance_aggregates_service_access ON public.finance_daily_aggregates
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
