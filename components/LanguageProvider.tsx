"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Language = "ka" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  ka: {
    "nav.services": "სერვისები",
    "hero.title": "შექმენი მომავალი AI-სთან ერთად",
  },
  en: {
    "nav.services": "Services",
    "hero.title": "Create the Future with AI",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ka");
  const t = (key: string): string => translations[language][key as keyof typeof translations.ka] || key;
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
