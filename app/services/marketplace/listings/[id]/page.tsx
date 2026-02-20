'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Loader2, MessageCircle, Rocket } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import type { MarketplaceListing } from '@/lib/marketplace/types';

export default function MarketplaceListingDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';
  const id = useMemo(() => String(params?.id || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [lastApiError, setLastApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const run = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      try {
        const data = await fetchJson<{ listing: MarketplaceListing }>(`/api/marketplace/listings/${id}`);
        setListing(data.listing || null);
        await fetchJson('/api/marketplace/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_id: id, event: 'view' }),
        });
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id]);

  const sendInquiry = async () => {
    if (!listing || !message.trim()) return;
    setSending(true);
    setLastApiError(null);
    try {
      const inquiry = await fetchJson<{ inquiry: { id: string } }>('/api/marketplace/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          subject: isEn ? `Inquiry about ${listing.title}` : `${listing.title}-ზე inquiry`,
          message,
        }),
      });
      setMessage('');
      window.location.href = `${withLocalePath('/services/marketplace/inbox', locale)}?inquiry=${inquiry.inquiry.id}`;
    } catch (err) {
      setLastApiError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-4">
        {loading ? (
          <Card className="h-72 animate-pulse border-white/10 bg-white/5" />
        ) : error || !listing ? (
          <Card className="border-white/10 bg-white/5 p-6 text-center text-gray-300">
            <p>{error || (isEn ? 'Listing not found.' : 'ლისტინგი ვერ მოიძებნა.')}</p>
            <div className="mt-3">
              <Link href={withLocalePath('/services/marketplace/browse', locale)}><Button>{isEn ? 'Back to Browse' : 'დათვალიერებაზე დაბრუნება'}</Button></Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 border-white/10 bg-white/5 p-4">
                <div className="h-56 rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10" />
                <h1 className="mt-4 text-2xl font-semibold text-white">{listing.title}</h1>
                <p className="mt-2 text-sm text-gray-300">{listing.description || (isEn ? 'No description provided.' : 'აღწერა არ არის დამატებული.')}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(listing.tags || []).map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200">#{tag}</span>)}
                </div>
              </Card>

              <Card className="border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">{isEn ? 'Price' : 'ფასი'}</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-300">{listing.pricing?.isFree ? (isEn ? 'Free' : 'უფასო') : `${listing.pricing?.currency || 'USD'} ${Number(listing.pricing?.amount || 0)}`}</p>
                <p className="mt-3 text-xs text-gray-400">{isEn ? 'Contact seller to place a test order.' : 'ტესტ-შეკვეთისთვის დაუკავშირდი გამყიდველს.'}</p>

                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={isEn ? 'Ask seller a question...' : 'დაუსვი კითხვა გამყიდველს...'} className="mt-3 h-24 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                <Button className="mt-2 w-full" onClick={() => void sendInquiry()} disabled={sending || !message.trim()}>
                  {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />} {isEn ? 'Send Inquiry' : 'Inquiry გაგზავნა'}
                </Button>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <Link href={`${withLocalePath('/services/business-agent', locale)}?source=marketplace&listingId=${listing.id}&title=${encodeURIComponent(listing.title)}`}><Button className="w-full" variant="secondary"><Rocket className="mr-1 h-4 w-4" /> BA: {isEn ? 'Create Offer Plan' : 'ოფერის გეგმა'}</Button></Link>
                  <Link href={`${withLocalePath('/services/social-media-manager', locale)}?source=marketplace&listingId=${listing.id}&title=${encodeURIComponent(listing.title)}`}><Button className="w-full" variant="secondary">SMM: {isEn ? 'Build Promo Plan' : 'Promo გეგმა'}</Button></Link>
                  <Link href={`${withLocalePath('/services/voice-lab', locale)}?source=marketplace&listingId=${listing.id}&title=${encodeURIComponent(listing.title)}`}><Button className="w-full" variant="secondary">Voice Lab: {isEn ? 'Voice-over for Listing' : 'ლისტინგის გახმოვანება'}</Button></Link>
                </div>
                {!authenticated && <p className="mt-3 text-xs text-amber-300">{isEn ? 'Login required for seller inbox threads.' : 'Inbox thread-ებისთვის საჭიროა ავტორიზაცია.'}</p>}
                {lastApiError && <p className="mt-2 text-xs text-red-300">{lastApiError}</p>}
              </Card>
            </div>

            <Card className="border-white/10 bg-white/5 p-4">
              <button type="button" onClick={() => setShowDiagnostics((current) => !current)} className="text-sm font-semibold text-white">
                {isEn ? 'Diagnostics' : 'დიაგნოსტიკა'}
              </button>
              {showDiagnostics ? (
                <div className="mt-2 space-y-1 text-xs text-gray-300">
                  <p>listing_id: {listing.id}</p>
                  <p>auth: {String(authenticated)}</p>
                  <p>last_api_error: {lastApiError || 'none'}</p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-gray-400">{isEn ? 'Collapsed by default.' : 'ნაგულისხმევად დახურულია.'}</p>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
