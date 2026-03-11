'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';
import PipelineBuilder from '@/components/workflow/PipelineBuilder';

interface WorkflowPageClientProps {
  locale: string;
}

export default function WorkflowPageClient({ locale }: WorkflowPageClientProps) {
  const demoMode =
    (process.env.NEXT_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase() === 'true';
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, [demoMode]);

  return (
    <div className="h-screen w-full" style={{ backgroundColor: 'var(--color-bg)' }}>
      <PipelineBuilder
        locale={locale}
        isAuthenticated={isAuthenticated}
        demoMode={demoMode}
      />
    </div>
  );
}
