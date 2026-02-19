-- Avatar G - Phase 10: Shipping and Tracking System
-- Created: Feb 2026
-- Purpose: Shopify-level shipping, fulfillment, and live tracking

========================================
-- ALTER ORDERS TABLE - ADD SHIPPING FIELDS
========================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS shipping_address_json JSONB DEFAULT '{}', -- {country, city, street, zip, phone, name}
ADD COLUMN IF NOT EXISTS shipping_method TEXT,
ADD COLUMN IF NOT EXISTS shipping_cost_cents INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_currency TEXT DEFAULT 'gel',
ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled'
  CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered', 'returned', 'canceled'));

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON public.orders(fulfillment_status);

========================================
-- SHIPMENTS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Carrier and tracking
  carrier TEXT NOT NULL DEFAULT 'manual', -- manual, georgian_post, glovo, wolt, dhl, ups
  service_level TEXT DEFAULT 'standard', -- standard, express
  tracking_number TEXT,
  tracking_url TEXT,
  tracking_public_token TEXT UNIQUE GENERATED ALWAYS AS (
    encode(gen_random_bytes(32), 'hex')
  ) STORED, -- Token for public tracking link
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'canceled', 'returned')),
  
  -- Timestamps
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipments_order_idx ON public.shipments(order_id);
CREATE INDEX IF NOT EXISTS shipments_seller_idx ON public.shipments(seller_user_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON public.shipments(status);
CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx ON public.shipments(tracking_number);
CREATE INDEX IF NOT EXISTS shipments_token_idx ON public.shipments(tracking_public_token);
CREATE INDEX IF NOT EXISTS shipments_created_idx ON public.shipments(created_at DESC);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- RLS: Seller can read/write their own shipments
CREATE POLICY shipments_seller_policy ON public.shipments
  FOR ALL USING (auth.uid() = seller_user_id);

-- RLS: Buyer can read shipments for their orders (public token + owner check)
CREATE POLICY shipments_buyer_read_policy ON public.shipments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = shipments.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- RLS: Service role can write shipment events (carrier webhooks)
CREATE POLICY shipments_service_write_policy ON public.shipments
  FOR UPDATE USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

========================================
-- SHIPMENT EVENTS TABLE (Audit Trail)
========================================
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  
  -- Event details
  status TEXT NOT NULL,
  location TEXT,
  message TEXT,
  
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'system', -- system, carrier, seller, admin
  
  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipment_events_shipment_idx ON public.shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS shipment_events_occurred_idx ON public.shipment_events(shipment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS shipment_events_created_idx ON public.shipment_events(created_at DESC);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- RLS: Events readable by order buyer and seller
CREATE POLICY shipment_events_read_policy ON public.shipment_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.shipments
      WHERE shipments.id = shipment_events.shipment_id
      AND (
        shipments.seller_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.orders
          WHERE orders.id = shipments.order_id
          AND orders.user_id = auth.uid()
        )
      )
    )
  );

-- RLS: Service role and seller can insert events
CREATE POLICY shipment_events_insert_policy ON public.shipment_events
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.shipments
      WHERE shipments.id = shipment_events.shipment_id
      AND shipments.seller_user_id = auth.uid()
    )
  );

========================================
-- SHIPPING ZONES TABLE
========================================
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Zone definition
  zone_name TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}', -- ISO country codes: ['GE', 'US', 'GB']
  regions TEXT[], -- Optional: cities/regions within countries
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipping_zones_seller_idx ON public.shipping_zones(seller_user_id);

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipping_zones_seller_policy ON public.shipping_zones
  FOR ALL USING (auth.uid() = seller_user_id);

========================================
-- SHIPPING RATES TABLE
========================================
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  
  -- Rate details
  name TEXT NOT NULL, -- "Standard", "Express", "Overnight"
  min_days INT NOT NULL DEFAULT 3,
  max_days INT NOT NULL DEFAULT 7,
  price_cents INT NOT NULL, -- In cents to avoid float precision issues
  currency TEXT NOT NULL DEFAULT 'gel',
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipping_rates_zone_idx ON public.shipping_rates(zone_id);
CREATE INDEX IF NOT EXISTS shipping_rates_active_idx ON public.shipping_rates(is_active);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipping_rates_seller_policy ON public.shipping_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.shipping_zones
      WHERE shipping_zones.id = shipping_rates.zone_id
      AND shipping_zones.seller_user_id = auth.uid()
    )
  );

========================================
-- TRACKING TOKENS TABLE (For Public Tracking Links)
========================================
CREATE TABLE IF NOT EXISTS public.tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  
  -- Token for public access
  token TEXT NOT NULL UNIQUE,
  
  -- Expiration (optional, NULL = never expires)
  expires_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracking_tokens_token_idx ON public.tracking_tokens(token);
CREATE INDEX IF NOT EXISTS tracking_tokens_shipment_idx ON public.tracking_tokens(shipment_id);

ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS needed: tokens are publicly accessible
CREATE POLICY tracking_tokens_public_policy ON public.tracking_tokens
  FOR SELECT USING (TRUE);

========================================
-- TRIGGERS FOR TIMESTAMP UPDATES
========================================
CREATE OR REPLACE FUNCTION update_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipments_updated_at_trigger ON public.shipments;
CREATE TRIGGER shipments_updated_at_trigger
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_shipments_updated_at();

CREATE OR REPLACE FUNCTION update_shipping_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipping_zones_updated_at_trigger ON public.shipping_zones;
CREATE TRIGGER shipping_zones_updated_at_trigger
  BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_zones_updated_at();

CREATE OR REPLACE FUNCTION update_shipping_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipping_rates_updated_at_trigger ON public.shipping_rates;
CREATE TRIGGER shipping_rates_updated_at_trigger
  BEFORE UPDATE ON public.shipping_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_rates_updated_at();

========================================
-- MIGRATION COMPLETE
========================================
