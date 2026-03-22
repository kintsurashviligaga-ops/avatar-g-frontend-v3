'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import ServiceChatLayout from '@/components/services/workspace/ServiceChatLayout';
import { createBrowserClient } from '@/lib/supabase/browser';
import { getServiceConfig } from '@/lib/service-chat/service-configs';

const ServiceChatShell = lazy(() => import('@/components/service-chat/ServiceChatShell'));

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

  // Use upgraded Service Chat Shell for services that have configs
  const serviceChatConfig = getServiceConfig(props.serviceId);

  if (serviceChatConfig && isAuthenticated) {
    return (
      <div className="h-[calc(100vh-64px)] w-full max-w-5xl mx-auto p-2 sm:p-4">
        <Suspense fallback={<ServiceChatShellFallback />}>
          <ServiceChatShell
            config={serviceChatConfig}
            language={props.locale}
            className="h-full border border-[rgba(255,255,255,0.06)] shadow-2xl"
          />
        </Suspense>
      </div>
    );
  }

  return (
    <ServiceChatLayout
      {...props}
      isAuthenticated={isAuthenticated}
      demoMode={demoMode}
    />
  );
}

function ServiceChatShellFallback() {
  return (
    <div className="h-full rounded-xl flex items-center justify-center" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</span>
      </div>
    </div>
  );
}
