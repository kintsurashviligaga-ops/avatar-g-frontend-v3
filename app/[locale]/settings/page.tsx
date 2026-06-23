import { setRequestLocale } from 'next-intl/server';
import { SettingsView } from '@/components/settings/SettingsView';

// Top-level Settings surface. The page itself is a thin server entry — every
// piece of UI lives in the client SettingsView so localStorage-backed prefs
// (render mode, aspect ratio, theme) and authenticated API calls (credits,
// usage, account-delete) work without server round-trips on every interaction.

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SettingsView locale={locale} />;
}
