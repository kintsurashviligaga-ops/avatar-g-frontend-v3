'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type Listing = {
  id: string;
  title: string;
  price: number;
  currency: string;
  category: string;
  thumbnail_url: string;
  seller_name: string;
};

type BrowseResponse = { listings: Listing[]; total: number };

const CATEGORIES = ['all', 'avatar', 'video', 'music', 'image', 'voice', 'prompt', 'other'];

export default function MarketplaceBrowsePage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        if (category !== 'all') params.set('category', category);
        const data = await fetchJson<BrowseResponse>(`/api/marketplace/listings?${params.toString()}`);
        setListings(data.listings || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [search, category]);

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/marketplace', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Browse Listings' : 'განცხადებები'}</h1>
        </div>

        <Card className="flex flex-wrap items-center gap-3 border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? 'Search...' : 'ძებნა...'}
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 text-xs ${category === c ? 'bg-cyan-500 text-white' : 'bg-white/10 text-gray-300'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Card>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && listings.length === 0 && (
          <p className="text-sm text-gray-400">{isEn ? 'No listings found.' : 'განცხადებები არ მოიძებნა.'}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <Link key={l.id} href={withLocalePath(`/services/marketplace/listings/${l.id}`, locale)}>
              <Card className="border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
                {l.thumbnail_url && (
                  <div className="mb-2 aspect-video w-full overflow-hidden rounded-lg bg-black/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.thumbnail_url} alt={l.title} className="h-full w-full object-cover" />
                  </div>
                )}
                <p className="text-sm font-medium text-white">{l.title}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                  <span>{l.seller_name}</span>
                  <Badge variant="secondary">{l.category}</Badge>
                </div>
                <p className="mt-1 text-sm font-semibold text-cyan-300">{l.price} {l.currency}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
