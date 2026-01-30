"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import Image from "next/image";
import { WarpBackground } from "./WarpBackground";
import { GlassContainer } from "./GlassContainer";
import { useSafeNavigation } from "@/lib/navigation";
import { translations, Lang } from "@/lib/i18n";

interface ServicePageShellProps {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  children?: React.ReactNode;
  lang?: Lang;
}

export function ServicePageShell({
  title,
  subtitle,
  description,
  icon,
  children,
  lang = "ge",
}: ServicePageShellProps) {
  const { safeBack } = useSafeNavigation();
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 min-h-screen flex flex-col max-w-4xl mx-auto p-4">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6 pt-4">
          <button
            onClick={() => safeBack("/workspace")}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">{t.online}</span>
          </div>
        </header>

        {/* Hero */}
        <GlassContainer className="p-8 mb-6 text-center" glow>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
