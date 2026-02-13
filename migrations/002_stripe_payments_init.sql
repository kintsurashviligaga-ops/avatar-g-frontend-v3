-- ========================================
-- STRIPE PAYMENTS INFRASTRUCTURE
-- ========================================

-- Stripe Events (idempotent webhook processing)
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  error_log TEXT,
  
  CONSTRAINT stripe_events_type_check CHECK (type != '')
);

CREATE INDEX IF NOT EXISTS stripe_events_created_at ON stripe_events(created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS stripe_events_processed_at ON stripe_events(processed_at) WHERE processed_at IS NOT NULL;

-- Payment Attempts (track Stripe payment intents)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  store_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  payment_intent_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'requires_action', 'succeeded', 'failed', 'refunded')),
  amount_total_cents INT NOT NULL CHECK (amount_total_cents > 0),
  currency TEXT NOT NULL,
  last_4_digits TEXT,
  card_brand TEXT,
  refund_cents INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  CONSTRAINT payment_attempts_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT payment_attempts_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT payment_attempts_store_fk FOREIGN KEY (store_id) REFERENCES shops(id)
);

CREATE INDEX IF NOT EXISTS payment_attempts_order_id ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS payment_attempts_payment_intent_id ON payment_attempts(payment_intent_id);
CREATE INDEX IF NOT EXISTS payment_attempts_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS payment_attempts_created_at ON payment_attempts(created_at DESC);

-- RLS: stripe_events (server only)
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_events_server_only ON stripe_events
  USING (false)
  WITH CHECK (false);

-- RLS: payment_attempts (server routes only, no direct client access)
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_attempts_server_only ON payment_attempts
  USING (false)
  WITH CHECK (false);

-- Note: Orders, Shops, Users must already exist
-- If not, create them before running this migration
