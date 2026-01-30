"use client";

import React from "react";
import { motion } from "framer-motion";

interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export function GlassContainer({ children, className = "", glow = true }: GlassContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`
        relative rounded-[28px] 
        bg-[rgba(10,20,35,0.55)] 
        backdrop-blur-xl 
        border border-cyan-500/25
        ${glow ? "shadow-[0_0_40px_rgba(34,211,238,0.12)]" : ""}
        ${className}
      `}
      style={{
        boxShadow: glow 
          ? "0 0 40px rgba(34, 211, 238, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)" 
          : "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {children}
    </motion.div>
  );
}
