"use client";

import React from "react";
import { motion } from "framer-motion";

export default function Agent3D() {
  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
      <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="relative w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] md:w-[900px] md:h-[900px]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute inset-0 rounded-full border border-cyan-500/10" />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute inset-8 rounded-full border border-blue-500/10" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-3xl" />
        <motion.div animate={{ rotate: 360, scale: [1, 1.1, 1] }} transition={{ rotate: { duration: 20, repeat: Infinity, ease: "linear" }, scale: { duration: 3, repeat: Infinity, ease: "easeInOut" } }} className="absolute inset-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 blur-2xl" />
        <motion.div animate={{ boxShadow: ["0 0 60px 20px rgba(6, 182, 212, 0.3)", "0 0 100px 40px rgba(6, 182, 212, 0.5)", "0 0 60px 20px rgba(6, 182, 212, 0.3)"] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600" />
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="absolute inset-0"><div className="absolute top-0 left-1/2 w-3 h-3 bg-cyan-400 rounded-full blur-sm shadow-lg shadow-cyan-400/50" /></motion.div>
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-24"><div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-400 rounded-full blur-sm shadow-lg shadow-blue-400/50" /></motion.div>
      </motion.div>
    </div>
  );
}
