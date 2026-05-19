'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Compass } from 'lucide-react';

const messages: Record<string, { code: string; title: string; subtitle: string; back: string; chat: string }> = {
  en: { code: '404', title: 'Page not found',         subtitle: 'The page you requested is unavailable.',     back: 'Back home', chat: 'Open chat' },
  ka: { code: '404', title: 'გვერდი ვერ მოიძებნა',     subtitle: 'მოთხოვნილი გვერდი მიუწვდომელია.',           back: 'მთავარზე',  chat: 'ჩატის გახსნა' },
  ru: { code: '404', title: 'Страница не найдена',     subtitle: 'Запрашиваемая страница недоступна.',          back: 'На главную', chat: 'Открыть чат' },
};

export default function LocaleNotFound() {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'ka') as keyof typeof messages;
  const t = messages[locale] ?? messages['ka'];
  if (!t) return null;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <Compass size={40} className="text-white/30 mx-auto" />
        <div>
          <div className="text-[64px] font-bold tracking-tight text-white leading-none">{t.code}</div>
          <h1 className="mt-3 text-xl font-semibold text-white/85">{t.title}</h1>
          <p className="mt-2 text-sm text-white/55">{t.subtitle}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 justify-center">
          <Link href={`/${locale}`}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition">
            <ArrowLeft size={16} />
            {t.back}
          </Link>
          <Link href={`/${locale}/dashboard`}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-black border border-white/[0.12] text-white text-[14px] font-medium hover:border-white/[0.22] transition">
            {t.chat}
          </Link>
        </div>
      </div>
    </div>
  );
}
