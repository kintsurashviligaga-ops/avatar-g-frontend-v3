// Hook: useLanguage - Access translations and language switching

'use client';

import { useCallback } from 'react';
import { useStudioStore } from '@/store/useStudioStore';
import type { Language } from '@/types/platform';
import { translations } from './translations';

export function useLanguage() {
  const language = useStudioStore((state) => state.language);
  const setLanguage = useStudioStore((state) => state.setLanguage);

  const t = useCallback(
    (key: string, defaultValue?: string): string => {
      const lang = translations[language as 'ka' | 'en' | 'ru'] || translations.en;
      const value = (lang as Record<string, string>)[key];
      return value || defaultValue || key;
    },
    [language]
  );

  const switchLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      // Also update document language for screen readers
      document.documentElement.lang = lang;
    },
    [setLanguage]
  );

  return {
    language,
    t,
    switchLanguage,
    isGeorgian: language === 'ka',
    isEnglish: language === 'en',
    isRussian: language === 'ru'
  };
}
