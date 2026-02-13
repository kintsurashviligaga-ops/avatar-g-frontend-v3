-- ========================================
-- 30-DAY LAUNCH GTM SYSTEM
-- ========================================

CREATE TABLE IF NOT EXISTS launch_30_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  plan_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT launch_30_plans_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT launch_30_plans_language_check CHECK (language IN ('en', 'ka', 'ru'))
);

CREATE INDEX IF NOT EXISTS launch_30_plans_store_id ON launch_30_plans(store_id);

-- KPI Daily Tracking
CREATE TABLE IF NOT EXISTS kpi_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  date DATE NOT NULL,
  views INT DEFAULT 0,
  clicks INT DEFAULT 0,
  purchases INT DEFAULT 0,
  ad_spend_cents INT DEFAULT 0,
  revenue_cents INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(store_id, date),
  CONSTRAINT kpi_daily_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT kpi_daily_views_check CHECK (views >= 0),
  CONSTRAINT kpi_daily_clicks_check CHECK (clicks >= 0),
  CONSTRAINT kpi_daily_purchases_check CHECK (purchases >= 0),
  CONSTRAINT kpi_daily_ad_spend_check CHECK (ad_spend_cents >= 0),
  CONSTRAINT kpi_daily_revenue_check CHECK (revenue_cents >= 0)
);

CREATE INDEX IF NOT EXISTS kpi_daily_store_date ON kpi_daily(store_id, date DESC);
CREATE INDEX IF NOT EXISTS kpi_daily_store_id ON kpi_daily(store_id);

-- RLS: launch_30_plans (store owner only)
ALTER TABLE launch_30_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY launch_30_plans_owner_read ON launch_30_plans
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY launch_30_plans_owner_write ON launch_30_plans
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY launch_30_plans_owner_update ON launch_30_plans
  FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

-- RLS: kpi_daily (store owner only)
ALTER TABLE kpi_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY kpi_daily_owner_read ON kpi_daily
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY kpi_daily_owner_write ON kpi_daily
  FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY kpi_daily_owner_update ON kpi_daily
  FOR UPDATE
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );
