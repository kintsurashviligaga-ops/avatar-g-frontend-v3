"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Check } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Locale } from "@/lib/i18n/config";

const languages = [
  { code: "ka" as Locale, label: "ქართული", flag: "🇬🇪" },
  { code: "en" as Locale, label: "English", flag: "🇬🇧" },
  { code: "ru" as Locale, label: "Русский", flag: "🇷🇺" },
  { code: "de" as Locale, label: "Deutsch", flag: "🇩🇪" },
];

export default function LanguageSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { locale, setLocale } = useLanguage();
  const currentLang = languages.find((l) => l.code === locale) || languages[0];

  const handleSelect = (code: Locale) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
      >
        <Globe className="w-4 h-4 text-cyan-400" />
        <span className="text-sm text-gray-300">{currentLang.flag}</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-48 py-2 rounded-xl bg-black/90 backdrop-blur-xl border border-cyan-500/20 shadow-xl z-50"
            >
              {languages.map((lang) => (
                <motion.button
                  key={lang.code}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    locale === lang.code
                      ? "bg-cyan-500/20 text-cyan-400"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span>{lang.flag}</span>
                    <span className="text-sm">{lang.label}</span>
                  </span>
                  {locale === lang.code && <Check className="w-4 h-4" />}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
