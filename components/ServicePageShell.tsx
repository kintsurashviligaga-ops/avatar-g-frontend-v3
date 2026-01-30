"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useNavigation } from "@/lib/navigation";

interface ServicePageShellProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  gradient?: string;
}

export default function ServicePageShell({
  children,
  title,
  description,
  icon,
  gradient = "from-cyan-500 to-blue-600",
}: ServicePageShellProps) {
  const { goBack } = useNavigation();

  return (
    <div className="relative min-h-screen bg-[#05070A]">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
      
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 bg-[#05070A]/80 backdrop-blur-xl border-b border-white/10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Back Button */}
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goBack("/workspace")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </motion.button>

              <Link href="/workspace">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  <Home className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">Workspace</span>
                </motion.div>
              </Link>
            </div>

            {/* Center: Title */}
            <div className="flex items-center gap-3">
              {icon && <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient}`}>{icon}</div>}
              <div className="hidden md:block">
                <h1 className="text-lg font-bold text-white">{title}</h1>
                {description && <p className="text-xs text-gray-400">{description}</p>}
              </div>
            </div>

            {/* Right: Placeholder for actions */}
            <div className="w-24" />
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
