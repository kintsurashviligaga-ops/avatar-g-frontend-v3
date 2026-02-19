import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SHOP_NAV_ITEMS = [
  { href: 'products', label: 'Products' },
  { href: 'suppliers', label: 'Suppliers' },
  { href: 'import', label: 'Import' },
  { href: 'orders', label: 'Orders' },
  { href: 'settings', label: 'Settings' },
];

type OnlineShopHeaderProps = {
  locale: string;
  title: string;
  subtitle: string;
};

export function OnlineShopHeader({ locale, title, subtitle }: OnlineShopHeaderProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-300">{subtitle}</p>
        <div className="flex flex-wrap gap-3">
          {SHOP_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}/services/online-shop/${item.href}`}
              className="rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={`/${locale}/services`}
            className="rounded-lg border border-cyan-500/30 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-500/10"
          >
            Back to Services
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
