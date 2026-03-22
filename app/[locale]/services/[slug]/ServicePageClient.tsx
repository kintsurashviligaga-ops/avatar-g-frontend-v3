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
      <div className="fixed inset-0 z-[9999] flex flex-col" style={{ height: '100dvh', background: 'var(--color-bg)' }}>
        <Suspense fallback={<ServiceChatShellFallback />}>
          <ServiceChatShell
            config={serviceChatConfig}
            language={props.locale}
            className="flex-1 min-h-0"
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
    <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</span>
      </div>
    </div>
  );
}
