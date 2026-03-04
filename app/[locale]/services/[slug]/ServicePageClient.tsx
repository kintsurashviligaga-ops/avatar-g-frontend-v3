'use client';

import { useEffect, useState } from 'react';
import UnifiedServiceLayout from '@/components/services/UnifiedServiceLayout';
import { createBrowserClient } from '@supabase/ssr';

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

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    );

    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [demoMode]);

  return (
    <UnifiedServiceLayout
      {...props}
      isAuthenticated={isAuthenticated}
      demoMode={demoMode}
    />
  );
}
