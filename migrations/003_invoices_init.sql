-- ========================================
-- INVOICE SYSTEM (Immutable Snapshots)
-- ========================================

CREATE TABLE IF NOT EXISTS invoice_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  year INT NOT NULL,
  next_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(store_id, year),
  CONSTRAINT invoice_counters_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT invoice_counters_year_check CHECK (year >= 2024 AND year <= 2099),
  CONSTRAINT invoice_counters_next_number_check CHECK (next_number >= 1)
);

CREATE INDEX IF NOT EXISTS invoice_counters_store_year ON invoice_counters(store_id, year);

-- Invoices (immutable snapshots)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE,
  store_id UUID NOT NULL,
  buyer_user_id UUID NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  tax_status TEXT NOT NULL CHECK (tax_status IN ('vat_payer', 'non_vat_payer')),
  vat_rate_bps INT NOT NULL DEFAULT 1800,
  vat_amount_cents INT NOT NULL DEFAULT 0,
  subtotal_cents INT NOT NULL CHECK (subtotal_cents > 0),
  total_cents INT NOT NULL CHECK (total_cents > 0),
  currency TEXT NOT NULL DEFAULT 'GEL',
  fx_rate_usd NUMERIC(10, 6),
  issued_at TIMESTAMPTZ DEFAULT now(),
  pdf_path TEXT NOT NULL,
  pdf_size_bytes INT,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT invoices_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT invoices_store_fk FOREIGN KEY (store_id) REFERENCES shops(id),
  CONSTRAINT invoices_buyer_fk FOREIGN KEY (buyer_user_id) REFERENCES auth.users(id),
  CONSTRAINT invoices_total_gte_subtotal CHECK (total_cents >= subtotal_cents)
);

CREATE INDEX IF NOT EXISTS invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS invoices_store_id ON invoices(store_id);
CREATE INDEX IF NOT EXISTS invoices_buyer_id ON invoices(buyer_user_id);
CREATE INDEX IF NOT EXISTS invoices_issued_at ON invoices(issued_at DESC);
CREATE INDEX IF NOT EXISTS invoices_invoice_number ON invoices(invoice_number);

-- RLS: invoice_counters (server only)
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_counters_server_only ON invoice_counters
  USING (false)
  WITH CHECK (false);

-- RLS: invoices (store owner or buyer can read their own)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_store_owner_read ON invoices
  FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY invoices_buyer_read ON invoices
  FOR SELECT
  USING (buyer_user_id = auth.uid());

CREATE POLICY invoices_server_insert ON invoices
  FOR INSERT
  WITH CHECK (false);

-- Note: Invoice creation is server-side only via POST /api/invoices/generate
