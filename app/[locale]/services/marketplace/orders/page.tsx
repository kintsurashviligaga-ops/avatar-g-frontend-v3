'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, Package } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type Order = {
  id: string;
  listing_title: string;
  price: number;
  currency: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  created_at: string;
};

type OrdersResponse = { orders: Order[] };

export default function MarketplaceOrdersPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson<OrdersResponse>('/api/marketplace/orders');
        setOrders(data.orders || []);
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
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/marketplace', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'My Orders' : 'ჩემი შეკვეთები'}</h1>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && orders.length === 0 && (
          <p className="text-sm text-gray-400">{isEn ? 'No orders yet.' : 'შეკვეთები ჯერ არ არის.'}</p>
        )}

        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">{o.listing_title}</span>
                </div>
                <Badge variant={o.status === 'completed' ? 'success' : o.status === 'cancelled' ? 'danger' : 'warning'}>{o.status}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                <span>{new Date(o.created_at).toLocaleDateString()}</span>
                <span className="font-semibold text-cyan-300">{o.price} {o.currency}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
