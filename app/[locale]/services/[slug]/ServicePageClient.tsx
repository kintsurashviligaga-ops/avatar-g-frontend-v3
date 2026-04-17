'use client';

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import ServiceChatLayout from '@/components/services/workspace/ServiceChatLayout';
import { createBrowserClient } from '@/lib/supabase/browser';
import { getServiceConfig } from '@/lib/service-chat/service-configs';
import { UnifiedServiceShell } from '@/components/services/unified';
import ServiceWorkspaceView from '@/components/services/unified/ServiceWorkspaceView';

const ServiceChatShell = lazy(() => import('@/components/service-chat/ServiceChatShell'));

type ViewMode = 'workspace' | 'chat';

interface ServicePageClientProps {
  serviceId: string;
  serviceName: string;
  serviceIcon: string;
  agentId: string;
  locale: string;
  features: string[];
  description: string;
}

export default function ServicePageClient(props: ServicePageClientProps) {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase() === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(demoMode);
  const [viewMode, setViewMode] = useState<ViewMode>('workspace');

  useEffect(() => {
    if (demoMode) {
      setIsAuthenticated(true);
      return;
    }

    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [demoMode]);

  const toggleView = useCallback(() => {
    setViewMode(v => v === 'workspace' ? 'chat' : 'workspace');
  }, []);

  // Use upgraded Service Chat Shell for services that have configs
  const serviceChatConfig = getServiceConfig(props.serviceId);

  const chatContent = serviceChatConfig && isAuthenticated ? (
    <div className="h-full w-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Suspense fallback={<ServiceChatShellFallback />}>
        <ServiceChatShell
          config={serviceChatConfig}
          language={props.locale}
          className="flex-1 min-h-0"
        />
      </Suspense>
    </div>
  ) : (
    <ServiceChatLayout
      {...props}
      isAuthenticated={isAuthenticated}
      demoMode={demoMode}
    />
  );

  const workspaceContent = (
    <ServiceWorkspaceView
      serviceId={props.serviceId}
      serviceName={props.serviceName}
      serviceIcon={props.serviceIcon}
      locale={props.locale}
      description={props.description}
    />
  );

  return (
    <UnifiedServiceShell
      activeServiceId={props.serviceId}
      locale={props.locale}
    >
      {/* View mode toggle */}
      <div className="h-full w-full flex flex-col">
        <div
          className="shrink-0 flex items-center gap-1 px-4 py-2"
          style={{ background: 'rgba(6,8,18,0.6)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <button
            onClick={() => setViewMode('workspace')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              background: viewMode === 'workspace' ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: viewMode === 'workspace' ? '#00d4ff' : 'rgba(148,163,184,0.5)',
              border: viewMode === 'workspace' ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
            }}
          >
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              Workspace
            </span>
          </button>
          <button
            onClick={() => setViewMode('chat')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              background: viewMode === 'chat' ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: viewMode === 'chat' ? '#00d4ff' : 'rgba(148,163,184,0.5)',
              border: viewMode === 'chat' ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
            }}
          >
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Chat
            </span>
          </button>
        </div>

        <div className="flex-1 min-h-0 relative">
          {viewMode === 'workspace' ? workspaceContent : chatContent}
        </div>
      </div>
    </UnifiedServiceShell>
  );
}

function ServiceChatShellFallback() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</span>
      </div>
    </div>
  );
}
