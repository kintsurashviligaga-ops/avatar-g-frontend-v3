import { notFound } from 'next/navigation';
import { LiveWorkspace } from '@/components/studio/liveWorkspace/LiveWorkspace';

/**
 * PREVIEW ONLY (v5.1 Phase 7): the Live Agent Workspace drawn from MOCK data, so its look and behaviour can be reviewed.
 * It calls no API, runs nothing and spends nothing. Off unless AGENT_WORKSPACE_PREVIEW=on (never set in Production);
 * the real workspace will mount inside the main window (One Window), not on this route.
 */
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function AgentWorkspacePreview({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.AGENT_WORKSPACE_PREVIEW !== 'on') notFound();
  const { locale } = await params;
  return <LiveWorkspace locale={locale} />;
}
