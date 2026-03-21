"use client";

import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceContextProvider } from "@/lib/services/ServiceContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <IdentityProvider>
        <LanguageProvider>
          <ServiceContextProvider>
            <ToastProvider>{children}</ToastProvider>
          </ServiceContextProvider>
        </LanguageProvider>
      </IdentityProvider>
    </ThemeProvider>
  );
}
