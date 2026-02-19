-- Avatar G - Phase 11: Post-Purchase Operations (Returns/Refunds/Disputes/Inventory)
-- Created: Feb 2026
-- Purpose: Returns management, refund automation, dispute handling, inventory sync

========================================
-- PRODUCTS TABLE (Create new or extend)
========================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Product details
  title TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE,
  
  -- Pricing
  price_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Inventory tracking
  stock_quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,  -- Reserved by pending orders
  low_stock_threshold INT DEFAULT 5,
  track_inventory BOOLEAN DEFAULT TRUE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  metadata_json JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_seller_idx ON public.products(seller_user_id);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products(is_active);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_seller_policy ON public.products
  FOR ALL USING (auth.uid() = seller_user_id);

CREATE POLICY products_read_policy ON public.products
  FOR SELECT USING (is_active = TRUE OR auth.uid() = seller_user_id);

========================================
-- ORDER_ITEMS TABLE (Ensure exists with product link)
========================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  
  -- Quantity and pricing at purchase time
  title TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL,
  line_total_cents INT NOT NULL,
  
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
-- INVENTORY_MOVEMENTS (Audit Trail)
========================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Movement type and quantity
  type TEXT NOT NULL -- reserve|release|deduct|restock|adjust|return_received
    CHECK (type IN ('reserve', 'release', 'deduct', 'restock', 'adjust', 'return_received')),
  qty_delta INT NOT NULL,  -- Negative for deductions, positive for restocks
  
  -- Context
  reason TEXT,
  note TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx ON public.inventory_movements(order_id);
CREATE INDEX IF NOT EXISTS inventory_movements_created_idx ON public.inventory_movements(created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_movements_seller_read_policy ON public.inventory_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = inventory_movements.product_id
      AND products.seller_user_id = auth.uid()
    )
  );

-- Only service role can write movements
CREATE POLICY inventory_movements_service_write_policy ON public.inventory_movements
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

========================================
-- RETURN_REQUESTS (RMA - Return Merchandise Authorization)
========================================
CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Return details
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'label_sent', 'in_transit', 'received', 'refunded', 'closed')),
  
  reason TEXT NOT NULL,  -- damage|defect|wrong_item|not_as_described|changed_mind|other
  notes TEXT,
  evidence_urls TEXT[] DEFAULT '{}',  -- Photos/evidence
  
  -- Refund
  refund_amount_cents INT,
  currency TEXT DEFAULT 'usd',
  
  -- Approval metadata
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS return_requests_order_idx ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS return_requests_buyer_idx ON public.return_requests(buyer_user_id);
CREATE INDEX IF NOT EXISTS return_requests_seller_idx ON public.return_requests(seller_user_id);
CREATE INDEX IF NOT EXISTS return_requests_status_idx ON public.return_requests(status);
CREATE INDEX IF NOT EXISTS return_requests_created_idx ON public.return_requests(created_at DESC);

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

-- RLS: Buyer can read/write their own returns
CREATE POLICY return_requests_buyer_policy ON public.return_requests
  FOR ALL USING (auth.uid() = buyer_user_id);

-- RLS: Seller can read returns for their orders
CREATE POLICY return_requests_seller_read_policy ON public.return_requests
  FOR SELECT USING (auth.uid() = seller_user_id);

-- RLS: Seller can update return status (approve/reject only)
CREATE POLICY return_requests_seller_update_policy ON public.return_requests
  FOR UPDATE USING (auth.uid() = seller_user_id)
  WITH CHECK (auth.uid() = seller_user_id);

========================================
-- REFUNDS TABLE
========================================
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_request_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
  
  -- Stripe integration
  stripe_refund_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  
  -- Amount and status
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  
  -- Reason
  reason TEXT,
  
  -- Reversals applied
  affiliate_commission_reversed BOOLEAN DEFAULT FALSE,
  seller_payout_adjusted BOOLEAN DEFAULT FALSE,
  invoice_voided BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refunds_order_idx ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS refunds_return_idx ON public.refunds(return_request_id);
CREATE INDEX IF NOT EXISTS refunds_stripe_idx ON public.refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON public.refunds(status);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- RLS: Buyer can read refunds for their orders
CREATE POLICY refunds_buyer_read_policy ON public.refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = refunds.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- RLS: Seller can read refunds for their orders
CREATE POLICY refunds_seller_read_policy ON public.refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = refunds.order_id
      AND EXISTS (
        SELECT 1 FROM public.shipments
        WHERE shipments.order_id = orders.id
        AND shipments.seller_user_id = auth.uid()
      )
    )
  );

========================================
-- DISPUTES TABLE (Chargebacks/Claims)
========================================
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Stripe integration
  stripe_dispute_id TEXT UNIQUE NOT NULL,
  stripe_charge_id TEXT,
  
  -- Dispute details
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL -- warning_needs_response|warning_under_review|needs_response|under_review|won|lost
    CHECK (status IN ('warning_needs_response', 'warning_under_review', 'needs_response', 'under_review', 'won', 'lost')),
  
  reason TEXT,  -- fraud|fraudulent|unrecognized|unauthorized|duplicate|general
  reason_description TEXT,
  
  -- Payout hold
  payout_hold_applied BOOLEAN DEFAULT FALSE,
  payout_hold_amount_cents INT,
  
  -- Evidence
  evidence_urls TEXT[] DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disputes_order_idx ON public.disputes(order_id);
CREATE INDEX IF NOT EXISTS disputes_stripe_idx ON public.disputes(stripe_dispute_id);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON public.disputes(status);
CREATE INDEX IF NOT EXISTS disputes_created_idx ON public.disputes(created_at DESC);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- RLS: Read-only for sellers (via order)
CREATE POLICY disputes_seller_read_policy ON public.disputes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = disputes.order_id
      AND EXISTS (
        SELECT 1 FROM public.shipments
        WHERE shipments.order_id = orders.id
        AND shipments.seller_user_id = auth.uid()
      )
    )
  );

-- RLS: Read-only for buyers
CREATE POLICY disputes_buyer_read_policy ON public.disputes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = disputes.order_id
      AND orders.user_id = auth.uid()
    )
  );

========================================
-- TRIGGERS FOR TIMESTAMP UPDATES
========================================
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at_trigger ON public.products;
CREATE TRIGGER products_updated_at_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

CREATE OR REPLACE FUNCTION update_return_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS return_requests_updated_at_trigger ON public.return_requests;
CREATE TRIGGER return_requests_updated_at_trigger
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_return_requests_updated_at();

CREATE OR REPLACE FUNCTION update_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refunds_updated_at_trigger ON public.refunds;
CREATE TRIGGER refunds_updated_at_trigger
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_refunds_updated_at();

CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS disputes_updated_at_trigger ON public.disputes;
CREATE TRIGGER disputes_updated_at_trigger
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_disputes_updated_at();

========================================
-- MIGRATION COMPLETE
========================================
