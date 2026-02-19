-- Phase 9: Georgia-specific Tax/VAT + Invoice Engine + Bank Readiness
-- Tables for business profiles, invoices, and tax tracking

-- =====================================================
-- 1. Business Profiles (User Tax Configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name text,
  tax_id text,
  address text,
  phone text,
  email text,
  is_vat_payer boolean NOT NULL DEFAULT false,
  vat_rate numeric(5,2) NOT NULL DEFAULT 18.00,
  invoice_prefix text NOT NULL DEFAULT 'AG',
  next_invoice_number integer NOT NULL DEFAULT 1,
  default_currency text NOT NULL DEFAULT 'GEL' CHECK (default_currency IN ('GEL', 'USD')),
  fx_rate_gel_per_usd numeric(10,4) NOT NULL DEFAULT 2.7000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);

-- =====================================================
-- 2. Invoices (Main Invoice Records - Immutable Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  buyer_tax_id text,
  buyer_address text,
  buyer_email text,
  invoice_number text UNIQUE NOT NULL,
  currency text NOT NULL CHECK (currency IN ('GEL', 'USD')),
  fx_rate_gel_per_usd numeric(10,4) NOT NULL DEFAULT 2.7000,
  subtotal_cents integer NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  vat_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'void')),
  stripe_object_id text,
  pdf_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  voided_at timestamptz
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_object_id) WHERE stripe_object_id IS NOT NULL;

-- =====================================================
-- 3. Invoice Items (Line Items - Immutable)
-- =====================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  title text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- =====================================================
-- 4. Tax Accounting Records (Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS tax_accounting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  record_type text NOT NULL CHECK (record_type IN ('invoice', 'refund', 'adjustment')),
  income_gross_cents integer NOT NULL,
  vat_collected_cents integer NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  net_income_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'GEL' CHECK (currency IN ('GEL', 'USD')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_tax_records_user_id ON tax_accounting_records(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_records_type ON tax_accounting_records(record_type);
CREATE INDEX IF NOT EXISTS idx_tax_records_created_at ON tax_accounting_records(created_at DESC);

-- =====================================================
-- 5. Payment Provider Configurations (Future: TBC/BoG/Payze)
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active_provider text NOT NULL DEFAULT 'stripe' CHECK (active_provider IN ('stripe', 'tbc', 'bog', 'payze')),
  stripe_enabled boolean NOT NULL DEFAULT true,
  tbc_enabled boolean NOT NULL DEFAULT false,
  bog_enabled boolean NOT NULL DEFAULT false,
  payze_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_provider_user_id ON payment_provider_configs(user_id);

-- =====================================================
-- Row-Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_accounting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_configs ENABLE ROW LEVEL SECURITY;

-- business_profiles: Users can see/edit only their own profile
CREATE POLICY "business_profiles_select" ON business_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "business_profiles_insert" ON business_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_profiles_update" ON business_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- invoices: Users can see only their own invoices; create via API only
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- invoices: Only owner can update status or void
CREATE POLICY "invoices_update_status" ON invoices
  FOR UPDATE USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id AND (status = 'issued' OR status = 'paid' OR status = 'void'));

-- invoice_items: Users can see only items in their invoices via join
CREATE POLICY "invoice_items_select" ON invoice_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );

-- tax_accounting_records: Users can see only their own records
CREATE POLICY "tax_records_select" ON tax_accounting_records
  FOR SELECT USING (auth.uid() = user_id);

-- tax_accounting_records: API can insert (via service role)
CREATE POLICY "tax_records_insert" ON tax_accounting_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- payment_provider_configs: Users can see/edit only their own config
CREATE POLICY "payment_provider_select" ON payment_provider_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payment_provider_insert" ON payment_provider_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payment_provider_update" ON payment_provider_configs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- Trigger: Update business_profiles.updated_at on changes
-- =====================================================
CREATE OR REPLACE FUNCTION update_business_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_profiles_update_timestamp
BEFORE UPDATE ON business_profiles
FOR EACH ROW
EXECUTE FUNCTION update_business_profiles_updated_at();

-- =====================================================
-- Trigger: Update payment_provider_configs.updated_at on changes
-- =====================================================
CREATE OR REPLACE FUNCTION update_payment_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_configs_update_timestamp
BEFORE UPDATE ON payment_provider_configs
FOR EACH ROW
EXECUTE FUNCTION update_payment_configs_updated_at();
