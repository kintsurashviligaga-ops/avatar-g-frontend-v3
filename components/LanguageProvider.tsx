"use client";

import { LanguageProvider as LibLanguageProvider } from "@/lib/i18n/LanguageContext";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return <LibLanguageProvider>{children}</LibLanguageProvider>;
}
