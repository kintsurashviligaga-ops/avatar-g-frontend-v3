import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * ⚠️ THIS SUB-NAV WAS ENGLISH-ONLY ON SIX LIVE GEORGIAN ROUTES. The component already received `locale`
 * and used it to build every href — so it knew which language the user was in and still printed
 * "Products / Suppliers / Import / Orders / Settings / Back to Services" to a Georgian audience. The
 * hrefs are route segments and stay English; only what a person reads is translated.
 */
const SHOP_NAV_ITEMS = [
  { href: 'products',  label: { ka: 'პროდუქტები', en: 'Products',  ru: 'Товары' } },
  { href: 'suppliers', label: { ka: 'მომწოდებლები', en: 'Suppliers', ru: 'Поставщики' } },
  { href: 'import',    label: { ka: 'იმპორტი',     en: 'Import',    ru: 'Импорт' } },
  { href: 'orders',    label: { ka: 'შეკვეთები',   en: 'Orders',    ru: 'Заказы' } },
  { href: 'settings',  label: { ka: 'პარამეტრები', en: 'Settings',  ru: 'Настройки' } },
] as const;

const BACK_TO_SERVICES = { ka: '← სერვისებზე', en: '← Back to Services', ru: '← К сервисам' } as const;

type Lang = 'ka' | 'en' | 'ru';
/** Georgian is the primary locale, so an unknown/absent segment falls back to ka rather than en. */
const asLang = (l: string): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

/**
 * Each page's own heading was English too — "Online Shop Products / Review imported products, pricing
 * decisions, and risk levels." on a Georgian route. Localised HERE rather than in six page files so the
 * copy for one screen lives in one place. `page` is the key; `title`/`subtitle` remain as an override for
 * anything not in the map.
 */
const PAGE_COPY = {
  home:      { ka: { t: 'ონლაინ მაღაზია', s: 'მართე მომწოდებლები, დააიმპორტე პროდუქტები, დააოპტიმიზირე ფასები და მოაწესრიგე შესრულება.' },
               en: { t: 'Online Shop', s: 'Manage suppliers, import products, optimize pricing, and automate fulfillment.' },
               ru: { t: 'Онлайн-магазин', s: 'Управляйте поставщиками, импортом, ценами и автоматизацией.' } },
  products:  { ka: { t: 'პროდუქტები', s: 'გადახედე დაიმპორტებულ პროდუქტებს, ფასებსა და რისკის დონეს.' },
               en: { t: 'Products', s: 'Review imported products, pricing decisions, and risk levels.' },
               ru: { t: 'Товары', s: 'Просмотр импортированных товаров, цен и уровней риска.' } },
  suppliers: { ka: { t: 'მომწოდებლები', s: 'შეადარე მომწოდებლების ხარისხი და აირჩიე საუკეთესო წყარო.' },
               en: { t: 'Suppliers', s: 'Compare supplier quality and select the best source for your pipeline.' },
               ru: { t: 'Поставщики', s: 'Сравните качество поставщиков и выберите лучший источник.' } },
  import:    { ka: { t: 'იმპორტი', s: 'AI-ის დახმარებით ჩამოტვირთე პროდუქტები მომწოდებლის ფიდებიდან.' },
               en: { t: 'Import', s: 'Use AI-assisted import to fetch product candidates from supplier feeds.' },
               ru: { t: 'Импорт', s: 'Импорт товаров из фидов поставщиков с помощью ИИ.' } },
  orders:    { ka: { t: 'შეკვეთები', s: 'თვალი ადევნე გადახდილ შეკვეთებს და გაუშვი ავტომატური შესრულება.' },
               en: { t: 'Orders', s: 'Track paid orders and trigger automated fulfillment jobs.' },
               ru: { t: 'Заказы', s: 'Отслеживайте оплаченные заказы и запускайте автоматизацию.' } },
  settings:  { ka: { t: 'პარამეტრები', s: 'დააკონფიგურირე ფასების წესები, რისკის ზღვარი და შესრულების ავტომატიზაცია.' },
               en: { t: 'Settings', s: 'Configure pricing rules, risk tolerance, and fulfillment defaults.' },
               ru: { t: 'Настройки', s: 'Настройте правила цен, порог риска и автоматизацию.' } },
} as const;

type OnlineShopHeaderProps = {
  locale: string;
  page?: keyof typeof PAGE_COPY;
  title?: string;
  subtitle?: string;
};

export function OnlineShopHeader({ locale, page, title, subtitle }: OnlineShopHeaderProps) {
  const lang = asLang(locale);
  const copy = page ? PAGE_COPY[page][lang] : null;
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-2xl text-white">{title ?? copy?.t ?? ''}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-300">{subtitle ?? copy?.s ?? ''}</p>
        <div className="flex flex-wrap gap-3">
          {SHOP_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}/services/online-shop/${item.href}`}
              className="rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10"
            >
              {item.label[lang]}
            </Link>
          ))}
          <Link
            href={`/${locale}/services`}
            className="rounded-lg border border-cyan-500/30 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-500/10"
          >
            {BACK_TO_SERVICES[lang]}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
