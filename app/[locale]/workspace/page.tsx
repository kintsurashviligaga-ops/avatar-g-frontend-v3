import { WorkspaceDashboard } from '@/components/workspace/WorkspaceDashboard';

export default async function WorkspacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <WorkspaceDashboard locale={locale} />;
}