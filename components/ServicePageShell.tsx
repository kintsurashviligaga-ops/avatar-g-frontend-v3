"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useSafeNavigation } from "@/lib/navigation";

interface ServicePageShellProps {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  children?: React.ReactNode;
}

export function ServicePageShell({
  title,
  subtitle,
  description,
  icon,
  children,
}: ServicePageShellProps) {
  const { safeBack } = useSafeNavigation();

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
                alt={title}
                fill
                className="object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('bg-gradient-to-br', 'from-cyan-400', 'to-blue-600', 'rounded-2xl');
                }}
              />
            </div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
              {title}
            </h1>
            <p className="text-cyan-400 text-lg mb-2">{subtitle}</p>
            <p className="text-slate-400">{description}</p>
          </div>
          
          {children}
        </motion.div>
      </div>
    </div>
  );
}
