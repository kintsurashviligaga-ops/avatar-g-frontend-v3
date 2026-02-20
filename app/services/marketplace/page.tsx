'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe2, MessageSquare, ShoppingBag, Store } from 'lucide-react';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

export default function MarketplacePage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-7xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
            <Store className="h-3.5 w-3.5" /> Marketplace
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            {isEn ? 'Global Marketplace for Avatar G Creators' : 'Avatar G-ის გლობალური Marketplace'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-300">
            {isEn
              ? 'Browse digital goods and services, publish your own listings, manage inquiries, and connect outputs across Business Agent, SMM, Voice Lab, and Workspace.'
              : 'დაათვალიერე ციფრული პროდუქტები და სერვისები, გამოაქვეყნე საკუთარი ლისტინგები, მართე inquiries და დააკავშირე შედეგები Business Agent/SMM/Voice Lab/Workspace-თან.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={withLocalePath('/services/marketplace/browse', locale)}>
              <Button><Globe2 className="mr-1 h-4 w-4" /> {isEn ? 'Browse Marketplace' : 'Marketplace-ის დათვალიერება'}</Button>
            </Link>
            <Link href={withLocalePath('/services/marketplace/listings/new', locale)}>
              <Button variant="secondary"><ShoppingBag className="mr-1 h-4 w-4" /> {isEn ? 'Sell on Marketplace' : 'Marketplace-ზე გაყიდვა'}</Button>
            </Link>
            <Link href={withLocalePath('/services/marketplace/my', locale)}>
              <Button variant="secondary"><MessageSquare className="mr-1 h-4 w-4" /> {isEn ? 'Seller Dashboard' : 'გამყიდველის პანელი'}</Button>
            </Link>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: isEn ? 'Digital Goods' : 'ციფრული პროდუქტები', desc: isEn ? 'Templates, packs, presets, assets.' : 'შაბლონები, პაკეტები, presets, ასეტები.' },
            { title: isEn ? 'Service Offers' : 'სერვის შეთავაზებები', desc: isEn ? 'Business packs, consulting, setup services.' : 'ბიზნეს პაკეტები, კონსალტინგი, setup სერვისები.' },
            { title: isEn ? 'Inquiries & Inbox' : 'Inquiries და Inbox', desc: isEn ? 'Built-in lead messaging and collaboration.' : 'ჩაშენებული შეტყობინებები და თანამშრომლობა.' },
            { title: isEn ? 'Cross-Service Links' : 'Cross-Service ბმულები', desc: isEn ? 'Use listings in SMM, Voice Lab, and BA.' : 'გამოიყენე ლისტინგები SMM/Voice Lab/BA-ში.' },
          ].map((item) => (
            <Card key={item.title} className="border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-gray-300">{item.desc}</p>
              <Badge className="mt-3" variant="success">{isEn ? 'Active' : 'აქტიური'}</Badge>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
