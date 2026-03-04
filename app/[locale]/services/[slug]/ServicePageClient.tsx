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
  const isAuthenticated = true;

  return (
    <UnifiedServiceLayout
      {...props}
      isAuthenticated={isAuthenticated}
    />
  );
}
