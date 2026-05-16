'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

// Initialize PostHog once on client
if (typeof window !== 'undefined' && POSTHOG_KEY && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,    // We manually track for accurate SPA routing
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    autocapture: false,         // Avoid capturing sensitive form data
    disable_session_recording: true,
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') {
        ph.opt_out_capturing(); // Don't pollute analytics with dev events
      }
    },
  });
}

/** Tracks page views on route change — required for Next.js App Router */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();
  const prevPath = useRef<string>('');

  useEffect(() => {
    const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (fullPath !== prevPath.current) {
      prevPath.current = fullPath;
      ph?.capture('$pageview', { $current_url: window.location.href });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/** Exported analytics helpers — use these instead of calling posthog directly */
export const analytics = {
  /** Track an AI generation */
  generation: (service: string, credits: number, success: boolean) => {
    posthog.capture('ai_generation', { service, credits, success });
  },
  /** Track pricing page interaction */
  pricingClick: (planId: string, action: 'view' | 'click_cta') => {
    posthog.capture('pricing_interaction', { plan_id: planId, action });
  },
  /** Track share page view */
  shareView: (kind: string, token: string) => {
    posthog.capture('share_page_view', { kind, token });
  },
  /** Track user signup / login */
  auth: (event: 'signup' | 'login' | 'logout') => {
    posthog.capture(`user_${event}`);
  },
  /** Track referral redemption */
  referral: (action: 'created' | 'redeemed', code?: string) => {
    posthog.capture('referral_action', { action, code });
  },
  /** Identify authenticated user */
  identify: (userId: string, props?: Record<string, unknown>) => {
    posthog.identify(userId, props);
  },
  /** Track prompt used */
  prompt: (service: string, prompt: string) => {
    // Only log first 100 chars to avoid PII
    posthog.capture('prompt_used', { service, prompt_preview: prompt.slice(0, 100) });
  },
};

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) {
    // No PostHog key configured — skip provider, render children directly
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
