-- Avatar G Commerce Platform - Phase 1 Migration
-- Created: Feb 2026
-- Purpose: Wallet system, Ledger, Audit logs, Compliance tracking, Orders with VAT

========================================
-- SHOP WALLETS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.shop_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Balance tracking
  balance_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Limits and risk scoring
  lifetime_deposits DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  aml_risk_score SMALLINT DEFAULT 0, -- 0-100, flags if > 50
  aml_flagged_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shop_wallets_user_id_idx ON public.shop_wallets(user_id);
CREATE INDEX IF NOT EXISTS shop_wallets_aml_risk_idx ON public.shop_wallets(aml_risk_score DESC);

ALTER TABLE public.shop_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_wallets_user_policy ON public.shop_wallets
  FOR ALL USING (auth.uid() = user_id);

========================================
-- WALLET TRANSACTIONS TABLE (Ledger)
========================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.shop_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction details
  type VARCHAR(50) NOT NULL, -- deposit, ai_spend, withdraw, adjustment, commission, payout
  amount DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  
  -- Metadata
  description TEXT,
  metadata_json JSONB DEFAULT '{}',
  
  -- Related entities
  order_id UUID,
  job_id UUID,
  agent_id VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_created_idx ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_type_idx ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS wallet_transactions_order_idx ON public.wallet_transactions(order_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_transactions_user_policy ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

========================================
-- AUDIT LOGS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Action tracking
  action VARCHAR(100) NOT NULL, -- deposit_created, order_placed, refund_issued, payout_initiated, etc
  resource_type VARCHAR(50) NOT NULL, -- wallet, order, affiliate, etc
  resource_id UUID,
  
  -- Details
  description TEXT,
  metadata_json JSONB DEFAULT '{}',
  
  -- Risk/Compliance
  is_critical BOOLEAN DEFAULT FALSE,
  risk_flags TEXT[] DEFAULT '{}', -- aml, fraud_signal, gdpr_request, etc
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_critical_idx ON public.audit_logs(is_critical) WHERE is_critical = TRUE;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_policy ON public.audit_logs
  FOR SELECT USING (
    -- Only admin can read audit logs (implement admin check in app layer)
    user_id = auth.uid() -- Users can see their own logs for now
  );

========================================
-- USER CONSENTS TABLE (GDPR/Privacy)
========================================
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Consent flags
  marketing_emails BOOLEAN DEFAULT FALSE,
  data_processing BOOLEAN DEFAULT FALSE,
  terms_accepted BOOLEAN DEFAULT FALSE,
  privacy_policy_accepted BOOLEAN DEFAULT FALSE,
  georgian_terms_accepted BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx ON public.user_consents(user_id);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_consents_user_policy ON public.user_consents
  FOR ALL USING (auth.uid() = user_id);

========================================
-- ORDERS TABLE (Core Commerce)
========================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Stripe integration
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_metadata JSONB DEFAULT '{}',
  
  -- Order status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, refunded, disputed
  
  -- Pricing breakdown
  subtotal_amount DECIMAL(12, 2) NOT NULL,
  vat_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00, -- 18 for Georgian VAT
  vat_enabled BOOLEAN DEFAULT FALSE,
  
  platform_fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  affiliate_fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  
  total_amount DECIMAL(12, 2) NOT NULL,
  
  -- Geography
  buyer_country_code VARCHAR(2),
  buyer_email TEXT,
  buyer_name TEXT,
  
  -- Fulfillment
  fulfillment_status VARCHAR(50) DEFAULT 'pending', -- pending, shipped, delivered, returned
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_user_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_stripe_idx ON public.orders(stripe_payment_intent_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_user_policy ON public.orders
  FOR ALL USING (auth.uid() = user_id);

========================================
-- ORDER ITEMS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Product reference
  product_id UUID,
  product_name TEXT NOT NULL,
  product_sku VARCHAR(100),
  
  -- Quantity and pricing
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  
  -- Digital product
  is_digital BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON public.order_items(product_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_user_policy ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

========================================
-- AFFILIATE TRACKING TABLE
========================================
CREATE TABLE IF NOT EXISTS public.affiliate_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Affiliate cookie/session ID
  session_id TEXT NOT NULL UNIQUE,
  referral_code TEXT UNIQUE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, inactive
  
  -- Limits
  minimum_payout_threshold DECIMAL(12, 2) DEFAULT 50.00,
  pending_earnings DECIMAL(12, 2) DEFAULT 0.00,
  paid_earnings DECIMAL(12, 2) DEFAULT 0.00,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_tracking_user_idx ON public.affiliate_tracking(user_id);
CREATE INDEX IF NOT EXISTS affiliate_tracking_referral_idx ON public.affiliate_tracking(referral_code);

ALTER TABLE public.affiliate_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY affiliate_tracking_user_policy ON public.affiliate_tracking
  FOR ALL USING (auth.uid() = user_id);

========================================
-- AFFILIATE CLICKS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_tracking(id) ON DELETE CASCADE,
  
  -- Click tracking
  referral_code TEXT NOT NULL,
  visitor_ip VARCHAR(45),
  visitor_country VARCHAR(2),
  referrer_url TEXT,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_affiliate_idx ON public.affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_created_idx ON public.affiliate_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_clicks_referral_idx ON public.affiliate_clicks(referral_code);

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY affiliate_clicks_user_policy ON public.affiliate_clicks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_tracking
      WHERE affiliate_tracking.id = affiliate_clicks.affiliate_id
      AND affiliate_tracking.user_id = auth.uid()
    )
  );

========================================
-- AFFILIATE CONVERSIONS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_tracking(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Conversion tracking
  referral_code TEXT NOT NULL,
  conversion_amount DECIMAL(12, 2) NOT NULL,
  commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 5.00, -- 5% default
  commission_amount DECIMAL(12, 2) NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, failed
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affiliate_conversions_affiliate_idx ON public.affiliate_conversions(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_conversions_order_idx ON public.affiliate_conversions(order_id);
CREATE INDEX IF NOT EXISTS affiliate_conversions_created_idx ON public.affiliate_conversions(created_at DESC);

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY affiliate_conversions_user_policy ON public.affiliate_conversions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_tracking
      WHERE affiliate_tracking.id = affiliate_conversions.affiliate_id
      AND affiliate_tracking.user_id = auth.uid()
    )
  );

========================================
-- DIGITAL LICENSES TABLE (Tokenization)
========================================
CREATE TABLE IF NOT EXISTS public.digital_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  
  -- Ownership
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- License terms
  license_key TEXT NOT NULL UNIQUE,
  transfer_limit INTEGER DEFAULT 1, -- Number of allowed transfers
  transfers_used INTEGER DEFAULT 0,
  
  -- Download tracking
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER, -- NULL = unlimited
  
  -- Expiry
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS digital_licenses_owner_idx ON public.digital_licenses(owner_user_id);
CREATE INDEX IF NOT EXISTS digital_licenses_license_key_idx ON public.digital_licenses(license_key);
CREATE INDEX IF NOT EXISTS digital_licenses_created_idx ON public.digital_licenses(created_at DESC);

ALTER TABLE public.digital_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY digital_licenses_user_policy ON public.digital_licenses
  FOR ALL USING (auth.uid() = owner_user_id);

========================================
-- DIGITAL LICENSE TRANSFERS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.digital_license_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.digital_licenses(id) ON DELETE CASCADE,
  
  -- Transfer parties
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, rejected, revoked
  
  -- Metadata
  reason TEXT,
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS digital_license_transfers_license_idx ON public.digital_license_transfers(license_id);
CREATE INDEX IF NOT EXISTS digital_license_transfers_from_user_idx ON public.digital_license_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS digital_license_transfers_to_user_idx ON public.digital_license_transfers(to_user_id);

ALTER TABLE public.digital_license_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY digital_license_transfers_user_policy ON public.digital_license_transfers
  FOR SELECT USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

========================================
-- SUPPLIER PRODUCTS TABLE (Abstraction)
========================================
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Supplier reference
  supplier_id VARCHAR(100) NOT NULL, -- manual, alibaba, local_distributor, etc
  external_product_id TEXT NOT NULL,
  
  -- Product details
  name TEXT NOT NULL,
  description TEXT,
  cost_price DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Metadata from supplier
  attributes JSONB DEFAULT '{}', -- color, size, material, etc
  categories TEXT[] DEFAULT '{}',
  supplier_metadata JSONB DEFAULT '{}',
  
  -- Sourcing cache
  is_available BOOLEAN DEFAULT TRUE,
  availability_updated_at TIMESTAMPTZ,
  
  -- Margin calculation
  last_margin_check_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_products_supplier_idx ON public.supplier_products(supplier_id, external_product_id);
CREATE INDEX IF NOT EXISTS supplier_products_created_idx ON public.supplier_products(created_at DESC);

========================================
-- SHOP STORES TABLE (User Shops)
========================================
CREATE TABLE IF NOT EXISTS public.shop_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Shop configuration
  shop_name TEXT NOT NULL,
  shop_slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  
  -- Shop type
  shop_type VARCHAR(50) NOT NULL, -- classic, dropshipping, digital, hybrid
  
  -- Operating details
  is_active BOOLEAN DEFAULT TRUE,
  vat_enabled BOOLEAN DEFAULT FALSE,
  vat_number TEXT,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shop_stores_user_idx ON public.shop_stores(user_id);
CREATE INDEX IF NOT EXISTS shop_stores_slug_idx ON public.shop_stores(shop_slug);

ALTER TABLE public.shop_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_stores_user_policy ON public.shop_stores
  FOR ALL USING (auth.uid() = user_id);

========================================
-- PRODUCTS TABLE (Listings)
========================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.shop_stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  sku VARCHAR(100) UNIQUE,
  
  -- Pricing
  cost_price DECIMAL(12, 2),
  retail_price DECIMAL(12, 2) NOT NULL,
  margin_percent DECIMAL(5, 2),
  
  -- Type
  product_type VARCHAR(50), -- physical, digital, service
  is_digital BOOLEAN DEFAULT FALSE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- draft, published, archived
  
  -- Media
  images TEXT[] DEFAULT '{}',
  video_url TEXT,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- AI generated
  ai_generated_at TIMESTAMPTZ,
  ai_agent_id VARCHAR(100),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_store_idx ON public.products(store_id);
CREATE INDEX IF NOT EXISTS products_user_idx ON public.products(user_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products(status);
CREATE INDEX IF NOT EXISTS products_created_idx ON public.products(created_at DESC);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_user_policy ON public.products
  FOR ALL USING (auth.uid() = user_id);

========================================
-- FUNCTION: Get wallet balance
========================================
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS DECIMAL
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT balance_amount FROM public.shop_wallets WHERE user_id = p_user_id;
$$;

========================================
-- FUNCTION: Deduct from wallet (atomically)
========================================
CREATE OR REPLACE FUNCTION public.deduct_from_wallet(
  p_wallet_id UUID,
  p_user_id UUID,
  p_amount DECIMAL,
  p_type VARCHAR,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Lock wallet for update
  UPDATE public.shop_wallets
  SET balance_amount = balance_amount - p_amount,
      updated_at = NOW()
  WHERE id = p_wallet_id AND user_id = p_user_id AND balance_amount >= p_amount;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance or wallet not found';
  END IF;
  
  -- Get new balance
  SELECT balance_amount INTO v_new_balance FROM public.shop_wallets WHERE id = p_wallet_id;
  
  -- Record transaction
  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_after, description, metadata_json
  )
  VALUES (
    p_wallet_id, p_user_id, p_type, -p_amount, v_new_balance, p_description, p_metadata
  )
  RETURNING id INTO v_transaction_id;
  
  -- Audit log
  INSERT INTO public.audit_logs (
    user_id, action, resource_type, resource_id, description, is_critical
  )
  VALUES (
    p_user_id, 'wallet_deduction', 'wallet', p_wallet_id, p_description || ' (' || p_amount || ')', TRUE
  );
  
  RETURN v_transaction_id;
END;
$$
```
