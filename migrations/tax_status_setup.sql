-- Tax Status Feature - Database Migrations
-- Georgian stores can choose VAT payer or non-VAT payer status
-- Date: February 13, 2026

-- ============================================
-- Phase 1: Add tax fields to stores table
-- ============================================

-- Tax status (VAT payer or non-VAT payer)
ALTER TABLE public.stores 
ADD COLUMN tax_status TEXT NOT NULL DEFAULT 'non_vat_payer';

-- VAT rate in basis points (1800 = 18%)
ALTER TABLE public.stores 
ADD COLUMN vat_rate_bps INTEGER NOT NULL DEFAULT 1800;

-- VAT registration number (optional)
ALTER TABLE public.stores 
ADD COLUMN vat_registration_no TEXT;

-- Whether prices include VAT (default: true for Georgian model)
ALTER TABLE public.stores 
ADD COLUMN prices_include_vat BOOLEAN NOT NULL DEFAULT true;

-- Tax residency country (primarily 'GE' for Georgia)
ALTER TABLE public.stores 
ADD COLUMN tax_residency_country TEXT NOT NULL DEFAULT 'GE';

-- Legal entity type for compliance
ALTER TABLE public.stores 
ADD COLUMN legal_entity_type TEXT;
-- Allowed: 'individual', 'llc'

-- ============================================
-- Phase 2: Add constraint to enforce consistency
-- ============================================

-- Ensure tax_status matches vat_enabled
ALTER TABLE public.stores
ADD CONSTRAINT check_tax_status_consistency
CHECK (
  (tax_status = 'vat_payer' AND vat_enabled = true) OR
  (tax_status = 'non_vat_payer' AND vat_enabled = false)
);

-- ============================================
-- Phase 3: Add snapshot field to orders table
-- ============================================

-- Record the store's tax status at order creation time
-- This allows historical VAT reporting even if store status changes later
ALTER TABLE public.orders
ADD COLUMN vat_status TEXT;
-- Allowed: 'vat_payer', 'non_vat_payer'

-- ============================================
-- Phase 4: Set default values for existing stores
-- ============================================

-- ALL existing stores default to non-VAT payer
-- (Safe default: no VAT collection responsibility)
UPDATE public.stores
SET 
  tax_status = 'non_vat_payer',
  vat_enabled = false,
  vat_rate_bps = 1800,
  prices_include_vat = true,
  tax_residency_country = 'GE',
  legal_entity_type = NULL
WHERE tax_status IS NULL;

-- ============================================
-- Phase 5: Create indexes for performance
-- ============================================

-- Index for tax status queries
CREATE INDEX idx_stores_tax_status ON public.stores(tax_status);

-- Index for orders VAT status (for reporting)
CREATE INDEX idx_orders_vat_status ON public.orders(vat_status);

-- ============================================
-- Phase 6: Create views for reporting
-- ============================================

-- VAT Payer stores
CREATE OR REPLACE VIEW vat_payer_stores AS
SELECT 
  id,
  user_id,
  shop_name,
  vat_registration_no,
  vat_rate_bps,
  created_at
FROM public.stores
WHERE tax_status = 'vat_payer' AND is_active = true;

-- Non-VAT Payer stores
CREATE OR REPLACE VIEW non_vat_payer_stores AS
SELECT 
  id,
  user_id,
  shop_name,
  created_at
FROM public.stores
WHERE tax_status = 'non_vat_payer' AND is_active = true;

-- Orders by tax status
CREATE OR REPLACE VIEW orders_by_tax_status AS
SELECT 
  vat_status,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue,
  SUM(vat_amount) as total_vat_collected,
  DATE(created_at) as order_date
FROM public.orders
WHERE created_at >= now() - interval '30 days'
GROUP BY vat_status, DATE(created_at);

-- ============================================
-- Phase 7: Add RLS policies for tax fields
-- ============================================

-- Allow users to read their own store's tax fields
ALTER POLICY select_own_stores ON public.stores
USING (auth.uid() = user_id);

-- Allow users to update tax fields on their own stores
ALTER POLICY update_own_stores ON public.stores
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Phase 8: Verification queries
-- ============================================

-- Verify columns were added
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'stores' AND column_name LIKE 'tax_%' OR column_name = 'vat_%';

-- Verify constraint was added
-- SELECT constraint_name, constraint_type
-- FROM information_schema.constraint_column_usage
-- WHERE table_name = 'stores' AND column_name = 'tax_status';

-- Verify indexes were created
-- SELECT indexname FROM pg_indexes WHERE tablename = 'stores' AND indexname LIKE 'idx_%tax%';

-- ============================================
-- Phase 9: Data migration (one-time)
-- ============================================

-- If migrating from existing vat_enabled field:
UPDATE public.stores
SET tax_status = CASE 
  WHEN vat_enabled = true THEN 'vat_payer'
  WHEN vat_enabled = false THEN 'non_vat_payer'
  ELSE 'non_vat_payer'
END
WHERE tax_status IS NULL;

-- ============================================
-- Done!
-- ============================================

-- All tax_status fields are now ready for use.
-- Existing stores default to 'non_vat_payer' (safest option).
-- Merchants can update their status via the UI.
