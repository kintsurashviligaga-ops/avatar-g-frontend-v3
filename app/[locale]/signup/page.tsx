'use client';

import { useParams } from 'next/navigation';
import AuthScreen from '@/components/auth/AuthScreen';

export default function LocaleSignupPage() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';

  return <AuthScreen mode="signup" locale={locale} />;
}
