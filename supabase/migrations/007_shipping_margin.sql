/**
 * Avatar G Commerce Phase 1B - Shipping System & Margin Enforcement
 * 
 * Adds:
 * - Shipping profiles (store owner defines shipping options)
 * - Shipping events (track shipment lifecycle)
 * - Order shipping extensions (links orders to shipping profiles)
 * - RLS policies for all shipping tables
 * 
 * All money fields are stored as integers (cents).
 * Margin enforcement is performed server-side at product publish/import.
 */

-- ============================================
-- SHIPPING PROFILES TABLE
-- ============================================
-- Store owners define their shipping options
-- Multiple profiles per store (local, express, international, etc)

CREATE TABLE IF NOT EXISTS public.shipping_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.shop_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "Local Courier", "International DHL", "Manual"
  description TEXT,
  base_cost INT NOT NULL DEFAULT 0, -- cents, flat fee
  per_kg_cost INT NOT NULL DEFAULT 0, -- cents per kg
  estimated_days_min INT NOT NULL DEFAULT 1,
  estimated_days_max INT NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB, -- future courier integration configs
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_profiles_store_id ON public.shipping_profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_shipping_profiles_is_active ON public.shipping_profiles(is_active);

-- ============================================
-- SHIPPING EVENTS TABLE
-- ============================================
-- Immutable log of shipment status updates
-- Events are added but never modified (audit trail)

CREATE TYPE shipping_status_enum AS ENUM (
  'pending',
  'processing',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
  'returned'
);

CREATE TABLE IF NOT EXISTS public.shipping_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status shipping_status_enum NOT NULL,
  location TEXT, -- e.g. "Tbilisi Distribution Center" or "In delivery vehicle"
  tracking_code TEXT,
  metadata_json JSONB, -- courier-specific data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_events_order_id ON public.shipping_events(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_events_created_at_desc ON public.shipping_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_events_status ON public.shipping_events(status);

-- ============================================
-- EXTEND ORDERS TABLE WITH SHIPPING FIELDS
-- ============================================
-- Link orders to shipping profiles and track shipment state

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.shop_stores(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS shipping_profile_id UUID REFERENCES public.shipping_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shipping_cost INT NOT NULL DEFAULT 0, -- cents
ADD COLUMN IF NOT EXISTS tracking_code TEXT,
ADD COLUMN IF NOT EXISTS shipping_status shipping_status_enum NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS weight_grams INT; -- for future shipping cost calculations

CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON public.orders(store_id, shipping_status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders(tracking_code);

-- ============================================
-- RLS POLICIES - SHIPPING PROFILES
-- ============================================
-- Store owner can CRUD their own shipping profiles
-- Others cannot see or modify

ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS shipping_profiles_owner_select ON public.shipping_profiles;
DROP POLICY IF EXISTS shipping_profiles_owner_insert ON public.shipping_profiles;
DROP POLICY IF EXISTS shipping_profiles_owner_update ON public.shipping_profiles;
DROP POLICY IF EXISTS shipping_profiles_owner_delete ON public.shipping_profiles;

-- Store owners can select their own profiles
CREATE POLICY shipping_profiles_owner_select ON public.shipping_profiles
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- Store owners can insert profiles for their stores
CREATE POLICY shipping_profiles_owner_insert ON public.shipping_profiles
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- Store owners can update their profiles
CREATE POLICY shipping_profiles_owner_update ON public.shipping_profiles
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- Store owners can delete their profiles
CREATE POLICY shipping_profiles_owner_delete ON public.shipping_profiles
  FOR DELETE USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- ============================================
-- RLS POLICIES - SHIPPING EVENTS
-- ============================================
-- Order buyer can READ tracking for their orders
-- Store owner can READ and INSERT tracking for their orders
-- Others cannot access

ALTER TABLE public.shipping_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS shipping_events_buyer_select ON public.shipping_events;
DROP POLICY IF EXISTS shipping_events_owner_select ON public.shipping_events;
DROP POLICY IF EXISTS shipping_events_owner_insert ON public.shipping_events;

-- Buyers can view tracking for their orders
CREATE POLICY shipping_events_buyer_select ON public.shipping_events
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

-- Store owners can view tracking for their orders
CREATE POLICY shipping_events_owner_select ON public.shipping_events
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.store_id IN (
        SELECT id FROM public.shop_stores WHERE user_id = auth.uid()
      )
    )
  );

-- Store owners can insert tracking events for their orders
CREATE POLICY shipping_events_owner_insert ON public.shipping_events
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.store_id IN (
        SELECT id FROM public.shop_stores WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- RLS POLICIES - ORDERS (UPDATE)
-- ============================================
-- Extend existing orders RLS to allow store owner shipping updates

-- Drop existing policy if it exists
DROP POLICY IF EXISTS orders_shipping_update ON public.orders;

-- Store owners can update shipping fields on their orders
CREATE POLICY orders_shipping_update ON public.orders
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.shop_stores WHERE id = store_id
    )
  );

-- ============================================
-- FUNCTION: Get current shipping status for order
-- ============================================

CREATE OR REPLACE FUNCTION public.get_shipping_status(p_order_id UUID)
RETURNS TABLE (
  status TEXT,
  last_event_at TIMESTAMPTZ,
  tracking_code TEXT,
  location TEXT
) AS $$
  SELECT
    se.status::TEXT,
    MAX(se.created_at),
    o.tracking_code,
    (se.location)
  FROM public.orders o
  LEFT JOIN public.shipping_events se ON o.id = se.order_id
  WHERE o.id = p_order_id
  GROUP BY se.status, o.tracking_code, se.location
  ORDER BY MAX(se.created_at) DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.shipping_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_profiles TO authenticated;
GRANT SELECT ON public.shipping_events TO authenticated;
GRANT INSERT ON public.shipping_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shipping_status TO authenticated;
