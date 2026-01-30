"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Home, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSafeNavigation } from "@/lib/navigation";
import dynamic from "next/dynamic";

const SpaceBackground = dynamic(
  () => import("@/components/SpaceSingularityBackground"),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-[#05070A]" /> }
);

interface ServicePageShellProps {
  children: React.ReactNode;
  serviceId: string;
  serviceNameKa: string;
  serviceNameEn: string;
  serviceDescriptionKa: string;
  serviceDescriptionEn: string;
  icon?: React.ReactNode;
  gradient?: string;
  agentGContext?: string;
}

export default function ServicePageShell({
  children,
  serviceId,
  serviceNameKa,
  serviceNameEn,
  serviceDescriptionKa,
  serviceDescriptionEn,
  icon,
  gradient = "from-cyan-500 to-blue-600",
  agentGContext,
}: ServicePageShellProps) {
  const { safeBack } = useSafeNavigation();

  return (
    <div className="relative min-h-screen bg-[#05070A] overflow-hidden">
      {/* Locked Background */}
      <SpaceBackground />

      {/* Top Bar - IDENTICAL ACROSS ALL SERVICES */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 h-16 bg-[rgba(5,7,10,0.9)] backdrop-blur-xl border-b border-white/10"
      >
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Left: Safe Back Button - CRITICAL */}
          <div className="flex items-center gap-2">
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
              >
                <Home className="w-4 h-4" />
              </motion.div>
            </Link>
          </div>

          {/* Center: Service Name - BILINGUAL */}
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
                {icon}
              </div>
            )}
            <div className="hidden md:block text-center">
              <h1 className="text-lg font-bold text-white">{serviceNameKa}</h1>
              <p className="text-xs text-gray-400">{serviceNameEn}</p>
            </div>
          </div>

          {/* Right: Logo */}
          <Link href="/workspace">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            </motion.div>
          </Link>
        </div>
      </motion.header>

      {/* Main Content - GLASS CONTAINER */}
      <main className="relative z-10 pt-20 pb-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto min-h-screen">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-4 mb-4">
            {icon && (
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} p-[2px] shadow-xl`}>
                <div className="w-full h-full rounded-2xl bg-[rgba(10,20,35,0.9)] flex items-center justify-center">
                  {React.cloneElement(icon as React.ReactElement, { className: "w-8 h-8 text-white" })}
                </div>
              </div>
            )}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                {serviceNameKa}
              </h1>
              <p className="text-sm text-gray-400">{serviceNameEn}</p>
            </div>
          </div>
          
          <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-2xl">
            {serviceDescriptionKa}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {serviceDescriptionEn}
          </p>
        </motion.div>

        {/* Agent G Context */}
        {agentGContext && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6 p-4 rounded-2xl bg-[rgba(10,20,35,0.6)] backdrop-blur-md border border-cyan-500/20"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-cyan-400 mb-1">Agent G</p>
                <p className="text-sm text-gray-300 leading-relaxed">{agentGContext}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Service Content - GLASS PANEL */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-[rgba(10,20,35,0.5)] backdrop-blur-md border border-white/10 overflow-hidden"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
