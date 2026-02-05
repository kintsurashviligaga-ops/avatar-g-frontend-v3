"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#05070A] text-white flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full bg-[#1A1A1A] border border-red-500/30 rounded-3xl p-8 text-center"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center"
        >
          <AlertTriangle className="w-12 h-12 text-red-500" />
        </motion.div>

        <h2 className="text-3xl font-bold text-red-400 mb-4">
          System Error
        </h2>
        
        <p className="text-gray-400 mb-2">
          An unexpected error occurred in the Digital Twin Protocol.
        </p>
        
        {error.digest && (
          <p className="text-xs text-gray-600 font-mono mb-6">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex gap-4 justify-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={reset}
            className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-xl font-semibold flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Try Again
          </motion.button>
          
          <Link
            href="/"
            className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold flex items-center gap-2"
          >
            <Home className="w-5 h-5" />
            Go Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
