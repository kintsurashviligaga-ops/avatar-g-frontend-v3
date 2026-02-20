CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT NOT NULL DEFAULT 'en',
  metrics JSONB NOT NULL DEFAULT '{"views":0,"favorites":0,"inquiries":0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_listings_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT marketplace_listings_type_check CHECK (type IN ('digital', 'service'))
);

CREATE TABLE IF NOT EXISTS public.marketplace_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_favorites_unique UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_inquiries_status_check CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.marketplace_inquiries(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'test',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_orders_status_check CHECK (status IN ('test', 'paid', 'refunded'))
);

CREATE INDEX IF NOT EXISTS marketplace_listings_status_created_idx ON public.marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_owner_updated_idx ON public.marketplace_listings(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_favorites_user_created_idx ON public.marketplace_favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_inquiries_buyer_created_idx ON public.marketplace_inquiries(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_inquiries_seller_created_idx ON public.marketplace_inquiries(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_messages_inquiry_created_idx ON public.marketplace_messages(inquiry_id, created_at ASC);
CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_created_idx ON public.marketplace_orders(buyer_id, created_at DESC);

DROP TRIGGER IF EXISTS marketplace_listings_updated_at_trigger ON public.marketplace_listings;
CREATE TRIGGER marketplace_listings_updated_at_trigger
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_listings_public_read ON public.marketplace_listings;
CREATE POLICY marketplace_listings_public_read
  ON public.marketplace_listings FOR SELECT
  USING (status = 'published' OR auth.uid() = owner_id);

DROP POLICY IF EXISTS marketplace_listings_owner_insert ON public.marketplace_listings;
CREATE POLICY marketplace_listings_owner_insert
  ON public.marketplace_listings FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS marketplace_listings_owner_update ON public.marketplace_listings;
CREATE POLICY marketplace_listings_owner_update
  ON public.marketplace_listings FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS marketplace_listings_owner_delete ON public.marketplace_listings;
CREATE POLICY marketplace_listings_owner_delete
  ON public.marketplace_listings FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS marketplace_favorites_owner_crud ON public.marketplace_favorites;
CREATE POLICY marketplace_favorites_owner_crud
  ON public.marketplace_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS marketplace_inquiries_participants_read ON public.marketplace_inquiries;
CREATE POLICY marketplace_inquiries_participants_read
  ON public.marketplace_inquiries FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_inquiries_participants_write ON public.marketplace_inquiries;
CREATE POLICY marketplace_inquiries_participants_write
  ON public.marketplace_inquiries FOR INSERT
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_inquiries_participants_update ON public.marketplace_inquiries;
CREATE POLICY marketplace_inquiries_participants_update
  ON public.marketplace_inquiries FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_messages_participants_read ON public.marketplace_messages;
CREATE POLICY marketplace_messages_participants_read
  ON public.marketplace_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.marketplace_inquiries i
      WHERE i.id = inquiry_id
        AND (i.buyer_id = auth.uid() OR i.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_messages_participants_insert ON public.marketplace_messages;
CREATE POLICY marketplace_messages_participants_insert
  ON public.marketplace_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1
      FROM public.marketplace_inquiries i
      WHERE i.id = inquiry_id
        AND (i.buyer_id = auth.uid() OR i.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_orders_buyer_select ON public.marketplace_orders;
CREATE POLICY marketplace_orders_buyer_select
  ON public.marketplace_orders FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS marketplace_orders_buyer_insert ON public.marketplace_orders;
CREATE POLICY marketplace_orders_buyer_insert
  ON public.marketplace_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
