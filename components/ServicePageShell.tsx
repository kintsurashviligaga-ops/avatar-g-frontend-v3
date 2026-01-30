"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useSafeNavigation } from "@/lib/navigation";

interface ServicePageShellProps {
  children: React.ReactNode;
  serviceId: string;
  serviceNameKa: string;
  serviceNameEn: string;
  icon?: React.ReactNode;
  gradient?: string;
}

export default function ServicePageShell({
  children,
  serviceId,
  serviceNameKa,
  serviceNameEn,
  icon,
  gradient = "from-cyan-500 to-blue-600",
}: ServicePageShellProps) {
  const { safeBack } = useSafeNavigation();

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      {/* Locked Background - Same as workspace */}
      <div className="absolute inset-0 bg-[#05070A]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-[#05070A] to-[#05070A]" />
      </div>

      {/* Header - Glass Effect */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 bg-[rgba(10,20,35,0.55)] backdrop-blur-xl border-b border-white/10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Safe Back Button - CRITICAL */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => safeBack()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-cyan-500/30 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">უკან / Back</span>
              </motion.button>

              <Link href="/workspace">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                >
                  <Home className="w-4 h-4" />
                </motion.div>
              </Link>
            </div>

            {/* Center: Service Name - Bilingual */}
            <div className="flex items-center gap-3">
              {icon && (
                <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient} shadow-lg`}>
                  {icon}
                </div>
              )}
              <div className="hidden md:block text-center">
                <h1 className="text-lg font-bold text-white">{serviceNameKa}</h1>
                <p className="text-xs text-gray-400">{serviceNameEn}</p>
              </div>
            </div>

            {/* Right: Spacer for balance */}
            <div className="w-24" />
          </div>
        </div>
      </motion.header>

      {/* Main Content - CHAT COCKPIT ONLY */}
      <main className="relative z-10 pt-20 pb-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto h-[calc(100vh-5rem)]">
        {children}
      </main>
    </div>
  );
}
