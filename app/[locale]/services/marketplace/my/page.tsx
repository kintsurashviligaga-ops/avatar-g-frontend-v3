'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Edit, Loader2, Plus, Trash2 } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type MyListing = {
  id: string;
  title: string;
  price: number;
  currency: string;
  category: string;
  status: 'active' | 'draft' | 'sold';
  views: number;
  inquiries: number;
};

type MyListingsResponse = { listings: MyListing[] };

export default function MarketplaceMyPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<MyListing[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson<MyListingsResponse>('/api/marketplace/my');
        setListings(data.listings || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <main className="relative min-h-screen bg-[#050510] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Link href={withLocalePath('/services/marketplace', locale)}>
              <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
            </Link>
            <h1 className="text-xl font-semibold text-white">{isEn ? 'My Listings' : 'ჩემი განცხადებები'}</h1>
          </div>
          <Link href={withLocalePath('/services/marketplace/listings/new', locale)}>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />{isEn ? 'New Listing' : 'ახალი'}</Button>
          </Link>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && listings.length === 0 && (
          <p className="text-sm text-gray-400">{isEn ? 'No listings yet.' : 'განცხადებები ჯერ არ გაქვს.'}</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {listings.map((l) => (
            <Card key={l.id} className="border-white/10 bg-white/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{l.title}</p>
                <Badge variant={l.status === 'active' ? 'success' : l.status === 'sold' ? 'primary' : 'secondary'}>{l.status}</Badge>
              </div>
              <p className="text-sm font-semibold text-cyan-300">{l.price} {l.currency}</p>
              <p className="text-xs text-gray-400">{l.views} views · {l.inquiries} inquiries</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary"><Edit className="mr-1 h-3.5 w-3.5" />{isEn ? 'Edit' : 'რედაქტირება'}</Button>
                <Button size="sm" variant="danger"><Trash2 className="mr-1 h-3.5 w-3.5" />{isEn ? 'Remove' : 'წაშლა'}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
