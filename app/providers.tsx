"use client";

import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { ToastProvider } from "@/components/Toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <IdentityProvider>
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </IdentityProvider>
    </ThemeProvider>
  );
}
