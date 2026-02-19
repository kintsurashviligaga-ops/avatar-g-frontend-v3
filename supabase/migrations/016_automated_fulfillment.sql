-- ============================================================
-- PHASE 12: AUTOMATED FULFILLMENT & AI SUPPLIER ENGINE
-- Migration 016
-- ============================================================

-- ============================================================
-- 1. SUPPLIERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('api', 'manual', 'warehouse')),
  api_endpoint TEXT,
  api_key_encrypted TEXT, -- Encrypted with app-level encryption
  rating NUMERIC(3,2) DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
  avg_shipping_days INTEGER DEFAULT 7,
  return_rate NUMERIC(5,2) DEFAULT 0.0, -- Percentage (0-100)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_type ON suppliers(type);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);
CREATE INDEX idx_suppliers_rating ON suppliers(rating DESC);

-- ============================================================
-- 2. SUPPLIER PRODUCTS TABLE (Catalog Mapping)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku TEXT NOT NULL,
  cost_cents INTEGER NOT NULL, -- Wholesale cost from supplier
  currency TEXT NOT NULL DEFAULT 'USD',
  shipping_days_min INTEGER NOT NULL DEFAULT 3,
  shipping_days_max INTEGER NOT NULL DEFAULT 10,
  stock_quantity INTEGER DEFAULT NULL, -- NULL = unlimited/unknown
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(supplier_id, product_id)
);

CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_product ON supplier_products(product_id);
CREATE INDEX idx_supplier_products_available ON supplier_products(is_available);
CREATE INDEX idx_supplier_products_cost ON supplier_products(cost_cents);

-- ============================================================
-- 3. FULFILLMENT JOBS TABLE (Core Automation)
-- ============================================================
CREATE TABLE IF NOT EXISTS fulfillment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id UUID REFERENCES auth.users(id), -- Seller/store owner
  supplier_id UUID REFERENCES suppliers(id),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('manual', 'dropship', 'warehouse', 'digital')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'shipped', 'delivered', 'failed', 'cancelled')),
  supplier_order_id TEXT, -- External supplier order reference
  tracking_number TEXT,
  carrier TEXT,
  estimated_delivery_date DATE,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fulfillment_jobs_order ON fulfillment_jobs(order_id);
CREATE INDEX idx_fulfillment_jobs_store ON fulfillment_jobs(store_id);
CREATE INDEX idx_fulfillment_jobs_status ON fulfillment_jobs(status);
CREATE INDEX idx_fulfillment_jobs_type ON fulfillment_jobs(fulfillment_type);
CREATE INDEX idx_fulfillment_jobs_retry ON fulfillment_jobs(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;

-- ============================================================
-- 4. ORDER SHIPMENTS TABLE (Multi-shipment Support)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_job_id UUID REFERENCES fulfillment_jobs(id),
  tracking_number TEXT NOT NULL,
  carrier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
  shipped_at TIMESTAMPTZ,
  estimated_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  tracking_events JSONB DEFAULT '[]'::jsonb, -- Array of tracking updates
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_shipments_order ON order_shipments(order_id);
CREATE INDEX idx_order_shipments_tracking ON order_shipments(tracking_number);
CREATE INDEX idx_order_shipments_status ON order_shipments(status);

-- ============================================================
-- 5. INVENTORY TABLE (Stock Management)
-- ============================================================
-- Note: If products table already has stock fields from Phase 11,
-- we'll extend it. Otherwise create inventory table.

-- Check if products table exists and extend it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'fulfillment_type'
  ) THEN
    ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'manual' CHECK (fulfillment_type IN ('manual', 'dropship', 'warehouse', 'digital')),
      ADD COLUMN IF NOT EXISTS warehouse_location TEXT,
      ADD COLUMN IF NOT EXISTS digital_download_url TEXT,
      ADD COLUMN IF NOT EXISTS auto_fulfill BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ============================================================
-- 6. FULFILLMENT ERRORS TABLE (Error Logging)
-- ============================================================
CREATE TABLE IF NOT EXISTS fulfillment_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_job_id UUID NOT NULL REFERENCES fulfillment_jobs(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL, -- 'api_error', 'timeout', 'validation', 'rate_limit', 'unknown'
  error_code TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  request_payload JSONB,
  response_payload JSONB,
  retry_attempt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fulfillment_errors_job ON fulfillment_errors(fulfillment_job_id);
CREATE INDEX idx_fulfillment_errors_type ON fulfillment_errors(error_type);
CREATE INDEX idx_fulfillment_errors_created ON fulfillment_errors(created_at DESC);

-- ============================================================
-- 7. FRAUD CHECKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS fraud_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stripe_risk_level TEXT, -- 'normal', 'elevated', 'highest'
  stripe_risk_score INTEGER, -- 0-100
  checks_performed JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged', 'blocked')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_checks_order ON fraud_checks(order_id);
CREATE INDEX idx_fraud_checks_status ON fraud_checks(status);
CREATE INDEX idx_fraud_checks_risk ON fraud_checks(stripe_risk_score DESC);

-- ============================================================
-- 8. TRIGGERS FOR UPDATED_AT
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_products_updated_at
  BEFORE UPDATE ON supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fulfillment_jobs_updated_at
  BEFORE UPDATE ON fulfillment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_shipments_updated_at
  BEFORE UPDATE ON order_shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fraud_checks_updated_at
  BEFORE UPDATE ON fraud_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_checks ENABLE ROW LEVEL SECURITY;

-- Suppliers: Admin manages, sellers can view active
CREATE POLICY suppliers_admin_all ON suppliers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY suppliers_sellers_read ON suppliers
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Supplier Products: Admin manages, sellers view available
CREATE POLICY supplier_products_admin_all ON supplier_products
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY supplier_products_sellers_read ON supplier_products
  FOR SELECT
  TO authenticated
  USING (is_available = TRUE);

-- Fulfillment Jobs: Sellers manage own, admin manages all
CREATE POLICY fulfillment_jobs_seller_own ON fulfillment_jobs
  FOR ALL
  TO authenticated
  USING (store_id = auth.uid());

CREATE POLICY fulfillment_jobs_admin_all ON fulfillment_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Order Shipments: Buyers/sellers/admin can view
CREATE POLICY order_shipments_buyer_view ON order_shipments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_shipments.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY order_shipments_seller_view ON order_shipments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fulfillment_jobs
      WHERE fulfillment_jobs.id = order_shipments.fulfillment_job_id
      AND fulfillment_jobs.store_id = auth.uid()
    )
  );

CREATE POLICY order_shipments_admin_all ON order_shipments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Fulfillment Errors: Sellers view own, admin views all
CREATE POLICY fulfillment_errors_seller_view ON fulfillment_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fulfillment_jobs
      WHERE fulfillment_jobs.id = fulfillment_errors.fulfillment_job_id
      AND fulfillment_jobs.store_id = auth.uid()
    )
  );

CREATE POLICY fulfillment_errors_admin_all ON fulfillment_errors
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Fraud Checks: Admin only
CREATE POLICY fraud_checks_admin_all ON fraud_checks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Service role bypass (for server-side operations)
CREATE POLICY suppliers_service_role ON suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY supplier_products_service_role ON supplier_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fulfillment_jobs_service_role ON fulfillment_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY order_shipments_service_role ON order_shipments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fulfillment_errors_service_role ON fulfillment_errors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fraud_checks_service_role ON fraud_checks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 10. SEED DATA (Example Suppliers)
-- ============================================================
INSERT INTO suppliers (id, name, type, rating, avg_shipping_days, return_rate, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Internal Warehouse', 'warehouse', 5.0, 2, 0.5, true),
  ('00000000-0000-0000-0000-000000000002', 'Manual Fulfillment', 'manual', 4.5, 5, 1.0, true),
  ('00000000-0000-0000-0000-000000000003', 'Mock Dropship API', 'api', 4.8, 7, 2.0, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. FUNCTIONS & PROCEDURES
-- ============================================================

-- Function: Calculate supplier score (AI scoring)
CREATE OR REPLACE FUNCTION calculate_supplier_score(
  p_cost_cents INTEGER,
  p_avg_shipping_days INTEGER,
  p_rating NUMERIC,
  p_return_rate NUMERIC,
  p_weight_price NUMERIC DEFAULT 0.4,
  p_weight_shipping NUMERIC DEFAULT 0.3,
  p_weight_rating NUMERIC DEFAULT 0.2,
  p_weight_risk NUMERIC DEFAULT 0.1
)
RETURNS NUMERIC AS $$
DECLARE
  v_price_score NUMERIC;
  v_shipping_score NUMERIC;
  v_rating_score NUMERIC;
  v_risk_score NUMERIC;
  v_final_score NUMERIC;
BEGIN
  -- Normalize scores (inverse for cost and shipping days)
  v_price_score := 1.0 / (p_cost_cents / 1000.0 + 1); -- Normalize to 0-1
  v_shipping_score := 1.0 / (p_avg_shipping_days + 1);
  v_rating_score := p_rating / 5.0; -- Already 0-5, normalize to 0-1
  v_risk_score := 1.0 - (p_return_rate / 100.0); -- Lower return rate = better
  
  -- Weighted sum
  v_final_score := 
    (p_weight_price * v_price_score) +
    (p_weight_shipping * v_shipping_score) +
    (p_weight_rating * v_rating_score) +
    (p_weight_risk * v_risk_score);
  
  RETURN ROUND(v_final_score, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Select best supplier for product
CREATE OR REPLACE FUNCTION select_best_supplier(p_product_id UUID)
RETURNS TABLE(
  supplier_id UUID,
  supplier_name TEXT,
  cost_cents INTEGER,
  score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id AS supplier_id,
    s.name AS supplier_name,
    sp.cost_cents,
    calculate_supplier_score(
      sp.cost_cents,
      s.avg_shipping_days,
      s.rating,
      s.return_rate
    ) AS score
  FROM supplier_products sp
  JOIN suppliers s ON sp.supplier_id = s.id
  WHERE sp.product_id = p_product_id
    AND sp.is_available = TRUE
    AND s.is_active = TRUE
  ORDER BY score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 12. COMMENTS
-- ============================================================
COMMENT ON TABLE suppliers IS 'Supplier catalog for automated fulfillment';
COMMENT ON TABLE supplier_products IS 'Maps products to suppliers with pricing';
COMMENT ON TABLE fulfillment_jobs IS 'Core automation queue for order fulfillment';
COMMENT ON TABLE order_shipments IS 'Multi-shipment support (one order can have multiple shipments)';
COMMENT ON TABLE fulfillment_errors IS 'Error logging for debugging and retry logic';
COMMENT ON TABLE fraud_checks IS 'Pre-fulfillment fraud detection results';
COMMENT ON FUNCTION calculate_supplier_score IS 'AI scoring algorithm for supplier selection';
COMMENT ON FUNCTION select_best_supplier IS 'Returns best supplier for a product based on AI score';
