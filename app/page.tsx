import { redirect } from 'next/navigation';
import { i18n } from '@/i18n.config';

export default function RootPage() {
  // Route sanity check: "/" redirects to default locale. Landing hero lives in `components/landing/Hero.tsx` and is rendered by `app/[locale]/page.tsx`.
  redirect(`/${i18n.defaultLocale}`);
}
