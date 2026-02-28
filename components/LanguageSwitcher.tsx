'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;

/**
 * Detect current locale from the pathname instead of useLocale().
 * This makes the component SAFE outside NextIntlClientProvider
 * (e.g. at root "/" which has no locale segment).
 */
function usePathnameLocale(): string {
  const pathname = usePathname();
  const seg = pathname.split('/')[1];
  if (seg && languages.some((l) => l.code === seg)) return seg;
  return 'ka'; // default locale
}

export default function LanguageSwitcher() {
  const locale = usePathnameLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const currentLang = languages.find((language) => language.code === locale) ?? languages[0];

  const handleSelect = (newLocale: string) => {
    startTransition(() => {
      // Strip existing locale prefix if present
      const segments = pathname.split('/');
      const hasLocalePrefix = segments.length > 1 && languages.some((l) => l.code === segments[1]);
      const pathWithoutLocale = hasLocalePrefix ? '/' + segments.slice(2).join('/') : pathname;
      const newPathname = `/${newLocale}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
      router.push(newPathname);
      setIsOpen(false);
    });
  };

  // Avoid hydration mismatch — render minimal until mounted
  if (!mounted) {
    return (
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
        aria-label="Language"
      >
        <svg className="w-4 h-4 text-cyan-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span className="text-sm text-gray-300">{currentLang.flag}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
        disabled={isPending}
        aria-label="Switch language"
      >
        <svg className="w-4 h-4 text-cyan-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span className="text-sm text-gray-300">{currentLang.flag}</span>
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 mt-2 w-48 py-2 rounded-xl bg-black/90 backdrop-blur-xl border border-cyan-500/20 shadow-xl z-50">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  locale === lang.code
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
                disabled={isPending}
              >
                <span className="flex items-center gap-3">
                  <span>{lang.flag}</span>
                  <span className="text-sm">{lang.label}</span>
                </span>
                {locale === lang.code && (
                  <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
