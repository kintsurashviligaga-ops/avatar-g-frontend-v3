'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import type { MarketplaceInquiry, MarketplaceListing } from '@/lib/marketplace/types';

export default function MarketplaceMyPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [inquiries, setInquiries] = useState<MarketplaceInquiry[]>([]);

  useEffect(() => {
    const run = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const listingRes = await fetchJson<{ listings: MarketplaceListing[] }>('/api/marketplace/listings?mine=1');
        const inquiryRes = await fetchJson<{ inquiries: MarketplaceInquiry[] }>('/api/marketplace/inquiries?mine=1');
        setListings(listingRes.listings || []);
        setInquiries(inquiryRes.inquiries || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <h1 className="text-2xl font-semibold text-white">{isEn ? 'Seller Dashboard' : 'გამყიდველის პანელი'}</h1>
          <p className="text-sm text-gray-300">{isEn ? 'Manage your listings and incoming buyer inquiries.' : 'მართე შენი ლისტინგები და მყიდველების მოთხოვნები.'}</p>
          <div className="mt-3">
            <Link href={withLocalePath('/services/marketplace/listings/new', locale)}><Button>{isEn ? 'Create New Listing' : 'ახალი ლისტინგი'}</Button></Link>
          </div>
        </Card>

        {!authenticated ? (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {isEn ? 'Login required to view seller dashboard.' : 'გამყიდველის პანელის სანახავად საჭიროა ავტორიზაცია.'}
          </Card>
        ) : loading ? (
          <Card className="h-48 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'My Listings' : 'ჩემი ლისტინგები'}</h2>
              {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
              <div className="mt-3 space-y-2">
                {listings.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No listings yet.' : 'ლისტინგები ჯერ არ არის.'}</p>
                ) : listings.slice(0, 12).map((listing) => (
                  <Link key={listing.id} href={`${withLocalePath('/services/marketplace/listings', locale)}/${listing.id}`}>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-gray-200 hover:bg-black/30">
                      <p className="font-semibold text-white">{listing.title}</p>
                      <p className="text-gray-400">{listing.status} • {listing.category}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold text-white">{isEn ? 'Recent Inquiries' : 'ბოლო inquiries'}</h2>
              <div className="mt-3 space-y-2">
                {inquiries.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEn ? 'No inquiries yet.' : 'inquiries ჯერ არ არის.'}</p>
                ) : inquiries.slice(0, 12).map((inquiry) => (
                  <Link key={inquiry.id} href={`${withLocalePath('/services/marketplace/inbox', locale)}?inquiry=${inquiry.id}`}>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-gray-200 hover:bg-black/30">
                      <p className="font-semibold text-white">{inquiry.subject || (isEn ? 'New inquiry' : 'ახალი inquiry')}</p>
                      <p className="text-gray-400">{inquiry.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
