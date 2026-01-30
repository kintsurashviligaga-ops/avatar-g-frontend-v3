"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useSafeNavigation } from "@/lib/navigation";

interface ServicePageShellProps {
  title: string;
  titleKa?: string;
  subtitle: string;
  subtitleKa?: string;
  description?: string;
  icon: string;
  primaryLabel?: string;
  primaryLabelKa?: string;
  onPrimary?: () => void;
  toast?: string | null;
  children?: React.ReactNode;
}

// Named export
export function ServicePageShell({
  title,
  titleKa,
  subtitle,
  subtitleKa,
  description,
  icon,
  primaryLabel,
  primaryLabelKa,
  onPrimary,
  toast,
  children,
}: ServicePageShellProps) {
  const { safeBack } = useSafeNavigation();

  // Use Georgian if available, fallback to English
  const displayTitle = titleKa || title;
  const displaySubtitle = subtitleKa || subtitle;
  const displayPrimaryLabel = primaryLabelKa || primaryLabel || "დაწყება";

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      {/* Background */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#05070A] via-[#0a0f1a] to-[#05070A]" />
      
      <div className="relative z-10 min-h-screen flex flex-col max-w-4xl mx-auto p-4">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6 pt-4">
          <button
            onClick={() => safeBack("/workspace")}
            className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-sm">უკან</span>
          </button>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">ონლაინ</span>
          </div>
        </header>

        {/* Toast notification */}
        {toast && (
          <div className="mb-4 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-center">
            {toast}
          </div>
        )}

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1"
        >
          <div className="text-center mb-8">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <Image
                src={icon}
                alt={displayTitle}
                fill
                className="object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('bg-gradient-to-br', 'from-cyan-400', 'to-blue-600', 'rounded-2xl');
                }}
              />
            </div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
              {displayTitle}
            </h1>
            <p className="text-cyan-400 text-lg mb-2">{displaySubtitle}</p>
            {description && <p className="text-slate-400">{description}</p>}
          </div>

          {/* Primary action button */}
          {onPrimary && (
            <div className="text-center mb-8">
              <button
                onClick={onPrimary}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow"
              >
                {displayPrimaryLabel}
              </button>
            </div>
          )}
          
          {children}
        </motion.div>
      </div>
    </div>
  );
}

// Default export (უკან თავსებადობისთვის)
export default ServicePageShell;
