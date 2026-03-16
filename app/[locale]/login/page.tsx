'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AuthScreen from '@/components/auth/AuthScreen';

function LoginForm() {
  const searchParams = useSearchParams();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';
  const redirectTo = searchParams.get('redirect') ?? '/';

  return <AuthScreen mode="login" locale={locale} redirectTo={redirectTo} />;
}

export default function LocaleLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
