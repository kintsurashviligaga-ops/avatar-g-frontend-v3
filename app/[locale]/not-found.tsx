'use client';

import { useParams } from 'next/navigation';
import { NotFoundView } from '@/components/NotFoundView';

export default function LocaleNotFound() {
  const params = useParams();
  return <NotFoundView locale={typeof params?.locale === 'string' ? params.locale : 'ka'} />;
}
