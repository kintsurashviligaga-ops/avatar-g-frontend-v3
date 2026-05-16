/**
 * /pricing — Public pricing page
 * Server Component for SEO metadata + Client Component for UI
 */
import type { Metadata } from 'next';
import PricingPageClient from './PricingPageClient';

export const metadata: Metadata = {
  title: 'ფასები | Avatar G — AI სერვისები საქართველოში',
  description: 'Avatar G-ის გეგმები: Starter (უფასო), Pro (₾9/თვეში), Ultimate (₾29/თვეში), Enterprise (₾89/თვეში). შეუზღუდავი AI სურათი, ვიდეო, მუსიკა, ხმა.',
  openGraph: {
    title: 'Avatar G — ფასები',
    description: 'Starter, Pro, Ultimate, Enterprise. ქართული AI პლატფორმა.',
    url: 'https://myavatar.ge/pricing',
    siteName: 'Avatar G',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Avatar G — ფასები',
    description: 'Pro ₾9/თვეში · Ultimate ₾29 · Enterprise ₾89',
  },
};

export default function PricingPage() {
  return <PricingPageClient />;
}
