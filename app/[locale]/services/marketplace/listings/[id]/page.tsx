'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare, ShoppingCart } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type ListingDetail = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  thumbnail_url: string;
  seller_name: string;
  seller_id: string;
  created_at: string;
  shipping_note?: string;
};

type ListingResponse = { listing: ListingDetail };

export default function MarketplaceListingDetailPage() {
  const pathname = usePathname();
  const params = useParams();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [inquirySent, setInquirySent] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson<ListingResponse>(`/api/marketplace/listings/${encodeURIComponent(id)}`);
        setListing(data.listing);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const sendInquiry = async () => {
    try {
      await fetchJson('/api/marketplace/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: id, message: `Interested in: ${listing?.title}` }),
      });
      setInquirySent(true);
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/marketplace/browse', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {listing && (
          <Card className="border-white/10 bg-white/5 p-5 space-y-4">
            {listing.thumbnail_url && (
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.thumbnail_url} alt={listing.title} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-white">{listing.title}</h1>
                <p className="mt-1 text-xs text-gray-400">{isEn ? 'Seller' : 'გამყიდველი'}: {listing.seller_name} · {new Date(listing.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-cyan-300">{listing.price} {listing.currency}</p>
                <Badge variant="secondary">{listing.category}</Badge>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-200">{listing.description}</p>
            {listing.shipping_note && (
              <p className="text-xs text-gray-400"><strong className="text-white">{isEn ? 'Shipping' : 'მიტანა'}:</strong> {listing.shipping_note}</p>
            )}
            <div className="flex gap-3">
              <Button disabled={inquirySent} onClick={() => void sendInquiry()}>
                <MessageSquare className="mr-1 h-4 w-4" />{inquirySent ? (isEn ? 'Sent!' : 'გაგზავნილია!') : (isEn ? 'Send Inquiry' : 'შეკითხვის გაგზავნა')}
              </Button>
              <Button variant="secondary">
                <ShoppingCart className="mr-1 h-4 w-4" />{isEn ? 'Add to Cart' : 'კალათაში'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
