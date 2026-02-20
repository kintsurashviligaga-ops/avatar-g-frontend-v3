'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Heart, Search, SlidersHorizontal } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import type { MarketplaceListing } from '@/lib/marketplace/types';

const CATEGORIES = ['all', 'Digital Goods', 'Services', 'Templates', 'Voice Packs', 'Social Packs', 'Business Packs', 'Avatars'];

export default function MarketplaceBrowsePage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');

  const tagsPrefill = searchParams.get('tags');

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (lower) {
        const hay = `${listing.title} ${listing.description} ${(listing.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(lower)) return false;
      }
      if (category !== 'all' && listing.category !== category) return false;
      if (language && listing.language !== language) return false;
      if (tagsPrefill) {
        const required = tagsPrefill.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean);
        const tags = (listing.tags || []).map((tag) => tag.toLowerCase());
        if (!required.every((tag) => tags.includes(tag))) return false;
      }
      return true;
    });
  }, [category, language, listings, query, tagsPrefill]);

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      try {
        const data = await fetchJson<{ listings: MarketplaceListing[] }>(`/api/marketplace/listings?sort=${encodeURIComponent(sort)}`);
        setListings(Array.isArray(data.listings) ? data.listings : []);
      } catch (err) {
        setError(toUserMessage(err));
      }

      if (user) {
        try {
          const favorites = await fetchJson<{ favorites: Array<{ listing_id: string }> }>('/api/marketplace/favorites');
          setFavoriteIds((favorites.favorites || []).map((item) => item.listing_id));
        } catch {
          setFavoriteIds([]);
        }
      }

      setLoading(false);
    };

    void boot();
  }, [sort]);

  const toggleFavorite = async (listingId: string) => {
    if (!authenticated) return;
    try {
      const response = await fetchJson<{ favorited: boolean }>('/api/marketplace/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      });

      setFavoriteIds((current) =>
        response.favorited ? Array.from(new Set([...current, listingId])) : current.filter((id) => id !== listingId)
      );
    } catch {
      // no-op
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-7xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="sr-only" htmlFor="market-search">Search</label>
              <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3 py-2">
                <Search className="h-4 w-4 text-gray-400" />
                <input id="market-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? 'Search listings...' : 'ძებნა...'} className="w-full bg-transparent text-sm text-white outline-none" />
              </div>
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="flex gap-2">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                <option value="">{isEn ? 'All languages' : 'ყველა ენა'}</option>
                <option value="en">EN</option>
                <option value="ka">KA</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" aria-label="Sort">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400"><SlidersHorizontal className="h-3.5 w-3.5" /> {isEn ? 'Smart filters active' : 'Smart ფილტრები აქტიურია'}</div>
        </Card>

        {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</Card>}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Card key={idx} className="h-44 animate-pulse border-white/10 bg-white/5" />
            ))}
            <Spinner label={isEn ? 'Loading listings...' : 'ლისტინგების ჩატვირთვა...'} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={isEn ? 'No listings found' : 'ლისტინგები ვერ მოიძებნა'} description={isEn ? 'Try different filters or create a new listing.' : 'სცადე სხვა ფილტრი ან შექმენი ახალი ლისტინგი.'} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((listing) => (
              <Card key={listing.id} className="border-white/10 bg-white/5 p-4">
                <div className="h-28 rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10" />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{listing.title}</h3>
                    <p className="text-xs text-gray-400">{listing.category} • {listing.type}</p>
                  </div>
                  <button onClick={() => void toggleFavorite(listing.id)} aria-label="favorite" className={`rounded-md p-1.5 ${favoriteIds.includes(listing.id) ? 'bg-pink-500/20 text-pink-300' : 'bg-white/10 text-gray-300'}`}>
                    <Heart className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-gray-300">{listing.description || (isEn ? 'No description yet.' : 'აღწერა ჯერ არ არის.')}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-cyan-300">
                    {listing.pricing?.isFree ? (isEn ? 'Free' : 'უფასო') : `${listing.pricing?.currency || 'USD'} ${Number(listing.pricing?.amount || 0)}`}
                  </div>
                  <Link href={`${withLocalePath('/services/marketplace/listings', locale)}/${listing.id}`}>
                    <Button size="sm">{isEn ? 'Open' : 'გახსნა'}</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
