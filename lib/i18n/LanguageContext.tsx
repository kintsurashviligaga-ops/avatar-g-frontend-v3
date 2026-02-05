"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

type Language = "ka" | "en" | "ru";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  locale: Language;
  setLocale: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  ka: {
    "nav.home": "მთავარი",
    "nav.services": "სერვისები",
    "nav.pricing": "ფასები",
    "nav.about": "ჩვენს შესახებ",
    "nav.contact": "კონტაქტი",
    "nav.workspace": "სამუშაო სივრცე",
    "nav.getStarted": "დაწყება",
    "nav.login": "შესვლა",
    "nav.signup": "რეგისტრაცია",
    "hero.subtitle": "მომავალი უკვე აქ არის",
    "hero.title": "Avatar G - AI სამყარო",
    "hero.description": "გამოიყენეთ ხელოვნური ინტელექტი თქვენი იდეების რეალობად ქცევისთვის",
    "hero.cta": "დაწყება",
    "hero.learnMore": "მეტის გაგება",
    "services.title": "ჩვენი სერვისები",
    "services.subtitle": "AI ტექნოლოგიები თქვენი ბიზნესისთვის",
    home: "მთავარი",
    services: "სერვისები",
    about: "ჩვენს შესახებ",
    contact: "კონტაქტი",
    workspace: "სამუშაო სივრცე",
    login: "შესვლა",
    signup: "რეგისტრაცია",
    chat: "ჩათი",
    send: "გაგზავნა",
    type_message: "შეიყვანეთ შეტყობინება...",
    voice_input: "ხმოვანი შეყვანა",
    stop: "შეწყვეტა",
    settings: "პარამეტრები",
    logout: "გასვლა",
  },
  en: {
    "nav.home": "Home",
    "nav.services": "Services",
    "nav.pricing": "Pricing",
    "nav.about": "About",
    "nav.contact": "Contact",
    "nav.workspace": "Workspace",
    "nav.getStarted": "Get Started",
    "nav.login": "Login",
    "nav.signup": "Sign Up",
    "hero.subtitle": "The Future is Here",
    "hero.title": "Avatar G - AI Universe",
    "hero.description": "Use artificial intelligence to turn your ideas into reality",
    "hero.cta": "Get Started",
    "hero.learnMore": "Learn More",
    "services.title": "Our Services",
    "services.subtitle": "AI technologies for your business",
    home: "Home",
    services: "Services",
    about: "About",
    contact: "Contact",
    workspace: "Workspace",
    login: "Login",
    signup: "Sign Up",
    chat: "Chat",
    send: "Send",
    type_message: "Type a message...",
    voice_input: "Voice Input",
    stop: "Stop",
    settings: "Settings",
    logout: "Logout",
  },
  ru: {
    "nav.home": "Главная",
    "nav.services": "Услуги",
    "nav.pricing": "Цены",
    "nav.about": "О нас",
    "nav.contact": "Контакты",
    "nav.workspace": "Рабочее пространство",
    "nav.getStarted": "Начать",
    "nav.login": "Вход",
    "nav.signup": "Регистрация",
    "hero.subtitle": "Будущее уже здесь",
    "hero.title": "Avatar G - AI Вселенная",
    "hero.description": "Используйте искусственный интеллект для воплощения ваших идей",
    "hero.cta": "Начать",
    "hero.learnMore": "Узнать больше",
    "services.title": "Наши услуги",
    "services.subtitle": "AI технологии для вашего бизнеса",
    home: "Главная",
    services: "Услуги",
    about: "О нас",
    contact: "Контакты",
    workspace: "Рабочее пространство",
    login: "Вход",
    signup: "Регистрация",
    chat: "Чат",
    send: "Отправить",
    type_message: "Введите сообщение...",
    voice_input: "Голосовой ввод",
    stop: "Стоп",
    settings: "Настройки",
    logout: "Выход",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ka");

  useEffect(() => {
    const saved = localStorage.getItem("avatar-g-language") as Language;
    if (saved && ["ka", "en", "ru"].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("avatar-g-language", lang);
  }, []);

  const locale = language;
  const setLocale = setLanguage;

  const t = useCallback(
    (key: string): string => {
      return translations[language][key as keyof typeof translations["ka"]] || key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
