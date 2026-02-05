"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white flex items-center justify-center">
      <div className="text-center">
        <motion.div
          animate={{ 
            rotate: 360,
            scale: [1, 1.2, 1]
          }}
          transition={{ 
            rotate: { duration: 2, repeat: Infinity, ease: "linear" },
            scale: { duration: 1, repeat: Infinity }
          }}
          className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-[#D4AF37] border-t-transparent"
        />
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-gray-400"
        >
          Initializing Digital Twin Protocol...
        </motion.p>
      </div>
    </div>
  );
}
