'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Search, ShoppingBag, Store } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

export default function MarketplacePage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const tiles = [
    { icon: Search, label: isEn ? 'Browse Listings' : '????????????? ????????????', href: '/services/marketplace/browse' },
    { icon: ShoppingBag, label: isEn ? 'My Orders' : '???? ?????????', href: '/services/marketplace/orders' },
    { icon: Package, label: isEn ? 'Create Listing' : '??????????? ??????', href: '/services/marketplace/listings/new' },
    { icon: Store, label: isEn ? 'Seller Dashboard' : '??????????? ??????', href: '/services/marketplace/my' },
  ];

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-white">{isEn ? 'Marketplace' : '????????????'}</h1>
          <p className="mt-1 text-sm text-gray-300">{isEn ? 'Buy, sell, and trade AI-generated assets.' : '?????, ?????? ?? ??????? AI-?? ???????? ????????.'}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.href} href={withLocalePath(t.href, locale)}>
              <Card className="flex flex-col items-center gap-3 border-white/10 bg-white/5 p-6 text-center transition hover:bg-white/10">
                <t.icon className="h-8 w-8 text-cyan-400" />
                <span className="text-sm font-medium text-white">{t.label}</span>
              </Card>
            </Link>
          ))}
        </div>

        <Link href={withLocalePath('/services/marketplace/inbox', locale)}>
          <Button variant="secondary" className="mt-4">{isEn ? 'Messages' : '?????????????'}</Button>
        </Link>
      </div>
    </main>
  );
}
