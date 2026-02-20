export type MarketplaceListingStatus = 'draft' | 'published' | 'archived';
export type MarketplaceListingType = 'digital' | 'service';

export type MarketplaceListing = {
  id: string;
  owner_id: string;
  status: MarketplaceListingStatus;
  type: MarketplaceListingType;
  title: string;
  category: string;
  tags: string[];
  description: string;
  faq: Array<{ q: string; a: string }>;
  media: string[];
  delivery: {
    mode: 'instant_link' | 'manual' | 'turnaround';
    url?: string;
    turnaround?: string;
  };
  pricing: {
    currency: string;
    amount: number;
    startingAt?: boolean;
    isFree?: boolean;
    plan?: 'subscription_placeholder' | 'fixed';
  };
  language: string;
  metrics: {
    views: number;
    favorites: number;
    inquiries: number;
  };
  created_at: string;
  updated_at: string;
};

export type MarketplaceFavorite = {
  id: string;
  user_id: string;
  listing_id: string;
  created_at: string;
};

export type MarketplaceInquiry = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
};

export type MarketplaceMessage = {
  id: string;
  inquiry_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type MarketplaceOrder = {
  id: string;
  buyer_id: string;
  listing_id: string;
  status: 'test' | 'paid' | 'refunded';
  amount: number;
  currency: string;
  created_at: string;
};
