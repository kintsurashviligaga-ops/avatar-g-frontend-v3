'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Ghost, ArrowLeft } from 'lucide-react';

const messages: Record<string, { title: string; subtitle: string; back: string }> = {
  en: { title: 'Page not found', subtitle: 'The page you requested is unavailable.', back: 'Back to Home' },
  ka: { title: 'გვერდი ვერ მოიძებნა', subtitle: 'მოთხოვნილი გვერდი მიუწვდომელია.', back: 'მთავარ გვერდზე დაბრუნება' },
  ru: { title: 'Страница не найдена', subtitle: 'Запрашиваемая страница недоступна.', back: 'Вернуться на главную' },
};

export default function LocaleNotFound() {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'ka') as keyof typeof messages;
  const t = messages[locale] ?? messages['ka'];

  // Satisfy noUncheckedIndexedAccess
  if (!t) return null;

  return (
    <div className="min-h-screen bg-transparent text-white flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/20 flex items-center justify-center">
          <Ghost className="w-16 h-16 text-gray-400" />
        </div>

        <h1 className="text-6xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent mb-4">
          404
        </h1>

        <p className="text-xl text-gray-400 mb-2">{t.title}</p>
        <p className="text-gray-600 mb-8">{t.subtitle}</p>

        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black font-semibold rounded-lg hover:opacity-90 transition-opacity"
        >
          <ArrowLeft className="w-5 h-5" />
          {t.back}
        </Link>
      </div>
    </div>
  );
}
