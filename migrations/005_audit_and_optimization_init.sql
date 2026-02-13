-- ========================================
-- AUDIT LOGS & OPTIMIZATION
-- ========================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  store_id UUID,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  action TEXT NOT NULL,
  changes_json JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT audit_logs_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT audit_logs_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT audit_logs_event_type_check CHECK (event_type IN ('payment', 'invoice', 'refund', 'store_config', 'pricing', 'order'))
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_store_id ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS audit_logs_created_at ON audit_logs(created_at DESC);

-- Profit First Config (store optimization settings)
CREATE TABLE IF NOT EXISTS profit_first_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE,
  goal TEXT NOT NULL CHECK (goal IN ('profit', 'volume', 'hybrid')),
  platform_fee_bps INT NOT NULL DEFAULT 500,
  refund_reserve_bps INT NOT NULL DEFAULT 200,
  min_margin_bps INT NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT profit_first_config_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT profit_first_config_fee_check CHECK (platform_fee_bps > 0 AND platform_fee_bps <= 2000),
  CONSTRAINT profit_first_config_reserve_check CHECK (refund_reserve_bps >= 100 AND refund_reserve_bps <= 1000),
  CONSTRAINT profit_first_config_margin_check CHECK (min_margin_bps >= 200 AND min_margin_bps <= 5000)
);

CREATE INDEX IF NOT EXISTS profit_first_config_store_id ON profit_first_config(store_id);

-- Launch Readiness Checklist (store progress)
CREATE TABLE IF NOT EXISTS launch_readiness_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE,
  tax_status_selected BOOLEAN DEFAULT FALSE,
  payout_account_added BOOLEAN DEFAULT FALSE,
  invoice_test_generated BOOLEAN DEFAULT FALSE,
  payment_test_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT launch_readiness_store_fk FOREIGN KEY (store_id) REFERENCES shops(id)
);

CREATE INDEX IF NOT EXISTS launch_readiness_store_id ON launch_readiness_checklist(store_id);

-- Founder Mode Coupons
CREATE TABLE IF NOT EXISTS founder_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  discount_bps INT NOT NULL CHECK (discount_bps > 0 AND discount_bps <= 10000),
  max_redemptions INT NOT NULL CHECK (max_redemptions > 0),
  current_redemptions INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT founder_coupons_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT founder_coupons_active_check CHECK (expires_at > now())
);

CREATE INDEX IF NOT EXISTS founder_coupons_store_id ON founder_coupons(store_id);
CREATE INDEX IF NOT EXISTS founder_coupons_code ON founder_coupons(code);
CREATE INDEX IF NOT EXISTS founder_coupons_expires_at ON founder_coupons(expires_at);

-- RLS: audit_logs (admin only, server-side)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_server_only ON audit_logs
  USING (false)
  WITH CHECK (false);

-- RLS: profit_first_config (store owner)
ALTER TABLE profit_first_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY profit_first_config_owner_read ON profit_first_config
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY profit_first_config_owner_write ON profit_first_config
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY profit_first_config_owner_update ON profit_first_config
  FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- RLS: launch_readiness_checklist (store owner)
ALTER TABLE launch_readiness_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY launch_readiness_owner_read ON launch_readiness_checklist
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY launch_readiness_owner_write ON launch_readiness_checklist
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY launch_readiness_owner_update ON launch_readiness_checklist
  FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- RLS: founder_coupons (store owner)
ALTER TABLE founder_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY founder_coupons_owner_read ON founder_coupons
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY founder_coupons_owner_write ON founder_coupons
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY founder_coupons_owner_update ON founder_coupons
  FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );
