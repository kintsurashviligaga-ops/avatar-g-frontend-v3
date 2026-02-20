'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname } from '@/lib/i18n/localePath';
import type { MarketplaceOrder } from '@/lib/marketplace/types';

export default function MarketplaceOrdersPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);

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
        const data = await fetchJson<{ orders: MarketplaceOrder[] }>('/api/marketplace/orders');
        setOrders(data.orders || []);
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
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <h1 className="text-2xl font-semibold text-white">{isEn ? 'Orders' : 'შეკვეთები'}</h1>
          <p className="text-sm text-gray-300">{isEn ? 'Track your Marketplace order history.' : 'Marketplace შეკვეთების ისტორია.'}</p>
        </Card>

        {!authenticated ? (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {isEn ? 'Login required to access orders.' : 'შეკვეთებისთვის საჭიროა ავტორიზაცია.'}
          </Card>
        ) : loading ? (
          <Card className="h-32 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <Card className="border-white/10 bg-white/5 p-4">
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="space-y-2">
              {orders.length === 0 ? (
                <p className="text-xs text-gray-400">{isEn ? 'No orders yet.' : 'შეკვეთები ჯერ არ არის.'}</p>
              ) : orders.map((order) => (
                <div key={order.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-gray-200">
                  <p className="font-semibold text-white">{order.currency} {Number(order.amount || 0)}</p>
                  <p className="text-gray-400">{order.status} • {new Date(order.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
