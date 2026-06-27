'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AuthScreen from '@/components/auth/AuthScreen';

function LoginForm() {
  const searchParams = useSearchParams();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';
  // Default the post-login landing to the CURRENT locale's dashboard (not '/', which
  // bounced through the middleware to the preferred locale) so OAuth + email login keep
  // the user on the locale they signed in from.
  const redirectTo = searchParams.get('redirect') ?? `/${locale}/dashboard`;

  return <AuthScreen mode="login" locale={locale} redirectTo={redirectTo} />;
}

export default function LocaleLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
