"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface ServicePageShellProps {
  title: string;
  subtitle: string;
  primaryLabel: string;
  onPrimary: () => void;
  children: React.ReactNode;
  toast?: string | null;
}

export default function ServicePageShell({
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  children,
  toast,
}: ServicePageShellProps) {
  const router = useRouter();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (toast) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <h1 className="text-sm font-semibold">{title}</h1>
            <p className="text-[10px] text-gray-500">{subtitle}</p>
          </div>

          <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] text-green-300">
            Active
          </div>
        </div>
      </header>

      <main className="pt-24 pb-32 px-4">
        <div className="max-w-md mx-auto space-y-6">{children}</div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="max-w-md mx-auto">
          <button
            onClick={onPrimary}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/25"
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      <div
        className={`fixed bottom-24 left-4 right-4 max-w-md mx-auto transition-all duration-300 ${
          showToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="px-4 py-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-300 text-sm text-center">
          {toast}
        </div>
      </div>
    </div>
  );
}
