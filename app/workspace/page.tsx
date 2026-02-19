import { redirect } from 'next/navigation';
import { i18n } from '@/i18n.config';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  redirect(`/${i18n.defaultLocale}/workspace`);
}
