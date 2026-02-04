"use client";

import { ReactNode } from "react";
import Header from "./Header";
import { ToastProvider } from "@/components/Toast";

interface PageShellProps {
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const MAX_WIDTHS = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1400px]",
  "2xl": "max-w-[1600px]",
  full: "max-w-full",
};

export default function PageShell({ children, maxWidth = "lg" }: PageShellProps) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <Header />
        <main className={'mx-auto px-4 py-8 ' + MAX_WIDTHS[maxWidth]}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
