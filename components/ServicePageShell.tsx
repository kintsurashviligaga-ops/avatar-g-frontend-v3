"use client";

import React, { useState, useCallback } from "react";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface ServicePageShellProps {
  title: string;
  titleKa?: string;
  subtitle: string;
  subtitleKa?: string;
  primaryLabel: string;
  primaryLabelKa?: string;
  onPrimary: () => void;
  children: React.ReactNode;
  toast?: string | null;
  isPremium?: boolean;
}

export default function ServicePageShell({
  title,
  titleKa,
  subtitle,
  subtitleKa,
  primaryLabel,
  primaryLabelKa,
  onPrimary,
  children,
  toast,
  isPremium,
}: ServicePageShellProps) {
  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 flex items-center justify-between p-4 border-b border-white/10 bg-black/60 backdrop-blur-xl">
          <Link
            href="/workspace"
            className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="text-center">
            <h1 className="text-sm font-bold">{titleKa || title}</h1>
            <p className="text-[10px] text-gray-400">{subtitleKa || subtitle}</p>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-medium text-green-400">Active</span>
            {isPremium && (
              <span className="ml-1 text-[10px] text-amber-400">★</span>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-32">
          {children}
        </main>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent max-w-md mx-auto">
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 backdrop-blur-sm"
              >
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400">{toast}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={onPrimary}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 active:scale-[0.98] transition-all"
          >
            {primaryLabelKa || primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
