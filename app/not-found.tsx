"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Ghost, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#00FFFF]/20 flex items-center justify-center"
        >
          <Ghost className="w-16 h-16 text-gray-400" />
        </motion.div>
        
        <h1 className="text-6xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent mb-4">
          404
        </h1>
        
        <p className="text-xl text-gray-400 mb-2">Digital Twin Not Found</p>
        <p className="text-gray-600 mb-8">
          The requested identity does not exist in our protocol.
        </p>
        
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          <ArrowLeft className="w-5 h-5" />
          Return to Base
        </Link>
      </motion.div>
    </div>
  );
}
