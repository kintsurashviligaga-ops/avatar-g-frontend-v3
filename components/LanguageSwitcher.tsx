'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const LOCALES = [
  { code: 'ka', label: 'ქარ', flag: '🇬🇪' },
  { code: 'en', label: 'ENG', flag: '🇬🇧' },
  { code: 'ru', label: 'РУС', flag: '🇷🇺' },
] as const;

const LOCALE_CODES = LOCALES.map(l => l.code);

function getLocaleFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] ?? '';
  return LOCALE_CODES.includes(first as typeof LOCALE_CODES[number]) ? first : 'ka';
}

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [activeLocale, setActiveLocale] = useState('ka');

  useEffect(() => {
    setMounted(true);
    setActiveLocale(getLocaleFromPath(pathname));
  }, [pathname]);

  const switchLocale = (code: string) => {
    // Set cookie for SSR fallback
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
    setActiveLocale(code);

    // Replace locale segment in the URL and navigate
    const currentLocale = getLocaleFromPath(pathname);
    const newPath = pathname.replace(`/${currentLocale}`, `/${code}`);
    router.push(newPath);
  };

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-1 py-0.5">
        {LOCALES.map(({ code, label }) => (
          <span
            key={code}
            className="text-xs px-2 py-1 rounded-full text-white/40 font-medium"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-full px-1 py-0.5">
      {LOCALES.map(({ code, label }) => {
        const active = activeLocale === code;
        return (
          <button
            key={code}
            onClick={() => switchLocale(code)}
            className={`
              text-xs px-2 py-1 rounded-full transition-all font-medium
              ${active
                ? 'bg-white text-[#050510]'
                : 'text-white/40 hover:text-white'}
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
