import { AiHubShell } from '@/components/hub/AiHubShell';

export const metadata = {
  title: 'AI Studio Hub',
  description: 'All 18 AI services in one production workspace',
};

type HubPageProps = { params: Promise<{ locale: string }> };

export default async function HubPage({ params }: HubPageProps) {
  const { locale } = await params;
  return <AiHubShell locale={locale} />;
}
