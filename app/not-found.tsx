"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-[#05070A] flex items-center justify-center overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#05070A] to-[#05070A]" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center px-4"
      >
        {/* 404 Number */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 }}
          className="text-8xl md:text-9xl font-bold bg-gradient-to-b from-white to-gray-600 bg-clip-text text-transparent mb-4"
        >
          404
        </motion.div>
        
        {/* Message - Bilingual */}
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          გვერდი ვერ მოიძებნა
        </h1>
        <p className="text-lg text-gray-400 mb-2">Page Not Found</p>
        
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          მოთხოვნილი გვერდი არ არსებობს ან გადატანილია სხვა მისამართზე
        </p>
        
        {/* Recovery CTA - CRITICAL: Must return to workspace */}
        <Link href="/workspace">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/30"
          >
            <Home className="w-5 h-5" />
            <span>სამუშაო სივრცეში დაბრუნება</span>
            <span className="text-sm opacity-75">/ Return to Workspace</span>
          </motion.button>
        </Link>
      </motion.div>
    </div>
  );
}
